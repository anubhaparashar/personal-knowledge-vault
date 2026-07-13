import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import admin from 'firebase-admin';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import sanitizeHtml from 'sanitize-html';
import pdfParse from 'pdf-parse';
import {
  buildLinkedInImportResult,
  detectOfficialPdfLinks,
  isLinkedInPostUrl,
  isLinkedInUrl,
  normalizeLinkedInPostUrl,
} from './linkedin-import.js';
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const logger = { warn: (...args) => console.warn('[discovery]', ...args), info: (...args) => console.log('[discovery]', ...args) };
const TZ = 'Asia/Kolkata';
const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12000;
const MAX_REDIRECTS = 5;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const IMPORT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const IMPORT_RATE_LIMIT_MAX = 30;
const importRateLimits = new Map();
const DEFAULT_SETTINGS = {
  automaticDiscoveryEnabled: true,
  timezone: TZ,
  fullScanTimes: ['06:00', '18:00'],
  refreshIntervalHours: 6,
  weekendScansEnabled: true,
  maxSourcesPerRun: 24,
  pauseAllScanning: false,
};
const QUICK_STAGES = {
  queued: 'Queued',
  loading: 'Loading active records',
  rechecking: 'Rechecking sources',
  comparing: 'Comparing changes',
  updating: 'Updating deadlines',
  saving: 'Saving updates',
  completed: 'Completed',
};
const FULL_STAGES = {
  requested: 'Scan requested',
  loading: 'Loading sources',
  extracting: 'Extracting records',
  categorising: 'Categorising',
  dates: 'Detecting dates',
  duplicates: 'Checking duplicates',
  saving: 'Saving discoveries',
  calendar: 'Updating calendar',
  completed: 'Completed',
};
const URL_IMPORT_STAGES = {
  validating: 'Validating link',
  connecting: 'Connecting to website',
  reading: 'Reading page',
  extracting: 'Extracting useful content',
  identifying: 'Identifying content type',
  category: 'Generating category',
  tags: 'Generating tags',
  dates: 'Detecting dates',
  duplicates: 'Checking duplicates',
  ready: 'Ready for review',
};
const DEFAULT_DISCOVERY_SOURCE_SEED = [
  {
    id: 'starter-openalex-research-opportunities',
    seedKey: 'starter-openalex-research-opportunities',
    name: 'OpenAlex research opportunities',
    type: 'OpenAlex',
    url: 'https://api.openalex.org/works?search=research%20funding%20scholarship%20fellowship&per-page=10&sort=publication_date:desc',
    expectedCategory: 'Research/Research Papers',
    requestDelayMs: 1000,
    concurrencyLimit: 1,
    refreshFrequency: 'daily',
  },
  {
    id: 'starter-crossref-research-funding',
    seedKey: 'starter-crossref-research-funding',
    name: 'Crossref research funding records',
    type: 'Crossref',
    url: 'https://api.crossref.org/works?query=research%20funding%20scholarship%20fellowship&rows=10&sort=published&order=desc',
    expectedCategory: 'Research/Research Papers',
    requestDelayMs: 1000,
    concurrencyLimit: 1,
    refreshFrequency: 'daily',
  },
  {
    id: 'starter-arxiv-research-opportunities',
    seedKey: 'starter-arxiv-research-opportunities',
    name: 'arXiv research opportunities',
    type: 'arXiv',
    url: 'https://export.arxiv.org/api/query?search_query=all:research%20opportunities&start=0&max_results=10&sortBy=submittedDate&sortOrder=descending',
    expectedCategory: 'Research/Research Papers',
    requestDelayMs: 3000,
    concurrencyLimit: 1,
    refreshFrequency: 'daily',
  },
  {
    id: 'starter-nsf-funding-rss',
    seedKey: 'starter-nsf-funding-rss',
    name: 'NSF funding opportunities RSS',
    type: 'RSS',
    url: 'https://www.nsf.gov/rss/rss_www_funding.xml',
    expectedCategory: 'Research Opportunities/Research Grants',
    requestDelayMs: 1500,
    concurrencyLimit: 1,
    refreshFrequency: 'daily',
  },
  {
    id: 'starter-official-fellowship-webpage',
    seedKey: 'starter-official-fellowship-webpage',
    name: 'Microsoft Research PhD Fellowship webpage',
    type: 'Public webpage',
    url: 'https://www.microsoft.com/en-us/research/academic-program/phd-fellowship/',
    expectedCategory: 'Research Opportunities/Fellowships',
    requestDelayMs: 1500,
    concurrencyLimit: 1,
    refreshFrequency: 'daily',
  },
];

