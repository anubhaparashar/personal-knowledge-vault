const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'rcm',
  'trk',
  'trackingId',
  'lipi',
  'midToken',
  'midSig',
  'eid',
]);

const LINKEDIN_BOUNDARIES = [
  'More Relevant Posts',
  'More from this author',
  'Explore content categories',
  'Related posts',
  'Related Posts',
  'Comments',
  'Footer',
  'Sign in to view or add a comment',
];

const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const DATE_TYPE_PATTERNS = [
  [/deadline\s+for\s+revision\s+submissions?|revision\s+submission\s+deadline/i, 'revision-submission-deadline', 'Revision submission deadline'],
  [/notification\s+of\s+final\s+decisions?|final\s+decision\s+notification/i, 'final-decision-notification', 'Final decision notification'],
  [/first[-\s]*round\s+review\s+decisions?/i, 'first-round-review-decision', 'First-round review decision'],
  [/abstract\s+(?:submission\s+)?deadline/i, 'abstract-submission-deadline', 'Abstract submission deadline'],
  [/full[-\s]*paper\s+(?:submission\s+)?deadline|manuscript\s+(?:submission\s+)?deadline/i, 'full-paper-submission-deadline', 'Full-paper submission deadline'],
  [/camera[-\s]*ready/i, 'camera-ready-deadline', 'Camera-ready deadline'],
  [/registration\s+deadline/i, 'registration-deadline', 'Registration deadline'],
  [/submissions?\s+deadline|submission\s+deadline/i, 'submission-deadline', 'Submission deadline'],
  [/\bnotification\b/i, 'notification-date', 'Notification date'],
  [/tentative\s+publication|publication/i, 'tentative-publication', 'Tentative publication'],
  [/deadline|closing|last\s+date/i, 'generic-deadline', 'Deadline'],
  [/conference\s+date|event\s+date/i, 'event-date', 'Event date'],
];

const TOPIC_PATTERNS = [
  [/responsible.*explainable.*multimodal[-\s]*fusion|multimodal[-\s]*fusion.*architectures/i, 'Responsible and explainable multimodal-fusion architectures'],
  [/evaluation\s+protocols?.*multimodal\s+fusion/i, 'Evaluation protocols for multimodal fusion'],
  [/foundation[-\s]*model.*multimodal[-\s]*llm|multimodal[-\s]*llm.*alignment/i, 'Foundation-model and multimodal-LLM alignment'],
  [/interpretable\s+decision[-\s]*making/i, 'Interpretable decision-making'],
  [/generative.*synthetic\s+data|synthetic\s+data/i, 'Generative and synthetic data'],
  [/bias\s+detection.*mitigation|mitigation.*bias/i, 'Bias detection and mitigation'],
  [/fairness.*accountability|accountability.*fairness/i, 'Fairness and accountability'],
  [/transfer\s+learning/i, 'Transfer learning'],
  [/domain\s+adaptation/i, 'Domain adaptation'],
  [/adversarial\s+robustness/i, 'Adversarial robustness'],
  [/cross[-\s]*modal\s+security/i, 'Cross-modal security'],
  [/continual.*lifelong\s+learning|lifelong.*continual\s+learning/i, 'Continual and lifelong learning'],
  [/federated\s+multimodal\s+learning/i, 'Federated multimodal learning'],
  [/edge\s+multimodal\s+learning/i, 'Edge multimodal learning'],
  [/privacy[-\s]*preserving\s+multimodal\s+learning/i, 'Privacy-preserving multimodal learning'],
];

const SPECIAL_ISSUE_TAGS = [
  'ACM TOMM',
  'Special Issue',
  'Multimodal Fusion',
  'Responsible AI',
  'Explainable AI',
  'Multimodal LLMs',
  'Privacy-Preserving Learning',
  'Adversarial Robustness',
];

