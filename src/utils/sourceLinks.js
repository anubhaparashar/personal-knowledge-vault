export const AUTO_ENRICH_PASTED_LINKS_KEY = 'aprv-auto-enrich-pasted-links';
export const AUTO_ENRICH_MODES = new Set(['auto', 'ask', 'never']);

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

function stripTrailingUrlPunctuation(value = '') {
  let next = String(value || '').trim();
  next = next.replace(TRAILING_PUNCTUATION, '');
  while (/[)\]}]$/.test(next)) {
    const last = next.slice(-1);
    const open = last === ')' ? '(' : last === ']' ? '[' : '{';
    const closeCount = (next.match(new RegExp(`\\${last}`, 'g')) || []).length;
    const openCount = (next.match(new RegExp(`\\${open}`, 'g')) || []).length;
    if (closeCount <= openCount) break;
    next = next.slice(0, -1).replace(TRAILING_PUNCTUATION, '');
  }
  return next;
}

export function validateDetectedUrl(value = '') {
  const stripped = stripTrailingUrlPunctuation(value);
  if (!stripped) return '';
  let parsed;
  try {
    parsed = new URL(stripped);
  } catch {
    return '';
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return '';
  return parsed.toString();
}

export function detectExternalUrls(text = '') {
  const matches = String(text || '').match(URL_PATTERN) || [];
  const seen = new Set();
  const urls = [];
  matches.forEach((match) => {
    const url = validateDetectedUrl(match);
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  });
  return urls;
}

export function readAutoEnrichPastedLinksMode() {
  if (typeof localStorage === 'undefined') return 'auto';
  const value = localStorage.getItem(AUTO_ENRICH_PASTED_LINKS_KEY) || 'auto';
  return AUTO_ENRICH_MODES.has(value) ? value : 'auto';
}

export function writeAutoEnrichPastedLinksMode(value) {
  const mode = AUTO_ENRICH_MODES.has(value) ? value : 'auto';
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(AUTO_ENRICH_PASTED_LINKS_KEY, mode);
  }
  return mode;
}
