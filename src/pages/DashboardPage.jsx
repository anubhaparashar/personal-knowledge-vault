import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Edit3,
  Eye,
  ExternalLink,
  FileArchive,
  FileText,
  Files,
  FlaskConical,
  GraduationCap,
  Grid2X2,
  Landmark,
  LayoutGrid,
  Lightbulb,
  Link2,
  Lock,
  Paperclip,
  Pin,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  XCircle,
} from 'lucide-react';
import AppShell from '../components/AppShell';
import NewEntryMenu from '../components/NewEntryMenu';
import ShareEntryDialog from '../components/ShareEntryDialog';
import { requestCalendarAdd } from '../components/ResearchCalendar';
import {
  Badge,
  EmptyState,
  PrimaryButton,
  SearchToolbar,
  SecondaryButton,
  SectionPanel,
  SegmentedControl,
  StatCard,
  WorkspaceCard,
} from '../components/DashboardUI';
import { useAuth } from '../context/AuthContext';
import { archivePage, removePage, savePage, unarchivePage } from '../services/pages';
import {
  DISCOVERY_PROGRESS_LABELS,
  DISCOVERY_QUEUE_MESSAGE,
  DEFAULT_DISCOVERY_SETTINGS,
  FIXED_DISCOVERY_SCHEDULE_LABEL,
  GITHUB_ACTIONS_DISCOVERY_MESSAGE,
  RESEARCH_DISCOVERY_WORKFLOW_URL,
  formatDiscoveryTimestamp,
  isActiveDiscoveryRun,
  requestStatusLabel,
  requestTypeLabel,
  scanDiscoverySource,
  startDiscoveryRun,
  subscribeDiscoveryRequests,
  subscribeDiscoverySettings,
  subscribeDiscoverySources,
  subscribeDiscoveryStats,
  subscribeLatestDiscoveryRun,
} from '../services/discovery';
import { formatDate, htmlToText } from '../utils/content';
import { daysUntilDate, formatDetectedDate, isCalendarImportantDate, selectNextImportantDate } from '../utils/dates';
import { buildResearchDateEvents, sortResearchPages } from '../utils/researchDates';
import { entryTypeForFocus, openManualEntry } from '../utils/manualEntry';
import {
  entryPagesToHtml,
  entryTypeForPage,
  entryTypeLabel,
  getEntryPages,
  isArchivedPage,
  isDiscoveryRecord,
  isMyEntry,
  isShareEnabledPage,
  normalizePage,
  originLabel,
  originTone,
  pageMatchesOriginFilter,
  pageMatchesSection,
  pageMatchesType,
  savedDiscoveryPatch,
} from '../utils/pageModel';

const LIBRARY_VIEW_KEY = 'aprv-library-view';
const LIBRARY_SEARCH_KEY = 'kv-global-search';
const PINNED_KEY = 'aprv-pinned-pages';
const PRELOAD_KEY = 'kv-editor-preload';
const REMINDER_DISMISS_KEY = 'aprv-dismissed-reminders';

const WORKSPACE_CARDS = [
  { key: 'Scholarships', label: 'Scholarships', icon: GraduationCap, href: '#/scholarships', description: 'Funding and academic calls', terms: ['scholarship', 'studentship', 'stipend', 'tuition waiver'] },
  { key: 'Postdoctoral', label: 'Postdoctoral Opportunities', icon: FlaskConical, href: '#/postdoctoral', description: 'Postdoc roles and lab openings', terms: ['postdoc', 'postdoctoral', 'research fellow', 'research associate'] },
  { key: 'Conferences', label: 'Conference Calls and Deadlines', icon: Presentation, href: '#/conferences', description: 'CFPs, abstracts and submissions', terms: ['conference', 'cfp', 'abstract submission', 'camera ready'] },
  { key: 'Journals', label: 'Journal Calls and Special Issues', icon: FileText, href: '#/journals', description: 'Journal calls and special issues', terms: ['journal', 'special issue', 'manuscript'] },
  { key: 'Ideas', label: 'Paper Ideas', icon: Lightbulb, href: '#/ideas', description: 'Research gaps and hypotheses', terms: ['paper idea', 'research gap', 'hypothesis', 'future work'] },
  { key: 'ProjectIdeas', label: 'Project Ideas', icon: LayoutGrid, href: '#/project-ideas', description: 'Products, systems and buildable ideas', terms: ['project idea', 'product idea', 'prototype', 'proposed system', 'possible features'] },
  { key: 'Papers', label: 'Research Papers and Reading Notes', icon: FileText, href: '#/papers', description: 'Reading notes and literature', terms: ['paper', 'study', 'literature', 'reading note'] },
  { key: 'Fellowships', label: 'Fellowships and Grants', icon: Landmark, href: '#/fellowships', description: 'Fellowships, awards and grants', terms: ['fellowship', 'grant', 'funding call'] },
  { key: 'Applications', label: 'Applications', icon: ClipboardCheck, href: '#/applications', description: 'Submitted and draft applications', terms: ['application', 'apply', 'statement of purpose', 'cover letter'] },
];

