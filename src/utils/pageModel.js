export const ORIGIN_VALUES = [
  'manual',
  'pasted',
  'imported-link',
  'imported-file',
  'shared-inbox',
  'auto-discovered',
  'scholarly-api',
  'system-generated',
  'saved-discovery',
];

export const PERSONAL_ENTRY_ORIGINS = new Set(['manual', 'pasted', 'imported-link', 'imported-file', 'shared-inbox', 'saved-discovery']);
export const DISCOVERY_ORIGINS = new Set(['auto-discovered', 'scholarly-api']);

const LEGACY_ORIGIN_ALIASES = {
  'manually-added': 'manual',
  'manual-entry': 'manual',
  'user-created': 'manual',
  'imported-from-url': 'imported-link',
  'imported-url': 'imported-link',
  'url-import': 'imported-link',
  'imported-from-file': 'imported-file',
  'uploaded-file': 'imported-file',
  'system-share': 'shared-inbox',
  'share-target': 'shared-inbox',
  'shared-from-app': 'shared-inbox',
  automatic: 'auto-discovered',
  discovery: 'auto-discovered',
  system: 'system-generated',
};

export const ORIGIN_LABELS = {
  manual: 'Manual',
  pasted: 'Pasted',
  'imported-link': 'Imported Link',
  'imported-file': 'Uploaded File',
  'shared-inbox': 'Shared from App',
  'auto-discovered': 'Auto-discovered',
  'scholarly-api': 'Scholarly API',
  'system-generated': 'System Generated',
  'saved-discovery': 'Saved Discovery',
};

export const ORIGIN_TONES = {
  manual: 'pin',
  pasted: 'neutral',
  'imported-link': 'neutral',
  'imported-file': 'neutral',
  'shared-inbox': 'neutral',
  'auto-discovered': 'upcoming',
  'scholarly-api': 'upcoming',
  'system-generated': 'neutral',
  'saved-discovery': 'completed',
};

const MY_WORK_FOCI = new Set(['diary', 'ideas', 'project-ideas', 'applications', 'proposals', 'projects', 'papers', 'literature']);
const PERSONAL_FOCI = new Set(['general-notes', 'books', 'secure-notes']);
const DISCOVERY_FOCI = new Set(['discoveries', 'scholarships', 'postdoctoral', 'fellowships', 'grants', 'conferences', 'journals', 'special-issues', 'submission-deadlines']);

function text(value = '') {
  return String(value || '').trim();
}

function lower(value = '') {
  return text(value).toLowerCase();
}

function hasDiscoveryMarkers(page = {}) {
  return Boolean(
    page.discovery
    || page.discoveryRunId
    || page.discoveredAt
    || page.discoveryState
    || page.discoverySourceId
    || page.sourceId
    || page.origin === 'auto-discovered'
    || page.origin === 'scholarly-api'
    || page.createdOrigin === 'auto-discovered'
    || page.createdOrigin === 'scholarly-api'
  );
}

function hasSharedInboxMarkers(page = {}) {
  return Boolean(page.shareCapture || page.sharedInbox || page.captureId || page.origin === 'shared-inbox' || page.origin === 'system-share');
}

export function normalizeOrigin(rawOrigin, page = {}) {
  const raw = lower(rawOrigin || page.origin || page.createdOrigin);
  const aliased = LEGACY_ORIGIN_ALIASES[raw] || raw;
  if (ORIGIN_VALUES.includes(aliased)) return aliased;
  if (hasDiscoveryMarkers(page)) return page.origin === 'scholarly-api' || page.createdOrigin === 'scholarly-api' ? 'scholarly-api' : 'auto-discovered';
  if (hasSharedInboxMarkers(page)) return 'shared-inbox';
  return 'manual';
}

export function originLabel(origin) {
  return ORIGIN_LABELS[normalizeOrigin(origin)] || ORIGIN_LABELS.manual;
}

export function originTone(origin) {
  return ORIGIN_TONES[normalizeOrigin(origin)] || 'neutral';
}

export function isDiscoveryOrigin(origin) {
  return DISCOVERY_ORIGINS.has(normalizeOrigin(origin));
}

export function isPersonalOrigin(origin) {
  return PERSONAL_ENTRY_ORIGINS.has(normalizeOrigin(origin));
}