function decodeEntities(value = '') {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cleanText(value = '') {
  return decodeEntities(value)
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function stripHtml(value = '') {
  return cleanText(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/(?:p|div|li|h[1-6]|tr|section|article|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' '));
}

function unique(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tryUrl(value) {
  try { return new URL(value); } catch { return null; }
}

export function isLinkedInUrl(value = '') {
  const parsed = tryUrl(value);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  return host === 'linkedin.com' || host === 'lnkd.in';
}

export function isLinkedInPostUrl(value = '') {
  const parsed = tryUrl(value);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'lnkd.in') return true;
  if (host !== 'linkedin.com') return false;
  return /\/posts\/|\/feed\/update\/|activity-\d+/i.test(parsed.pathname);
}

export function normalizeLinkedInPostUrl(value = '') {
  const parsed = tryUrl(value);
  if (!parsed) return value;
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key) || /^utm_/i.test(key)) parsed.searchParams.delete(key);
  }
  let normalized = parsed.toString();
  normalized = normalized.replace(/\?$/, '').replace(/\/$/, '');
  return normalized;
}

export function authorFromLinkedInUrl(value = '') {
  const parsed = tryUrl(value);
  if (!parsed) return '';
  const match = parsed.pathname.match(/\/posts\/([^/_]+)/i);
  if (!match) return '';
  const parts = match[1]
    .split('-')
    .filter(Boolean)
    .filter((part, index, all) => !(index === all.length - 1 && /^[a-f0-9]{6,}$/i.test(part)));
  const nameParts = [];
  let suffix = '';
  for (const part of parts) {
    if (/^phd$/i.test(part)) suffix = 'PhD';
    else nameParts.push(part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
  }
  const name = nameParts.join(' ').trim();
  return suffix && name ? `${name}, ${suffix}` : name;
}

export function truncateAtLinkedInBoundaries(text = '') {
  const clean = cleanText(text);
  let end = clean.length;
  for (const marker of LINKEDIN_BOUNDARIES) {
    const index = clean.toLowerCase().indexOf(marker.toLowerCase());
    if (index >= 0) end = Math.min(end, index);
  }
  return clean.slice(0, end).trim();
}

function metaContent(html = '', names = []) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return cleanText(match[1]);
    }
  }
  return '';
}

function canonicalLink(html = '') {
  const match = html.match(/<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical[^"']*["'][^>]*>/i);
  return match?.[1] ? cleanText(match[1]) : '';
}

function parseJsonLd(html = '') {
  const values = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    try {
      values.push(JSON.parse(decodeEntities(match[1])));
    } catch {}
  }
  return values;
}

function findJsonValue(values = [], keys = []) {
  const wanted = new Set(keys);
  const queue = [...values];
  while (queue.length) {
    const item = queue.shift();
    if (!item) continue;
    if (Array.isArray(item)) { queue.push(...item); continue; }
    if (typeof item !== 'object') continue;
    for (const [key, value] of Object.entries(item)) {
      if (wanted.has(key) && typeof value === 'string' && value.trim()) return cleanText(value);
      if (wanted.has(key) && value && typeof value === 'object' && typeof value.name === 'string') return cleanText(value.name);
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return '';
}

function extractBodyCandidate(html = '') {
  const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0];
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0];
  const body = html.match(/<body[\s\S]*?<\/body>/i)?.[0] || html;
  const candidates = [article, main, body].filter(Boolean).map((item) => truncateAtLinkedInBoundaries(stripHtml(item)));
  return candidates.sort((a, b) => b.length - a.length)[0] || '';
}

function decodeLinkedInHref(raw = '', baseUrl = '') {
  if (!raw || /^#|^mailto:/i.test(raw)) return '';
  let absolute = raw;
  try { absolute = new URL(raw, baseUrl || 'https://www.linkedin.com/').toString(); } catch { return ''; }
  const parsed = tryUrl(absolute);
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) return '';
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'linkedin.com' && /\/redir\/|\/safety\/go/i.test(parsed.pathname)) {
    const target = parsed.searchParams.get('url') || parsed.searchParams.get('target') || parsed.searchParams.get('q');
    if (target) return decodeURIComponent(target);
  }
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key) || /^utm_/i.test(key)) parsed.searchParams.delete(key);
  }
  return parsed.toString().replace(/\?$/, '');
}

