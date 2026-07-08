import { auth, db, discoveryImportEndpoint, discoveryRunEndpoint, firebaseNamespace } from '../firebase';
import { withFirestoreWriteTimeout } from './pages';

export const DEFAULT_DISCOVERY_SETTINGS = {
  automaticDiscoveryEnabled: true,
  timezone: 'Asia/Kolkata',
  fullScanTimes: ['06:00', '18:00'],
  refreshIntervalHours: 6,
  weekendScansEnabled: true,
  maxSourcesPerRun: 24,
  pauseAllScanning: false,
};

export const DISCOVERY_PROGRESS_LABELS = {
  queued: 'Queued',
  running: 'Running',
  'loading-active-records': 'Loading active records',
  'rechecking-sources': 'Rechecking sources',
  'comparing-changes': 'Comparing changes',
  'updating-deadlines': 'Updating deadlines',
  'saving-updates': 'Saving updates',
  'loading-sources': 'Loading sources',
  'checking-source': 'Checking source',
  'checking-sources': 'Checking sources',
  'extracting-records': 'Extracting records',
  categorising: 'Categorising',
  'detecting-dates': 'Detecting dates',
  'checking-duplicates': 'Checking duplicates',
  'saving-results': 'Saving results',
  'updating-calendar': 'Updating calendar',
  connecting: 'Connecting to website',
  'reading-page': 'Reading page',
  'extracting-content': 'Extracting useful content',
  'identifying-content-type': 'Identifying content type',
  'generating-category': 'Generating category',
  'generating-tags': 'Generating tags',
  completed: 'Completed',
  'completed-with-warnings': 'Completed with warnings',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const SOURCE_TYPES = [
  'API',
  'RSS',
  'Atom',
  'Sitemap',
  'Structured webpage',
  'Public webpage',
  'OpenAlex',
  'Crossref',
  'arXiv',
  'Semantic Scholar',
  'Manual-only',
];

export const ORIGIN_LABELS = {
  'auto-discovered': 'Auto-discovered',
  'manually-added': 'Manually added',
  'imported-from-url': 'Imported from URL',
  'imported-from-file': 'Imported from file',
  'scholarly-api': 'Scholarly API',
};

function requireDb() {
  if (!db) throw new Error('Firebase is not configured.');
  return db;
}

function settingsDoc(uid) {
  return requireDb().collection('users').doc(uid).collection('discovery').doc('settings');
}

function statsDoc(uid) {
  return requireDb().collection('users').doc(uid).collection('discovery').doc('stats');
}

function sourcesCollection(uid) {
  return requireDb().collection('users').doc(uid).collection('discoverySources');
}

function runsCollection(uid) {
  return requireDb().collection('users').doc(uid).collection('discoveryRuns');
}

function normalizeSettings(data = {}) {
  return {
    ...DEFAULT_DISCOVERY_SETTINGS,
    ...data,
    fullScanTimes: Array.isArray(data.fullScanTimes) && data.fullScanTimes.length ? data.fullScanTimes.slice(0, 2) : DEFAULT_DISCOVERY_SETTINGS.fullScanTimes,
    refreshIntervalHours: Number(data.refreshIntervalHours || DEFAULT_DISCOVERY_SETTINGS.refreshIntervalHours),
    maxSourcesPerRun: Number(data.maxSourcesPerRun || DEFAULT_DISCOVERY_SETTINGS.maxSourcesPerRun),
  };
}

export function isDiscoveryBackendConfigured() {
  return Boolean(discoveryRunEndpoint && discoveryImportEndpoint);
}

export function hasVerifiedDiscoveryScan(stats = null, sources = []) {
  const enabledSourceCount = (sources || []).filter((source) => source.enabled !== false && !source.paused).length;
  const successful = Boolean(stats?.lastSuccessfulScanAt || stats?.verifiedBackendAt || stats?.lastSuccessfulRunId);
  const checkedSomething = Number(stats?.sourcesChecked || 0) > 0 || Number(stats?.recordsChecked || 0) > 0;
  return isDiscoveryBackendConfigured() && enabledSourceCount > 0 && successful && checkedSomething;
}

export function discoveryAutomaticStatus(settings = DEFAULT_DISCOVERY_SETTINGS, stats = null, sources = []) {
  if (!hasVerifiedDiscoveryScan(stats, sources)) return 'Not configured';
  if (settings.pauseAllScanning || !settings.automaticDiscoveryEnabled) return 'Paused';
  return 'Enabled';
}

export function isActiveDiscoveryRun(run = null) {
  return ['queued', 'running', 'checking-sources', 'extracting-records', 'detecting-dates', 'checking-duplicates', 'saving-results'].includes(run?.status);
}

export function subscribeDiscoverySettings(uid, onData, onError) {
  return settingsDoc(uid).onSnapshot(
    (snapshot) => onData(normalizeSettings(snapshot.exists ? snapshot.data() : {})),
    onError,
  );
}

export async function saveDiscoverySettings(uid, settings) {
  const times = (settings.fullScanTimes || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 2);
  const payload = normalizeSettings({ ...settings, fullScanTimes: times.length ? times : DEFAULT_DISCOVERY_SETTINGS.fullScanTimes });
  await withFirestoreWriteTimeout(settingsDoc(uid).set({
    ...payload,
    updatedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
  }, { merge: true }));
}

export function subscribeDiscoverySources(uid, onData, onError) {
  return sourcesCollection(uid)
    .orderBy('name', 'asc')
    .onSnapshot(
      (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      onError,
    );
}

export async function saveDiscoverySource(uid, source) {
  const collection = sourcesCollection(uid);
  const sourceId = source.id || collection.doc().id;
  const { id, ...rest } = source;
  await withFirestoreWriteTimeout(collection.doc(sourceId).set({
    ...rest,
    name: String(rest.name || '').trim(),
    url: String(rest.url || '').trim(),
    enabled: rest.enabled !== false,
    updatedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
    createdAt: rest.createdAt || firebaseNamespace.firestore.FieldValue.serverTimestamp(),
  }, { merge: true }));
  return sourceId;
}

export async function deleteDiscoverySource(uid, sourceId) {
  await withFirestoreWriteTimeout(sourcesCollection(uid).doc(sourceId).delete());
}

export async function pauseDiscoverySource(uid, source, paused = true) {
  await saveDiscoverySource(uid, { ...source, enabled: !paused, paused });
}

export function subscribeLatestDiscoveryRun(uid, onData, onError) {
  return runsCollection(uid)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .onSnapshot(
      (snapshot) => onData(snapshot.docs[0] ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null),
      onError,
    );
}

export function subscribeDiscoveryStats(uid, onData, onError) {
  return statsDoc(uid).onSnapshot(
    (snapshot) => onData(snapshot.exists ? snapshot.data() : null),
    onError,
  );
}

async function authHeaders(user = auth?.currentUser) {
  if (!user?.getIdToken) throw new Error('Sign in before using backend discovery.');
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function postDiscovery(endpoint, body, user, options = {}) {
  if (!endpoint) throw new Error('Automatic discovery is not configured. Deploy the Firebase Functions and set the discovery endpoint.');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: await authHeaders(user),
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Discovery request failed with HTTP ${response.status}.`);
  return payload;
}

export async function startDiscoveryRun(user, mode = 'quick') {
  return postDiscovery(discoveryRunEndpoint, { action: 'start-run', mode }, user);
}

export async function testDiscoverySource(user, source) {
  return postDiscovery(discoveryRunEndpoint, { action: 'test-source', source }, user);
}

export async function scanDiscoverySource(user, sourceId) {
  return postDiscovery(discoveryRunEndpoint, { action: 'scan-source', sourceId }, user);
}

export async function cancelDiscoveryRun(user, runId) {
  return postDiscovery(discoveryRunEndpoint, { action: 'cancel-run', runId }, user);
}

export async function importDiscoveryUrl(user, url, extra = {}, options = {}) {
  return postDiscovery(discoveryImportEndpoint, { url, ...extra }, user, options);
}

export function originLabel(origin) {
  return ORIGIN_LABELS[origin] || ORIGIN_LABELS['manually-added'];
}

export function originTone(origin) {
  if (origin === 'auto-discovered' || origin === 'scholarly-api') return 'upcoming';
  if (origin === 'imported-from-url' || origin === 'imported-from-file') return 'neutral';
  return 'pin';
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export function formatDiscoveryTimestamp(value) {
  if (!value) return 'Not recorded';
  const raw = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(raw.getTime())) return 'Not recorded';
  return raw.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function zoneParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: get('weekday'),
  };
}

function zonedTimeToUtc({ year, month, day, hour, minute }, timeZone) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const rendered = zoneParts(guess, timeZone);
  const renderedUtc = Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute, 0, 0);
  return new Date(guess.getTime() - (renderedUtc - guess.getTime()));
}

function addDaysInZone(parts, offset) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offset, 12, 0, 0, 0));
  return zoneParts(date, 'UTC');
}

export function nextScheduledScan(settings = DEFAULT_DISCOVERY_SETTINGS, fromDate = new Date()) {
  const config = normalizeSettings(settings);
  if (!config.automaticDiscoveryEnabled || config.pauseAllScanning) return 'Paused';
  const timeZone = config.timezone || 'Asia/Kolkata';
  const times = (config.fullScanTimes || []).filter(Boolean).sort();
  const now = new Date(fromDate);
  const nowZone = zoneParts(now, timeZone);
  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    const dayParts = addDaysInZone(nowZone, dayOffset);
    const weekday = new Date(Date.UTC(dayParts.year, dayParts.month - 1, dayParts.day)).getUTCDay();
    if (!config.weekendScansEnabled && (weekday === 0 || weekday === 6)) continue;
    for (const time of times) {
      const [hour, minute] = time.split(':').map(Number);
      const candidate = zonedTimeToUtc({ ...dayParts, hour: hour || 0, minute: minute || 0 }, timeZone);
      if (candidate > now) {
        const sameDay = dayParts.year === nowZone.year && dayParts.month === nowZone.month && dayParts.day === nowZone.day;
        const label = sameDay ? 'Today' : candidate.toLocaleDateString(undefined, { timeZone, weekday: 'short', month: 'short', day: 'numeric' });
        const timeLabel = candidate.toLocaleTimeString(undefined, { timeZone, hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
        return `${label}, ${timeLabel}`;
      }
    }
  }
  return 'Not scheduled';
}
