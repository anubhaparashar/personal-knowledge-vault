const DB_NAME = 'ap-research-vault-share-queue';
const DB_VERSION = 1;
const CAPTURE_STORE = 'captures';
const FALLBACK_KEY = 'aprv-local-share-captures';
const MAX_TEXT_LENGTH = 12000;

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function cleanText(value = '', max = MAX_TEXT_LENGTH) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function randomPart() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function createCaptureId() {
  return `share_${Date.now()}_${randomPart()}`;
}

function extractFirstUrl(value = '') {
  const match = String(value || '').match(/\bhttps?:\/\/[^\s<>"']+/i);
  return match?.[0] || '';
}

export function safeSharedUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function inferSourcePlatform({ rawUrl = '', rawText = '', rawTitle = '' } = {}) {
  const source = `${rawUrl} ${rawTitle} ${rawText}`.toLowerCase();
  if (/facebook\.com|fb\.watch|fb\.me|\bfacebook\b/.test(source)) return 'facebook';
  if (/linkedin\.com|\blinkedin\b/.test(source)) return 'linkedin';
  if (/(^|\.)x\.com|twitter\.com|\btwitter\b|\bx\/twitter\b/.test(source)) return 'twitter';
  if (/whatsapp\.com|\bwhatsapp\b|wa\.me/.test(source)) return 'whatsapp';
  if (/telegram\.org|t\.me|\btelegram\b/.test(source)) return 'telegram';
  if (/mail\.google\.com|\bemail\b|\bsubject:/.test(source)) return 'email';
  if (/google\.com|google\./.test(source)) return 'google';
  if (rawUrl) return 'browser';
  return 'unknown';
}

function fallbackList() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFallbackList(items) {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(items));
}

function openDb() {
  if (!hasIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CAPTURE_STORE)) {
        const store = db.createObjectStore(CAPTURE_STORE, { keyPath: 'id' });
        store.createIndex('receivedAt', 'receivedAt');
        store.createIndex('synced', 'synced');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const db = await openDb();
  if (!db) return callback(null);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(CAPTURE_STORE, mode);
      const store = tx.objectStore(CAPTURE_STORE);
      let result;
      Promise.resolve(callback(store))
        .then((value) => { result = value; })
        .catch(reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function normalizeSharePayload(input = {}) {
  const rawText = cleanText(input.rawText ?? input.text);
  const firstUrl = extractFirstUrl(rawText);
  const rawUrl = safeSharedUrl(input.rawUrl ?? input.url) || safeSharedUrl(firstUrl);
  const rawTitle = cleanText(input.rawTitle ?? input.title, 600);
  const receivedAt = input.receivedAt || new Date().toISOString();
  const files = Array.isArray(input.files) ? input.files : [];
  const capture = {
    id: input.id || createCaptureId(),
    rawTitle,
    rawText,
    rawUrl,
    canonicalUrl: input.canonicalUrl || null,
    sourcePlatform: input.sourcePlatform || inferSourcePlatform({ rawTitle, rawText, rawUrl }),
    receivedAt,
    suggestedCategory: input.suggestedCategory || input.category || null,
    classificationConfidence: Number(input.classificationConfidence || 0),
    classificationConfidenceLabel: input.classificationConfidenceLabel || 'Low',
    suggestedTags: Array.isArray(input.suggestedTags) ? input.suggestedTags : [],
    detectedDates: Array.isArray(input.detectedDates) ? input.detectedDates : [],
    extractedContent: input.extractedContent || null,
    summary: input.summary || null,
    processingStatus: input.processingStatus || 'received',
    processingError: input.processingError || null,
    destinationPageId: input.destinationPageId || null,
    duplicateOf: input.duplicateOf || null,
    duplicateTitle: input.duplicateTitle || '',
    origin: input.origin || 'shared-inbox',
    attachmentIndicator: input.attachmentIndicator || (files.length ? `${files.length} shared file(s)` : ''),
    files,
    synced: Boolean(input.synced),
    remoteId: input.remoteId || null,
    archived: Boolean(input.archived),
    reviewSuggested: Boolean(input.reviewSuggested),
    locallySaved: input.locallySaved ?? true,
  };
  if (!capture.rawTitle && capture.rawUrl) capture.rawTitle = new URL(capture.rawUrl).hostname.replace(/^www\./, '');
  if (!capture.rawTitle && capture.rawText) capture.rawTitle = capture.rawText.slice(0, 90);
  if (!capture.rawTitle) capture.rawTitle = 'Shared item';
  return capture;
}

export function parseShareLaunch(search = window.location.search) {
  const params = new URLSearchParams(search || '');
  if (params.get('share-target') !== '1' && params.get('capture') !== '1') return null;
  return normalizeSharePayload({
    rawTitle: params.get('title') || '',
    rawText: params.get('text') || '',
    rawUrl: params.get('url') || '',
    suggestedCategory: params.get('category') || null,
    origin: params.get('origin') || 'shared-inbox',
  });
}

export async function putLocalCapture(capture) {
  const normalized = normalizeSharePayload(capture);
  if (!hasIndexedDb()) {
    const items = fallbackList().filter((item) => item.id !== normalized.id);
    items.push({ ...normalized, files: [] });
    saveFallbackList(items);
    return normalized;
  }
  await withStore('readwrite', (store) => store.put(normalized));
  return normalized;
}

export async function createLocalCapture(input) {
  return putLocalCapture(normalizeSharePayload(input));
}

export async function getLocalCapture(id) {
  if (!id) return null;
  if (!hasIndexedDb()) return fallbackList().find((item) => item.id === id) || null;
  return withStore('readonly', (store) => new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  }));
}

export async function listLocalCaptures() {
  if (!hasIndexedDb()) return fallbackList().sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  const items = await withStore('readonly', (store) => new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  }));
  return items.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
}

export async function updateLocalCapture(id, patch) {
  const existing = await getLocalCapture(id);
  if (!existing) return null;
  return putLocalCapture({ ...existing, ...patch, id });
}

export async function deleteLocalCapture(id) {
  if (!id) return;
  if (!hasIndexedDb()) {
    saveFallbackList(fallbackList().filter((item) => item.id !== id));
    return;
  }
  await withStore('readwrite', (store) => store.delete(id));
}

export async function countPendingLocalCaptures() {
  const items = await listLocalCaptures();
  return items.filter((item) => !item.synced || item.processingStatus === 'received' || item.processingStatus === 'processing').length;
}

export function replaceShareLaunchUrl(captureId) {
  const path = window.location.pathname || '/personal-knowledge-vault/';
  const next = `${path}#/share-capture/${encodeURIComponent(captureId)}`;
  window.history.replaceState(null, '', next);
}

export function productionShareUrl(payload = {}) {
  const params = new URLSearchParams();
  params.set('share-target', '1');
  if (payload.title) params.set('title', payload.title);
  if (payload.text) params.set('text', payload.text);
  if (payload.url) params.set('url', payload.url);
  return `https://anubhaparashar.github.io/personal-knowledge-vault/?${params.toString()}`;
}

export function bookmarkletSource() {
  const target = 'https://anubhaparashar.github.io/personal-knowledge-vault/';
  return `javascript:(()=>{const s=window.getSelection?String(window.getSelection()):'';const u='${target}?share-target=1&title='+encodeURIComponent(document.title||'')+'&url='+encodeURIComponent(location.href)+'&text='+encodeURIComponent(s);window.open(u,'_blank','noopener,noreferrer');})();`;
}
