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
export const SOURCE_TYPES = {
  manual: 'manual',
  discovery: 'discovery',
};

export const TECHNOLOGY_ENTRY_TYPE = 'technology';

export const TECH_REFERENCE_CATEGORIES = [
  'Hosting',
  'Domain and DNS',
  'Email',
  'Cloud',
  'Database',
  'Authentication',
  'Frontend',
  'Backend',
  'AI/ML',
  'Computer Vision',
  'DevOps',
  'Deployment',
  'Security',
  'Analytics',
  'API',
  'Development Tool',
  'Other',
];

export const TECH_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'testing', label: 'Testing' },
  { value: 'previously-used', label: 'Previously Used' },
  { value: 'deprecated', label: 'Deprecated' },
];

export const TECH_STATUS_LABELS = Object.fromEntries(TECH_STATUS_OPTIONS.map((item) => [item.value, item.label]));

export const EMPTY_TECH_USAGE = {
  projectName: '',
  projectUrl: '',
  purpose: '',
  servicesUsed: [],
  environment: '',
  dateAdded: '',
  notes: '',
};

export const EMPTY_TECH_TROUBLESHOOTING = {
  problem: '',
  symptoms: '',
  cause: '',
  solution: '',
  dateSolved: '',
  relatedProject: '',
};

export const EMPTY_TECH_DETAILS = {
  canonicalName: '',
  aliases: [],
  technologyCategory: '',
  officialUrl: '',
  shortDefinition: '',
  whyUsed: '',
  mainPurpose: '',
  alternatives: '',
  status: 'active',
  lastVerifiedAt: '',
  projects: [],
  useCases: [],
  setupNotes: '',
  configurationNotes: '',
  commonCommands: '',
  issuesAndSolutions: '',
  limitations: '',
  securityNotes: '',
  relatedTechnologies: [],
  importantConcepts: '',
  problemSolved: '',
  advantages: '',
  setupSteps: '',
  codeSnippets: '',
  environmentVariables: '',
  usefulLinks: '',
  troubleshooting: [],
  relatedPages: '',
  references: '',
  personalNotes: '',
};
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

const MY_WORK_FOCI = new Set(['diary', 'ideas', 'project-ideas', 'applications', 'proposals', 'projects', 'papers', 'literature', 'tech-reference']);
const PERSONAL_FOCI = new Set(['general-notes', 'books', 'secure-notes']);
const DISCOVERY_FOCI = new Set(['discoveries', 'scholarships', 'postdoctoral', 'fellowships', 'grants', 'jobs', 'conferences', 'journals', 'special-issues', 'submission-deadlines']);
export const MAIN_ENTRY_PAGE_ID = 'main';
export const MAIN_ENTRY_PAGE_TITLE = 'Main Page';

function text(value = '') {
  return String(value || '').trim();
}

function lower(value = '') {
  return text(value).toLowerCase();
}

export function normalizeStringList(value = []) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeStringList(item))
      .map(text)
      .filter(Boolean);
  }
  if (value == null) return [];
  return String(value)
    .split(/[;,\n]/)
    .map(text)
    .filter(Boolean);
}

function objectHasValue(value = {}) {
  return Object.values(value || {}).some((item) => {
    if (Array.isArray(item)) return item.length > 0;
    if (item && typeof item === 'object') return objectHasValue(item);
    return text(item).length > 0;
  });
}

function normalizeTechUsage(record = {}) {
  const next = {
    ...EMPTY_TECH_USAGE,
    ...record,
    projectName: text(record.projectName || record.name || record.title),
    projectUrl: text(record.projectUrl || record.url),
    purpose: text(record.purpose),
    servicesUsed: normalizeStringList(record.servicesUsed || record.services),
    environment: text(record.environment),
    dateAdded: text(record.dateAdded),
    notes: text(record.notes),
  };
  return next;
}

function normalizeTechTroubleshooting(record = {}) {
  return {
    ...EMPTY_TECH_TROUBLESHOOTING,
    ...record,
    problem: text(record.problem),
    symptoms: text(record.symptoms),
    cause: text(record.cause),
    solution: text(record.solution),
    dateSolved: text(record.dateSolved),
    relatedProject: text(record.relatedProject),
  };
}

