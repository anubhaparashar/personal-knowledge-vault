import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Bell,
  CalendarClock,
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
  Trash2,
} from 'lucide-react';
import AppShell from '../components/AppShell';
import NewEntryMenu from '../components/NewEntryMenu';
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
import { removePage } from '../services/pages';
import {
  DISCOVERY_PROGRESS_LABELS,
  DISCOVERY_QUEUE_MESSAGE,
  DEFAULT_DISCOVERY_SETTINGS,
  FIXED_DISCOVERY_SCHEDULE_LABEL,
  GITHUB_ACTIONS_DISCOVERY_MESSAGE,
  RESEARCH_DISCOVERY_WORKFLOW_URL,
  formatDiscoveryTimestamp,
  isActiveDiscoveryRun,
  originLabel,
  originTone,
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
import { formatDate } from '../utils/content';
import { daysUntilDate, formatDetectedDate, isCalendarImportantDate, selectNextImportantDate } from '../utils/dates';
import { buildResearchDateEvents, sortResearchPages } from '../utils/researchDates';
import { entryTypeForFocus, openManualEntry } from '../utils/manualEntry';

const LIBRARY_VIEW_KEY = 'aprv-library-view';
const LIBRARY_SEARCH_KEY = 'kv-global-search';
const PINNED_KEY = 'aprv-pinned-pages';
const ARCHIVED_KEY = 'aprv-archived-pages';
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
const FOCUS_LABELS = {
  overview: 'Research Library',
  notes: 'All Notes',
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
  conferences: 'Conferences',
  journals: 'Journals',
  'special-issues': 'Special Issues',
  'submission-deadlines': 'Submission Deadlines',
  diary: 'Diary',
  'general-notes': 'General Notes',
  books: 'Books and Reading',
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
function summarizeText(page) {
  return [page.title, page.summary, page.plainText, page.category, page.sourceDomain, page.sourceTitle, page.sourceUrl, ...(page.tags || [])].filter(Boolean).join(' ');
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
  if (scope === 'content') return [page.plainText, page.summary].filter(Boolean).join(' ');
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
  const [archivedIds, setArchivedIds] = useState(() => readSet(ARCHIVED_KEY));
  const [dismissedReminders, setDismissedReminders] = useState(() => readSessionSet(REMINDER_DISMISS_KEY));
  const [notificationMessage, setNotificationMessage] = useState('');
  const [discoverySettings, setDiscoverySettings] = useState(DEFAULT_DISCOVERY_SETTINGS);
  const [discoverySources, setDiscoverySources] = useState([]);
  const [latestDiscoveryRun, setLatestDiscoveryRun] = useState(null);
  const [discoveryStats, setDiscoveryStats] = useState(null);
  const [discoveryMessage, setDiscoveryMessage] = useState('');
  const [selectedDiscoverySourceId, setSelectedDiscoverySourceId] = useState('');
  const [runLogOpen, setRunLogOpen] = useState(false);

  useEffect(() => { localStorage.setItem(LIBRARY_SEARCH_KEY, search); }, [search]);
  useEffect(() => { localStorage.setItem(LIBRARY_VIEW_KEY, viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem(librarySortStorageKey, sortMode); }, [librarySortStorageKey, sortMode]);
  useEffect(() => { saveSet(PINNED_KEY, pinnedIds); }, [pinnedIds]);
  useEffect(() => { saveSet(ARCHIVED_KEY, archivedIds); }, [archivedIds]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const unsubscribers = [
      subscribeDiscoverySettings(user.uid, setDiscoverySettings, (err) => setDiscoveryMessage(err.message)),
      subscribeDiscoverySources(user.uid, setDiscoverySources, (err) => setDiscoveryMessage(err.message)),
      subscribeLatestDiscoveryRun(user.uid, setLatestDiscoveryRun, (err) => setDiscoveryMessage(err.message)),
      subscribeDiscoveryStats(user.uid, setDiscoveryStats, (err) => setDiscoveryMessage(err.message)),
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

  const activePages = useMemo(() => pages.filter((page) => !archivedIds.has(page.id)), [archivedIds, pages]);
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
    activePages.forEach((page) => {
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
  }, [activePages]);

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

  const recent = useMemo(() => [...activePages].sort(sortByUpdated).slice(0, 6), [activePages]);
  const pagesWithoutDeadlines = useMemo(() => activePages.filter((page) => !page.secure && !selectNextImportantDate(page.importantDates || [], { includeOverdue: true })), [activePages]);
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

  const stats = useMemo(() => {
    const drivePdfCount = pdfs.length + activePages.reduce((total, page) => total + [...(page.attachments || []), ...(page.inlineFiles || [])].filter(attachmentIsPdf).length, 0);
    return [
      { icon: Files, value: activePages.length, label: 'Total pages', helper: 'Active research entries' },
      { icon: FileArchive, value: drivePdfCount, label: 'Drive PDFs', helper: 'Linked documents' },
      { icon: CalendarClock, value: deadlines.length, label: 'Deadlines', helper: 'Tracked important dates' },
      { icon: Link2, value: activePages.filter((page) => page.sourceUrl).length, label: 'Sources', helper: 'Pages with references' },
      { icon: Lock, value: activePages.filter((page) => page.secure).length, label: 'Secure notes', helper: 'Encrypted entries' },
    ];
  }, [activePages, deadlines.length, pdfs.length]);

  const workspaceCounts = useMemo(() => new Map(WORKSPACE_CARDS.map((card) => [card.key, activePages.filter((page) => categoryCount(page, card)).length])), [activePages]);

  const filteredPages = useMemo(() => {
    const q = search.trim().toLowerCase();
    let items = activePages.filter((page) => {
      if (!focusMatchesPage(page, focus)) return false;
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
  }, [activePages, filterValue, focus, pinnedIds, primaryDates, researchEvents, search, searchScope, sortMode]);

  const focusLabel = FOCUS_LABELS[focus] || 'Research Library';
  const deadlineScopeOptions = DEADLINE_SCOPE_FILTERS.map((label) => ({ label, value: label }));
  const deadlineTimeOptions = DEADLINE_TIME_FILTERS.map((label) => ({ label, value: label }));
  const noDeadlineMode = deadlineTimeFilter === 'No deadline recorded';
  const deadlineRows = noDeadlineMode ? [] : filteredDeadlines.slice(0, 10);
  const noDeadlineRows = noDeadlineMode ? pagesWithoutDeadlines.slice(0, 10) : [];
  const enabledSources = discoverySources.filter((source) => source.enabled !== false && !source.paused);
  const enabledSourceCount = enabledSources.length;
  const queuedDiscoveryRequests = discoveryRequests.filter((request) => ['queued', 'processing'].includes(request.status));
  const queuedLinkRequests = discoveryRequests.filter((request) => request.type === 'single-link').slice(0, 4);
  const automaticDiscoveryLabel = 'GitHub Actions scheduled';
  const discoveryRunStatus = latestDiscoveryRun?.status || 'idle';
  const discoveryStatusLabel = latestDiscoveryRun?.currentStage || DISCOVERY_PROGRESS_LABELS[latestDiscoveryRun?.step] || DISCOVERY_PROGRESS_LABELS[discoveryRunStatus] || 'Idle';
  const discoveryActive = isActiveDiscoveryRun(latestDiscoveryRun);
  const currentActivity = discoveryActive ? (discoveryRunStatus === 'queued' ? 'Queued' : 'Running') : (queuedDiscoveryRequests.length ? `${queuedDiscoveryRequests.length} queued request(s)` : 'Idle');
  const latestWarnings = Array.isArray(latestDiscoveryRun?.warningMessages) ? latestDiscoveryRun.warningMessages.length : (Array.isArray(latestDiscoveryRun?.warnings) ? latestDiscoveryRun.warnings.length : Number(latestDiscoveryRun?.warnings || discoveryStats?.warnings || 0));
  const latestStats = latestDiscoveryRun?.stats || {};
  const contextEntry = entryTypeForFocus(focus);

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
  async function togglePin(page) {
    const next = new Set(pinnedIds);
    next.has(page.id) ? next.delete(page.id) : next.add(page.id);
    setPinnedIds(next);
  }
  async function toggleArchive(page) {
    const next = new Set(archivedIds);
    next.has(page.id) ? next.delete(page.id) : next.add(page.id);
    setArchivedIds(next);
  }
  async function duplicatePage(page) {
    const payload = page.secure
      ? { title: `${page.title || 'Locked note'} copy`, category: page.category || 'Private Vault', tagsText: (page.tags || []).join(', '), sourceUrl: '', summary: '', html: '<p></p>', secure: false }
      : { title: `${page.title || 'Untitled'} copy`, category: page.category || 'Uncategorised', tagsText: (page.tags || []).join(', '), sourceUrl: page.sourceUrl || '', summary: page.summary || '', html: page.html || '<p></p>', secure: false };
    openEditorWithPreload(payload);
  }
  async function deletePage(page) {
    if (!window.confirm(`Delete "${page.title || 'this note'}" permanently?`)) return;
    await removePage(user.uid, page.id);
  }

  return (
    <AppShell title={focusLabel}>
      <div className="dashboard-stack">
        {error ? <div className="alert-panel error"><strong>Library sync issue</strong><span>{error}</span></div> : null}
        {loading ? <div className="skeleton-panel"><span /><span /><span /></div> : null}

        <SectionPanel className="dashboard-actions-panel discovery-control-centre" eyebrow="DISCOVERY" title="Discovery Control Centre" actions={(
          <div className="control-centre-actions">
            <NewEntryMenu onImportFromLink={() => window.dispatchEvent(new CustomEvent('kv-open-import-link'))} />
            <SecondaryButton onClick={() => window.dispatchEvent(new CustomEvent('kv-open-import-link'))}><Link2 size={16} /> Scrape a Link</SecondaryButton>
            <SecondaryButton onClick={() => runDiscovery('quick')}><RefreshCw size={16} /> Quick Refresh</SecondaryButton>
            <PrimaryButton onClick={() => runDiscovery('full')}><RefreshCw size={16} /> Full Web Scan</PrimaryButton>
            <SecondaryButton as="a" href={RESEARCH_DISCOVERY_WORKFLOW_URL} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open Research Discovery Workflow</SecondaryButton>
            <label className="source-select-control"><span>Source</span><select value={selectedDiscoverySourceId} onChange={(event) => setSelectedDiscoverySourceId(event.target.value)} disabled={!enabledSources.length}>{enabledSources.map((source) => <option key={source.id} value={source.id}>{source.name || source.url}</option>)}</select></label>
            <SecondaryButton disabled={!selectedDiscoverySourceId} onClick={scanSelectedSource}>Scan One Source</SecondaryButton>
            <SecondaryButton as="a" href="#/settings">Manage Sources</SecondaryButton>
            <SecondaryButton onClick={() => setRunLogOpen((value) => !value)}>View Run Log</SecondaryButton>
          </div>
        )}>
          <div className="alert-panel warning"><strong>Free discovery mode</strong><span>Instant scraping is disabled to keep the project free. Requests are processed by GitHub Actions.</span></div>
          <p className="section-intro">Discovery coverage is based on enabled sources and queued Firestore requests.</p>
          <div className="discovery-status-grid">
            <article><span>Automatic Discovery</span><strong>{automaticDiscoveryLabel}</strong></article>
            <article><span>Manual scanning</span><strong>Queue-based, no Firebase Functions</strong></article>
            <article><span>Next scheduled scan</span><strong>{FIXED_DISCOVERY_SCHEDULE_LABEL}</strong></article>
            <article><span>Last attempted scan</span><strong>{formatDiscoveryTimestamp(discoveryStats?.lastAttemptedScanAt || latestDiscoveryRun?.requestedAt || latestDiscoveryRun?.createdAt)}</strong></article>
            <article><span>Last successful scan</span><strong>{formatDiscoveryTimestamp(discoveryStats?.lastSuccessfulScanAt)}</strong></article>
            <article><span>Current activity</span><strong>{currentActivity}</strong></article>
            <article><span>Sources enabled</span><strong>{enabledSourceCount}</strong></article>
            <article><span>Sources checked</span><strong>{latestDiscoveryRun?.sourcesChecked ?? latestStats.sourcesChecked ?? discoveryStats?.sourcesChecked ?? 0}</strong></article>
            <article><span>New discoveries</span><strong>{latestDiscoveryRun?.recordsCreated ?? latestStats.newRecords ?? discoveryStats?.newRecords ?? 0}</strong></article>
            <article><span>Updated discoveries</span><strong>{latestDiscoveryRun?.recordsUpdated ?? latestStats.updatedRecords ?? discoveryStats?.updatedRecords ?? 0}</strong></article>
            <article><span>Duplicates skipped</span><strong>{latestDiscoveryRun?.duplicatesSkipped ?? latestStats.duplicates ?? discoveryStats?.duplicatesSkipped ?? 0}</strong></article>
            <article><span>Warnings</span><strong>{latestWarnings}</strong></article>
            <article><span>Failed sources</span><strong>{latestDiscoveryRun?.failures ?? latestStats.failures ?? discoveryStats?.failures ?? 0}</strong></article>
          </div>
          {discoveryActive ? <p className="status-message">{latestDiscoveryRun?.runType === 'manual-full' ? 'Full web scan in progress' : 'Discovery scan in progress'}{latestDiscoveryRun?.currentSource ? ` - ${latestDiscoveryRun.currentStage || 'Checking'}: ${latestDiscoveryRun.currentSource}` : ` - ${discoveryStatusLabel}`}</p> : null}
          {!discoveryActive && latestDiscoveryRun ? <p className="status-message">Latest run: {discoveryStatusLabel}</p> : null}
          {discoveryMessage ? <p className={discoveryMessage.includes('Could not') || discoveryMessage.includes('No enabled') ? 'form-error' : 'status-message'}>{discoveryMessage}</p> : null}
          {queuedLinkRequests.length ? (
            <div className="request-status-list compact" aria-label="Queued link request status">
              {queuedLinkRequests.map((request) => (
                <article key={request.id}>
                  <div><strong>{request.sourceUrl || request.url || request.title || 'Queued link'}</strong><span>{requestTypeLabel(request.type)} - {formatDiscoveryTimestamp(request.updatedAt || request.createdAt)}</span></div>
                  <span className={`request-status ${request.status || 'queued'}`}>{requestStatusLabel(request.status)}</span>
                </article>
              ))}
            </div>
          ) : null}
          {runLogOpen ? (
            <div className="run-log-panel">
              <dl>
                <div><dt>Run record</dt><dd>{latestDiscoveryRun?.id ? `users/${user?.uid}/discoveryRuns/${latestDiscoveryRun.id}` : 'No run record yet'}</dd></div>
                <div><dt>Run type</dt><dd>{latestDiscoveryRun?.runType || 'Not recorded'}</dd></div>
                <div><dt>Status</dt><dd>{latestDiscoveryRun?.status || 'Idle'}</dd></div>
                <div><dt>Stage</dt><dd>{latestDiscoveryRun?.currentStage || discoveryStatusLabel}</dd></div>
                <div><dt>Records found</dt><dd>{latestDiscoveryRun?.recordsFound ?? latestStats.recordsFound ?? 0}</dd></div>
                <div><dt>Dates detected</dt><dd>{latestDiscoveryRun?.datesDetected ?? latestStats.datesDetected ?? 0}</dd></div>
              </dl>
              {Array.isArray(latestDiscoveryRun?.warningMessages) && latestDiscoveryRun.warningMessages.length ? <ul>{latestDiscoveryRun.warningMessages.slice(0, 5).map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
            </div>
          ) : null}
          {focus !== 'overview' && focus !== 'notes' ? <button type="button" className="button secondary context-add-button" onClick={openContextEntry}>{contextEntry.shortLabel || contextEntry.label}</button> : null}
        </SectionPanel>

        {visibleReminders.length ? (
          <SectionPanel className="reminder-panel" eyebrow="REMINDERS" title="Reminders" actions={<SecondaryButton onClick={enableBrowserNotifications}><Bell size={16} /> Enable browser reminders</SecondaryButton>}>
            <p className="section-intro">Due and overdue items for this session.</p>
            {notificationMessage ? <p className="small-note">{notificationMessage}</p> : null}
            <div className="reminder-list">
              {visibleReminders.slice(0, 5).map((item) => (
                <article key={item.id} className={`reminder-row ${deadlineTone(item.status)}`}>
                  <div>
                    <strong>{item.page.title}</strong>
                    <span>{item.kind} - {item.status}</span>
                  </div>
                  <a className="text-link" href={`#/read/${item.page.id}`}>Open</a>
                  <button type="button" className="text-link" onClick={() => dismissReminder(item.id)}>Dismiss</button>
                </article>
              ))}
            </div>
          </SectionPanel>
        ) : null}

        <section className="stat-grid" aria-label="Library summary">
          {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
        </section>

        <SectionPanel
          className="deadline-panel"
          eyebrow="DEADLINES"
          title="Upcoming Deadlines"
          actions={<PrimaryButton onClick={requestCalendarAdd}><Plus size={17} /> Add Deadline</PrimaryButton>}
        >
          <div className="deadline-filter-stack">
            <SegmentedControl ariaLabel="Deadline category filters" options={deadlineScopeOptions} value={deadlineScopeFilter} onChange={setDeadlineScopeFilter} />
            <SegmentedControl ariaLabel="Deadline time filters" className="compact" options={deadlineTimeOptions} value={deadlineTimeFilter} onChange={setDeadlineTimeFilter} />
          </div>

          {deadlineRows.length ? (
            <div className="deadline-list" aria-label="Upcoming deadline list">
              {deadlineRows.map((item) => (
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
            </div>
          ) : null}

          {noDeadlineRows.length ? (
            <div className="deadline-list" aria-label="Entries without deadlines">
              {noDeadlineRows.map((page) => (
                <a key={page.id} className="deadline-row no-deadline" href={`#/read/${page.id}`}>
                  <span className="deadline-row-icon"><FileText size={18} strokeWidth={1.8} /></span>
                  <span className="deadline-row-main">
                    <strong>{page.secure ? 'Locked note' : page.title}</strong>
                    <small>{page.category || 'Uncategorised'}</small>
                  </span>
                  <span className="deadline-row-date">No deadline recorded</span>
                  <Badge>No date</Badge>
                  <span className="deadline-row-days">Add one</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </a>
              ))}
            </div>
          ) : null}

          {!deadlineRows.length && !noDeadlineRows.length ? (
            <EmptyState
              icon={CalendarClock}
              title="No upcoming deadlines"
              actions={(
                <>
                  <SecondaryButton as="a" href="#/edit/new"><Link2 size={16} /> Import Opportunity</SecondaryButton>
                  <PrimaryButton onClick={requestCalendarAdd}><Plus size={17} /> Add Manually</PrimaryButton>
                </>
              )}
            >
              Import a scholarship, postdoctoral opening, conference call or journal opportunity to begin tracking important dates.
            </EmptyState>
          ) : null}
        </SectionPanel>

        <section className="workspace-section" aria-labelledby="workspace-title">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">RESEARCH WORKSPACE</p>
              <h2 id="workspace-title">Research Workspace</h2>
            </div>
          </div>
          <div className="workspace-card-grid">
            {WORKSPACE_CARDS.map((card) => <WorkspaceCard key={card.key} {...card} title={card.label} count={workspaceCounts.get(card.key) || 0} />)}
          </div>
        </section>

        <SectionPanel eyebrow="NOTE LIBRARY" title="Research Notes" actions={<Badge>{filteredPages.length} shown</Badge>}>
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

          <div className={`note-library ${viewMode === 'list' ? 'is-list' : 'is-grid'}`}>
            {filteredPages.map((page) => {
              const deadline = primaryDates.get(page.id);
              const preview = page.secure ? 'Encrypted note. Unlock it to read the contents.' : (page.summary || page.plainText || 'No summary yet.').slice(0, 180);
              const attachmentCount = (page.attachments || []).length + (page.inlineFiles || []).length;
              const pinned = pinnedIds.has(page.id);
              return (
                <article key={page.id} className={`note-card ${page.secure ? 'secure-note' : ''}`}>
                  <div className="note-card-head">
                    <span className="category-pill">{page.secure ? 'Private Vault' : page.category || 'Uncategorised'}</span>
                    <div className="note-meta-row">
                      {pinned ? <Badge tone="pin">Pinned</Badge> : null}
                      <Badge tone={originTone(page.origin || page.createdOrigin || 'manually-added')}>{originLabel(page.origin || page.createdOrigin || 'manually-added')}</Badge>
                      {deadline ? <Badge tone={deadlineTone(deadline.status)}>{deadline.status}</Badge> : null}
                    </div>
                  </div>
                  <h3>{page.secure ? 'Locked note' : page.title}</h3>
                  <p>{preview}</p>
                  <div className="tag-row">
                    {(page.tags || []).slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
                    {attachmentCount ? <span><Paperclip size={12} /> {attachmentCount} file(s)</span> : null}
                  </div>
                  {page.origin === 'auto-discovered' || page.origin === 'scholarly-api' ? (
                    <div className="note-discovery-meta">
                      <span>Source: {page.discovery?.sourceName || page.sourceDomain || 'Official source'}</span>
                      <span>First discovered: {formatDiscoveryTimestamp(page.discovery?.firstDiscoveredAt)}</span>
                      <span>Last checked: {formatDiscoveryTimestamp(page.discovery?.lastCheckedAt)}</span>
                      <span>Relevance: {Math.round((page.discovery?.relevanceScore || 0) * 100)}%</span>
                      <span>Date confidence: {Math.round((page.discovery?.dateConfidence || 0) * 100)}%</span>
                      <span>Status: {page.discovery?.status || 'active'}</span>
                    </div>
                  ) : null}
                  {deadline ? (
                    <div className="note-next-date">
                      <CalendarClock size={15} />
                      <span><strong>Next important date</strong>{deadline.kind} - {formatDetectedDate(deadline.deadline)}</span>
                      <small>{daysRemainingLabel(deadline.days)}</small>
                    </div>
                  ) : <div className="note-next-date subtle"><span>No deadline recorded</span></div>}
                  <div className="note-card-foot">
                    <small>Updated {formatDate(page.updatedAt)}</small>
                    <div className="note-actions">
                      <NoteAction icon={Eye} onClick={() => window.location.hash = `#/read/${page.id}`}>Open</NoteAction>
                      <NoteAction icon={Edit3} onClick={() => window.location.hash = `#/edit/${page.id}`}>Edit</NoteAction>
                      <NoteAction icon={Pin} onClick={() => togglePin(page)}>{pinned ? 'Unpin' : 'Pin'}</NoteAction>
                      <NoteAction icon={Copy} onClick={() => duplicatePage(page)}>Duplicate</NoteAction>
                      <NoteAction icon={Archive} onClick={() => toggleArchive(page)}>{archivedIds.has(page.id) ? 'Restore' : 'Archive'}</NoteAction>
                      <NoteAction icon={Trash2} danger onClick={() => deletePage(page)}>Delete</NoteAction>
                    </div>
                  </div>
                </article>
              );
            })}
            {!filteredPages.length ? (
              <EmptyState icon={Grid2X2} title="No pages match this search" actions={<PrimaryButton as="a" href="#/edit/new"><Plus size={17} /> New Entry</PrimaryButton>}>
                Try a different search, scope or filter, or create a new research entry.
              </EmptyState>
            ) : null}
          </div>
        </SectionPanel>

        <SectionPanel eyebrow="RECENT ACTIVITY" title="Recently Updated">
          <div className="recent-list">
            {recent.map((page) => (
              <a key={page.id} className="recent-row" href={`#/read/${page.id}`}>
                <span className="recent-icon"><FileText size={18} strokeWidth={1.8} /></span>
                <div>
                  <strong>{page.secure ? 'Locked note' : page.title}</strong>
                  <span>{page.category || 'Uncategorised'}</span>
                </div>
                <small>{formatDate(page.updatedAt)}</small>
                <ChevronRight size={18} aria-hidden="true" />
              </a>
            ))}
            {!recent.length ? <EmptyState icon={FileText} title="No recent entries" compact /> : null}
          </div>
        </SectionPanel>
      </div>
    </AppShell>
  );
}