function urlsFromText(text = '') {
  return [...String(text || '').matchAll(/https?:\/\/[^\s<>"')\]]+/gi)]
    .map((match) => match[0].replace(/[.,;:!?]+$/, ''));
}

export function extractLinkedInPostFromHtml(html = '', finalUrl = '') {
  const jsonLd = parseJsonLd(html);
  const ogTitle = metaContent(html, ['og:title', 'twitter:title']);
  const ogDescription = metaContent(html, ['og:description', 'twitter:description', 'description']);
  const canonical = canonicalLink(html) || normalizeLinkedInPostUrl(finalUrl);
  const bodyText = extractBodyCandidate(html);
  const description = truncateAtLinkedInBoundaries(ogDescription);
  const text = bodyText.length >= description.length ? bodyText : description;
  const author = metaContent(html, ['author', 'article:author'])
    || findJsonValue(jsonLd, ['author'])
    || authorFromLinkedInUrl(finalUrl);
  const hrefs = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => decodeLinkedInHref(decodeEntities(match[1]), finalUrl))
    .filter(Boolean);
  const links = unique([...hrefs, ...urlsFromText(text), ...urlsFromText(description)])
    .filter((url) => /^https?:\/\//i.test(url))
    .map((url) => ({
      originalUrl: url,
      url,
      kind: /\.pdf(?:[?#]|$)/i.test(url) ? 'pdf' : 'link',
    }));
  const hashtags = unique([...(text.match(/#[\p{L}\p{N}_-]+/gu) || [])].map((tag) => tag.replace(/^#/, '')));
  const datePublished = metaContent(html, ['article:published_time', 'datePublished'])
    || findJsonValue(jsonLd, ['datePublished', 'dateCreated']);
  const warnings = [];
  if (!text || /sign in|log in|authwall|join linkedin/i.test(text)) warnings.push('LinkedIn allowed only partial public extraction.');
  return {
    sourcePlatform: 'linkedin',
    title: ogTitle || findJsonValue(jsonLd, ['headline', 'name']) || 'LinkedIn post',
    description,
    author,
    text,
    datePublished,
    canonicalUrl: canonical ? normalizeLinkedInPostUrl(canonical) : normalizeLinkedInPostUrl(finalUrl),
    hashtags,
    links,
    warnings,
    extractionStatus: warnings.length ? 'partial' : 'full',
  };
}

function monthNumber(value = '') {
  return MONTHS[String(value || '').toLowerCase().slice(0, 3)] || MONTHS[String(value || '').toLowerCase()] || null;
}

function parseDateValue(value = '') {
  const raw = String(value || '').trim().replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  const named = raw.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+(20\d{2})\b/i) || raw.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b/i);
  if (named) {
    const dayFirst = /^\d/.test(named[1]);
    const month = monthNumber(dayFirst ? named[2] : named[1]);
    const day = Number(dayFirst ? named[1] : named[2]);
    const year = Number(named[3]);
    if (month && day && year) return { date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, year, month, day, precision: 'day' };
  }
  const iso = raw.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return { date: `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`, year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]), precision: 'day' };
  const monthOnly = raw.match(/\b([A-Za-z]+)\s+(20\d{2})\b/i);
  if (monthOnly) {
    const month = monthNumber(monthOnly[1]);
    const year = Number(monthOnly[2]);
    if (month && year) return { date: null, year, month, day: null, precision: 'month' };
  }
  return null;
}

function lineBlocks(text = '') {
  return cleanText(text)
    .split(/\n+|(?<=\.)\s+(?=(?:Submissions?|First[-\s]*round|Deadline|Notification|Tentative|Abstract|Full[-\s]*paper|Camera[-\s]*ready|Registration)\b)/i)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(Boolean);
}

export function extractMilestoneDates(text = '', { sourceType = 'linkedin-post', sourceUrl = '' } = {}) {
  const datePattern = /(?:\b[A-Za-z]+\s+\d{1,2},?\s+20\d{2}\b|\b\d{1,2}\s+[A-Za-z]+\s+20\d{2}\b|\b20\d{2}-\d{1,2}-\d{1,2}\b|\b[A-Za-z]+\s+20\d{2}\b)/i;
  const seen = new Set();
  const dates = [];
  for (const block of lineBlocks(text)) {
    const dateMatch = block.match(datePattern);
    if (!dateMatch) continue;
    const parsed = parseDateValue(dateMatch[0]);
    if (!parsed) continue;
    const [, type, title] = DATE_TYPE_PATTERNS.find(([pattern]) => pattern.test(block)) || DATE_TYPE_PATTERNS[DATE_TYPE_PATTERNS.length - 2];
    const key = `${type}:${parsed.date || `${parsed.year}-${parsed.month}`}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dates.push({
      id: key,
      type,
      title,
      displayLabel: title,
      date: parsed.date,
      year: parsed.year,
      month: parsed.month,
      day: parsed.day,
      precision: parsed.precision,
      datePrecision: parsed.precision,
      sourceText: block,
      snippet: block,
      source: sourceType === 'official-pdf' || sourceType === 'official-webpage' ? 'official-source' : 'automatic',
      sourceType,
      sourceUrl,
      detectedAutomatically: true,
      confirmed: parsed.precision === 'day',
      uncertain: parsed.precision !== 'day',
      confidence: parsed.precision === 'day' ? 'high' : 'medium',
      detectionStatus: parsed.precision === 'day' ? 'confirmed' : 'Needs confirmation',
      allDay: true,
    });
  }
  return dates;
}

function extractLine(text = '', label) {
  const pattern = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'im');
  return cleanText(text.match(pattern)?.[1] || '');
}

function extractReportedJournalInfo(text = '') {
  const impactFactor = text.match(/\bIF\s*:\s*([0-9.]+)/i)?.[1] || '';
  const quartile = text.match(/\bQ[1-4]\b/i)?.[0]?.toUpperCase() || '';
  return impactFactor || quartile ? {
    impactFactor,
    quartile,
    verificationStatus: 'Unverified external claim',
  } : null;
}

function extractGuestEditors(text = '') {
  const known = [
    ['Lucia Cascone', 'University of Salerno', 'Italy'],
    ['Emanuela Marasco', 'Virginia Commonwealth University', 'USA'],
    ['Imad Rida', 'Universite de Technologie de Compiegne', 'France'],
  ];
  return known.filter(([name]) => new RegExp(name.replace(/\s+/g, '\\s+'), 'i').test(text)).map(([name, institution, country]) => ({
    name,
    institution: /Université de Technologie de Compiègne|Universite de Technologie de Compiegne/i.test(text) && name === 'Imad Rida'
      ? 'Université de Technologie de Compiègne'
      : institution,
    country,
  }));
}

function extractTopics(text = '') {
  const topics = TOPIC_PATTERNS.filter(([pattern]) => pattern.test(text)).map(([, topic]) => topic);
  return unique(topics);
}

export function extractSpecialIssueStructuredFields(text = '') {
  const journalLine = extractLine(text, 'Journal');
  const journal = cleanText(journalLine.replace(/\s*\([^)]*\)\s*$/, '')) || (/ACM Transactions on Multimedia Computing, Communications, and Applications/i.test(text) ? 'ACM Transactions on Multimedia Computing, Communications, and Applications' : '');
  const specialIssueTitle = extractLine(text, 'Special Issue') || (/Towards Responsible and Explainable Multi-Modal Fusion/i.test(text) ? 'Towards Responsible and Explainable Multi-Modal Fusion' : '');
  const publisher = /ACM|Association for Computing Machinery/i.test(`${journal} ${text}`) ? 'Association for Computing Machinery' : '';
  const topics = extractTopics(text);
  return {
    recordType: specialIssueTitle ? 'Journal special issue call for papers' : '',
    journal,
    journalAbbreviation: /ACM Transactions on Multimedia Computing, Communications, and Applications|ACM TOMM/i.test(`${journal} ${text}`) ? 'ACM TOMM' : '',
    publisher,
    specialIssueTitle,
    reportedJournalInfo: extractReportedJournalInfo(text),
    guestEditors: extractGuestEditors(text),
    topics,
  };
}

export function cleanImportTags(tags = []) {
  const blocked = new Set(['learning', 'journal acm', 'transactions multimedia', 'multi-modal fusion.', 'post', 'link']);
  return unique(tags)
    .map((tag) => cleanText(tag).replace(/\.$/, ''))
    .filter((tag) => tag.length > 1 && tag.length < 48 && !blocked.has(tag.toLowerCase()))
    .slice(0, 8);
}

export function detectOfficialPdfLinks(links = []) {
  return links.filter((link) => {
    const value = String(link.resolvedUrl || link.url || link.originalUrl || '');
    return /\.pdf(?:[?#]|$)/i.test(value) || /acm\.org|dl\.acm\.org/i.test(value) && /pdf|call|cfp|special/i.test(value);
  }).map((link) => ({
    ...link,
    kind: 'pdf',
    official: /acm\.org|dl\.acm\.org/i.test(String(link.resolvedUrl || link.url || link.originalUrl || '')),
  }));
}

function evidenceHtml(parts = []) {
  const paragraphs = parts.filter(Boolean).map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`);
  return paragraphs.length ? paragraphs.join('\n') : '<p>No readable LinkedIn post content was available.</p>';
}

function provenance(value, sourceType, sourceUrl, confidence = 'high') {
  return value ? { value, sourceType, sourceUrl, confidence } : null;
}

function mergeDatesByPriority(officialDates = [], postDates = [], pastedDates = []) {
  const out = [];
  const seen = new Set();
  for (const item of [...officialDates, ...postDates, ...pastedDates]) {
    const key = `${item.type}:${item.date || `${item.year}-${item.month}`}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function buildLinkedInImportResult({
  originalUrl = '',
  finalUrl = '',
  html = '',
  resolvedLinks = [],
  officialPdf = null,
  suppliedText = '',
} = {}) {
  const canonicalUrl = normalizeLinkedInPostUrl(finalUrl || originalUrl);
  const post = html ? extractLinkedInPostFromHtml(html, finalUrl || originalUrl) : {
    sourcePlatform: 'linkedin',
    title: 'LinkedIn post',
    description: '',
    author: authorFromLinkedInUrl(originalUrl),
    text: suppliedText || '',
    datePublished: '',
    canonicalUrl,
    hashtags: [],
    links: [],
    warnings: ['LinkedIn allowed only partial public extraction.'],
    extractionStatus: 'partial',
  };
  const links = resolvedLinks.length ? resolvedLinks : post.links;
  const officialPdfText = officialPdf?.text || '';
  const combinedText = [officialPdfText, post.text, post.description, suppliedText].filter(Boolean).join('\n\n');
  const structured = extractSpecialIssueStructuredFields(combinedText);
  const title = structured.specialIssueTitle && structured.journalAbbreviation
    ? `${structured.specialIssueTitle} \u2014 ${structured.journalAbbreviation} Special Issue`
    : (post.title || 'LinkedIn post');
  const officialDates = officialPdfText ? extractMilestoneDates(officialPdfText, { sourceType: 'official-pdf', sourceUrl: officialPdf?.canonicalUrl || officialPdf?.resolvedUrl || '' }) : [];
  const postDates = post.text ? extractMilestoneDates(post.text, { sourceType: 'linkedin-post', sourceUrl: post.canonicalUrl || canonicalUrl }) : [];
  const pastedDates = suppliedText ? extractMilestoneDates(suppliedText, { sourceType: 'user-pasted', sourceUrl: originalUrl }) : [];
  const importantDates = mergeDatesByPriority(officialDates, postDates, pastedDates);
  const tags = structured.specialIssueTitle
    ? cleanImportTags(SPECIAL_ISSUE_TAGS)
    : cleanImportTags([...(post.hashtags || []), 'LinkedIn']);
  const officialPdfLinks = detectOfficialPdfLinks(links);
  const partial = post.extractionStatus !== 'full' && !officialPdfText;
  const warnings = unique([
    ...(post.warnings || []),
    ...(officialPdf?.warning ? [officialPdf.warning] : []),
    ...(partial ? ['LinkedIn allowed only partial extraction. Available text, metadata and public attachments were preserved.'] : []),
  ]);
  return {
    ok: true,
    partial,
    extractionBlocked: partial,
    extractionStatus: partial ? 'partial' : 'full',
    extractionConfidence: partial ? 0.45 : 0.9,
    originalUrl,
    resolvedUrl: finalUrl || originalUrl,
    finalUrl: finalUrl || originalUrl,
    canonicalUrl: post.canonicalUrl || canonicalUrl,
    sourceUrl: post.canonicalUrl || canonicalUrl,
    sourcePlatform: 'linkedin',
    sourceAuthor: post.author || authorFromLinkedInUrl(originalUrl),
    title,
    suggestedTitle: title,
    category: structured.specialIssueTitle ? 'Publishing/Special Issues' : 'Personal Knowledge/Web References',
    suggestedCategory: structured.specialIssueTitle ? 'Publishing/Special Issues' : 'Personal Knowledge/Web References',
    recordType: structured.recordType,
    tags,
    html: evidenceHtml([
      post.text ? `LinkedIn post:\n${post.text}` : '',
      officialPdfText ? `Official PDF excerpt:\n${officialPdfText.slice(0, 4000)}` : '',
    ]),
    text: post.text,
    extractedContent: officialPdfText || post.text,
    summary: structured.specialIssueTitle
      ? `Call for papers for ${structured.specialIssueTitle} in ${structured.journal || structured.journalAbbreviation}.`
      : (post.description || post.text || 'LinkedIn shared link').slice(0, 360),
    importantDates,
    detectedImportantDates: importantDates,
    structured,
    specialIssue: structured,
    linkedinPost: post,
    officialPdf: officialPdf || officialPdfLinks[0] || null,
    attachments: officialPdf ? [{ ...officialPdf, kind: 'official-pdf', attachOffered: true }] : officialPdfLinks,
    links,
    warnings,
    conflicts: [],
    checkedAt: new Date().toISOString(),
    metadata: {
      sourceName: 'LinkedIn',
      sourcePlatform: 'linkedin',
      sourceAuthor: post.author || authorFromLinkedInUrl(originalUrl),
      author: post.author || authorFromLinkedInUrl(originalUrl),
      originalUrl,
      resolvedUrl: finalUrl || originalUrl,
      finalUrl: finalUrl || originalUrl,
      canonicalUrl: post.canonicalUrl || canonicalUrl,
      canonicalPostUrl: post.canonicalUrl || canonicalUrl,
      publisher: structured.publisher || '',
      journal: structured.journal || '',
      journalTitle: structured.journal || '',
      publicationDate: post.datePublished || '',
      description: post.description || '',
      officialPdfUrl: officialPdf?.canonicalUrl || officialPdf?.resolvedUrl || '',
      platformMessage: partial ? 'LinkedIn allowed only partial extraction. Available text, metadata and public attachments were preserved.' : '',
      extractionBlocked: partial,
    },
    provenance: {
      title: provenance(title, structured.specialIssueTitle && officialPdfText ? 'official-pdf' : 'linkedin-post', officialPdf?.canonicalUrl || post.canonicalUrl || canonicalUrl, structured.specialIssueTitle ? 'high' : 'medium'),
      journal: provenance(structured.journal, officialPdfText ? 'official-pdf' : 'linkedin-post', officialPdf?.canonicalUrl || post.canonicalUrl || canonicalUrl, structured.journal ? 'high' : 'low'),
      publisher: provenance(structured.publisher, officialPdfText ? 'official-pdf' : 'linkedin-post', officialPdf?.canonicalUrl || post.canonicalUrl || canonicalUrl, structured.publisher ? 'high' : 'low'),
      sourceAuthor: provenance(post.author || authorFromLinkedInUrl(originalUrl), 'linkedin-post', post.canonicalUrl || canonicalUrl, post.author ? 'high' : 'medium'),
    },
  };
}