const DEADLINE_SCOPE_FILTERS = ['All', 'Scholarships', 'Postdoctoral', 'Conferences', 'Journals', 'Jobs/Fellowships'];
const DEADLINE_TIME_FILTERS = ['Due in 7 days', 'Due in 30 days', 'Due in 90 days', 'Overdue', 'Completed', 'No deadline recorded'];
const ALL_NOTES_VIEW_OPTIONS = [
  { value: 'my-entries', label: 'My Entries' },
  { value: 'discoveries', label: 'Scraped Entries' },
  { value: 'shareable', label: 'Shareable Entries' },
  { value: 'shared-inbox', label: 'Shared Inbox' },
  { value: 'archived', label: 'Archived' },
  { value: 'everything', label: 'Everything' },
];
const ORIGIN_FILTER_OPTIONS = [
  { value: 'all', label: 'All origins' },
  { value: 'manual', label: 'Manual' },
  { value: 'pasted', label: 'Pasted' },
  { value: 'imported', label: 'Imported' },
  { value: 'shared', label: 'Shared' },
  { value: 'auto-discovered', label: 'Scraped/discovered' },
  { value: 'saved-discovery', label: 'Saved Discovery' },
];
const MY_ENTRY_TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'diary', label: 'Diary' },
  { value: 'note', label: 'Note' },
  { value: 'scholarship', label: 'Scholarship' },
  { value: 'postdoctoral', label: 'Postdoctoral' },
  { value: 'grant', label: 'Grant' },
  { value: 'job', label: 'Job' },
  { value: 'conference', label: 'Conference' },
  { value: 'journal', label: 'Journal' },
  { value: 'special-issue', label: 'Special Issue' },
  { value: 'paper-idea', label: 'Paper Idea' },
  { value: 'project-idea', label: 'Project Idea' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'application', label: 'Application' },
];
const ARCHIVE_TABS = [
  { value: 'all', label: 'All Archived' },
  { value: 'my', label: 'My Archived Entries' },
  { value: 'discoveries', label: 'Archived Scraped Entries' },
  { value: 'applications', label: 'Archived Applications' },
  { value: 'proposals', label: 'Archived Proposals' },
];
const DASHBOARD_TABS = [
  { value: 'my-work', label: 'My Work' },
  { value: 'discoveries', label: 'Scraped Entries' },
  { value: 'deadlines', label: 'Deadlines' },
  { value: 'archived', label: 'Archived' },
];
const FOCUS_LABELS = {
  overview: 'Research Library',
  notes: 'All Notes',
  'my-entries': 'My Entries',
  discoveries: 'Scraped Entries',
  shareable: 'Shareable Entries',
  archives: 'Archives',
  calendar: 'Research Calendar',
  deadlines: 'Upcoming Deadlines',
  applications: 'Applications',
  ideas: 'Paper Ideas',
  'project-ideas': 'Project Ideas',
  papers: 'Research Papers',
  literature: 'Literature Notes',
  projects: 'Research Projects',
  scholarships: 'Scholarships',
  postdoctoral: 'Postdoctoral Opportunities',
  fellowships: 'Fellowships',
  grants: 'Grants',
  jobs: 'Jobs',
  conferences: 'Conferences',
  journals: 'Journals',
  'special-issues': 'Special Issues',
  'submission-deadlines': 'Submission Deadlines',
  diary: 'Diary',
  'general-notes': 'General Notes',
  books: 'Books and Reading',
  'secure-notes': 'Secure Notes',
  proposals: 'Project Proposals',
};

function readSessionSet(key) {
  try { return new Set(JSON.parse(sessionStorage.getItem(key) || '[]')); } catch { return new Set(); }
}
function saveSessionSet(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify([...value])); } catch {}
}
function readSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}
function saveSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify([...value])); } catch {}
}
function normalize(value = '') { return String(value).toLowerCase(); }
function sortByUpdated(a, b) { return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0); }
function statusForDays(days) {
  if (days == null) return 'Upcoming';
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  if (days <= 7) return 'Due soon';
  return 'Upcoming';
}
function statusForDeadline(deadline, days) {
  if (deadline?.completed) return 'Completed';
  return statusForDays(days);
}
function deadlineTone(status) {
  return normalize(status).replace(/\s+/g, '-');
}
function entryPagesText(page) {
  if (page.secure) return '';
  return htmlToText(entryPagesToHtml(getEntryPages(page)));
}
function summarizeText(page) {
  return [page.title, page.summary, page.plainText, entryPagesText(page), page.category, page.sourceDomain, page.sourceTitle, page.sourceUrl, ...(page.tags || [])].filter(Boolean).join(' ');
}
function categoryCount(page, card) {
  const source = normalize(summarizeText(page));
  return card.terms.some((term) => source.includes(term));
}
function focusMatchesPage(page, focus) {
  if (!focus || focus === 'overview' || focus === 'notes' || focus === 'calendar') return true;
  if (focus === 'deadlines' || focus === 'submission-deadlines') return Boolean(selectNextImportantDate(page.importantDates || [], { includeOverdue: true }));
  if (focus === 'literature') return normalize(summarizeText(page)).includes('literature') || normalize(summarizeText(page)).includes('reading note');
  if (focus === 'project-ideas') return normalize(summarizeText(page)).includes('project idea') || normalize(summarizeText(page)).includes('product idea') || normalize(summarizeText(page)).includes('prototype') || normalize(page.category || '').includes('project ideas');
  if (focus === 'projects') return normalize(summarizeText(page)).includes('project');
  if (focus === 'grants') return normalize(summarizeText(page)).includes('grant');
  if (focus === 'special-issues') return normalize(summarizeText(page)).includes('special issue');
  if (focus === 'diary') return normalize(summarizeText(page)).includes('diary');
  if (focus === 'general-notes') return normalize(summarizeText(page)).includes('general note');
  if (focus === 'books') return normalize(summarizeText(page)).includes('book') || normalize(summarizeText(page)).includes('reading');
  const card = WORKSPACE_CARDS.find((item) => item.href === `#/${focus}`);
  return card ? categoryCount(page, card) : true;
}
function deadlineMatchesScope(item, filter) {
  const source = normalize([item.deadline?.type, item.page.category, item.page.title, item.page.summary, ...(item.page.tags || [])].filter(Boolean).join(' '));
  if (filter === 'All') return true;
  if (filter === 'Scholarships') return source.includes('scholarship') || source.includes('studentship');
  if (filter === 'Postdoctoral') return source.includes('postdoc') || source.includes('postdoctoral') || source.includes('research fellow');
  if (filter === 'Conferences') return source.includes('conference') || source.includes('abstract') || source.includes('camera');
  if (filter === 'Journals') return source.includes('journal') || source.includes('special issue');
  if (filter === 'Jobs/Fellowships') return source.includes('job') || source.includes('fellowship') || source.includes('grant');
  return true;
}
function deadlineMatchesTime(item, filter) {
  if (!filter || filter === 'No deadline recorded') return true;
  if (filter === 'Due in 7 days') return item.days != null && item.days >= 0 && item.days <= 7;
  if (filter === 'Due in 30 days') return item.days != null && item.days >= 0 && item.days <= 30;
  if (filter === 'Due in 90 days') return item.days != null && item.days >= 0 && item.days <= 90;
  if (filter === 'Overdue') return item.status === 'Overdue';
  if (filter === 'Completed') return item.status === 'Completed';
  return true;
}
function daysRemainingLabel(days) {
  if (days == null) return 'Needs confirmation';
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Due today';
  return `${days} days remaining`;
}
function attachmentIsPdf(file = {}) {
  return normalize(file.mimeType || file.type).includes('pdf') || normalize(file.name || file.originalName || file.fileName).endsWith('.pdf');
}
function sourceForScope(page, scope) {
  if (scope === 'titles') return page.title || '';
  if (scope === 'content') return [page.plainText, page.summary, entryPagesText(page)].filter(Boolean).join(' ');
  if (scope === 'categories') return page.category || '';
  if (scope === 'tags') return (page.tags || []).join(' ');
  if (scope === 'sources') return [page.sourceUrl, page.sourceDomain, page.sourceTitle].filter(Boolean).join(' ');
  return page.secure ? 'locked note private vault' : summarizeText(page);
}
function filterLabel(value) {
  if (value.startsWith('category:')) return value.replace('category:', 'Category: ');
  if (value.startsWith('tag:')) return value.replace('tag:', 'Tag: ');
  if (value.startsWith('deadline:')) return value.replace('deadline:', 'Deadline: ');
  return 'All';
}
function openEditorWithPreload(payload) {
  localStorage.setItem(PRELOAD_KEY, JSON.stringify(payload));
  window.location.hash = '#/edit/new';
}

