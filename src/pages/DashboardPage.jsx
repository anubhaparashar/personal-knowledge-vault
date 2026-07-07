import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Bell,
  Calendar,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Edit3,
  Eye,
  FileArchive,
  FileText,
  Files,
  FlaskConical,
  GraduationCap,
  Grid2X2,
  Landmark,
  Lightbulb,
  Link2,
  Lock,
  Paperclip,
  Pin,
  Plus,
  Presentation,
  Trash2,
} from 'lucide-react';
import AppShell from '../components/AppShell';
import { MiniCalendar, TimelineView, UpcomingDatesWidget, requestCalendarAdd } from '../components/ResearchCalendar';
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
import { formatDate } from '../utils/content';
import { daysUntilDate, formatDetectedDate, isCalendarImportantDate, selectNextImportantDate } from '../utils/dates';
import { buildResearchDateEvents, dateTypeGroup, formatDateShort, getEventsByDate, sortResearchPages, statusLabel, todayIso } from '../utils/researchDates';

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
  { key: 'Ideas', label: 'Paper Ideas', icon: Lightbulb, href: '#/ideas', description: 'Research gaps and hypotheses', terms: ['idea', 'paper idea', 'hypothesis', 'future work'] },
  { key: 'Papers', label: 'Research Papers and Reading Notes', icon: FileText, href: '#/papers', description: 'Reading notes and literature', terms: ['paper', 'study', 'literature', 'reading note'] },
  { key: 'Fellowships', label: 'Fellowships and Grants', icon: Landmark, href: '#/fellowships', description: 'Fellowships, awards and grants', terms: ['fellowship', 'grant', 'funding call'] },
  { key: 'Applications', label: 'Applications', icon: ClipboardCheck, href: '#/applications', description: 'Submitted and draft applications', terms: ['application', 'apply', 'statement of purpose', 'cover letter'] },
];