export function createEmptyTechDetails() {
  return {
    ...EMPTY_TECH_DETAILS,
    aliases: [],
    projects: [],
    useCases: [],
    relatedTechnologies: [],
    troubleshooting: [],
  };
}

export function normalizeTechDetails(details = {}) {
  if (!details || typeof details !== 'object') return createEmptyTechDetails();
  const rawStatus = lower(details.status || 'active').replace(/\s+/g, '-');
  const status = TECH_STATUS_LABELS[rawStatus] ? rawStatus : 'active';
  const projects = Array.isArray(details.projects) ? details.projects : [];
  const troubleshooting = Array.isArray(details.troubleshooting || details.problemsAndSolutions)
    ? (details.troubleshooting || details.problemsAndSolutions)
    : [];
  return {
    ...createEmptyTechDetails(),
    ...details,
    canonicalName: text(details.canonicalName),
    aliases: normalizeStringList(details.aliases),
    technologyCategory: text(details.technologyCategory || details.category),
    officialUrl: text(details.officialUrl),
    shortDefinition: text(details.shortDefinition || details.definition),
    whyUsed: text(details.whyUsed),
    mainPurpose: text(details.mainPurpose),
    alternatives: text(details.alternatives),
    status,
    lastVerifiedAt: text(details.lastVerifiedAt),
    projects: projects.map(normalizeTechUsage).filter(objectHasValue),
    useCases: normalizeStringList(details.useCases),
    setupNotes: text(details.setupNotes),
    configurationNotes: text(details.configurationNotes),
    commonCommands: text(details.commonCommands),
    issuesAndSolutions: text(details.issuesAndSolutions),
    limitations: text(details.limitations),
    securityNotes: text(details.securityNotes),
    relatedTechnologies: normalizeStringList(details.relatedTechnologies),
    importantConcepts: text(details.importantConcepts),
    problemSolved: text(details.problemSolved),
    advantages: text(details.advantages),
    setupSteps: text(details.setupSteps),
    codeSnippets: text(details.codeSnippets),
    environmentVariables: text(details.environmentVariables),
    usefulLinks: text(details.usefulLinks),
    troubleshooting: troubleshooting.map(normalizeTechTroubleshooting).filter(objectHasValue),
    relatedPages: text(details.relatedPages),
    references: text(details.references),
    personalNotes: text(details.personalNotes),
  };
}

export function hasTechnologyDetails(details = {}) {
  const normalized = normalizeTechDetails(details);
  return Object.entries(normalized).some(([key, value]) => key !== 'status' && objectHasValue({ value }));
}

export function technologyStatusLabel(status = 'active') {
  return TECH_STATUS_LABELS[lower(status).replace(/\s+/g, '-')] || TECH_STATUS_LABELS.active;
}

export function technologyStatusTone(status = 'active') {
  const value = lower(status).replace(/\s+/g, '-');
  if (value === 'deprecated') return 'overdue';
  if (value === 'testing') return 'due-soon';
  if (value === 'previously-used') return 'neutral';
  return 'completed';
}

export function isTechnologyEntry(page = {}) {
  const type = lower(page.entryType || page.entryTypeId || page.type);
  if (type === TECHNOLOGY_ENTRY_TYPE) return true;
  if (page.techDetails && hasTechnologyDetails(page.techDetails)) return true;
  const category = lower(page.category);
  return category === 'tech reference' || category.startsWith('tech reference/');
}