function NoteAction({ icon: Icon, children, onClick, danger = false }) {
  return (
    <button type="button" className={`note-action ${danger ? 'is-danger' : ''}`} onClick={onClick}>
      <Icon size={15} strokeWidth={1.9} />
      <span>{children}</span>
    </button>
  );
}

export default function DashboardPage({ pages, pdfs = [], loading, error, focus = 'overview' }) {
  const { user } = useAuth();
  const librarySortStorageKey = 'aprv-library-sort:' + (user?.uid || 'local');
  const [search, setSearch] = useState(() => localStorage.getItem(LIBRARY_SEARCH_KEY) || '');
  const [searchScope, setSearchScope] = useState('all');
  const [filterValue, setFilterValue] = useState('all');
  const [deadlineScopeFilter, setDeadlineScopeFilter] = useState('All');
  const [deadlineTimeFilter, setDeadlineTimeFilter] = useState('');
  const [sortMode, setSortMode] = useState(() => localStorage.getItem(librarySortStorageKey) || 'updated-desc');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem(LIBRARY_VIEW_KEY) || 'grid');
  const [pinnedIds, setPinnedIds] = useState(() => readSet(PINNED_KEY));
  const [dismissedReminders, setDismissedReminders] = useState(() => readSessionSet(REMINDER_DISMISS_KEY));
  const [notificationMessage, setNotificationMessage] = useState('');
  const [discoverySettings, setDiscoverySettings] = useState(DEFAULT_DISCOVERY_SETTINGS);
  const [discoverySources, setDiscoverySources] = useState([]);
  const [latestDiscoveryRun, setLatestDiscoveryRun] = useState(null);
  const [discoveryStats, setDiscoveryStats] = useState(null);
  const [discoveryRequests, setDiscoveryRequests] = useState([]);
  const [discoveryMessage, setDiscoveryMessage] = useState('');
  const [selectedDiscoverySourceId, setSelectedDiscoverySourceId] = useState('');
  const [runLogOpen, setRunLogOpen] = useState(false);
  const [allNotesView, setAllNotesView] = useState('my-entries');
  const [originFilter, setOriginFilter] = useState('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [myOriginFilter, setMyOriginFilter] = useState('all');
  const [myTypeFilter, setMyTypeFilter] = useState('all');
  const [myStatusFilter, setMyStatusFilter] = useState('active');
  const [archiveTab, setArchiveTab] = useState('all');
  const [archiveOriginFilter, setArchiveOriginFilter] = useState('all');
  const [archiveTypeFilter, setArchiveTypeFilter] = useState('all');
  const [archiveHasDeadline, setArchiveHasDeadline] = useState('all');
  const [selectedPageIds, setSelectedPageIds] = useState(() => new Set());
  const [sharePage, setSharePage] = useState(null);
  const [dashboardTab, setDashboardTab] = useState('my-work');

  useEffect(() => { localStorage.setItem(LIBRARY_SEARCH_KEY, search); }, [search]);
  useEffect(() => { localStorage.setItem(LIBRARY_VIEW_KEY, viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem(librarySortStorageKey, sortMode); }, [librarySortStorageKey, sortMode]);
  useEffect(() => { saveSet(PINNED_KEY, pinnedIds); }, [pinnedIds]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const unsubscribers = [
      subscribeDiscoverySettings(user.uid, setDiscoverySettings, (err) => setDiscoveryMessage(err.message)),
      subscribeDiscoverySources(user.uid, setDiscoverySources, (err) => setDiscoveryMessage(err.message)),
      subscribeLatestDiscoveryRun(user.uid, setLatestDiscoveryRun, (err) => setDiscoveryMessage(err.message)),
      subscribeDiscoveryStats(user.uid, setDiscoveryStats, (err) => setDiscoveryMessage(err.message)),
      subscribeDiscoveryRequests(user.uid, (items = []) => setDiscoveryRequests(Array.isArray(items) ? items : []), (err) => setDiscoveryMessage(err.message), 20),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
  }, [user?.uid]);

  useEffect(() => {
    const enabled = discoverySources.filter((source) => source.enabled !== false && !source.paused);
    if (!enabled.length) {
      setSelectedDiscoverySourceId('');
      return;
    }
    if (!enabled.some((source) => source.id === selectedDiscoverySourceId)) setSelectedDiscoverySourceId(enabled[0].id);
  }, [discoverySources, selectedDiscoverySourceId]);

  const normalizedPages = useMemo(() => pages.map((page) => normalizePage(page)), [pages]);
  const activePages = useMemo(() => normalizedPages.filter((page) => !isArchivedPage(page)), [normalizedPages]);
  const archivedPages = useMemo(() => normalizedPages.filter((page) => isArchivedPage(page)), [normalizedPages]);
  const myEntryPages = useMemo(() => activePages.filter(isMyEntry), [activePages]);
  const discoveryPages = useMemo(() => activePages.filter(isDiscoveryRecord), [activePages]);
  const researchEvents = useMemo(() => buildResearchDateEvents(activePages, { includeDerived: true }), [activePages]);

  const deadlines = useMemo(() => activePages
    .flatMap((page) => (page.importantDates || [])
      .filter((deadline) => deadline.date && isCalendarImportantDate(deadline))
      .map((deadline) => {
        const date = new Date(`${deadline.date}T00:00:00`);
        const days = daysUntilDate(deadline.date);
        return {
          id: `${page.id}:${deadline.id || deadline.type || deadline.date}`,
          page,
          deadline,
          date,
          days,
          status: statusForDeadline(deadline, days),
          kind: deadline.displayLabel || deadline.title || deadline.type || page.category || 'Important date',
        };
      }))
    .sort((a, b) => {
      if (a.status === 'Completed' && b.status !== 'Completed') return 1;
      if (b.status === 'Completed' && a.status !== 'Completed') return -1;
      return a.date - b.date;
    }), [activePages]);

  const primaryDates = useMemo(() => {
    const map = new Map();
    normalizedPages.forEach((page) => {
      const primary = selectNextImportantDate(page.importantDates || []);
      if (!primary) return;
      const days = daysUntilDate(primary.date);
      map.set(page.id, {
        id: `${page.id}:${primary.id || primary.type || primary.date}`,
        page,
        deadline: primary,
        date: new Date(`${primary.date}T00:00:00`),
        days,
        status: statusForDeadline(primary, days),
        kind: primary.type || 'Important date',
      });
    });
    return map;
  }, [normalizedPages]);

  const categories = useMemo(() => {
    const map = new Map();
    activePages.forEach((page) => {
      const key = page.secure ? 'Private Vault' : page.category || 'Uncategorised';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [activePages]);

  const tags = useMemo(() => {
    const map = new Map();
    activePages.forEach((page) => (page.tags || []).forEach((tag) => map.set(tag, (map.get(tag) || 0) + 1)));
    return map;
  }, [activePages]);

  const recent = useMemo(() => [...myEntryPages].sort(sortByUpdated).slice(0, 6), [myEntryPages]);
  const pagesWithoutDeadlines = useMemo(() => myEntryPages.filter((page) => !page.secure && !selectNextImportantDate(page.importantDates || [], { includeOverdue: true })), [myEntryPages]);
  const visibleReminders = useMemo(() => deadlines.filter((item) => ['Overdue', 'Due today', 'Due soon'].includes(item.status) && !item.deadline?.completed && !dismissedReminders.has(item.id)), [deadlines, dismissedReminders]);
  const filteredDeadlines = useMemo(() => deadlines.filter((item) => deadlineMatchesScope(item, deadlineScopeFilter) && deadlineMatchesTime(item, deadlineTimeFilter)), [deadlines, deadlineScopeFilter, deadlineTimeFilter]);

  const filterOptions = useMemo(() => {
    const items = [{ value: 'all', label: 'All filters' }];
    [...categories.keys()].sort().forEach((category) => items.push({ value: `category:${category}`, label: `Category: ${category}` }));
    [...tags.keys()].sort().slice(0, 24).forEach((tag) => items.push({ value: `tag:${tag}`, label: `Tag: ${tag}` }));
    items.push(
      { value: 'deadline:due-today', label: 'Deadline: Due today' },
      { value: 'deadline:due-soon', label: 'Deadline: Due within 7 days' },
      { value: 'deadline:overdue', label: 'Deadline: Overdue' },
    );
    return items;
  }, [categories, tags]);

  const stats = useMemo(() => [
    { icon: Files, value: myEntryPages.length, label: 'My Entries', helper: 'Created or accepted records' },
    { icon: Search, value: discoveryPages.length, label: 'Scraped Entries', helper: 'GitHub Actions results' },
    { icon: CalendarClock, value: deadlines.filter((item) => !item.deadline?.completed).length, label: 'Upcoming Deadlines', helper: 'Active tracked dates' },
    { icon: Archive, value: archivedPages.length, label: 'Archived', helper: 'Hidden, not deleted' },
  ], [archivedPages.length, deadlines, discoveryPages.length, myEntryPages.length]);

  const workspaceCounts = useMemo(() => new Map(WORKSPACE_CARDS.map((card) => [card.key, myEntryPages.filter((page) => categoryCount(page, card)).length])), [myEntryPages]);

  const filteredPages = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sectionOptions = {
      allNotesView,
      includeArchived: includeArchived || focus === 'archives',
    };
    let items = normalizedPages.filter((page) => pageMatchesSection(page, focus, sectionOptions));

    if (focus === 'my-entries') {
      items = items.filter((page) => {
        if (!pageMatchesOriginFilter(page, myOriginFilter)) return false;
        if (!pageMatchesType(page, myTypeFilter)) return false;
        if (myStatusFilter === 'active' && isArchivedPage(page)) return false;
        if (myStatusFilter === 'archived' && !isArchivedPage(page)) return false;
        return true;
      });
    }

    if (focus === 'notes' || focus === 'overview') {
      items = items.filter((page) => pageMatchesOriginFilter(page, originFilter));
    }

    if (focus === 'archives') {
      items = items.filter((page) => {
        if (archiveTab === 'my' && !isMyEntry(page)) return false;
        if (archiveTab === 'discoveries' && !isDiscoveryRecord(page)) return false;
        if (archiveTab === 'applications' && entryTypeForPage(page) !== 'application') return false;
        if (archiveTab === 'proposals' && entryTypeForPage(page) !== 'proposal') return false;
        if (!pageMatchesOriginFilter(page, archiveOriginFilter)) return false;
        if (!pageMatchesType(page, archiveTypeFilter)) return false;
        if (archiveHasDeadline === 'yes' && !selectNextImportantDate(page.importantDates || [], { includeOverdue: true })) return false;
        if (archiveHasDeadline === 'no' && selectNextImportantDate(page.importantDates || [], { includeOverdue: true })) return false;
        return true;
      });
    }

    items = items.filter((page) => {
      if (filterValue.startsWith('category:') && normalize(page.secure ? 'Private Vault' : (page.category || 'Uncategorised')) !== normalize(filterValue.slice(9))) return false;
      if (filterValue.startsWith('tag:') && !(page.tags || []).map(normalize).includes(normalize(filterValue.slice(4)))) return false;
      const deadline = primaryDates.get(page.id);
      if (filterValue === 'deadline:due-today' && deadline?.days !== 0) return false;
      if (filterValue === 'deadline:due-soon' && !(deadline && deadline.days > 0 && deadline.days <= 7)) return false;
      if (filterValue === 'deadline:overdue' && !(deadline && deadline.days < 0)) return false;
      if (q && !normalize(sourceForScope(page, searchScope)).includes(q)) return false;
      return true;
    });

    items = sortResearchPages(items, researchEvents, sortMode);
    return [...items].sort((a, b) => (pinnedIds.has(a.id) === pinnedIds.has(b.id) ? 0 : pinnedIds.has(a.id) ? -1 : 1));
  }, [allNotesView, archiveHasDeadline, archiveOriginFilter, archiveTab, archiveTypeFilter, filterValue, focus, includeArchived, myOriginFilter, myStatusFilter, myTypeFilter, normalizedPages, originFilter, pinnedIds, primaryDates, researchEvents, search, searchScope, sortMode]);

  const focusLabel = FOCUS_LABELS[focus] || 'Research Library';
  const deadlineScopeOptions = DEADLINE_SCOPE_FILTERS.map((label) => ({ label, value: label }));
  const deadlineTimeOptions = DEADLINE_TIME_FILTERS.map((label) => ({ label, value: label }));
  const noDeadlineMode = deadlineTimeFilter === 'No deadline recorded';
  const deadlineRows = noDeadlineMode ? [] : filteredDeadlines.slice(0, 10);
  const noDeadlineRows = noDeadlineMode ? pagesWithoutDeadlines.slice(0, 10) : [];
  const enabledSources = discoverySources.filter((source) => source.enabled !== false && !source.paused);
  const enabledSourceCount = enabledSources.length;
  const discoveryRequestRows = Array.isArray(discoveryRequests) ? discoveryRequests : [];
  const queuedDiscoveryRequests = discoveryRequestRows.filter((request) => ['queued', 'processing'].includes(request.status));
  const queuedLinkRequests = discoveryRequestRows.filter((request) => request.type === 'single-link').slice(0, 4);
  const automaticDiscoveryLabel = 'GitHub Actions scheduled';
  const discoveryRunStatus = latestDiscoveryRun?.status || 'idle';
  const discoveryStatusLabel = latestDiscoveryRun?.currentStage || DISCOVERY_PROGRESS_LABELS[latestDiscoveryRun?.step] || DISCOVERY_PROGRESS_LABELS[discoveryRunStatus] || 'Idle';
  const discoveryActive = isActiveDiscoveryRun(latestDiscoveryRun);
  const currentActivity = discoveryActive ? (discoveryRunStatus === 'queued' ? 'Queued' : 'Running') : (queuedDiscoveryRequests.length ? `${queuedDiscoveryRequests.length} queued request(s)` : 'Idle');
  const latestWarnings = Array.isArray(latestDiscoveryRun?.warningMessages) ? latestDiscoveryRun.warningMessages.length : (Array.isArray(latestDiscoveryRun?.warnings) ? latestDiscoveryRun.warnings.length : Number(latestDiscoveryRun?.warnings || discoveryStats?.warnings || 0));
  const latestStats = latestDiscoveryRun?.stats || {};
  const contextEntry = entryTypeForFocus(focus);
  const selectedCount = selectedPageIds.size;
  const isDiscoveryFocus = focus === 'discoveries' || ['scholarships', 'postdoctoral', 'fellowships', 'grants', 'jobs', 'conferences', 'journals', 'special-issues', 'submission-deadlines'].includes(focus);
  const isShareableFocus = focus === 'shareable';
  const libraryTitle = focus === 'my-entries'
    ? 'My Entries'
    : focus === 'discoveries'
      ? 'Scraped Entries'
      : focus === 'shareable'
        ? 'Shareable Entries'
        : focus === 'archives'
        ? 'Archives'
        : focus === 'notes'
          ? 'All Notes'
          : focusLabel;
  const libraryEyebrow = focus === 'archives' ? 'ARCHIVES' : isDiscoveryFocus ? 'SCRAPED ENTRIES' : isShareableFocus ? 'SHAREABLE' : 'NOTE LIBRARY';
  const emptyTitle = focus === 'diary' ? 'No diary entries yet.' : focus === 'archives' ? 'No archived records' : focus === 'discoveries' ? 'No scraped entries yet' : focus === 'shareable' ? 'No shareable entries yet' : 'No pages match this search';
  const emptyDescription = focus === 'diary'
    ? 'Write a personal note, reflection, idea, or daily research update.'
    : focus === 'archives'
      ? 'Archive manual and scraped entries to hide them without deleting.'
      : focus === 'discoveries'
        ? 'Queued discovery results from GitHub Actions will appear here.'
        : focus === 'shareable'
          ? 'Manual entries appear here only after you enable a public share link.'
          : 'Try a different search, scope or filter, or create a new research entry.';

  function dismissReminder(id) {
    const next = new Set(dismissedReminders);
    next.add(id);
    setDismissedReminders(next);
    saveSessionSet(REMINDER_DISMISS_KEY, next);
  }

  async function enableBrowserNotifications() {
    if (!('Notification' in window)) {
      setNotificationMessage('This browser does not support notifications.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setNotificationMessage('Browser reminders were not enabled.');
      return;
    }
    setNotificationMessage('Browser reminders enabled for this browser.');
    visibleReminders.slice(0, 3).forEach((item) => {
      new Notification(`${item.kind}: ${item.page.title}`, { body: `${item.status} - ${item.deadline.date}` });
    });
  }

  async function runDiscovery(mode) {
    setDiscoveryMessage('');
    if (mode === 'full') {
      setDiscoveryMessage(GITHUB_ACTIONS_DISCOVERY_MESSAGE);
      return;
    }
    try {
      await startDiscoveryRun(user, 'quick');
      setDiscoveryMessage(DISCOVERY_QUEUE_MESSAGE);
    } catch (error) {
      setDiscoveryMessage(error.message || 'Could not queue discovery.');
    }
  }

  async function scanSelectedSource() {
    setDiscoveryMessage('');
    if (!selectedDiscoverySourceId) {
      setDiscoveryMessage('No enabled source is selected. Add or enable a source in Settings.');
      return;
    }
    try {
      await scanDiscoverySource(user, selectedDiscoverySourceId);
      setDiscoveryMessage(DISCOVERY_QUEUE_MESSAGE);
    } catch (error) {
      setDiscoveryMessage(error.message || 'Could not queue this source scan.');
    }
  }

  function openContextEntry() {
    openManualEntry(entryTypeForFocus(focus).id);
  }
  function selectedPages() {
    return normalizedPages.filter((page) => selectedPageIds.has(page.id));
  }

  function toggleSelect(pageId) {
    setSelectedPageIds((current) => {
      const next = new Set(current);
      next.has(pageId) ? next.delete(pageId) : next.add(pageId);
      return next;
    });
  }

  function clearSelection() {
    setSelectedPageIds(new Set());
  }

  async function togglePin(page) {
    const next = new Set(pinnedIds);
    next.has(page.id) ? next.delete(page.id) : next.add(page.id);
    setPinnedIds(next);
  }

  async function toggleArchive(page) {
    if (!user?.uid) return;
    try {
      if (isArchivedPage(page)) await unarchivePage(user.uid, page.id);
      else await archivePage(user.uid, page.id, 'Archived from dashboard');
    } catch (error) {
      window.alert(error.message || 'Could not update archive status.');
    }
  }

  async function saveDiscoveryToMyEntries(page) {
    if (!user?.uid) return;
    try {
      await savePage(user.uid, page.id, savedDiscoveryPatch(page), false);
      setDiscoveryMessage('Saved to My Entries.');
    } catch (error) {
      setDiscoveryMessage(error.message || 'Could not save discovery.');
    }
  }

  async function followDiscovery(page) {
    if (!user?.uid) return;
    try {
      await savePage(user.uid, page.id, { following: true, discoveryState: page.discoveryState || 'active' }, false);
      setDiscoveryMessage('Discovery followed.');
    } catch (error) {
      setDiscoveryMessage(error.message || 'Could not follow discovery.');
    }
  }

  async function dismissDiscovery(page) {
    if (!user?.uid) return;
    try {
      await savePage(user.uid, page.id, { discoveryState: 'dismissed', dismissedAt: new Date().toISOString() }, false);
      setDiscoveryMessage('Discovery dismissed.');
    } catch (error) {
      setDiscoveryMessage(error.message || 'Could not dismiss discovery.');
    }
  }

  function startApplicationFromPage(page) {
    openEditorWithPreload({
      title: `Application - ${page.title || 'Opportunity'}`,
      category: 'Applications/Application Documents',
      tagsText: ['Application', ...(page.tags || [])].join(', '),
      sourceUrl: page.sourceUrl || '',
      summary: `Application workspace for ${page.title || 'this opportunity'}.`,
      html: `<p>Application workspace for <a href="#/read/${page.id}">${page.title || 'this opportunity'}</a>.</p>`,
      origin: 'manual',
      opportunityDetails: { relatedOpportunityId: page.id, applicationUrl: page.sourceUrl || '' },
    });
  }

  async function bulkArchiveSelected() {
    if (!user?.uid) return;
    await Promise.all(selectedPages().map((page) => archivePage(user.uid, page.id, 'Bulk archive')));
    clearSelection();
  }

  async function bulkUnarchiveSelected() {
    if (!user?.uid) return;
    await Promise.all(selectedPages().map((page) => unarchivePage(user.uid, page.id)));
    clearSelection();
  }

  async function bulkChangeCategory() {
    if (!user?.uid || !selectedPageIds.size) return;
    const category = window.prompt('New category for selected entries');
    if (!category || !category.trim()) return;
    await Promise.all(selectedPages().map((page) => savePage(user.uid, page.id, { category: category.trim() }, false)));
    clearSelection();
  }
  async function bulkMarkMyEntry() {
    if (!user?.uid) return;
    await Promise.all(selectedPages().map((page) => savePage(user.uid, page.id, { origin: 'saved-discovery', createdOrigin: 'saved-discovery', originalOrigin: page.origin || 'auto-discovered', sourceType: 'manual', createdByUser: true, isArchived: false, archived: false, archivedAt: null, archivedReason: null, visibility: 'private', shareEnabled: false, shareId: null, shareCreatedAt: null, shareExpiresAt: null }, false)));
    clearSelection();
  }

  async function bulkMarkDiscovery() {
    if (!user?.uid) return;
    await Promise.all(selectedPages().map((page) => savePage(user.uid, page.id, { origin: 'auto-discovered', createdOrigin: 'auto-discovered', originalOrigin: page.originalOrigin || page.origin || 'manual', sourceType: 'discovery', createdByUser: false, visibility: 'private', shareEnabled: false, shareId: null, shareCreatedAt: null, shareExpiresAt: null }, false)));
    clearSelection();
  }

  async function bulkDeleteSelected() {
    if (!user?.uid || !selectedPageIds.size) return;
    if (!window.confirm(`Delete ${selectedPageIds.size} selected item(s) permanently?`)) return;
    await Promise.all(selectedPages().map((page) => removePage(user.uid, page.id)));
    clearSelection();
  }

  function bulkExportSelected() {
    const payload = selectedPages();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'research-vault-selected-entries.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function duplicatePage(page) {
    const now = new Date().toISOString();
    const copiedPages = getEntryPages(page).map((entryPage, index) => ({
      ...entryPage,
      order: index,
      createdAt: now,
      updatedAt: now,
    }));
    const payload = page.secure
      ? { title: `${page.title || 'Locked note'} copy`, category: page.category || 'Private Vault', tagsText: (page.tags || []).join(', '), sourceUrl: '', summary: '', html: '<p></p>', secure: false, origin: 'manual' }
      : { title: `${page.title || 'Untitled'} copy`, category: page.category || 'Uncategorised', tagsText: (page.tags || []).join(', '), sourceUrl: page.sourceUrl || '', summary: page.summary || '', html: page.html || '<p></p>', content: page.content || page.html || '<p></p>', pages: copiedPages, secure: false, origin: 'manual' };
    openEditorWithPreload(payload);
  }

  async function deletePage(page) {
    if (!window.confirm(`Delete "${page.title || 'this note'}" permanently?`)) return;
    await removePage(user.uid, page.id);
  }

  const setupIssue = error && /firebase|configured|permission|not configured|api key/i.test(error);
  const dashboardDeadlines = deadlines.filter((item) => !item.deadline?.completed).slice(0, 6);
  const dashboardDiscoveries = [...discoveryPages].sort(sortByUpdated).slice(0, 5);
  const dashboardArchived = [...archivedPages].sort(sortByUpdated).slice(0, 5);
  const discoverySummary = [
    { label: 'Status', value: currentActivity },
    { label: 'Sources enabled', value: enabledSourceCount },
    { label: 'Next scheduled scan', value: FIXED_DISCOVERY_SCHEDULE_LABEL },
    { label: 'Last successful scan', value: formatDiscoveryTimestamp(discoveryStats?.lastSuccessfulScanAt) },
  ];

  function renderSyncMessage() {
    if (!error) return null;
    if (setupIssue) {
      return (
        <div className="setup-message">
          <strong>Backend setup needed</strong>
          <span>Connect Firebase in Settings before live sync is available.</span>
        </div>
      );
    }
    return <div className="alert-panel error"><strong>Library sync issue</strong><span>{error}</span></div>;
  }

  function renderDeadlineRows(items, emptyTitle = 'No upcoming deadlines') {
    return (
      <div className="deadline-list" aria-label="Upcoming deadline list">
        {items.map((item) => (
          <a key={item.id} className={`deadline-row ${deadlineTone(item.status)}`} href={`#/read/${item.page.id}`}>
            <span className="deadline-row-icon"><CalendarClock size={18} strokeWidth={1.8} /></span>
            <span className="deadline-row-main">
              <strong>{item.page.secure ? 'Locked note' : item.page.title}</strong>
              <small>{item.page.category || 'Uncategorised'} - {item.kind}</small>
            </span>
            <span className="deadline-row-date">{formatDetectedDate(item.deadline)}</span>
            <Badge tone={deadlineTone(item.status)}>{item.status}</Badge>
            <span className="deadline-row-days">{daysRemainingLabel(item.days)}</span>
            <ChevronRight size={18} aria-hidden="true" />
          </a>
        ))}
        {!items.length ? <EmptyState icon={CalendarClock} title={emptyTitle} compact /> : null}
      </div>
    );
  }

  function renderCompactPageRows(items, emptyTitle, emptyDescription, options = {}) {
    const allowSelection = options.allowSelection !== false;
    return (
      <div className={`note-library ${viewMode === 'list' ? 'is-list' : 'is-grid'}`}>
        {items.map((page) => {
          const normalizedPage = normalizePage(page);
          const deadline = primaryDates.get(normalizedPage.id);
          const preview = normalizedPage.secure ? 'Encrypted entry. Unlock it to read the contents.' : (normalizedPage.summary || normalizedPage.plainText || 'No summary yet.').slice(0, 150);
          const archived = isArchivedPage(normalizedPage);
          const discovery = isDiscoveryRecord(normalizedPage);
          const ownedEntry = isMyEntry(normalizedPage);
          const shareable = isShareEnabledPage(normalizedPage);
          const discoveredAt = normalizedPage.discoveredAt || normalizedPage.discovery?.firstDiscoveredAt || normalizedPage.createdAt;
          const selected = selectedPageIds.has(normalizedPage.id);
          return (
            <article key={normalizedPage.id} className={`note-card ${normalizedPage.secure ? 'secure-note' : ''} ${archived ? 'is-archived' : ''}`}>
              {allowSelection ? (
                <label className="card-select-control" aria-label={`Select ${normalizedPage.title || 'entry'}`}>
                  <input type="checkbox" checked={selected} onChange={() => toggleSelect(normalizedPage.id)} />
                  <span>Select</span>
                </label>
              ) : null}
              <div className="note-card-head">
                <span className="category-pill">{normalizedPage.secure ? 'Private Vault' : normalizedPage.category || 'Uncategorised'}</span>
                <div className="note-meta-row">
                  <Badge tone={originTone(normalizedPage.origin)}>{originLabel(normalizedPage.origin)}</Badge>
                  <Badge tone="neutral">{entryTypeLabel(entryTypeForPage(normalizedPage))}</Badge>
                  {archived ? <Badge tone="neutral">Archived</Badge> : null}
                  {shareable ? <Badge tone="completed">Shareable</Badge> : null}
                  {deadline ? <Badge tone={deadlineTone(deadline.status)}>{deadline.status}</Badge> : null}
                </div>
              </div>
              <h3>{normalizedPage.secure ? 'Locked entry' : normalizedPage.title || 'Untitled entry'}</h3>
              <p>{preview}</p>
              {discovery ? (
                <div className="note-discovery-meta compact">
                  <span>Source: {normalizedPage.discovery?.sourceName || normalizedPage.sourceDomain || 'Official source'}</span>
                  <span>Status: {normalizedPage.discovery?.status || normalizedPage.discoveryState || 'active'}</span>
                  <span>Discovered: {formatDiscoveryTimestamp(discoveredAt)}</span>
                </div>
              ) : null}
              {deadline ? (
                <div className="note-next-date">
                  <CalendarClock size={15} />
                  <span><strong>Next date</strong>{deadline.kind} - {formatDetectedDate(deadline.deadline)}</span>
                  <small>{daysRemainingLabel(deadline.days)}</small>
                </div>
              ) : null}
              <div className="note-card-foot">
                <small>{discovery ? `Discovered ${formatDiscoveryTimestamp(discoveredAt)}` : `Updated ${formatDate(normalizedPage.updatedAt)}`}</small>
                <div className="note-actions">
                  <NoteAction icon={Eye} onClick={() => window.location.hash = `#/read/${normalizedPage.id}`}>Open</NoteAction>
                  {ownedEntry ? <NoteAction icon={Edit3} onClick={() => window.location.hash = `#/edit/${normalizedPage.id}`}>Edit</NoteAction> : null}
                  {ownedEntry ? <NoteAction icon={Share2} onClick={() => setSharePage(normalizedPage)}>{shareable ? 'Share link' : 'Make shareable'}</NoteAction> : null}
                  {ownedEntry ? <NoteAction icon={Copy} onClick={() => duplicatePage(normalizedPage)}>Duplicate</NoteAction> : null}
                  {discovery ? <NoteAction icon={CheckCircle2} onClick={() => saveDiscoveryToMyEntries(normalizedPage)}>Save to My Entries</NoteAction> : null}
                  {normalizedPage.sourceUrl ? <NoteAction icon={ExternalLink} onClick={() => window.open(normalizedPage.sourceUrl, '_blank', 'noopener,noreferrer')}>Source</NoteAction> : null}
                  <NoteAction icon={Archive} onClick={() => toggleArchive(normalizedPage)}>{archived ? 'Restore' : 'Archive'}</NoteAction>
                </div>
              </div>
            </article>
          );
        })}
        {!items.length ? (
          <EmptyState
            icon={Grid2X2}
            title={emptyTitle}
            actions={focus === 'archives' ? null : focus === 'diary' ? <PrimaryButton onClick={() => openManualEntry('diary')}><Plus size={17} /> New Diary Entry</PrimaryButton> : null}
          >
            {emptyDescription}
          </EmptyState>
        ) : null}
      </div>
    );
  }

  if (focus === 'overview') {
    return (
      <AppShell title="Dashboard">
        <div className="dashboard-stack dashboard-overview">
          {renderSyncMessage()}
          {loading ? <div className="skeleton-panel"><span /><span /><span /></div> : null}

          <section className="stat-grid dashboard-stat-grid" aria-label="Vault summary">
            {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
          </section>

          <div className="dashboard-tab-row">
            <SegmentedControl ariaLabel="Dashboard tabs" options={DASHBOARD_TABS} value={dashboardTab} onChange={setDashboardTab} />
          </div>

          {dashboardTab === 'my-work' ? (
            <SectionPanel eyebrow="MY WORK" title="Recent entries" actions={<Badge>{myEntryPages.length} total</Badge>}>
              {renderCompactPageRows(recent, 'No recent entries', 'Create or accept entries to build your working library.', { allowSelection: false })}
            </SectionPanel>
          ) : null}

          {dashboardTab === 'discoveries' ? (
            <SectionPanel eyebrow="SCRAPED ENTRIES" title="Discovery status summary" actions={<Badge>{discoveryPages.length} active</Badge>}>
              <div className="discovery-status-grid summary-only">
                {discoverySummary.map((item) => <article key={item.label}><span>{item.label}</span><strong>{item.value}</strong></article>)}
              </div>
              {discoveryMessage ? <p className="status-message">{discoveryMessage.includes('Could not') ? 'Discovery setup needs attention. Review Sources in Settings.' : discoveryMessage}</p> : null}
              {renderCompactPageRows(dashboardDiscoveries, 'No scraped entries yet', 'Scraped records will appear here after the configured GitHub Actions workflow runs.', { allowSelection: false })}
            </SectionPanel>
          ) : null}

          {dashboardTab === 'deadlines' ? (
            <SectionPanel eyebrow="DEADLINES" title="Upcoming deadlines" actions={<Badge>{dashboardDeadlines.length} shown</Badge>}>
              {renderDeadlineRows(dashboardDeadlines)}
            </SectionPanel>
          ) : null}

          {dashboardTab === 'archived' ? (
            <SectionPanel eyebrow="ARCHIVED" title="Recently archived" actions={<Badge>{archivedPages.length} total</Badge>}>
              {renderCompactPageRows(dashboardArchived, 'No archived records', 'Archived manual and scraped entries are hidden from active views.', { allowSelection: false })}
            </SectionPanel>
          ) : null}
        </div>
        <ShareEntryDialog page={sharePage} open={Boolean(sharePage)} onClose={() => setSharePage(null)} />
      </AppShell>
    );
  }

  if (focus === 'deadlines') {
    return (
      <AppShell title="Upcoming Deadlines">
        <div className="dashboard-stack">
          {renderSyncMessage()}
          {loading ? <div className="skeleton-panel"><span /><span /><span /></div> : null}
          <SectionPanel eyebrow="DEADLINES" title="Upcoming deadlines" actions={<Badge>{deadlines.length} tracked</Badge>}>
            {renderDeadlineRows(deadlines.filter((item) => !item.deadline?.completed).slice(0, 24))}
          </SectionPanel>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={focusLabel}>
      <div className="dashboard-stack">
        {renderSyncMessage()}
        {loading ? <div className="skeleton-panel"><span /><span /><span /></div> : null}

        <SectionPanel eyebrow={libraryEyebrow} title={libraryTitle} actions={(
          <>
            <Badge>{filteredPages.length} shown</Badge>
            {!isDiscoveryFocus && !isShareableFocus && focus !== 'archives' ? <PrimaryButton onClick={openContextEntry}><Plus size={17} /> {contextEntry.shortLabel || contextEntry.label}</PrimaryButton> : null}
          </>
        )}>
          {focus === 'notes' ? (
            <div className="section-filter-stack">
              <SegmentedControl ariaLabel="All Notes view" options={ALL_NOTES_VIEW_OPTIONS} value={allNotesView} onChange={setAllNotesView} />
              <div className="section-filter-row">
                <label className="select-control"><span>Origin</span><select value={originFilter} onChange={(event) => setOriginFilter(event.target.value)}>{ORIGIN_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="switch-field"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /><span>Include archived</span></label>
              </div>
            </div>
          ) : null}
          {focus === 'my-entries' ? (
            <div className="section-filter-row">
              <label className="select-control"><span>Type</span><select value={myTypeFilter} onChange={(event) => setMyTypeFilter(event.target.value)}>{MY_ENTRY_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            </div>
          ) : null}
          {focus === 'archives' ? (
            <div className="section-filter-stack">
              <SegmentedControl ariaLabel="Archive tabs" options={ARCHIVE_TABS} value={archiveTab} onChange={setArchiveTab} />
              <div className="section-filter-row">
                <label className="select-control"><span>Type</span><select value={archiveTypeFilter} onChange={(event) => setArchiveTypeFilter(event.target.value)}>{MY_ENTRY_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="select-control"><span>Deadline</span><select value={archiveHasDeadline} onChange={(event) => setArchiveHasDeadline(event.target.value)}><option value="all">All</option><option value="yes">Has deadline</option><option value="no">No deadline</option></select></label>
              </div>
            </div>
          ) : null}
          {selectedCount ? (
            <div className="bulk-action-bar">
              <strong>{selectedCount} selected</strong>
              <button type="button" className="button secondary" onClick={bulkArchiveSelected}>Archive selected</button>
              <button type="button" className="button secondary" onClick={bulkUnarchiveSelected}>Unarchive selected</button>
              <button type="button" className="button secondary" onClick={bulkChangeCategory}>Change category</button>
              <button type="button" className="button secondary" onClick={bulkMarkMyEntry}>Mark as My Entry</button>
              <button type="button" className="button secondary" onClick={bulkMarkDiscovery}>Mark as Discovery</button>
              <button type="button" className="button secondary" onClick={bulkExportSelected}>Export selected</button>
              <button type="button" className="button danger" onClick={bulkDeleteSelected}>Delete selected</button>
              <button type="button" className="button secondary" onClick={clearSelection}>Clear</button>
            </div>
          ) : null}
          <SearchToolbar
            search={search}
            onSearchChange={setSearch}
            scope={searchScope}
            onScopeChange={setSearchScope}
            filter={filterValue}
            onFilterChange={setFilterValue}
            filterOptions={filterOptions}
            sort={sortMode}
            onSortChange={setSortMode}
            view={viewMode}
            onViewChange={setViewMode}
          />
          {filterValue !== 'all' ? <p className="active-filter-note">Active filter: {filterLabel(filterValue)}</p> : null}
          {renderCompactPageRows(filteredPages, emptyTitle, emptyDescription)}
        </SectionPanel>
      </div>
      <ShareEntryDialog page={sharePage} open={Boolean(sharePage)} onClose={() => setSharePage(null)} />
    </AppShell>
  );
}
