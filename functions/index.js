import dns from 'node:dns/promises';
import net from 'node:net';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import sanitizeHtml from 'sanitize-html';

const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

function allowedOrigins() {
  return (process.env.URL_IMPORT_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function applyCors(req, res) {
  const origin = req.get('origin') || '';
  const origins = allowedOrigins();
  if (!origins.length) {
    res.set('Access-Control-Allow-Origin', '*');
    return true;
  }
  if (origin && origins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    return true;
  }
  return false;
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a >= 224;
}

function isPrivateIpv6(ip) {
  const value = ip.toLowerCase();
  return value === '::1'
    || value === '::'
    || value.startsWith('fc')
    || value.startsWith('fd')
    || value.startsWith('fe8')
    || value.startsWith('fe9')
    || value.startsWith('fea')
    || value.startsWith('feb');
}

function assertPublicIp(address) {
  const version = net.isIP(address);
  if (!version) throw new Error('Could not validate the destination address.');
  if (version === 4 && isPrivateIpv4(address)) throw new Error('This URL resolves to a private or unsafe network address.');
  if (version === 6 && isPrivateIpv6(address)) throw new Error('This URL resolves to a private or unsafe network address.');
}

function assertSafeHostname(hostname) {
  const lower = hostname.toLowerCase();
  if (!lower || lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local')) {
    throw new Error('Localhost and local network URLs cannot be imported.');
  }
  if (lower === 'metadata.google.internal') throw new Error('Metadata service URLs cannot be imported.');
}

async function assertSafeUrl(value) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS URLs can be imported.');
  if (parsed.username || parsed.password) throw new Error('URLs with embedded credentials cannot be imported.');
  assertSafeHostname(parsed.hostname);

  const ipVersion = net.isIP(parsed.hostname);
  if (ipVersion) {
    assertPublicIp(parsed.hostname);
    return parsed;
  }

  const addresses = await dns.lookup(parsed.hostname, { all: true, verbatim: false });
  if (!addresses.length) throw new Error('This URL did not resolve to an address.');
  addresses.forEach((entry) => assertPublicIp(entry.address));
  return parsed;
}

async function readLimitedBody(response) {
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) throw new Error('The webpage is too large to import.');
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return buffer.toString('utf8');
}

async function fetchSafe(url, redirects = 0) {
  const parsed = await assertSafeUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(parsed.toString(), {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': 'PersonalKnowledgeVaultUrlImporter/1.0',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5',
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects >= MAX_REDIRECTS) throw new Error('Too many redirects while importing this URL.');
      const location = response.headers.get('location');
      if (!location) throw new Error('The webpage redirected without a Location header.');
      return fetchSafe(new URL(location, parsed).toString(), redirects + 1);
    }

    if (!response.ok) throw new Error(`The webpage returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
      throw new Error('This URL did not return an importable HTML or text page.');
    }

    const html = await readLimitedBody(response);
    return { html, finalUrl: parsed.toString(), contentType };
  } finally {
    clearTimeout(timer);
  }
}
function meta(document, selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const value = element?.getAttribute('content') || element?.getAttribute('href') || element?.textContent;
    if (value?.trim()) return value.trim();
  }
  return '';
}

function removeBoilerplate(document) {
  document.querySelectorAll('script, style, noscript, iframe, svg, canvas, nav, footer, header, form, aside, [aria-hidden="true"], [role="navigation"], [role="banner"], [role="contentinfo"]').forEach((node) => node.remove());
}

function sanitizeArticle(html) {
  return sanitizeHtml(html || '', {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'b', 'em', 'i', 'u',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a', 'hr', 'sup', 'sub', 'dl', 'dt', 'dd', 'figure', 'figcaption',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  });
}

function textFromHtml(html) {
  const dom = new JSDOM(`<main>${html}</main>`);
  return (dom.window.document.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function summarize(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const firstSentence = clean.match(/[^.!?]+[.!?]/)?.[0]?.trim();
  return (firstSentence || clean).slice(0, 360);
}

function extractPage(rawHtml, finalUrl) {
  const dom = new JSDOM(rawHtml, { url: finalUrl });
  const { document } = dom.window;
  removeBoilerplate(document);

  const metadata = {
    sourceName: meta(document, ['meta[property="og:site_name"]', 'meta[name="application-name"]']),
    author: meta(document, ['meta[name="author"]', 'meta[property="article:author"]', '[rel="author"]']),
    publicationDate: meta(document, ['meta[property="article:published_time"]', 'meta[name="date"]', 'meta[name="dc.date"]', 'time[datetime]']),
    description: meta(document, ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']),
    canonicalUrl: meta(document, ['link[rel="canonical"]']),
  };

  const readable = new Readability(document).parse();
  const fallbackTitle = document.querySelector('title')?.textContent?.trim() || '';
  const articleHtml = readable?.content || document.body.innerHTML || '';
  const sanitized = sanitizeArticle(articleHtml);
  const text = readable?.textContent?.replace(/\s+/g, ' ').trim() || textFromHtml(sanitized);
  const title = readable?.title || meta(document, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) || fallbackTitle;

  return {
    title: title || '',
    html: sanitized || '<p>No readable article content was found.</p>',
    text,
    summary: summarize(text || metadata.description || title),
    canonicalUrl: metadata.canonicalUrl || finalUrl,
    metadata,
  };
}

export const importUrl = onRequest(
  {
    timeoutSeconds: 30,
    memory: '512MiB',
    maxInstances: 5,
  },
  async (req, res) => {
    const corsOk = applyCors(req, res);
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(corsOk ? 204 : 403).send('');
      return;
    }

    if (!corsOk) {
      json(res, 403, { ok: false, error: 'This origin is not allowed to use the URL import endpoint.' });
      return;
    }

    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Use POST to import a URL.' });
      return;
    }

    try {
      const sourceUrl = String(req.body?.url || '').trim();
      if (!sourceUrl) throw new Error('Missing URL.');
      const { html, finalUrl } = await fetchSafe(sourceUrl);
      const extracted = extractPage(html, finalUrl);
      json(res, 200, { ok: true, ...extracted });
    } catch (error) {
      logger.warn('URL import failed', { message: error?.message });
      json(res, 400, { ok: false, error: error?.message || 'URL import failed.' });
    }
  },
);