function stripHtmlForSearch(value = '') {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSearchText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenSearchValue(value) {
  if (Array.isArray(value)) return value.map(flattenSearchValue).filter(Boolean).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(flattenSearchValue).filter(Boolean).join(' ');
  return text(value);
}

function domainFromUrl(value = '') {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function addSearchField(fields, label, value, scopes = ['all']) {
  const raw = flattenSearchValue(value);
  if (!raw) return;
  fields.push({ label, value: raw, scopes });
}

function searchableEntryPages(page = {}) {
  if (page.secure) return '';
  return getEntryPages(page).map((entryPage) => [entryPage.title, stripHtmlForSearch(entryPage.content)].filter(Boolean).join(' ')).join(' ');
}

function addTechnologySearchFields(fields, page = {}) {
  const tech = normalizeTechDetails(page.techDetails);
  const projectNames = tech.projects.map((project) => project.projectName);
  const projectUrls = tech.projects.map((project) => [project.projectUrl, domainFromUrl(project.projectUrl)].filter(Boolean).join(' '));
  const projectPurposes = tech.projects.map((project) => project.purpose);
  const projectServices = tech.projects.map((project) => project.servicesUsed);
  const projectNotes = tech.projects.map((project) => [project.environment, project.dateAdded, project.notes].filter(Boolean).join(' '));
  const troubleshooting = tech.troubleshooting;

  addSearchField(fields, 'Technology name', [tech.canonicalName, page.title], ['all', 'titles']);
  addSearchField(fields, 'Aliases', tech.aliases, ['all', 'titles', 'content']);
  addSearchField(fields, 'Definition', tech.shortDefinition, ['all', 'content']);
  addSearchField(fields, 'Main purpose', [tech.mainPurpose, tech.importantConcepts], ['all', 'content']);
  addSearchField(fields, 'Why used', [tech.whyUsed, tech.problemSolved, tech.advantages], ['all', 'content']);
  addSearchField(fields, 'Technology category', tech.technologyCategory, ['all', 'categories']);
  addSearchField(fields, 'Official website', [tech.officialUrl, domainFromUrl(tech.officialUrl)], ['all', 'sources']);
  addSearchField(fields, 'Project name', projectNames, ['all', 'content']);
  addSearchField(fields, 'Project URL', projectUrls, ['all', 'sources']);
  addSearchField(fields, 'Use-case purpose', [tech.useCases, projectPurposes], ['all', 'content']);
  addSearchField(fields, 'Services used', projectServices, ['all', 'content']);
  addSearchField(fields, 'Project notes', projectNotes, ['all', 'content']);
  addSearchField(fields, 'Setup notes', [tech.setupNotes, tech.setupSteps, tech.usefulLinks], ['all', 'content']);
  addSearchField(fields, 'Configuration notes', [tech.configurationNotes, tech.codeSnippets, tech.environmentVariables], ['all', 'content']);
  addSearchField(fields, 'Commands', tech.commonCommands, ['all', 'content']);
  addSearchField(fields, 'Problem', troubleshooting.map((item) => item.problem), ['all', 'content']);
  addSearchField(fields, 'Symptoms', troubleshooting.map((item) => item.symptoms), ['all', 'content']);
  addSearchField(fields, 'Cause', troubleshooting.map((item) => item.cause), ['all', 'content']);
  addSearchField(fields, 'Problem solution', [tech.issuesAndSolutions, troubleshooting.map((item) => item.solution)], ['all', 'content']);
  addSearchField(fields, 'Limitations', tech.limitations, ['all', 'content']);
  addSearchField(fields, 'Alternatives', tech.alternatives, ['all', 'content']);
  addSearchField(fields, 'Security notes', tech.securityNotes, ['all', 'content']);
  addSearchField(fields, 'Related technologies', tech.relatedTechnologies, ['all', 'content']);
  addSearchField(fields, 'Related pages', tech.relatedPages, ['all', 'content']);
  addSearchField(fields, 'References', [tech.references, tech.personalNotes], ['all', 'content', 'sources']);
}

export function buildPageSearchDocument(page = {}, scope = 'all') {
  const fields = [];
  if (page.secure) {
    addSearchField(fields, 'Private vault', 'locked note private vault', ['all', 'titles', 'content', 'categories']);
  } else {
    addSearchField(fields, 'Title', page.title, ['all', 'titles']);
    addSearchField(fields, 'Summary', page.summary, ['all', 'content']);
    addSearchField(fields, 'Content', [page.plainText, searchableEntryPages(page)], ['all', 'content']);
    addSearchField(fields, 'Category', page.category, ['all', 'categories']);
    addSearchField(fields, 'Tags', page.tags, ['all', 'tags']);
    addSearchField(fields, 'Source', [page.sourceUrl, page.sourceDomain, page.sourceTitle, page.sourceMetadata], ['all', 'sources']);
    addSearchField(fields, 'Internal links', page.wikiLinks, ['all', 'content']);
    if (isTechnologyEntry(page)) addTechnologySearchFields(fields, page);
  }

  const scopedFields = scope === 'all' ? fields : fields.filter((field) => field.scopes.includes(scope));
  return {
    text: normalizeSearchText(scopedFields.map((field) => field.value).join(' ')),
    fields: scopedFields.map((field) => ({
      ...field,
      normalized: normalizeSearchText(field.value),
    })),
  };
}

function snippetParts(rawValue = '', query = '') {
  const value = String(rawValue || '').replace(/\s+/g, ' ').trim();
  const normalizedQuery = normalizeSearchText(query);
  if (!value || !normalizedQuery) return [];
  const index = value.toLowerCase().indexOf(normalizedQuery);
  if (index < 0) return [{ text: value.slice(0, 180), match: false }];
  const start = Math.max(0, index - 52);
  const end = Math.min(value.length, index + normalizedQuery.length + 90);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < value.length ? '...' : '';
  return [
    { text: `${prefix}${value.slice(start, index)}`, match: false },
    { text: value.slice(index, index + normalizedQuery.length), match: true },
    { text: `${value.slice(index + normalizedQuery.length, end)}${suffix}`, match: false },
  ].filter((part) => part.text);
}

export function searchMatchForPage(page = {}, query = '', scope = 'all') {
  const normalizedQuery = normalizeSearchText(query);
  const document = buildPageSearchDocument(page, scope);
  if (!normalizedQuery) return { matched: true, fieldLabel: '', parts: [] };
  const field = document.fields.find((item) => item.normalized.includes(normalizedQuery));
  if (!field) return { matched: false, fieldLabel: '', parts: [] };
  return {
    matched: true,
    fieldLabel: field.label,
    parts: snippetParts(field.value, query),
  };
}
function hasDiscoveryMarkers(page = {}) {
  return Boolean(
    page.discovery
    || page.discoveryRunId
    || page.discoveryRequestId
    || page.discoveredAt
    || page.discoveryState
    || page.discoverySourceId
    || page.sourceId
    || page.scrapedAt
    || page.scrapedFrom
    || page.crawler
    || page.crawlerInfo
    || page.sourceType === SOURCE_TYPES.discovery
    || page.sourceType === 'scraped'
    || page.entryType === 'scraped'
    || page.entryType === 'discovery'
    || page.origin === 'auto-discovered'
    || page.origin === 'scholarly-api'
    || page.createdOrigin === 'auto-discovered'
    || page.createdOrigin === 'scholarly-api'
  );
}

function hasLegacySourceOnlyMarkers(page = {}) {
  return Boolean(
    page.sourceUrl
    || page.sourceDomain
    || page.sourceTitle
    || page.sourceMetadata?.canonicalUrl
    || page.sourceMetadata?.resolvedUrl
    || page.sourceMetadata?.crawler
    || page.sourceMetadata?.crawlerInfo
  );
}

function hasSharedInboxMarkers(page = {}) {
  return Boolean(page.shareCapture || page.sharedInbox || page.captureId || page.origin === 'shared-inbox' || page.origin === 'system-share');
}

export function sourceTypeForPage(page = {}) {
  const explicit = lower(page.sourceType || page.originType);
  if (['manual', 'user', 'user-created', 'personal'].includes(explicit)) return SOURCE_TYPES.manual;
  if (['discovery', 'scraped', 'auto', 'automatic', 'auto-discovered', 'scholarly-api'].includes(explicit)) return SOURCE_TYPES.discovery;

  const modelEntryType = lower(page.entryType);
  if (['manual', 'user-created', TECHNOLOGY_ENTRY_TYPE].includes(modelEntryType)) return SOURCE_TYPES.manual;
  if (['scraped', 'discovery', 'auto-discovered'].includes(modelEntryType)) return SOURCE_TYPES.discovery;

  const rawOrigin = lower(page.origin || page.createdOrigin);
  const aliasedOrigin = LEGACY_ORIGIN_ALIASES[rawOrigin] || rawOrigin;
  if (DISCOVERY_ORIGINS.has(aliasedOrigin) || hasDiscoveryMarkers(page)) return SOURCE_TYPES.discovery;
  if (PERSONAL_ENTRY_ORIGINS.has(aliasedOrigin) || hasSharedInboxMarkers(page)) return SOURCE_TYPES.manual;
  if (typeof page.createdByUser === 'boolean') return page.createdByUser ? SOURCE_TYPES.manual : SOURCE_TYPES.discovery;
  if (!rawOrigin && hasLegacySourceOnlyMarkers(page)) return SOURCE_TYPES.discovery;
  return SOURCE_TYPES.manual;
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

function createLocalPageId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `page_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  return `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEntryPage(rawPage = {}, index = 0, entry = {}) {
  const fallbackContent = index === 0 ? (entry.content ?? entry.html ?? '') : '';
  const pageId = text(rawPage.pageId || rawPage.id) || (index === 0 ? MAIN_ENTRY_PAGE_ID : createLocalPageId());
  return {
    pageId,
    title: text(rawPage.title) || (index === 0 ? MAIN_ENTRY_PAGE_TITLE : `Page ${index + 1}`),
    content: String(rawPage.content ?? rawPage.html ?? rawPage.body ?? fallbackContent ?? ''),
    createdAt: rawPage.createdAt || entry.createdAt || null,
    updatedAt: rawPage.updatedAt || entry.updatedAt || null,
    order: Number.isFinite(Number(rawPage.order ?? rawPage.index)) ? Number(rawPage.order ?? rawPage.index) : index,
  };
}

export function getEntryPages(entry = {}) {
  const rawPages = Array.isArray(entry.pages) && entry.pages.length
    ? entry.pages
    : [{
        pageId: MAIN_ENTRY_PAGE_ID,
        title: MAIN_ENTRY_PAGE_TITLE,
        content: entry.content ?? entry.html ?? '',
        createdAt: entry.createdAt || null,
        updatedAt: entry.updatedAt || null,
        order: 0,
      }];

  const seen = new Set();
  const normalized = rawPages
    .map((page, index) => normalizeEntryPage(page, index, entry))
    .filter((page) => {
      if (!page.pageId || seen.has(page.pageId)) return false;
      seen.add(page.pageId);
      return true;
    })
    .sort((a, b) => a.order - b.order);

  const pages = normalized.length ? normalized : [normalizeEntryPage({}, 0, entry)];
  return pages.map((page, index) => ({ ...page, order: index }));
}

export function getMainPage(entry = {}) {
  const pages = getEntryPages(entry);
  return pages.find((page) => page.pageId === MAIN_ENTRY_PAGE_ID) || pages[0];
}

export function createEntryPage(title = '', order = 0) {
  const now = new Date().toISOString();
  return {
    pageId: createLocalPageId(),
    title: text(title) || `Page ${order + 1}`,
    content: '<p></p>',
    createdAt: now,
    updatedAt: now,
    order,
  };
}

export function prepareEntryPagesForSave(pages = [], options = {}) {
  const now = options.now || new Date().toISOString();
  const entry = options.entry || {};
  return getEntryPages({ ...entry, pages }).map((page, index) => ({
    pageId: page.pageId || (index === 0 ? MAIN_ENTRY_PAGE_ID : createLocalPageId()),
    title: text(page.title) || (index === 0 ? MAIN_ENTRY_PAGE_TITLE : `Page ${index + 1}`),
    content: String(page.content || '<p></p>'),
    createdAt: page.createdAt || now,
    updatedAt: page.updatedAt || now,
    order: index,
  }));
}

function escapeHeading(value = '') {
  return String(value).replace(/[<>&"]/g, '');
}

export function entryPagesToHtml(pages = []) {
  return prepareEntryPagesForSave(pages).map((page) => {
    const heading = page.pageId === MAIN_ENTRY_PAGE_ID && page.title === MAIN_ENTRY_PAGE_TITLE ? '' : `<h2>${escapeHeading(page.title)}</h2>`;
    return `${heading}${page.content || '<p></p>'}`;
  }).join('\n');
}

export function entryTypeForPage(page = {}) {
  if (isTechnologyEntry(page)) return TECHNOLOGY_ENTRY_TYPE;
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
    technology: 'Technology',
  })[type] || 'Note';
}

export function normalizePage(page = {}) {
  const sourceType = sourceTypeForPage(page);
  const origin = normalizeOrigin(page.origin || page.createdOrigin, { ...page, sourceType });
  const rawOrigin = page.origin || page.createdOrigin || '';
  const inferredDiscovery = hasDiscoveryMarkers(page) && DISCOVERY_ORIGINS.has(origin);
  const createdByUser = typeof page.createdByUser === 'boolean'
    ? page.createdByUser
    : sourceType === SOURCE_TYPES.manual;
  const isArchived = Boolean(page.isArchived || page.archived);
  const visibility = page.visibility === 'shareable' || page.visibility === 'share-link' ? page.visibility : 'private';
  const shareEnabled = Boolean(page.shareEnabled || (visibility !== 'private' && page.shareId));
  const needsOriginReview = page.needsOriginReview ?? (!rawOrigin && !inferredDiscovery && !hasSharedInboxMarkers(page));
  const savedOriginalOrigin = normalizeOrigin(page.originalOrigin || page.discovery?.origin || page.createdOrigin || 'auto-discovered', page);
  const pages = getEntryPages(page);
  const techDetails = isTechnologyEntry(page) ? normalizeTechDetails(page.techDetails) : null;
  const entryType = page.entryType || entryTypeForPage({ ...page, origin, techDetails });
  const normalized = {
    ...page,
    pages,
    ...(techDetails ? { techDetails } : {}),
    origin,
    createdOrigin: normalizeOrigin(page.createdOrigin || origin, { ...page, origin }),
    originalOrigin: page.originalOrigin || (origin === 'saved-discovery' ? (savedOriginalOrigin === 'saved-discovery' ? 'auto-discovered' : savedOriginalOrigin) : null),
    sourceType,
    createdByUser,
    isArchived,
    archived: isArchived,
    archivedAt: page.archivedAt || null,
    archivedReason: page.archivedReason || null,
    visibility,
    shareEnabled,
    shareId: page.shareId || null,
    shareCreatedAt: page.shareCreatedAt || null,
    shareExpiresAt: page.shareExpiresAt || null,
    needsOriginReview: Boolean(needsOriginReview),
    entryType,
  };
  const searchText = buildPageSearchDocument(normalized).text;

  return {
    ...normalized,
    searchText,
    __needsOriginMigration: page.origin !== origin
      || typeof page.createdByUser !== 'boolean'
      || page.sourceType !== sourceType
      || typeof page.isArchived !== 'boolean'
      || typeof page.archived !== 'boolean'
      || typeof page.visibility !== 'string'
      || typeof page.shareEnabled !== 'boolean'
      || (entryType === TECHNOLOGY_ENTRY_TYPE && page.entryType !== TECHNOLOGY_ENTRY_TYPE)
      || !Object.prototype.hasOwnProperty.call(page, 'archivedAt')
      || !Object.prototype.hasOwnProperty.call(page, 'archivedReason')
      || !Object.prototype.hasOwnProperty.call(page, 'shareId')
      || !Object.prototype.hasOwnProperty.call(page, 'shareCreatedAt')
      || !Object.prototype.hasOwnProperty.call(page, 'shareExpiresAt'),
  };
}

export function stripRuntimePageFields(page = {}) {
  const { __needsOriginMigration, ...rest } = page;
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
  if (Object.prototype.hasOwnProperty.call(patch, 'sourceType')) patch.sourceType = sourceTypeForPage({ sourceType: patch.sourceType });
  if (Object.prototype.hasOwnProperty.call(patch, 'isArchived') && !Object.prototype.hasOwnProperty.call(patch, 'archived')) patch.archived = Boolean(patch.isArchived);
  if (Object.prototype.hasOwnProperty.call(patch, 'archived') && !Object.prototype.hasOwnProperty.call(patch, 'isArchived')) patch.isArchived = Boolean(patch.archived);
  if (Object.prototype.hasOwnProperty.call(patch, 'shareEnabled')) patch.shareEnabled = Boolean(patch.shareEnabled);
  if (Object.prototype.hasOwnProperty.call(patch, 'visibility') && !['shareable', 'share-link'].includes(patch.visibility)) patch.visibility = 'private';
  return patch;
}

export function buildOriginMigrationPatch(page = {}) {
  const normalized = normalizePage(page);
  if (!normalized.__needsOriginMigration) return null;
  return {
    origin: normalized.origin,
    createdOrigin: normalized.createdOrigin,
    sourceType: normalized.sourceType,
    createdByUser: normalized.createdByUser,
    entryType: normalized.entryType,
    searchText: normalized.searchText,
    isArchived: normalized.isArchived,
    archived: normalized.archived,
    archivedAt: normalized.archivedAt,
    archivedReason: normalized.archivedReason,
    visibility: normalized.visibility,
    shareEnabled: normalized.shareEnabled,
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
  return normalized.sourceType === SOURCE_TYPES.discovery && normalized.createdByUser !== true && normalized.discoveryState !== 'dismissed';
}

export function isMyEntry(page = {}) {
  const normalized = normalizePage(page);
  return normalized.sourceType === SOURCE_TYPES.manual && normalized.createdByUser === true && PERSONAL_ENTRY_ORIGINS.has(normalized.origin);
}

export function isShareEnabledPage(page = {}) {
  const normalized = normalizePage(page);
  return Boolean(normalized.shareEnabled && normalized.shareId);
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
    case 'tech-reference': return type === TECHNOLOGY_ENTRY_TYPE;
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
    case 'grants': return type === 'grant';
    case 'jobs': return type === 'job';
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
  if (focus === 'shareable') return isShareEnabledPage(normalized);
  if (focus === 'shared-inbox') return isSharedInboxEntry(normalized);
  if (focus === 'notes' || focus === 'overview' || !focus) {
    const view = options.allNotesView || 'my-entries';
    if (view === 'my-entries') return isMyEntry(normalized);
    if (view === 'discoveries') return isDiscoveryRecord(normalized);
    if (view === 'shareable') return isShareEnabledPage(normalized);
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
    archived: true,
    archivedAt: new Date().toISOString(),
    archivedReason: reason,
  };
}

export function unarchivePatch() {
  return {
    isArchived: false,
    archived: false,
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
    sourceType: SOURCE_TYPES.manual,
    createdByUser: true,
    isArchived: false,
    archived: false,
    archivedAt: null,
    archivedReason: null,
    visibility: 'private',
    shareEnabled: false,
    shareId: null,
    shareCreatedAt: null,
    shareExpiresAt: null,
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
  const includeFull = options.includeFullNote !== false;
  const includeSummary = options.includeSummary !== false;
  const includeSourceUrl = options.includeSourceUrl !== false;
  const includeImportantDates = options.includeImportantDates !== false;
  const includeAttachments = options.includeAttachments === true;
  const pages = getEntryPages(normalized);
  return {
    visibility: 'share-link',
    active: true,
    title: normalized.secure ? 'Encrypted note' : (normalized.title || 'Shared entry'),
    category: normalized.secure ? 'Private Vault' : (normalized.category || ''),
    tags: normalized.secure ? [] : (normalized.tags || []).slice(0, 20),
    entryType: normalized.secure ? 'secure-note' : normalized.entryType,
    techDetails: !normalized.secure && normalized.entryType === TECHNOLOGY_ENTRY_TYPE ? normalizeTechDetails(normalized.techDetails) : null,
    summary: includeSummary && !normalized.secure ? (normalized.summary || '') : '',
    html: includeFull && !normalized.secure ? entryPagesToHtml(pages) : '',
    pages: includeFull && !normalized.secure ? pages : [],
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