export function originGroup(origin) {
  const normalized = normalizeOrigin(origin);
  if (normalized === 'saved-discovery') return 'saved-discovery';
  if (DISCOVERY_ORIGINS.has(normalized)) return 'auto-discovered';
  if (normalized === 'shared-inbox') return 'shared';
  if (normalized === 'imported-link' || normalized === 'imported-file') return 'imported';
  if (normalized === 'pasted') return 'pasted';
  return 'manual';
}

export function timestampValue(value) {
  if (!value) return 0;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function entryTypeForPage(page = {}) {
  const category = lower(page.category);
  const haystack = lower([page.category, page.title, page.summary, ...(page.tags || [])].filter(Boolean).join(' '));
  if (category.includes('diary') || haystack.includes('diary')) return 'diary';
  if (category.includes('postdoc') || haystack.includes('postdoc')) return 'postdoctoral';
  if (category.includes('scholarship') || haystack.includes('scholarship')) return 'scholarship';
  if (category.includes('conference')) return 'conference';
  if (category.includes('special issue')) return 'special-issue';
  if (category.includes('journal')) return 'journal';
  if (category.includes('fellowship')) return 'fellowship';
  if (category.includes('grant')) return 'grant';
  if (category.includes('job')) return 'job';
  if (category.includes('proposal')) return 'proposal';
  if (category.includes('application')) return 'application';
  if (category.includes('project idea')) return 'project-idea';
  if (category.includes('paper idea')) return 'paper-idea';
  if (category.includes('paper') || category.includes('literature')) return 'paper';
  if (page.secure || category.includes('private vault')) return 'secure-note';
  if (category.includes('book') || haystack.includes('book') || haystack.includes('reading')) return 'book';
  return 'note';
}

export function entryTypeLabel(type = '') {
  return ({
    diary: 'Diary',
    note: 'Note',
    scholarship: 'Scholarship',
    postdoctoral: 'Postdoctoral',
    fellowship: 'Fellowship',
    grant: 'Grant',
    job: 'Job',
    conference: 'Conference',
    journal: 'Journal',
    'special-issue': 'Special Issue',
    'paper-idea': 'Paper Idea',
    'project-idea': 'Project Idea',
    proposal: 'Proposal',
    application: 'Application',
    paper: 'Research Paper',
    book: 'Book',
    'secure-note': 'Secure Note',
  })[type] || 'Note';
}

export function normalizePage(page = {}) {
  const origin = normalizeOrigin(page.origin || page.createdOrigin, page);
  const rawOrigin = page.origin || page.createdOrigin || '';
  const inferredDiscovery = hasDiscoveryMarkers(page) && DISCOVERY_ORIGINS.has(origin);
  const createdByUser = typeof page.createdByUser === 'boolean'
    ? page.createdByUser
    : !DISCOVERY_ORIGINS.has(origin);
  const isArchived = Boolean(page.isArchived || page.archived);
  const visibility = page.visibility === 'share-link' ? 'share-link' : 'private';
  const needsOriginReview = page.needsOriginReview ?? (!rawOrigin && !inferredDiscovery && !hasSharedInboxMarkers(page));
  const savedOriginalOrigin = normalizeOrigin(page.originalOrigin || page.discovery?.origin || page.createdOrigin || 'auto-discovered', page);

  return {
    ...page,
    origin,
    createdOrigin: normalizeOrigin(page.createdOrigin || origin, { ...page, origin }),
    originalOrigin: page.originalOrigin || (origin === 'saved-discovery' ? (savedOriginalOrigin === 'saved-discovery' ? 'auto-discovered' : savedOriginalOrigin) : null),
    createdByUser,
    isArchived,
    archivedAt: page.archivedAt || null,
    archivedReason: page.archivedReason || null,
    visibility,
    shareId: page.shareId || null,
    shareCreatedAt: page.shareCreatedAt || null,
    shareExpiresAt: page.shareExpiresAt || null,
    needsOriginReview: Boolean(needsOriginReview),
    entryType: page.entryType || entryTypeForPage({ ...page, origin }),
    __needsOriginMigration: page.origin !== origin
      || typeof page.createdByUser !== 'boolean'
      || typeof page.isArchived !== 'boolean'
      || typeof page.visibility !== 'string'
      || !Object.prototype.hasOwnProperty.call(page, 'archivedAt')
      || !Object.prototype.hasOwnProperty.call(page, 'archivedReason')
      || !Object.prototype.hasOwnProperty.call(page, 'shareId')
      || !Object.prototype.hasOwnProperty.call(page, 'shareCreatedAt')
      || !Object.prototype.hasOwnProperty.call(page, 'shareExpiresAt'),
  };
}

export function stripRuntimePageFields(page = {}) {
  const { __needsOriginMigration, entryType, ...rest } = page;
  return rest;
}

export function normalizePageForSave(data = {}, { isNew = false } = {}) {
  const normalized = normalizePage({ ...data, origin: data.origin || (isNew ? 'manual' : data.origin) });
  return stripRuntimePageFields(normalized);
}

export function normalizePagePatch(data = {}) {
  const patch = { ...data };
  if (Object.prototype.hasOwnProperty.call(patch, 'origin')) patch.origin = normalizeOrigin(patch.origin);
  if (Object.prototype.hasOwnProperty.call(patch, 'createdOrigin')) patch.createdOrigin = normalizeOrigin(patch.createdOrigin);
  if (Object.prototype.hasOwnProperty.call(patch, 'visibility') && patch.visibility !== 'share-link') patch.visibility = 'private';
  return patch;
}

export function buildOriginMigrationPatch(page = {}) {
  const normalized = normalizePage(page);
  if (!normalized.__needsOriginMigration) return null;
  return {
    origin: normalized.origin,
    createdOrigin: normalized.createdOrigin,
    createdByUser: normalized.createdByUser,
    isArchived: normalized.isArchived,
    archivedAt: normalized.archivedAt,
    archivedReason: normalized.archivedReason,
    visibility: normalized.visibility,
    shareId: normalized.shareId,
    shareCreatedAt: normalized.shareCreatedAt,
    shareExpiresAt: normalized.shareExpiresAt,
    needsOriginReview: normalized.needsOriginReview,
  };
}

export function isArchivedPage(page = {}) {
  return Boolean(normalizePage(page).isArchived);
}

export function isDiscoveryRecord(page = {}) {
  const normalized = normalizePage(page);
  return DISCOVERY_ORIGINS.has(normalized.origin) && normalized.createdByUser !== true && normalized.discoveryState !== 'dismissed';
}

export function isMyEntry(page = {}) {
  const normalized = normalizePage(page);
  return normalized.createdByUser === true && PERSONAL_ENTRY_ORIGINS.has(normalized.origin);
}

export function isDiaryEntry(page = {}) {
  const normalized = normalizePage(page);
  return !normalized.isArchived
    && normalized.createdByUser === true
    && !DISCOVERY_ORIGINS.has(normalized.origin)
    && entryTypeForPage(normalized) === 'diary';
}

export function isSharedInboxEntry(page = {}) {
  return normalizePage(page).origin === 'shared-inbox';
}

export function pageMatchesType(page = {}, type = 'all') {
  return type === 'all' || entryTypeForPage(page) === type;
}

export function pageMatchesOriginFilter(page = {}, filter = 'all') {
  if (!filter || filter === 'all') return true;
  return originGroup(normalizePage(page).origin) === filter || normalizePage(page).origin === filter;
}

export function pageMatchesFocusCategory(page = {}, focus = '') {
  const type = entryTypeForPage(page);
  const textValue = lower([page.category, page.title, page.summary, ...(page.tags || [])].filter(Boolean).join(' '));
  switch (focus) {
    case 'diary': return type === 'diary';
    case 'ideas': return type === 'paper-idea';
    case 'project-ideas':
    case 'projects': return type === 'project-idea';
    case 'applications': return type === 'application';
    case 'proposals': return type === 'proposal';
    case 'papers':
    case 'literature': return type === 'paper' || textValue.includes('literature');
    case 'general-notes': return type === 'note';
    case 'books': return type === 'book';
    case 'secure-notes': return type === 'secure-note';
    case 'scholarships': return type === 'scholarship';
    case 'postdoctoral': return type === 'postdoctoral';
    case 'fellowships': return type === 'fellowship';
    case 'grants': return type === 'grant' || type === 'job';
    case 'conferences': return type === 'conference';
    case 'journals': return type === 'journal';
    case 'special-issues': return type === 'special-issue';
    case 'submission-deadlines': return (page.importantDates || []).some((item) => /submission|deadline/i.test(`${item.type || ''} ${item.title || ''}`));
    default: return true;
  }
}

export function pageMatchesSection(page = {}, focus = 'overview', options = {}) {
  const normalized = normalizePage(page);
  const includeArchived = Boolean(options.includeArchived);
  const archived = normalized.isArchived;
  if (focus === 'archives') return archived;
  if (archived && !includeArchived) return false;
  if (focus === 'discoveries') return isDiscoveryRecord(normalized);
  if (focus === 'my-entries') return isMyEntry(normalized);
  if (focus === 'shared-inbox') return isSharedInboxEntry(normalized);
  if (focus === 'notes' || focus === 'overview' || !focus) {
    const view = options.allNotesView || 'my-entries';
    if (view === 'my-entries') return isMyEntry(normalized);
    if (view === 'discoveries') return isDiscoveryRecord(normalized);
    if (view === 'shared-inbox') return isSharedInboxEntry(normalized);
    if (view === 'archived') return archived;
    return includeArchived || !archived;
  }
  if (MY_WORK_FOCI.has(focus) || PERSONAL_FOCI.has(focus)) return isMyEntry(normalized) && pageMatchesFocusCategory(normalized, focus);
  if (DISCOVERY_FOCI.has(focus)) return isDiscoveryRecord(normalized) && pageMatchesFocusCategory(normalized, focus);
  return includeArchived || !archived;
}

export function archivePatch(reason = 'Archived by user') {
  return {
    isArchived: true,
    archivedAt: new Date().toISOString(),
    archivedReason: reason,
  };
}

export function unarchivePatch() {
  return {
    isArchived: false,
    archivedAt: null,
    archivedReason: null,
  };
}

export function savedDiscoveryPatch(page = {}) {
  const origin = normalizeOrigin(page.origin || page.createdOrigin || 'auto-discovered', page);
  return {
    origin: 'saved-discovery',
    createdOrigin: 'saved-discovery',
    originalOrigin: page.originalOrigin || origin,
    createdByUser: true,
    isArchived: false,
    archivedAt: null,
    archivedReason: null,
    discoveryState: 'saved',
    acceptedAt: new Date().toISOString(),
  };
}

export function publicShareUrl(shareId) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/share/${encodeURIComponent(shareId)}`;
}

export function privateEntryUrl(pageId) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/entry/${encodeURIComponent(pageId)}`;
}