const DEADLINE_SCOPE_FILTERS = ['All', 'Scholarships', 'Postdoctoral', 'Conferences', 'Journals', 'Jobs/Fellowships'];
const DEADLINE_TIME_FILTERS = ['Due in 7 days', 'Due in 30 days', 'Due in 90 days', 'Overdue', 'Completed', 'No deadline detected'];

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
function daysUntil(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}
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
  if (!filter) return true;
  if (filter === 'Due in 7 days') return item.days != null && item.days >= 0 && item.days <= 7;
  if (filter === 'Due in 30 days') return item.days != null && item.days >= 0 && item.days <= 30;
  if (filter === 'Due in 90 days') return item.days != null && item.days >= 0 && item.days <= 90;
  if (filter === 'Overdue') return item.status === 'Overdue';
  if (filter === 'Completed') return item.status === 'Completed';
  return true;
}
function sortByUpdated(a, b) { return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0); }
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
function deadlineDaysLabel(item) {
  if (item.days == null) return 'Unknown';
  if (item.days < 0) return `${Math.abs(item.days)} days late`;
  if (item.days === 0) return 'Today';
  return `${item.days} days`;
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
  const [showCreatedDates, setShowCreatedDates] = useState(false);
  const [showUpdatedDates, setShowUpdatedDates] = useState(false);
  const [dashboardSelectedDate, setDashboardSelectedDate] = useState(() => todayIso());

  useEffect(() => { localStorage.setItem(LIBRARY_SEARCH_KEY, search); }, [search]);
  useEffect(() => { localStorage.setItem(LIBRARY_VIEW_KEY, viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem(librarySortStorageKey, sortMode); }, [librarySortStorageKey, sortMode]);
  useEffect(() => { saveSet(PINNED_KEY, pinnedIds); }, [pinnedIds]);
  useEffect(() => { saveSet(ARCHIVED_KEY, archivedIds); }, [archivedIds]);

  const activePages = useMemo(() => pages.filter((page) => !archivedIds.has(page.id)), [archivedIds, pages]);

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
          kind: deadline.type || page.category || 'Important date',
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
  const calendarEvents = useMemo(() => buildResearchDateEvents(activePages, { includeDerived: true })
    .filter((event) => {
      if (event.type === 'Created date') return showCreatedDates;
      if (event.type === 'Updated date') return showUpdatedDates;
      if (event.type === 'Publication date') return false;
      return true;
    }), [activePages, showCreatedDates, showUpdatedDates]);

  const calendarGroups = useMemo(() => {
    const grouped = getEventsByDate(calendarEvents);
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 14)
      .map(([date, events]) => ({
        date,
        groups: [...events].reduce((map, event) => {
          const key = event.type === 'Created date' ? 'Notes created' : event.type === 'Updated date' ? 'Notes updated' : dateTypeGroup(event.type);
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(event);
          return map;
        }, new Map()),
      }));
  }, [calendarEvents]);

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
    const focusCard = WORKSPACE_CARDS.find((card) => card.href === `#/${focus}`);
    let items = activePages.filter((page) => {
      if (focusCard && !categoryCount(page, focusCard)) return false;
      if (filterValue.startsWith('category:') && normalize(page.secure ? 'Private Vault' : (page.category || 'Uncategorised')) !== normalize(filterValue.slice(9))) return false;
      if (filterValue.startsWith('tag:') && !(page.tags || []).map(normalize).includes(normalize(filterValue.slice(4)))) return false;
      const deadline = primaryDates.get(page.id);
      if (filterValue === 'deadline:due-today' && deadline?.days !== 0) return false;
      if (filterValue === 'deadline:due-soon' && !(deadline && deadline.days > 0 && deadline.days <= 7)) return false;
      if (filterValue === 'deadline:overdue' && !(deadline && deadline.days < 0)) return false;
      if (q && !normalize(sourceForScope(page, searchScope)).includes(q)) return false;
      return true;
    });

    items = sortResearchPages(items, calendarEvents, sortMode);

    return [...items].sort((a, b) => (pinnedIds.has(a.id) === pinnedIds.has(b.id) ? 0 : pinnedIds.has(a.id) ? -1 : 1));
  }, [activePages, calendarEvents, filterValue, focus, pinnedIds, primaryDates, search, searchScope, sortMode]);

  const focusLabel = {
    overview: 'Research Library', notes: 'All Notes', calendar: 'Research Calendar', deadlines: 'Upcoming Deadlines', applications: 'Applications', ideas: 'Paper Ideas', papers: 'Research Papers', literature: 'Literature Notes', projects: 'Research Projects', scholarships: 'Scholarships', postdoctoral: 'Postdoctoral Opportunities', fellowships: 'Fellowships', grants: 'Grants', conferences: 'Conferences', journals: 'Journals', 'special-issues': 'Special Issues', 'submission-deadlines': 'Submission Deadlines', diary: 'Diary', 'general-notes': 'General Notes', books: 'Books and Reading',
  }[focus] || 'Research Library';

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
    localStorage.setItem(PRELOAD_KEY, JSON.stringify(payload));
    window.location.hash = '#/edit/new';
  }
  async function deletePage(page) {
    if (!window.confirm(`Delete "${page.title || 'this note'}" permanently?`)) return;
    await removePage(user.uid, page.id);
  }

  function renderCalendarEvent(event) {
    return (
      <a key={event.id} className="calendar-event-row" href={`#/read/${event.pageId}`}>
        <span>
          <strong>{event.pageTitle}</strong>
          <small>{event.title || event.type}</small>
        </span>
        <Badge tone={event.status}>{statusLabel(event.status)}</Badge>
      </a>
    );
  }
  const deadlineScopeOptions = DEADLINE_SCOPE_FILTERS.map((label) => ({ label, value: label }));
  const deadlineTimeOptions = DEADLINE_TIME_FILTERS.map((label) => ({ label, value: label }));
  const deadlineRows = deadlineTimeFilter === 'No deadline detected' ? [] : filteredDeadlines.slice(0, 10);
  const noDeadlineRows = deadlineTimeFilter === 'No deadline detected' ? pagesWithoutDeadlines.slice(0, 10) : [];
  const dashboardEventsByDate = useMemo(() => getEventsByDate(calendarEvents), [calendarEvents]);
  const selectedDashboardEvents = dashboardEventsByDate.get(dashboardSelectedDate) || [];
  const dashboardTimelineEvents = selectedDashboardEvents.length ? selectedDashboardEvents : calendarEvents.filter((event) => !event.isDerived).slice(0, 6);
  const contextPanel = (
    <div className="context-stack calendar-dashboard-context">
      <MiniCalendar events={calendarEvents} selectedDate={dashboardSelectedDate} onSelectDate={setDashboardSelectedDate} />
      <section className="context-card compact-date-context">
        <div className="context-head"><span>Selected date</span><Calendar size={18} /></div>
        <TimelineView compact events={dashboardTimelineEvents} onOpenEvent={(event) => { window.location.hash = `#/read/${event.pageId}`; }} />
      </section>
    </div>
  );

  return (
    <AppShell title={focusLabel} contextPanel={contextPanel}>
      <div className="dashboard-stack">
        {error ? <div className="alert-panel error"><strong>Library sync issue</strong><span>{error}</span></div> : null}
        {loading ? <div className="skeleton-panel"><span /><span /><span /></div> : null}

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
          className="research-calendar-panel"
          eyebrow="RESEARCH CALENDAR"
          title="Date-wise Research Calendar"
          actions={(
            <div className="calendar-toggle-row">
              <label><input type="checkbox" checked={showCreatedDates} onChange={(event) => setShowCreatedDates(event.target.checked)} /> Show created dates</label>
              <label><input type="checkbox" checked={showUpdatedDates} onChange={(event) => setShowUpdatedDates(event.target.checked)} /> Show updated dates</label>
            </div>
          )}
        >
          {calendarGroups.length ? (
            <div className="calendar-date-list">
              {calendarGroups.map(({ date, groups }) => (
                <article key={date} className="calendar-date-card">
                  <div className="calendar-date-block"><Calendar size={18} /><strong>{formatDateShort(date)}</strong></div>
                  <div className="calendar-date-groups">
                    {[...groups.entries()].map(([group, events]) => (
                      <section key={group}>
                        <h3>{group}</h3>
                        {events.map(renderCalendarEvent)}
                      </section>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyState icon={CalendarClock} title="No calendar dates yet" compact>No detected deadlines, events or reminders are available for this view.</EmptyState>}
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

        <UpcomingDatesWidget events={calendarEvents} onAddDate={() => requestCalendarAdd()} />

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
                      {deadline ? <Badge tone={deadlineTone(deadline.status)}>{deadline.status}</Badge> : null}
                    </div>
                  </div>
                  <h3>{page.secure ? 'Locked note' : page.title}</h3>
                  <p>{preview}</p>
                  <div className="tag-row">
                    {(page.tags || []).slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
                    {attachmentCount ? <span><Paperclip size={12} /> {attachmentCount} file(s)</span> : null}
                  </div>
                  {deadline ? (
                    <div className="note-next-date">
                      <CalendarClock size={15} />
                      <span><strong>Next important date</strong>{deadline.kind} ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· {formatDetectedDate(deadline.deadline)}</span>
                      <small>{daysRemainingLabel(deadline.days)}</small>
                    </div>
                  ) : <div className="note-next-date subtle"><span>No deadline detected</span></div>}
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