function allowedOrigins() {
  const configured = (process.env.URL_IMPORT_ALLOWED_ORIGINS || process.env.DISCOVERY_ALLOWED_ORIGINS || '')
    .split(',').map((item) => item.trim()).filter(Boolean);
  if (configured.length) return configured;
  return ['https://anubhaparashar.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173'];
}
function applyCors(req, res) {
  const origin = req.get('origin') || '';
  const origins = allowedOrigins();
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (!origins.length) { res.set('Access-Control-Allow-Origin', '*'); return true; }
  if (origin && origins.includes(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); return true; }
  return false;
}
function json(res, status, payload) { res.status(status).json(payload); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
async function requireUser(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw httpError(401, 'Sign in before using discovery.');
  const decoded = await admin.auth().verifyIdToken(token);
  const allowed = (process.env.DISCOVERY_USER_UIDS || process.env.DISCOVERY_USER_UID || process.env.ALLOWED_UID || '')
    .split(',').map((item) => item.trim()).filter(Boolean);
  const email = (process.env.DISCOVERY_ALLOWED_EMAIL || process.env.ALLOWED_EMAIL || '').trim().toLowerCase();
  if (allowed.length && !allowed.includes(decoded.uid)) throw httpError(403, 'This account is not allowed to run discovery.');
  if (email && decoded.email?.toLowerCase() !== email) throw httpError(403, 'This account is not allowed to run discovery.');
  return decoded;
}
function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}
function isPrivateIpv6(ip) {
  const value = ip.toLowerCase();
  return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb');
}
function assertPublicIp(address) {
  const version = net.isIP(address);
  if (!version) throw new Error('Could not validate the destination address.');
  if (version === 4 && isPrivateIpv4(address)) throw new Error('This URL resolves to a private or unsafe network address.');
  if (version === 6 && isPrivateIpv6(address)) throw new Error('This URL resolves to a private or unsafe network address.');
}
function assertSafeHostname(hostname) {
  const lower = hostname.toLowerCase();
  if (!lower || lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local')) throw new Error('Localhost and local network URLs cannot be imported or scanned.');
  if (lower === 'metadata.google.internal' || lower.includes('metadata')) throw new Error('Cloud metadata URLs cannot be imported or scanned.');
}
async function assertSafeUrl(value) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS URLs are allowed.');
  if (parsed.username || parsed.password) throw new Error('URLs with embedded credentials are not allowed.');
  assertSafeHostname(parsed.hostname);
  if (net.isIP(parsed.hostname)) { assertPublicIp(parsed.hostname); return parsed; }
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
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) throw new Error('The response is too large to import or scan.');
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}
function robotsAllows(text = '', path = '/') {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/#.*/, '').trim()).filter(Boolean);
  let applies = false;
  const rules = [];
  for (const line of lines) {
    const [keyRaw, ...rest] = line.split(':');
    const key = keyRaw.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') applies = value === '*' || /personalknowledgevault/i.test(value);
    if (applies && key === 'disallow' && value) rules.push(value);
    if (key === 'user-agent' && value !== '*' && !/personalknowledgevault/i.test(value)) applies = false;
  }
  return !rules.some((rule) => rule === '/' || path.startsWith(rule));
}
async function assertRobotsAllowed(parsed) {
  const robotsUrl = new URL('/robots.txt', parsed.origin);
  await assertSafeUrl(robotsUrl.toString());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(robotsUrl, { signal: controller.signal, redirect: 'manual', headers: { 'User-Agent': 'PersonalKnowledgeVaultDiscovery/1.0' } });
    if (!response.ok) return;
    const text = await readLimitedBody(response);
    if (!robotsAllows(text, parsed.pathname || '/')) throw new Error('This site disallows automated access in robots.txt.');
  } catch (error) {
    if (/disallows/.test(error.message || '')) throw error;
  } finally { clearTimeout(timer); }
}
async function fetchSafe(url, redirects = 0, options = {}) {
  const parsed = await assertSafeUrl(url);
  if (options.checkRobots !== false) await assertRobotsAllowed(parsed);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(parsed.toString(), {
      redirect: 'manual', signal: controller.signal,
      headers: { 'User-Agent': 'PersonalKnowledgeVaultDiscovery/1.0', Accept: options.accept || 'text/html,application/xhtml+xml,application/xml,text/xml,application/rss+xml,application/atom+xml,application/json,text/plain;q=0.8,*/*;q=0.4' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects >= MAX_REDIRECTS) throw new Error('Too many redirects.');
      const location = response.headers.get('location');
      if (!location) throw new Error('The page redirected without a Location header.');
      const redirected = await fetchSafe(new URL(location, parsed).toString(), redirects + 1, options);
      return { ...redirected, redirectChain: [parsed.toString(), ...(redirected.redirectChain || [])] };
    }
    if (!response.ok) throw new Error(`The page returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    const allowed = options.allowedContentTypes || /text\/html|application\/xhtml\+xml|text\/plain|application\/xml|text\/xml|application\/rss\+xml|application\/atom\+xml|application\/json/i;
    if (contentType && !allowed.test(contentType)) throw new Error('This URL did not return a supported response type.');
    return { html: await readLimitedBody(response), finalUrl: parsed.toString(), contentType, redirectChain: [parsed.toString()], redirectCount: redirects };
  } finally { clearTimeout(timer); }
}
function checkImportRateLimit(uid) {
  if (!uid) throw httpError(401, 'Sign in before using source enrichment.');
  const now = Date.now();
  const current = (importRateLimits.get(uid) || []).filter((stamp) => now - stamp < IMPORT_RATE_LIMIT_WINDOW_MS);
  if (current.length >= IMPORT_RATE_LIMIT_MAX) throw httpError(429, 'Too many URL imports. Please wait before trying again.');
  current.push(now);
  importRateLimits.set(uid, current);
  for (const [key, stamps] of importRateLimits.entries()) {
    const fresh = stamps.filter((stamp) => now - stamp < IMPORT_RATE_LIMIT_WINDOW_MS);
    if (fresh.length) importRateLimits.set(key, fresh);
    else importRateLimits.delete(key);
  }
}
async function readLimitedBinary(response, maxBytes = MAX_PDF_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.from(await response.arrayBuffer());
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) throw new Error('The file is too large to import safely.');
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}
async function resolveRedirectSafe(url, redirects = 0, options = {}) {
  const parsed = await assertSafeUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(parsed.toString(), {
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'User-Agent': 'PersonalKnowledgeVaultDiscovery/1.0', Accept: options.accept || '*/*' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects >= MAX_REDIRECTS) throw new Error('Too many redirects.');
      const location = response.headers.get('location');
      if (!location) throw new Error('The link redirected without a Location header.');
      const redirected = await resolveRedirectSafe(new URL(location, parsed).toString(), redirects + 1, options);
      return { ...redirected, redirectChain: [parsed.toString(), ...(redirected.redirectChain || [])] };
    }
    response.body?.cancel?.();
    return { finalUrl: parsed.toString(), status: response.status, contentType: response.headers.get('content-type') || '', redirectChain: [parsed.toString()] };
  } finally { clearTimeout(timer); }
}
async function fetchBinarySafe(url, redirects = 0, options = {}) {
  const parsed = await assertSafeUrl(url);
  if (options.checkRobots !== false) await assertRobotsAllowed(parsed);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(parsed.toString(), {
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'User-Agent': 'PersonalKnowledgeVaultDiscovery/1.0', Accept: options.accept || 'application/pdf,*/*;q=0.4' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects >= MAX_REDIRECTS) throw new Error('Too many redirects.');
      const location = response.headers.get('location');
      if (!location) throw new Error('The file redirected without a Location header.');
      const redirected = await fetchBinarySafe(new URL(location, parsed).toString(), redirects + 1, options);
      return { ...redirected, redirectChain: [parsed.toString(), ...(redirected.redirectChain || [])] };
    }
    if (!response.ok) throw new Error(`The file returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    const allowed = options.allowedContentTypes || /application\/pdf|application\/octet-stream/i;
    if (contentType && !allowed.test(contentType) && !/\.pdf(?:[?#]|$)/i.test(parsed.pathname)) throw new Error('This link did not return a PDF.');
    return { buffer: await readLimitedBinary(response, options.maxBytes || MAX_PDF_BYTES), finalUrl: parsed.toString(), contentType, redirectChain: [parsed.toString()] };
  } finally { clearTimeout(timer); }
}
async function extractOfficialPdf(link = {}) {
  const source = link.resolvedUrl || link.canonicalUrl || link.url || link.originalUrl;
  if (!source) return null;
  const file = await fetchBinarySafe(source, 0, { checkRobots: false, maxBytes: MAX_PDF_BYTES, timeoutMs: 18000 });
  const parsed = await pdfParse(file.buffer);
  const text = String(parsed.text || '').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return {
    ...link,
    kind: 'official-pdf',
    originalUrl: link.originalUrl || source,
    resolvedUrl: file.finalUrl,
    canonicalUrl: file.finalUrl,
    contentType: file.contentType || 'application/pdf',
    size: file.buffer.length,
    pages: parsed.numpages || null,
    text,
    textPreview: text.slice(0, 1200),
    extractionStatus: text ? 'extracted' : 'empty',
  };
}
async function findUrlImportDuplicate(uid, urls = []) {
  const values = [...new Set(urls.filter(Boolean))].slice(0, 6);
  const fields = ['sourceUrl', 'sourceMetadata.canonicalUrl', 'sourceMetadata.canonicalPostUrl', 'sourceMetadata.officialPdfUrl'];
  for (const value of values) {
    for (const field of fields) {
      const snapshot = await userRef(uid).collection('pages').where(field, '==', value).limit(1).get();
      const doc = snapshot.docs[0];
      if (doc) return { id: doc.id, title: doc.data()?.title || 'Existing entry', field, value };
    }
  }
  return null;
}
async function importLinkedInUrl(sourceUrl, supplied = {}, uid = '') {
  let fetched = null;
  let fetchError = null;
  try {
    fetched = await fetchSafe(sourceUrl, 0, { checkRobots: false, accept: 'text/html,application/xhtml+xml,text/plain;q=0.8', timeoutMs: 15000 });
  } catch (error) {
    fetchError = error;
  }
  let provisional = buildLinkedInImportResult({
    originalUrl: sourceUrl,
    finalUrl: fetched?.finalUrl || normalizeLinkedInPostUrl(sourceUrl),
    html: fetched?.html || '',
    suppliedText: [supplied.title, supplied.text, supplied.sharedText].filter(Boolean).join('\n\n'),
  });
  const rawLinks = provisional.linkedinPost?.links || provisional.links || [];
  const prioritizedLinks = [
    ...rawLinks.filter((link) => /\\.pdf(?:[?#]|$)|acm\\.org|dl\\.acm\\.org/i.test(link.url || link.originalUrl || '')),
    ...rawLinks.filter((link) => !/\\.pdf(?:[?#]|$)|acm\\.org|dl\\.acm\\.org/i.test(link.url || link.originalUrl || '')),
  ];
  const seenLinkTargets = new Set();
  const resolvedLinks = [];
  for (const link of prioritizedLinks.filter((link) => { const target = link.url || link.originalUrl || ''; if (!target || seenLinkTargets.has(target)) return false; seenLinkTargets.add(target); return true; }).slice(0, 30)) {
    try {
      const resolved = await resolveRedirectSafe(link.url || link.originalUrl, 0, { timeoutMs: 8000 });
      resolvedLinks.push({
        ...link,
        resolvedUrl: resolved.finalUrl,
        canonicalUrl: resolved.finalUrl,
        contentType: resolved.contentType,
        status: resolved.status,
        redirectChain: resolved.redirectChain,
        kind: /application\/pdf/i.test(resolved.contentType) || /\.pdf(?:[?#]|$)/i.test(resolved.finalUrl) ? 'pdf' : (link.kind || 'link'),
      });
    } catch (error) {
      resolvedLinks.push({ ...link, resolutionError: error.message || 'Could not resolve link.' });
    }
  }
  let officialPdf = null;
  for (const candidate of detectOfficialPdfLinks(resolvedLinks)) {
    try {
      officialPdf = await extractOfficialPdf(candidate);
      break;
    } catch (error) {
      officialPdf = { ...candidate, extractionStatus: 'failed', warning: error.message || 'Official PDF could not be extracted.' };
    }
  }
  const result = buildLinkedInImportResult({
    originalUrl: sourceUrl,
    finalUrl: fetched?.finalUrl || provisional.finalUrl,
    html: fetched?.html || '',
    resolvedLinks,
    officialPdf,
    suppliedText: [supplied.title, supplied.text, supplied.sharedText].filter(Boolean).join('\n\n'),
  });
  const duplicate = uid ? await findUrlImportDuplicate(uid, [result.canonicalUrl, result.originalUrl, result.officialPdf?.canonicalUrl, result.officialPdf?.resolvedUrl]) : null;
  return {
    ...result,
    contentType: fetched?.contentType || '',
    redirectChain: fetched?.redirectChain || [sourceUrl],
    duplicateOf: duplicate,
    duplicateWarning: duplicate ? `This call may already exist in your vault: ${duplicate.title}` : '',
    error: fetchError?.message || '',
    warnings: [...(result.warnings || []), ...(fetchError ? [fetchError.message] : [])],
  };
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
    allowedTags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'hr', 'sup', 'sub', 'dl', 'dt', 'dd', 'figure', 'figcaption'],
    allowedAttributes: { a: ['href', 'title'], th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }) },
  });
}
function textFromHtml(html) {
  const dom = new JSDOM(`<main>${html}</main>`);
  return (dom.window.document.body.textContent || '').replace(/\s+/g, ' ').trim();
}
function summarize(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const sentence = clean.match(/[^.!?]+[.!?]/)?.[0]?.trim();
  return (sentence || clean).slice(0, 360);
}
function extractPage(rawHtml, finalUrl) {
  const dom = new JSDOM(rawHtml, { url: finalUrl });
  const { document } = dom.window;
  removeBoilerplate(document);
  const metadata = {
    sourceName: meta(document, ['meta[property="og:site_name"]', 'meta[name="application-name"]']),
    author: meta(document, ['meta[name="author"]', 'meta[property="article:author"]', '[rel="author"]']),
    publicationDate: meta(document, ['meta[property="article:published_time"]', 'meta[name="date"]', 'meta[name="dc.date"]', 'meta[name="citation_publication_date"]', 'meta[name="citation_online_date"]', 'time[datetime]']),
    description: meta(document, ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']),
    canonicalUrl: meta(document, ['link[rel="canonical"]']),
    publisher: meta(document, ['meta[name="citation_publisher"]', 'meta[property="article:publisher"]', 'meta[name="dc.publisher"]', 'meta[property="og:site_name"]']),
    journal: meta(document, ['meta[name="citation_journal_title"]', 'meta[name="citation_publication_title"]', 'meta[name="dc.source"]']),
    institution: meta(document, ['meta[name="citation_institution"]', 'meta[name="dc.institution"]', 'meta[name="institution"]']),
    conference: meta(document, ['meta[name="citation_conference_title"]', 'meta[name="conference"]']),
    funder: meta(document, ['meta[name="citation_funder"]', 'meta[name="funder"]']),
  };
  const readable = new Readability(document).parse();
  const fallbackTitle = document.querySelector('title')?.textContent?.trim() || '';
  const articleHtml = readable?.content || document.body.innerHTML || '';
  const sanitized = sanitizeArticle(articleHtml);
  const text = readable?.textContent?.replace(/\s+/g, ' ').trim() || textFromHtml(sanitized);
  const title = readable?.title || meta(document, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) || fallbackTitle;
  return { title: title || '', html: sanitized || '<p>No readable article content was found.</p>', text, summary: summarize(text || metadata.description || title), canonicalUrl: metadata.canonicalUrl || finalUrl, metadata };
}
function stableHash(value = '') { return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24); }
function sourceDomain(value = '') { try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return ''; } }
function titleCase(value = '') { return value.split(/\s+/).filter(Boolean).map((word) => (/^[A-Z0-9]{2,}$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())).join(' '); }
function plainHtml(text = '') {
  const escaped = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  return escaped ? `<p>${escaped.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>` : '<p></p>';
}
function extractDoi(value = '') {
  const input = decodeURIComponent(String(value || '')).trim();
  try {
    const parsed = new URL(input);
    if (/doi\.org$/i.test(parsed.hostname)) return parsed.pathname.replace(/^\/+/, '').replace(/[?#].*$/, '').replace(/[).,;]+$/, '');
  } catch {}
  const match = input.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  return match ? match[0].replace(/[).,;]+$/, '') : '';
}
function extractArxivId(value = '') {
  const input = String(value || '').trim();
  try {
    const parsed = new URL(input);
    if (/arxiv\.org$/i.test(parsed.hostname)) {
      const match = parsed.pathname.match(/\/(?:abs|pdf)\/([A-Za-z.-]+\/\d+|\d{4}\.\d{4,5})(?:v\d+)?/i);
      if (match) return match[1];
    }
  } catch {}
  const match = input.match(/arxiv:\s*([A-Za-z.-]+\/\d+|\d{4}\.\d{4,5})(?:v\d+)?/i);
  return match ? match[1] : '';
}
function crossrefDate(parts = {}) {
  const first = parts?.['date-parts']?.[0] || [];
  if (!first.length) return '';
  const [year, month = 1, day = 1] = first;
  return year ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
}
function addDateIfMissing(record, item) {
  if (!item?.date) return record;
  const exists = (record.importantDates || []).some((date) => date.type === item.type && date.date === item.date);
  return exists ? record : { ...record, importantDates: [...(record.importantDates || []), { id: stableHash(`${item.type}:${item.date}:${record.sourceUrl}`), source: 'automatic', detectedAutomatically: true, confirmed: true, uncertain: false, ...item }] };
}
async function discoverFromDoi(doi, source = {}) {
  const apiUrl = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const { html } = await fetchSafe(apiUrl, 0, { checkRobots: false, accept: 'application/json', allowedContentTypes: /application\/json|text\/plain/i });
  const message = JSON.parse(html).message || {};
  const rawTitle = message.title || message['container-title'] || [];
  const title = (Array.isArray(rawTitle) ? rawTitle[0] : rawTitle) || `DOI ${doi}`;
  const abstractHtml = sanitizeArticle(message.abstract || '');
  const abstractText = textFromHtml(abstractHtml);
  const publicationDate = crossrefDate(message.published || message['published-print'] || message['published-online']);
  const url = message.URL || `https://doi.org/${doi}`;
  let record = analyseRecord({
    title,
    html: abstractHtml || plainHtml(title),
    text: abstractText || title,
    summary: summarize(abstractText || title),
    sourceUrl: url,
    canonicalUrl: url,
    metadata: { sourceName: 'Crossref', doi: message.DOI || doi, containerTitle: Array.isArray(message['container-title']) ? message['container-title'][0] : '', publicationDate },
  }, { ...source, name: source.name || 'Crossref', type: 'Crossref', expectedCategory: source.expectedCategory || 'Research/Research Papers' });
  if (publicationDate) record = addDateIfMissing(record, { type: 'Publication date', title: 'Publication date', date: publicationDate });
  return record;
}
async function discoverFromArxiv(id, source = {}) {
  const apiUrl = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`;
  const { html } = await fetchSafe(apiUrl, 0, { checkRobots: false, accept: 'application/atom+xml,application/xml,text/xml', allowedContentTypes: /application\/atom\+xml|application\/xml|text\/xml/i });
  const dom = new JSDOM(html, { contentType: 'text/xml', url: apiUrl });
  const entry = dom.window.document.querySelector('entry');
  if (!entry) throw new Error('No arXiv metadata was returned for this identifier.');
  const title = xmlText(entry, ['title']) || `arXiv ${id}`;
  const summaryText = xmlText(entry, ['summary']);
  const published = toIsoDate(xmlText(entry, ['published']));
  const link = [...entry.querySelectorAll('link[href]')].find((node) => /abs/i.test(node.getAttribute('href') || ''))?.getAttribute('href') || `https://arxiv.org/abs/${id}`;
  let record = analyseRecord({
    title,
    html: plainHtml(summaryText),
    text: summaryText,
    summary: summarize(summaryText),
    sourceUrl: link,
    canonicalUrl: link,
    metadata: { sourceName: 'arXiv', arxivId: id, publicationDate: published },
  }, { ...source, name: source.name || 'arXiv', type: 'arXiv', expectedCategory: source.expectedCategory || 'Research/Research Papers' });
  if (published) record = addDateIfMissing(record, { type: 'Publication date', title: 'Publication date', date: published });
  return record;
}
function blockedPlatform(sourceUrl = '') {
  const domain = sourceDomain(sourceUrl).toLowerCase();
  if (/facebook\.com$|fb\.com$/.test(domain)) return 'Facebook';
  if (/linkedin\.com$|lnkd\.in$/.test(domain)) return 'LinkedIn';
  return '';
}
function platformFallbackRecord(sourceUrl, source = {}, supplied = {}) {
  const platform = blockedPlatform(sourceUrl) || 'Platform';
  const suppliedText = [supplied.title, supplied.sharedText, supplied.text].filter(Boolean).join('\n');
  const title = supplied.title || `${platform} shared link`;
  return analyseRecord({
    title,
    html: plainHtml(suppliedText || `Original link: ${sourceUrl}`),
    text: suppliedText || sourceUrl,
    summary: suppliedText ? summarize(suppliedText) : 'The platform did not allow automatic page extraction. The supplied text and link were saved.',
    sourceUrl,
    canonicalUrl: sourceUrl,
    metadata: { sourceName: platform, extractionBlocked: true, platformMessage: 'The platform did not allow automatic page extraction. The supplied text and link were saved.' },
    extractionBlocked: true,
  }, { ...source, name: platform, type: 'Manual-only', expectedCategory: source.expectedCategory || 'Personal Knowledge/Web References' });
}
function extractSnippet(text = '', patterns = []) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+|\n+/).map((item) => item.trim()).filter(Boolean);
  return sentences.find((sentence) => patterns.some((pattern) => pattern.test(sentence))) || '';
}
function extractOpportunityDetails(text = '', record = {}) {
  const fundingSnippet = extractSnippet(text, [/stipend/i, /salary/i, /funding/i, /grant/i, /tuition/i, /award/i]);
  const eligibilitySnippet = extractSnippet(text, [/eligib/i, /qualification/i, /requirements?/i, /candidate/i, /applicants? must/i]);
  const contactMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const locationSnippet = extractSnippet(text, [/location/i, /venue/i, /remote/i, /hybrid/i, /onsite/i]);
  return {
    institution: record.metadata?.sourceName || '',
    funding: fundingSnippet.slice(0, 500),
    eligibility: eligibilitySnippet.slice(0, 900),
    location: locationSnippet.slice(0, 300),
    applicationUrl: record.sourceUrl || record.canonicalUrl || '',
    contactEmail: contactMatch?.[0] || '',
  };
}
function runTypeFor({ mode = 'full', trigger = 'manual', sourceId = '' } = {}) {
  if (sourceId || trigger === 'manual-source') return 'single-source';
  if (mode === 'quick') return 'quick-refresh';
  if (String(trigger).startsWith('scheduled') || trigger === 'github-actions') return 'scheduled-full';
  return 'manual-full';
}
const CATEGORY_RULES = [
  ['Research Opportunities/Scholarships', ['scholarship', 'studentship', 'stipend', 'tuition waiver']],
  ['Research Opportunities/Postdoctoral Opportunities', ['postdoc', 'postdoctoral', 'research fellow', 'principal investigator', 'lab opening']],
  ['Research Opportunities/Fellowships', ['fellowship', 'visiting fellow']],
  ['Research Opportunities/Research Grants', ['research grant', 'grant call', 'funding call', 'proposal deadline']],
  ['Research Opportunities/Research Jobs', ['research job', 'faculty position', 'vacancy', 'assistant professor']],
  ['Publishing/Conference Calls', ['conference', 'call for papers', 'cfp', 'symposium', 'workshop']],
  ['Publishing/Journal Calls', ['journal call', 'call for manuscripts', 'special issue', 'guest editor']],
  ['Research/Paper Ideas', ['paper idea', 'research gap', 'hypothesis', 'future work']],
  ['Research/Research Papers', ['research paper', 'abstract', 'doi', 'arxiv', 'methodology']],
];
function scoreCategory(text = '', fallback = '') {
  const haystack = text.toLowerCase();
  let best = { category: fallback || 'Uncategorised', score: fallback ? 2 : 0 };
  for (const [category, terms] of CATEGORY_RULES) {
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 2 : 0), 0);
    if (score > best.score) best = { category, score };
  }
  return { category: best.category, confidence: Math.min(1, best.score / 10) };
}
const STOP_WORDS = new Set('a,an,and,are,as,at,be,by,for,from,has,have,in,is,it,of,on,or,that,the,this,to,with,will,new,call,apply,application,deadline'.split(','));
function generateTags({ title = '', text = '', url = '', category = '' } = {}) {
  const tags = new Map();
  category.split('/').filter(Boolean).forEach((part) => tags.set(part.toLowerCase(), titleCase(part)));
  const domain = sourceDomain(url);
  if (domain) tags.set(domain, titleCase(domain.split('.')[0]));
  `${title} ${text}`.split(/[^a-zA-Z0-9+#.-]+/).map((word) => word.trim()).filter((word) => word.length > 3 && !STOP_WORDS.has(word.toLowerCase())).slice(0, 50).forEach((word) => tags.set(word.toLowerCase(), titleCase(word)));
  return [...tags.values()].slice(0, 8);
}
const DATE_CONTEXTS = [
  [/abstract/i, 'Abstract submission deadline'],
  [/camera[- ]?ready/i, 'Camera-ready deadline'],
  [/registration/i, 'Registration deadline'],
  [/notification/i, 'Notification date'],
  [/interview/i, 'Interview date'],
  [/expected start|start date|starts?/i, 'Expected start date'],
  [/full[- ]?paper|paper submission|manuscript/i, 'Full-paper submission deadline'],
  [/opening|opens/i, 'Application opening date'],
  [/conference dates?|event dates?|venue/i, 'Conference dates'],
  [/expression.of.interest|\beoi\b/i, 'Expression-of-interest deadline'],
  [/tender|rfp|contract/i, 'Tender closing date'],
  [/proposal/i, 'Proposal deadline'],
  [/scholarship/i, 'Scholarship deadline'],
  [/postdoctoral|postdoc/i, 'Postdoctoral deadline'],
  [/fellowship/i, 'Fellowship deadline'],
  [/grant|funding/i, 'Grant deadline'],
  [/deadline|last date|apply by|application|closing|closes/i, 'Application deadline'],
  [/publication|published/i, 'Publication date'],
];
function toIsoDate(value) {
  const raw = String(value || '').trim().replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  const numeric = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](20\d{2})$/);
  if (numeric) return `${numeric[3]}-${String(numeric[2]).padStart(2, '0')}-${String(numeric[1]).padStart(2, '0')}`;
  const iso = raw.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}
function extractImportantDates(text = '') {
  const candidates = [];
  const month = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
  const dateValue = `(?:\\d{1,2}\\s+${month}\\s+20\\d{2}|${month}\\s+\\d{1,2},?\\s+20\\d{2}|20\\d{2}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/-]\\d{1,2}[/-]20\\d{2})`;
  const patterns = [
    new RegExp(`(?:deadline|due|closes|closing|last date|apply by|abstract|registration|notification|camera[- ]ready|conference dates?|interview|start date|tender|rfp|proposal|publication)\\D{0,90}(${dateValue})`, 'gi'),
    new RegExp(`(${dateValue})\\D{0,90}(?:deadline|due|closes|closing|last date|abstract|registration|notification|camera[- ]ready|conference|interview|tender|rfp|proposal|publication)`, 'gi'),
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) && candidates.length < 20) {
      const snippet = match[0].replace(/\s+/g, ' ').trim();
      const date = toIsoDate(match[1]);
      if (!date) continue;
      const type = DATE_CONTEXTS.find(([regex]) => regex.test(snippet))?.[1] || 'Application deadline';
      candidates.push({ id: stableHash(`${type}:${date}:${snippet}`), type, title: type, date, snippet, sourceText: snippet, source: 'automatic', detectedAutomatically: true, confirmed: false, uncertain: true, confidence: 'needs-confirmation', detectionStatus: 'Needs confirmation' });
    }
  }
  const seen = new Set();
  return candidates.filter((item) => { const key = `${item.type}:${item.date}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
function analyseRecord(record, source = {}) {
  const text = [record.title, record.text, record.summary].filter(Boolean).join(' ');
  const scored = scoreCategory(text, source.expectedCategory || '');
  const category = scored.category || source.expectedCategory || 'Uncategorised';
  const importantDates = extractImportantDates(text);
  const opportunityDetails = { ...extractOpportunityDetails(text, record), ...(record.opportunityDetails || {}) };
  return {
    ...record,
    category,
    suggestedCategory: category,
    suggestedSubcategory: category.split('/').slice(-1)[0] || category,
    categoryConfidence: scored.confidence,
    tags: generateTags({ title: record.title, text, url: record.sourceUrl, category }),
    importantDates,
    detectedImportantDates: importantDates,
    opportunityDetails,
    institution: opportunityDetails.institution,
    funding: opportunityDetails.funding,
    eligibility: opportunityDetails.eligibility,
    location: opportunityDetails.location,
    applicationUrl: opportunityDetails.applicationUrl,
    dateConfidence: importantDates.length ? Math.min(0.95, 0.55 + importantDates.length * 0.1) : 0.2,
    noDeadlinePublished: !importantDates.some((item) => item.date && !/publication/i.test(item.type || '')),
    relevanceScore: Math.min(0.98, 0.45 + scored.confidence * 0.35 + (importantDates.length ? 0.15 : 0)),
    lifecycleStatus: importantDates.some((item) => new Date(`${item.date}T00:00:00`) >= new Date()) ? 'active' : (importantDates.length ? 'expired' : 'active'),
  };
}
function xmlText(node, selectors) { for (const selector of selectors) { const value = node.querySelector(selector)?.textContent?.trim(); if (value) return value; } return ''; }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.min(Number(ms || 0), 10000)))); }
async function discoverFromUrl(url, source = {}, supplied = {}) {
  const doi = extractDoi(url);
  if (doi) return discoverFromDoi(doi, source);
  const arxivId = extractArxivId(url);
  if (arxivId) return discoverFromArxiv(arxivId, source);
  try {
    const { html, finalUrl } = await fetchSafe(url);
    const extracted = extractPage(html, finalUrl);
    return analyseRecord({ title: extracted.title, html: extracted.html, text: extracted.text, summary: extracted.summary, sourceUrl: extracted.canonicalUrl || finalUrl, canonicalUrl: extracted.canonicalUrl || finalUrl, metadata: { ...extracted.metadata, sourceName: extracted.metadata.sourceName || source.name } }, source);
  } catch (error) {
    if (blockedPlatform(url)) return { ...platformFallbackRecord(url, source, supplied), extractionBlocked: true, extractionError: error.message };
    throw error;
  }
}
async function discoverFromFeed(source, limit) {
  const { html, finalUrl } = await fetchSafe(source.url);
  const dom = new JSDOM(html, { contentType: 'text/xml', url: finalUrl });
  return [...dom.window.document.querySelectorAll('item, entry')].slice(0, limit).map((item) => {
    const linkElement = item.querySelector('link[href]');
    const link = linkElement?.getAttribute('href') || xmlText(item, ['link', 'guid', 'id']);
    const url = link ? new URL(link, finalUrl).toString() : finalUrl;
    const title = xmlText(item, ['title']);
    const summaryText = xmlText(item, ['description', 'summary', 'content']);
    return analyseRecord({ title, html: sanitizeArticle(summaryText ? `<p>${summaryText}</p>` : ''), text: summaryText, summary: summarize(summaryText), sourceUrl: url, canonicalUrl: url, metadata: { sourceName: source.name } }, source);
  });
}
async function discoverFromSitemap(source, limit) {
  const { html, finalUrl } = await fetchSafe(source.url);
  const dom = new JSDOM(html, { contentType: 'text/xml', url: finalUrl });
  const urls = [...dom.window.document.querySelectorAll('loc')].map((node) => node.textContent.trim()).filter(Boolean).slice(0, limit);
  const records = [];
  for (const url of urls) { await delay(source.requestDelayMs || 1000); records.push(await discoverFromUrl(url, source)); }
  return records.filter(Boolean);
}
async function discoverFromJsonApi(source, limit) {
  const { html, finalUrl } = await fetchSafe(source.url, 0, { checkRobots: false, accept: 'application/json,text/plain;q=0.8', allowedContentTypes: /application\/json|text\/plain/i });
  const payload = JSON.parse(html);
  const list = Array.isArray(payload) ? payload : payload.results || payload.items || payload.data || payload.message?.items || [];
  return list.slice(0, limit).map((item) => {
    const rawTitle = item.title || item.display_name || item.name || item['dc:title'] || 'Scholarly record';
    const title = Array.isArray(rawTitle) ? rawTitle[0] : rawTitle;
    const url = item.url || item.landing_page_url || item.URL || (item.DOI || item.doi ? `https://doi.org/${item.DOI || item.doi}` : finalUrl);
    const summaryText = item.abstract || item.description || item.summary || '';
    return analyseRecord({ title, html: summaryText ? `<p>${summaryText}</p>` : '<p></p>', text: summaryText, summary: summarize(summaryText), sourceUrl: url, canonicalUrl: url, metadata: { sourceName: source.name } }, source);
  });
}
async function discoverFromArxivApiSource(source, limit) {
  const { html, finalUrl } = await fetchSafe(source.url, 0, { checkRobots: false, accept: 'application/atom+xml,application/xml,text/xml', allowedContentTypes: /application\/atom\+xml|application\/xml|text\/xml/i });
  const dom = new JSDOM(html, { contentType: 'text/xml', url: finalUrl });
  return [...dom.window.document.querySelectorAll('entry')].slice(0, limit).map((entry) => {
    const title = xmlText(entry, ['title']) || 'arXiv record';
    const summaryText = xmlText(entry, ['summary']);
    const published = toIsoDate(xmlText(entry, ['published']));
    const link = [...entry.querySelectorAll('link[href]')].find((node) => /abs/i.test(node.getAttribute('href') || ''))?.getAttribute('href') || finalUrl;
    let record = analyseRecord({ title, html: plainHtml(summaryText), text: summaryText, summary: summarize(summaryText), sourceUrl: link, canonicalUrl: link, metadata: { sourceName: source.name || 'arXiv', publicationDate: published } }, source);
    if (published) record = addDateIfMissing(record, { type: 'Publication date', title: 'Publication date', date: published });
    return record;
  });
}
async function discoverFromSource(source, { limit = 10 } = {}) {
  const type = String(source.type || 'Public webpage').toLowerCase();
  if (/manual-only/.test(type)) return [];
  if (/rss|atom|feed/.test(type)) return discoverFromFeed(source, limit);
  if (/sitemap/.test(type)) return discoverFromSitemap(source, Math.min(limit, 8));
  if (/arxiv/.test(type)) return discoverFromArxivApiSource(source, limit);
  if (/\bapi\b|openalex|crossref|semantic scholar|custom api/.test(type)) return discoverFromJsonApi(source, limit);
  return [await discoverFromUrl(source.url, source)].filter(Boolean);
}
function userRef(uid) { return db.collection('users').doc(uid); }
function normalizedSeedValue(value = '') { return String(value || '').trim().toLowerCase(); }
function sourceMatchesSeed(source = {}, seed = {}) {
  return normalizedSeedValue(source.seedKey) === normalizedSeedValue(seed.seedKey)
    || normalizedSeedValue(source.url) === normalizedSeedValue(seed.url)
    || normalizedSeedValue(source.name) === normalizedSeedValue(seed.name);
}
export async function seedDefaultDiscoverySources(uid) {
  if (!uid) throw new Error('A user UID is required to seed discovery sources.');
  const collection = userRef(uid).collection('discoverySources');
  const snapshot = await collection.get();
  const existing = snapshot.docs.map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }));
  const sourceIds = [];
  for (const seed of DEFAULT_DISCOVERY_SOURCE_SEED) {
    const match = existing.find((source) => sourceMatchesSeed(source, seed));
    const ref = match?.ref || collection.doc(seed.id);
    const payload = {
      name: seed.name,
      url: seed.url,
      type: seed.type,
      expectedCategory: seed.expectedCategory,
      requestDelayMs: seed.requestDelayMs,
      concurrencyLimit: seed.concurrencyLimit,
      refreshFrequency: seed.refreshFrequency,
      seedKey: seed.seedKey,
      seedVersion: 1,
      seededBy: 'default-discovery-sources',
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!match) {
      Object.assign(payload, {
        enabled: true,
        paused: false,
        health: 'not-tested',
        errorCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        seededAt: FieldValue.serverTimestamp(),
      });
    } else {
      if (typeof match.enabled === 'undefined') payload.enabled = true;
      if (typeof match.paused === 'undefined') payload.paused = false;
    }
    await ref.set(payload, { merge: true });
    sourceIds.push(ref.id);
  }
  return { sourceCount: sourceIds.length, sourceIds };
}
async function getSettings(uid) {
  const snapshot = await userRef(uid).collection('discovery').doc('settings').get();
  return { ...DEFAULT_SETTINGS, ...(snapshot.exists ? snapshot.data() : {}) };
}
async function updateRun(runRef, patch) { await runRef.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); }
function datesSignature(page = {}) { return (page.importantDates || []).map((item) => `${item.type}:${item.date}`).sort().join('|'); }
function pagePayloadFromRecord(record, source, existing = null) {
  const nowIso = new Date().toISOString();
  const origin = /openalex|crossref|arxiv|semantic/i.test(source.type || '') ? 'scholarly-api' : 'auto-discovered';
  return {
    secure: false,
    encryption: null,
    title: record.title || 'Discovered research record',
    category: record.category || source.expectedCategory || 'Uncategorised',
    categoryAuto: true,
    categoryConfidence: record.categoryConfidence || 0,
    tags: record.tags || [],
    sourceUrl: record.sourceUrl,
    sourceDomain: sourceDomain(record.sourceUrl),
    sourceMetadata: record.metadata || {},
    summary: record.summary || summarize(record.text || record.title),
    html: sanitizeArticle(record.html || '<p></p>'),
    plainText: record.text || textFromHtml(record.html || ''),
    wikiLinks: [],
    importantDates: record.importantDates || [],
    dateAnalysisAt: nowIso,
    dateAnalysisSummary: {
      detectedCount: (record.importantDates || []).length,
      requiringConfirmation: (record.importantDates || []).filter((item) => item.uncertain && !item.confirmed).length,
      noDeadlineFound: !(record.importantDates || []).some((item) => item.date),
    },
    attachments: existing?.attachments || [],
    inlineFiles: existing?.inlineFiles || [],
    origin,
    createdOrigin: origin,
    createdByUser: false,
    isArchived: Boolean(existing?.isArchived),
    archivedAt: existing?.archivedAt || null,
    archivedReason: existing?.archivedReason || null,
    visibility: existing?.visibility === 'share-link' ? 'share-link' : 'private',
    shareId: existing?.shareId || null,
    shareCreatedAt: existing?.shareCreatedAt || null,
    shareExpiresAt: existing?.shareExpiresAt || null,
    discoveryState: record.relevanceScore >= 0.72 ? 'active' : 'inbox',
    discovery: {
      ...(existing?.discovery || {}),
      sourceId: source.id || null,
      sourceName: source.name || '',
      officialSourceUrl: record.sourceUrl,
      firstDiscoveredAt: existing?.discovery?.firstDiscoveredAt || nowIso,
      lastCheckedAt: nowIso,
      relevanceScore: record.relevanceScore || 0,
      dateConfidence: record.dateConfidence || 0,
      status: record.lifecycleStatus || 'active',
      noDeadlinePublished: Boolean(record.noDeadlinePublished),
    },
    opportunityDetails: { ...(existing?.opportunityDetails || {}), ...(record.opportunityDetails || {}) },
    lifecycleStatus: record.lifecycleStatus || 'active',
  };
}
async function findManualMatch(uid, record) {
  if (!record.sourceUrl) return null;
  const matches = await userRef(uid).collection('pages').where('sourceUrl', '==', record.sourceUrl).limit(3).get();
  return matches.docs.map((doc) => ({ id: doc.id, ...doc.data() })).find((page) => !['auto-discovered', 'scholarly-api'].includes(page.origin));
}
async function saveRecords(uid, records, source, warnings) {
  const stats = { newRecords: 0, updatedRecords: 0, duplicates: 0, possibleMatches: 0, datesDetected: 0 };
  const pages = userRef(uid).collection('pages');
  for (const record of records) {
    const pageRef = pages.doc(`disc_${stableHash(record.sourceUrl || `${source.id}:${record.title}`)}`);
    const existingSnapshot = await pageRef.get();
    const existing = existingSnapshot.exists ? existingSnapshot.data() : null;
    if (existing && !['auto-discovered', 'scholarly-api'].includes(existing.origin)) {
      stats.possibleMatches += 1;
      await userRef(uid).collection('discoveryMatches').add({ record, sourceId: source.id || null, manualPageId: pageRef.id, createdAt: FieldValue.serverTimestamp(), status: 'needs-review' });
      continue;
    }
    const manualMatch = await findManualMatch(uid, record);
    if (manualMatch) {
      stats.possibleMatches += 1;
      await userRef(uid).collection('discoveryMatches').add({ record, sourceId: source.id || null, manualPageId: manualMatch.id, createdAt: FieldValue.serverTimestamp(), status: 'needs-review' });
      continue;
    }
    const payload = pagePayloadFromRecord(record, { ...source, id: source.id || null }, existing);
    const changed = existing && (datesSignature(existing) !== datesSignature(payload) || existing.summary !== payload.summary || existing.lifecycleStatus !== payload.lifecycleStatus);
    await pageRef.set({ ...payload, updatedAt: FieldValue.serverTimestamp(), ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
    if (!existing) stats.newRecords += 1;
    else if (changed) stats.updatedRecords += 1;
    else stats.duplicates += 1;
  }
  if (stats.possibleMatches) warnings.push(`${stats.possibleMatches} possible manual match(es) need review before merging.`);
  return stats;
}
async function listSources(uid, sourceId = '') {
  if (sourceId) {
    const doc = await userRef(uid).collection('discoverySources').doc(sourceId).get();
    return doc.exists ? [{ id: doc.id, ...doc.data() }] : [];
  }
  const snapshot = await userRef(uid).collection('discoverySources').where('enabled', '==', true).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((source) => !source.paused);
}
async function refreshExisting(uid, runRef, warnings) {
  await updateRun(runRef, { status: 'running', step: 'loading-active-records', currentStage: QUICK_STAGES.loading, currentSource: null });
  const snapshot = await userRef(uid).collection('pages').where('origin', 'in', ['auto-discovered', 'scholarly-api']).limit(80).get();
  let updatedRecords = 0;
  let deadlineChanges = 0;
  let closedRecords = 0;
  let datesDetected = 0;
  let failures = 0;
  let checked = 0;
  await updateRun(runRef, { currentStage: QUICK_STAGES.rechecking, recordsFound: snapshot.size, stats: { refreshedRecords: snapshot.size } });
  for (const doc of snapshot.docs) {
    const page = { id: doc.id, ...doc.data() };
    if (!page.sourceUrl || page.lifecycleStatus === 'closed') continue;
    checked += 1;
    try {
      await updateRun(runRef, { currentSource: page.title || page.sourceUrl, sourcesChecked: checked, stats: { refreshedRecords: snapshot.size, recordsChecked: checked } });
      const source = { id: page.discovery?.sourceId || null, name: page.discovery?.sourceName || page.sourceDomain, url: page.sourceUrl, type: page.origin === 'scholarly-api' ? 'Custom API' : 'Public webpage', expectedCategory: page.category };
      const record = await discoverFromUrl(page.sourceUrl, source);
      const payload = pagePayloadFromRecord(record, source, page);
      const datesChanged = datesSignature(page) !== datesSignature(payload);
      const statusChanged = page.lifecycleStatus !== payload.lifecycleStatus;
      if (datesChanged) deadlineChanges += 1;
      if (payload.lifecycleStatus === 'expired' && page.lifecycleStatus !== 'expired') closedRecords += 1;
      if (datesChanged || statusChanged) updatedRecords += 1;
      datesDetected += (payload.importantDates || []).length;
      await updateRun(runRef, { currentStage: QUICK_STAGES.comparing, recordsUpdated: updatedRecords, datesDetected });
      await doc.ref.set({ ...payload, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      failures += 1;
      warnings.push(`Refresh failed for ${page.title || page.sourceUrl}: ${error.message}`);
    }
  }
  await updateRun(runRef, { currentStage: QUICK_STAGES.updating, recordsUpdated: updatedRecords, datesDetected, failures });
  await updateRun(runRef, { currentStage: QUICK_STAGES.saving });
  return { updatedRecords, refreshedRecords: snapshot.size, recordsChecked: checked, recordsFound: snapshot.size, deadlineChanges, closedRecords, datesDetected, failures };
}
async function executeRun(uid, { mode = 'full', trigger = 'manual', sourceId = '' } = {}) {
  const runRef = userRef(uid).collection('discoveryRuns').doc();
  const lockRef = userRef(uid).collection('discovery').doc('scanLock');
  const settings = await getSettings(uid);
  const warnings = [];
  const runType = runTypeFor({ mode, trigger, sourceId });
  const initialStage = mode === 'quick' ? QUICK_STAGES.queued : FULL_STAGES.requested;
  const requestedBy = trigger === 'manual' || trigger === 'manual-source' ? uid : trigger;
  await db.runTransaction(async (transaction) => {
    const lock = await transaction.get(lockRef);
    const data = lock.exists ? lock.data() : null;
    const lockedAt = data?.lockedAt?.toDate ? data.lockedAt.toDate().getTime() : 0;
    if (data?.active && Date.now() - lockedAt < 45 * 60 * 1000) throw new Error('Another discovery scan is already running.');
    transaction.set(lockRef, { active: true, runId: runRef.id, mode, trigger, lockedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(runRef, {
      runType,
      mode,
      trigger,
      status: 'queued',
      step: 'queued',
      requestedBy,
      requestedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      startedAt: null,
      completedAt: null,
      timezone: settings.timezone || TZ,
      currentStage: initialStage,
      currentSource: null,
      sourcesTotal: 0,
      sourcesChecked: 0,
      recordsFound: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      duplicatesSkipped: 0,
      datesDetected: 0,
      warnings: 0,
      warningMessages: [],
      failures: 0,
      errorSummary: null,
      stats: {},
    });
  });
  const stats = { sourcesTotal: 0, sourcesChecked: 0, sourcesSucceeded: 0, recordsFound: 0, newRecords: 0, updatedRecords: 0, duplicates: 0, refreshedRecords: 0, recordsChecked: 0, deadlineChanges: 0, closedRecords: 0, datesDetected: 0, failures: 0 };
  try {
    await userRef(uid).collection('discovery').doc('stats').set({ lastAttemptedScanAt: FieldValue.serverTimestamp(), lastRunId: runRef.id }, { merge: true });
    if (settings.pauseAllScanning) throw new Error('Scanning is paused by user settings.');
    if (!settings.automaticDiscoveryEnabled && trigger.startsWith('scheduled')) throw new Error('Automatic discovery is disabled by user settings.');
    await updateRun(runRef, { status: 'running', startedAt: FieldValue.serverTimestamp(), currentStage: mode === 'quick' ? QUICK_STAGES.loading : FULL_STAGES.loading, step: mode === 'quick' ? 'loading-active-records' : 'loading-sources' });
    if (mode === 'quick') {
      Object.assign(stats, await refreshExisting(uid, runRef, warnings));
      stats.recordsFound = stats.refreshedRecords;
    } else {
      await updateRun(runRef, { currentStage: FULL_STAGES.loading, step: 'loading-sources' });
      const sources = (await listSources(uid, sourceId)).slice(0, Number(settings.maxSourcesPerRun || 24));
      stats.sourcesTotal = sources.length;
      await updateRun(runRef, { sourcesTotal: sources.length, stats: { sourcesTotal: sources.length } });
      if (!sources.length) warnings.push('No enabled discovery sources are configured.');
      const bySource = [];
      for (const [index, source] of sources.entries()) {
        await delay(source.requestDelayMs || 1000);
        try {
          await updateRun(runRef, { status: 'running', step: 'checking-source', currentStage: `Checking source ${index + 1} of ${sources.length}`, currentSource: source.name || source.url, sourcesChecked: stats.sourcesChecked, sourcesTotal: sources.length });
          await updateRun(runRef, { step: 'extracting-records', currentStage: FULL_STAGES.extracting });
          const records = await discoverFromSource(source, { limit: sourceId ? 10 : 6 });
          bySource.push({ source, records });
          stats.sourcesChecked += 1;
          stats.sourcesSucceeded += 1;
          stats.recordsFound += records.length;
          await userRef(uid).collection('discoverySources').doc(source.id).set({ lastAttemptedAt: FieldValue.serverTimestamp(), lastCheckedAt: FieldValue.serverTimestamp(), lastSuccessfulAt: FieldValue.serverTimestamp(), resultCount: records.length, resultsFound: records.length, health: records.length ? 'healthy' : 'warning', lastError: '', errorCount: 0 }, { merge: true });
          await updateRun(runRef, { sourcesChecked: stats.sourcesChecked, recordsFound: stats.recordsFound, stats });
        } catch (error) {
          stats.sourcesChecked += 1;
          stats.failures += 1;
          warnings.push(`${source.name || source.url}: ${error.message}`);
          await userRef(uid).collection('discoverySources').doc(source.id).set({ lastAttemptedAt: FieldValue.serverTimestamp(), lastCheckedAt: FieldValue.serverTimestamp(), health: 'error', lastError: error.message, errorCount: FieldValue.increment(1) }, { merge: true });
          await updateRun(runRef, { sourcesChecked: stats.sourcesChecked, failures: stats.failures, warnings: warnings.length, warningMessages: warnings, errorSummary: warnings[0] || null, stats });
        }
      }
      await updateRun(runRef, { step: 'categorising', currentStage: FULL_STAGES.categorising });
      await updateRun(runRef, { step: 'detecting-dates', currentStage: FULL_STAGES.dates });
      await updateRun(runRef, { step: 'checking-duplicates', currentStage: FULL_STAGES.duplicates });
      await updateRun(runRef, { step: 'saving-results', currentStage: FULL_STAGES.saving });
      for (const item of bySource) {
        const saved = await saveRecords(uid, item.records, item.source, warnings);
        stats.newRecords += saved.newRecords;
        stats.updatedRecords += saved.updatedRecords;
        stats.duplicates += saved.duplicates;
        stats.datesDetected += saved.datesDetected;
        await updateRun(runRef, { recordsCreated: stats.newRecords, recordsUpdated: stats.updatedRecords, duplicatesSkipped: stats.duplicates, datesDetected: stats.datesDetected, warnings: warnings.length, warningMessages: warnings, stats });
      }
      await updateRun(runRef, { step: 'updating-calendar', currentStage: FULL_STAGES.calendar });
    }
    const finalStatus = warnings.length || stats.failures ? 'completed-with-warnings' : 'completed';
    await updateRun(runRef, {
      status: finalStatus,
      step: finalStatus,
      currentStage: finalStatus === 'completed' ? FULL_STAGES.completed : 'Completed with warnings',
      currentSource: null,
      stats,
      sourcesTotal: stats.sourcesTotal,
      sourcesChecked: stats.sourcesChecked,
      recordsFound: stats.recordsFound,
      recordsCreated: stats.newRecords,
      recordsUpdated: stats.updatedRecords,
      duplicatesSkipped: stats.duplicates,
      datesDetected: stats.datesDetected,
      warnings: warnings.length,
      warningMessages: warnings,
      failures: stats.failures,
      errorSummary: warnings[0] || null,
      completedAt: FieldValue.serverTimestamp(),
    });
    const verifiedRun = stats.sourcesSucceeded > 0 || (mode === 'quick' && stats.recordsChecked > 0);
    const statsPatch = { lastAttemptedScanAt: FieldValue.serverTimestamp(), sourcesChecked: stats.sourcesChecked, sourcesSucceeded: stats.sourcesSucceeded, recordsChecked: stats.recordsChecked, newRecords: stats.newRecords, updatedRecords: stats.updatedRecords, duplicatesSkipped: stats.duplicates, warnings: warnings.length, failures: stats.failures, lastRunId: runRef.id };
    if (verifiedRun) Object.assign(statsPatch, { lastSuccessfulScanAt: FieldValue.serverTimestamp(), lastSuccessfulRunId: runRef.id, verifiedBackendAt: FieldValue.serverTimestamp() });
    await userRef(uid).collection('discovery').doc('stats').set(statsPatch, { merge: true });
    await userRef(uid).collection('notifications').add({ type: 'discovery-run', title: finalStatus === 'completed' ? 'Discovery scan completed' : 'Discovery scan completed with warnings', message: `${stats.newRecords} new, ${stats.updatedRecords} updated, ${warnings.length} warning(s).`, createdAt: FieldValue.serverTimestamp(), runId: runRef.id, read: false });
    return { runId: runRef.id, status: finalStatus, stats, warnings };
  } catch (error) {
    await updateRun(runRef, { status: 'failed', step: 'failed', currentStage: 'Failed', currentSource: null, error: error.message, errorSummary: error.message, stats, warnings: warnings.length, warningMessages: warnings, failures: stats.failures || 1, completedAt: FieldValue.serverTimestamp() });
    await userRef(uid).collection('discovery').doc('stats').set({ lastAttemptedScanAt: FieldValue.serverTimestamp(), lastError: error.message, lastRunId: runRef.id }, { merge: true });
    throw error;
  } finally { await lockRef.set({ active: false, releasedAt: FieldValue.serverTimestamp() }, { merge: true }); }
}
async function configuredUserIds() {
  const ids = (process.env.DISCOVERY_USER_UIDS || process.env.DISCOVERY_USER_UID || process.env.ALLOWED_UID || '')
    .split(',').map((item) => item.trim()).filter(Boolean);
  if (ids.length) return ids;
  if (process.env.DISCOVERY_SCAN_ALL_USERS === 'true') {
    const snapshot = await db.collection('users').limit(20).get();
    return snapshot.docs.map((doc) => doc.id);
  }
  logger.warn('No DISCOVERY_USER_UIDS configured; scheduled discovery skipped.');
  return [];
}
export async function seedDiscoverySourcesForConfiguredUsers() {
  const results = [];
  for (const uid of await configuredUserIds()) {
    results.push({ uid, ...(await seedDefaultDiscoverySources(uid)) });
  }
  return results;
}
function localParts(settings, date = new Date()) {
  const timezone = settings.timezone || TZ;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return { time: `${get('hour')}:${get('minute')}`, weekday: get('weekday') };
}
function isWeekend(settings) {
  const weekday = localParts(settings).weekday.toLowerCase();
  return weekday.startsWith('sat') || weekday.startsWith('sun');
}
async function runScheduled(mode, trigger) {
  for (const uid of await configuredUserIds()) {
    try {
      await seedDefaultDiscoverySources(uid);
      const settings = await getSettings(uid);
      if (settings.pauseAllScanning || !settings.automaticDiscoveryEnabled) continue;
      if (!settings.weekendScansEnabled && isWeekend(settings)) continue;
      await executeRun(uid, { mode, trigger });
    } catch (error) { logger.warn('Scheduled discovery failed', { uid, mode, trigger, message: error.message }); }
  }
}
async function runConfigTick() {
  for (const uid of await configuredUserIds()) {
    await seedDefaultDiscoverySources(uid);
    const settings = await getSettings(uid);
    if (settings.pauseAllScanning || !settings.automaticDiscoveryEnabled) continue;
    if (!settings.weekendScansEnabled && isWeekend(settings)) continue;
    const { time } = localParts(settings);
    if ((settings.fullScanTimes || DEFAULT_SETTINGS.fullScanTimes).includes(time)) {
      try { await executeRun(uid, { mode: 'full', trigger: 'scheduled-configured-time' }); } catch (error) { logger.warn('Configured full scan failed', { uid, message: error.message }); }
      continue;
    }
    const stats = await userRef(uid).collection('discovery').doc('stats').get();
    const last = stats.data()?.lastAttemptedScanAt?.toDate?.() || new Date(0);
    if (Date.now() - last.getTime() >= Number(settings.refreshIntervalHours || 6) * 60 * 60 * 1000) {
      try { await executeRun(uid, { mode: 'quick', trigger: 'scheduled-configured-refresh' }); } catch (error) { logger.warn('Configured refresh failed', { uid, message: error.message }); }
    }
  }
}
function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}
async function updateDiscoveryRequest(requestRef, patch) {
  await requestRef.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
async function executeSingleLinkRequest(uid, requestRef, request) {
  const sourceUrl = String(request.sourceUrl || request.url || '').trim();
  if (!sourceUrl) throw new Error('Queued link request is missing sourceUrl.');
  const runRef = userRef(uid).collection('discoveryRuns').doc();
  const source = { id: requestRef.id, name: 'Queued link request', url: sourceUrl, type: 'Public webpage', expectedCategory: request.expectedCategory || '' };
  const warnings = [];
  const stats = { sourcesTotal: 1, sourcesChecked: 0, sourcesSucceeded: 0, recordsFound: 0, newRecords: 0, updatedRecords: 0, duplicates: 0, datesDetected: 0, failures: 0 };
  await updateDiscoveryRequest(requestRef, { status: 'processing', statusLabel: 'Processing', runId: runRef.id, startedAt: FieldValue.serverTimestamp() });
  await runRef.set({
    runType: 'single-url',
    mode: 'single-link',
    trigger: 'queued-link-request',
    requestId: requestRef.id,
    status: 'queued',
    step: 'queued',
    requestedBy: uid,
    requestedAt: request.requestedAt || request.createdAt || FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    startedAt: null,
    completedAt: null,
    timezone: TZ,
    currentStage: URL_IMPORT_STAGES.validating,
    currentSource: sourceUrl,
    sourcesTotal: 1,
    sourcesChecked: 0,
    recordsFound: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    duplicatesSkipped: 0,
    datesDetected: 0,
    warnings: 0,
    warningMessages: [],
    failures: 0,
    errorSummary: null,
    stats: {},
  });
  try {
    await userRef(uid).collection('discovery').doc('stats').set({ lastAttemptedScanAt: FieldValue.serverTimestamp(), lastRunId: runRef.id }, { merge: true });
    await updateRun(runRef, { status: 'running', startedAt: FieldValue.serverTimestamp(), currentStage: URL_IMPORT_STAGES.connecting, step: 'connecting' });
    await updateRun(runRef, { currentStage: URL_IMPORT_STAGES.reading, step: 'reading-page' });
    const supplied = { title: request.title || '', text: request.text || '', sharedText: request.sharedText || '' };
    const record = await discoverFromUrl(sourceUrl, source, supplied);
    await updateRun(runRef, { currentStage: URL_IMPORT_STAGES.extracting, step: 'extracting-content', recordsFound: 1 });
    await updateRun(runRef, { currentStage: URL_IMPORT_STAGES.dates, step: 'detecting-dates', datesDetected: (record.importantDates || []).length });
    await updateRun(runRef, { currentStage: URL_IMPORT_STAGES.duplicates, step: 'checking-duplicates' });
    if (record.extractionBlocked) warnings.push(record.metadata?.platformMessage || 'The platform did not allow complete automatic extraction. The supplied link was preserved.');
    const saved = await saveRecords(uid, [record], source, warnings);
    stats.sourcesChecked = 1;
    stats.sourcesSucceeded = 1;
    stats.recordsFound = 1;
    stats.newRecords = saved.newRecords;
    stats.updatedRecords = saved.updatedRecords;
    stats.duplicates = saved.duplicates;
    stats.datesDetected = saved.datesDetected;
    const finalStatus = warnings.length ? 'completed-with-warnings' : 'completed';
    await updateRun(runRef, {
      status: finalStatus,
      step: finalStatus,
      currentStage: finalStatus === 'completed' ? URL_IMPORT_STAGES.ready : 'Completed with warnings',
      currentSource: null,
      sourcesChecked: 1,
      recordsFound: 1,
      recordsCreated: stats.newRecords,
      recordsUpdated: stats.updatedRecords,
      duplicatesSkipped: stats.duplicates,
      datesDetected: stats.datesDetected,
      warnings: warnings.length,
      warningMessages: warnings,
      failures: 0,
      errorSummary: warnings[0] || null,
      stats,
      completedAt: FieldValue.serverTimestamp(),
    });
    await userRef(uid).collection('discovery').doc('stats').set({
      lastAttemptedScanAt: FieldValue.serverTimestamp(),
      lastSuccessfulScanAt: FieldValue.serverTimestamp(),
      lastSuccessfulRunId: runRef.id,
      verifiedBackendAt: FieldValue.serverTimestamp(),
      newRecords: stats.newRecords,
      updatedRecords: stats.updatedRecords,
      duplicatesSkipped: stats.duplicates,
      warnings: warnings.length,
      failures: 0,
      lastRunId: runRef.id,
    }, { merge: true });
    await updateDiscoveryRequest(requestRef, {
      status: 'completed',
      statusLabel: 'Completed',
      completedAt: FieldValue.serverTimestamp(),
      error: '',
      stats,
      warnings,
    });
    return { runId: runRef.id, status: finalStatus, stats, warnings };
  } catch (error) {
    stats.failures = 1;
    await updateRun(runRef, { status: 'failed', step: 'failed', currentStage: 'Failed', currentSource: null, error: error.message, errorSummary: error.message, stats, failures: 1, completedAt: FieldValue.serverTimestamp() });
    await userRef(uid).collection('discovery').doc('stats').set({ lastAttemptedScanAt: FieldValue.serverTimestamp(), lastError: error.message, lastRunId: runRef.id, failures: 1 }, { merge: true });
    await updateDiscoveryRequest(requestRef, { status: 'failed', statusLabel: 'Failed', runId: runRef.id, error: error.message, completedAt: FieldValue.serverTimestamp() });
    throw error;
  }
}
async function executeQueuedRunRequest(uid, requestRef, request) {
  const type = request.type || '';
  const sourceId = String(request.sourceId || '').trim();
  if (type === 'single-source' && !sourceId) throw new Error('Queued source scan is missing sourceId.');
  const mode = type === 'quick-refresh' ? 'quick' : 'full';
  const trigger = type === 'quick-refresh' ? 'queued-quick-refresh' : 'queued-source-scan';
  await updateDiscoveryRequest(requestRef, { status: 'processing', statusLabel: 'Processing', startedAt: FieldValue.serverTimestamp() });
  try {
    const result = await executeRun(uid, { mode, trigger, sourceId });
    await updateDiscoveryRequest(requestRef, { status: 'completed', statusLabel: 'Completed', runId: result.runId, completedAt: FieldValue.serverTimestamp(), stats: result.stats || {}, warnings: result.warnings || [] });
    return result;
  } catch (error) {
    await updateDiscoveryRequest(requestRef, { status: 'failed', statusLabel: 'Failed', error: error.message, completedAt: FieldValue.serverTimestamp() });
    throw error;
  }
}
async function processQueuedDiscoveryRequests(uid) {
  const snapshot = await userRef(uid).collection('discoveryRequests').where('status', '==', 'queued').limit(25).get();
  const queued = snapshot.docs.sort((a, b) => timestampMillis(a.data().createdAt || a.data().requestedAt) - timestampMillis(b.data().createdAt || b.data().requestedAt));
  const results = [];
  for (const doc of queued) {
    const request = { id: doc.id, ...doc.data() };
    try {
      if (request.type === 'single-link') results.push({ requestId: doc.id, ...(await executeSingleLinkRequest(uid, doc.ref, request)) });
      else if (request.type === 'quick-refresh' || request.type === 'single-source') results.push({ requestId: doc.id, ...(await executeQueuedRunRequest(uid, doc.ref, request)) });
      else await updateDiscoveryRequest(doc.ref, { status: 'failed', statusLabel: 'Failed', error: `Unsupported discovery request type: ${request.type || 'unknown'}`, completedAt: FieldValue.serverTimestamp() });
    } catch (error) {
      logger.warn('Queued discovery request failed', { uid, requestId: doc.id, type: request.type, message: error.message });
    }
  }
  return results;
}
export async function runDiscoveryForConfiguredUsers(scanType = process.env.DISCOVERY_SCAN_TYPE || 'full') {
  const mode = scanType === 'quick' ? 'quick' : 'full';
  for (const uid of await configuredUserIds()) {
    try {
      await seedDefaultDiscoverySources(uid);
      await executeRun(uid, { mode, trigger: 'github-actions' });
    } catch (error) {
      logger.warn('GitHub Actions discovery scan failed', { uid, mode, message: error.message });
    }
    try {
      await processQueuedDiscoveryRequests(uid);
    } catch (error) {
      logger.warn('GitHub Actions queued request processing failed', { uid, message: error.message });
    }
  }
}