export function buildPublicSharePayload(page = {}, options = {}) {
  const normalized = normalizePage(page);
  const includeFull = options.includeFullNote === true;
  const includeSummary = options.includeSummary !== false;
  const includeSourceUrl = options.includeSourceUrl !== false;
  const includeImportantDates = options.includeImportantDates !== false;
  const includeAttachments = options.includeAttachments === true;
  return {
    visibility: 'share-link',
    active: true,
    title: normalized.secure ? 'Encrypted note' : (normalized.title || 'Shared entry'),
    category: normalized.secure ? 'Private Vault' : (normalized.category || ''),
    tags: normalized.secure ? [] : (normalized.tags || []).slice(0, 20),
    summary: includeSummary && !normalized.secure ? (normalized.summary || '') : '',
    html: includeFull && !normalized.secure ? (normalized.html || '') : '',
    plainText: '',
    sourceUrl: includeSourceUrl && !normalized.secure ? (normalized.sourceUrl || '') : '',
    importantDates: includeImportantDates && !normalized.secure ? (normalized.importantDates || []).slice(0, 30) : [],
    attachments: includeAttachments && !normalized.secure ? (normalized.attachments || []).map((item) => ({
      name: item.name || item.title || item.originalName || 'Attachment',
      url: item.webViewLink || item.url || item.originalUrl || '',
      mimeType: item.mimeType || item.type || '',
      size: item.size || 0,
    })).filter((item) => item.url).slice(0, 12) : [],
    sharedBy: 'Anubha Parashar',
    sharedAt: new Date().toISOString(),
    shareCreatedAt: new Date().toISOString(),
    shareExpiresAt: options.shareExpiresAt || null,
    options: {
      includeSummary,
      includeFullNote: includeFull,
      includeSourceUrl,
      includeImportantDates,
      includeAttachments,
    },
  };
}