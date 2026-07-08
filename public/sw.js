const APP_BASE = '/personal-knowledge-vault/';
const CACHE_NAME = 'ap-research-vault-shell-v1';
const LOCAL_DB_NAME = 'ap-research-vault-share-queue';
const LOCAL_DB_VERSION = 1;
const CAPTURE_STORE = 'captures';

function openShareDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
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

async function putLocalCapture(capture) {
  const db = await openShareDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(CAPTURE_STORE, 'readwrite');
    tx.objectStore(CAPTURE_STORE).put(capture);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function randomId() {
  if (self.crypto?.randomUUID) return self.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 12000);
}

function safeUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

async function handleMultipartShare(request) {
  const form = await request.formData();
  const files = form.getAll('files')
    .filter((item) => item instanceof File)
    .map((file) => ({
      name: file.name || 'shared-file',
      type: file.type || 'application/octet-stream',
      size: file.size || 0,
      lastModified: file.lastModified || Date.now(),
      blob: file,
    }));
  const id = `share_${Date.now()}_${randomId()}`;
  await putLocalCapture({
    id,
    rawTitle: cleanText(form.get('title')),
    rawText: cleanText(form.get('text')),
    rawUrl: safeUrl(form.get('url')),
    canonicalUrl: null,
    sourcePlatform: 'unknown',
    receivedAt: new Date().toISOString(),
    suggestedCategory: null,
    classificationConfidence: 0,
    suggestedTags: [],
    detectedDates: [],
    extractedContent: null,
    summary: null,
    processingStatus: 'received',
    processingError: null,
    destinationPageId: null,
    duplicateOf: null,
    origin: 'system-share',
    attachmentIndicator: files.length ? `${files.length} shared file(s)` : '',
    files,
    synced: false,
    locallySaved: true,
  });
  return Response.redirect(`${APP_BASE}#/share-capture/${encodeURIComponent(id)}`, 303);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([
        APP_BASE,
        `${APP_BASE}manifest.webmanifest`,
        `${APP_BASE}favicon.svg`,
      ]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_BASE)) return;

  if (event.request.method === 'POST' && url.searchParams.get('share-target-file') === '1') {
    event.respondWith(handleMultipartShare(event.request).catch(() => Response.redirect(`${APP_BASE}#/shared-inbox`, 303)));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(APP_BASE, clone));
          return response;
        })
        .catch(() => caches.match(APP_BASE)),
    );
  }
});
