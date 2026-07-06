import React, { useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import { formatDate } from '../utils/content';
import { DASHBOARD_SECTIONS, daysUntil, deadlineStatus } from '../utils/intelligence';

const DEADLINE_FILTERS = ['All', 'Scholarships', 'Postdoctoral', 'Conferences', 'Journals', 'Jobs/Fellowships', 'Overdue', 'Completed'];
const TIME_FILTERS = ['Due in 7 days', 'Due in 30 days', 'Due in 90 days', 'No deadline recorded'];

function increment(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function CountList({ title, values, empty = 'No indexed items yet.' }) {
  const entries = [...values.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <section className="index-panel">
      <h3>{title}</h3>
      {entries.length ? (
        <div className="count-list">
          {entries.map(([label, count]) => (
            <div key={label}><span>{label}</span><strong>{count}</strong></div>
          ))}
        </div>
      ) : <p className="muted">{empty}</p>}
    </section>
  );
}

function getPageDates(page) {
  return (page.importantDates || []).map((date) => ({
    ...date,
    status: deadlineStatus(date),
    page,
    daysRemaining: daysUntil(date.date),
  }));
}

function deadlineMatchesFilter(item, filter) {
  const text = `${item.type} ${item.page.category} ${item.page.title}`.toLowerCase();
  if (filter === 'All') return true;
  if (filter === 'Overdue') return item.status === 'Overdue';
  if (filter === 'Completed') return item.status === 'Completed';
  if (filter === 'Scholarships') return text.includes('scholarship');
  if (filter === 'Postdoctoral') return text.includes('postdoc') || text.includes('postdoctoral');
  if (filter === 'Conferences') return text.includes('conference') || text.includes('abstract') || text.includes('camera');
  if (filter === 'Journals') return text.includes('journal') || text.includes('special issue');
  if (filter === 'Jobs/Fellowships') return text.includes('job') || text.includes('fellowship');
  return true;
}

function deadlineMatchesTime(item, timeFilter) {
  if (!timeFilter) return true;
  const days = item.daysRemaining;
  if (timeFilter === 'Due in 7 days') return days != null && days >= 0 && days <= 7;
  if (timeFilter === 'Due in 30 days') return days != null && days >= 0 && days <= 30;
  if (timeFilter === 'Due in 90 days') return days != null && days >= 0 && days <= 90;
  return true;
}

function statusLabel(item) {
  if (item.status === 'Overdue') return `Overdue by ${Math.abs(item.daysRemaining || 0)} day(s)`;
  if (item.status === 'Today') return 'Due today';
  if (item.status === 'Due soon') return `Due in ${item.daysRemaining} day(s)`;
  if (item.status === 'Completed') return 'Completed';
  return item.daysRemaining == null ? 'Date needs confirmation' : `Due in ${item.daysRemaining} day(s)`;
}

function WorkflowCard({ section, count, onClick }) {
  return (
    <button type="button" className="workflow-card" onClick={onClick}>
      <span>{section.title}</span>
      <strong>{count}</strong>
    </button>
  );
}

function ReminderPanel({ items }) {
  const [dismissed, setDismissed] = useState(() => new Set(JSON.parse(sessionStorage.getItem('dismissed-reminders') || '[]')));
  const [permissionMessage, setPermissionMessage] = useState('');

  const visible = items.filter((item) => !dismissed.has(item.id));

  function dismiss(id) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    sessionStorage.setItem('dismissed-reminders', JSON.stringify([...next]));
  }

  async function enableBrowserNotifications() {
    if (!('Notification' in window)) {
      setPermissionMessage('This browser does not support notifications.');
      return;
    }
    const permission = await Notification.requestPermission();
    setPermissionMessage(permission === 'granted' ? 'Browser reminders enabled for this browser.' : 'Browser reminders were not enabled.');
    if (permission === 'granted') {
      visible.slice(0, 3).forEach((item) => {
        new Notification(`${item.type}: ${item.page.title}`, { body: `${item.status} - ${item.date}` });
      });
    }
  }

  if (!visible.length) return null;

  return (
    <section className="reminder-panel" aria-label="Due and overdue reminders">
      <div>
        <h2>Reminders</h2>
        <p>Due and overdue items for this session.</p>
      </div>
      <button type="button" className="button secondary" onClick={enableBrowserNotifications}>Enable browser reminders</button>
      {permissionMessage ? <p className="small-note">{permissionMessage}</p> : null}
      <div className="reminder-list">
        {visible.map((item) => (
          <article key={item.id} className={`deadline-row ${item.status.toLowerCase().replace(/\s+/g, '-')}`}>
            <div>
              <strong>{item.page.title}</strong>
              <span>{item.type} - {statusLabel(item)}</span>
            </div>
            <a className="text-link" href={`#/read/${item.page.id}`}>Open</a>
            <button type="button" className="text-link" onClick={() => dismiss(item.id)}>Dismiss</button>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function DashboardPage({ pages, pdfs = [], loading, error }) {
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('all');
  const [activeWorkflow, setActiveWorkflow] = useState('all');
  const [deadlineFilter, setDeadlineFilter] = useState('All');
  const [timeFilter, setTimeFilter] = useState('');

  const indexes = useMemo(() => {
    const categories = new Map();
    const tags = new Map();
    const sources = new Map();
    const letters = new Map();

    pages.forEach((page) => {
      if (page.secure) {
        increment(categories, 'Private Vault');
        return;
      }
      increment(categories, page.category || 'Uncategorised');
      (page.tags || []).forEach((tag) => increment(tags, tag));
      increment(sources, page.sourceDomain || 'Original notes');
      increment(letters, (page.title || '#').charAt(0).toUpperCase());
    });

    return { categories, tags, sources, letters };
  }, [pages]);

  const deadlines = useMemo(() => pages
    .filter((page) => !page.secure)
    .flatMap(getPageDates)
    .sort((a, b) => {
      if (a.status === 'Completed' && b.status !== 'Completed') return 1;
      if (b.status === 'Completed' && a.status !== 'Completed') return -1;
      return (a.daysRemaining ?? 999999) - (b.daysRemaining ?? 999999);
    }), [pages]);

  const dueReminders = useMemo(() => deadlines.filter((item) => ['Overdue', 'Today', 'Due soon'].includes(item.status) && !item.completed), [deadlines]);

  const workflowCounts = useMemo(() => DASHBOARD_SECTIONS.map((item) => ({
    ...item,
    count: pages.filter((page) => !page.secure && item.categories.includes(page.category)).length,
  })), [pages]);

  const filteredDeadlines = deadlines.filter((item) => deadlineMatchesFilter(item, deadlineFilter) && deadlineMatchesTime(item, timeFilter));
  const pagesWithoutDeadlines = pages.filter((page) => !page.secure && !(page.importantDates || []).length);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const workflow = DASHBOARD_SECTIONS.find((item) => item.key === activeWorkflow);
    return pages.filter((page) => {
      if (workflow && !workflow.categories.includes(page.category)) return false;
      if (!query) return true;
      const searchable = page.secure
        ? 'locked note private vault'
        : [page.title, page.plainText, page.category, page.sourceDomain, ...(page.tags || [])].join(' ');
      return searchable.toLowerCase().includes(query);
    });
  }, [activeWorkflow, pages, search]);

  const totalSources = new Set(pages.filter((page) => page.sourceDomain).map((page) => page.sourceDomain)).size;
  const lockedCount = pages.filter((page) => page.secure).length;

  return (
    <AppShell title="Research Library">
      <ReminderPanel items={dueReminders} />

      <section className="workflow-grid" aria-label="Research workflow sections">
        {workflowCounts.map((item) => (
          <WorkflowCard key={item.key} section={item} count={item.count} onClick={() => { setActiveWorkflow(item.key); setSection('all'); }} />
        ))}
      </section>

      <section className="stat-grid compact-stats">
        <article><strong>{pages.length}</strong><span>Total pages</span></article>
        <article><strong>{pdfs.length}</strong><span>Drive PDFs</span></article>
        <article><strong>{deadlines.length}</strong><span>Deadlines</span></article>
        <article><strong>{totalSources}</strong><span>Sources</span></article>
        <article><strong>{lockedCount}</strong><span>Secure notes</span></article>
      </section>

      <section className="deadline-dashboard">
        <div className="section-head">
          <div>
            <p className="eyebrow">DATES AND REMINDERS</p>
            <h2>Upcoming Deadlines</h2>
          </div>
          <a className="button secondary" href="#/edit/new">Add page</a>
        </div>
        <div className="filter-row" role="group" aria-label="Deadline filters">
          {DEADLINE_FILTERS.map((filter) => (
            <button key={filter} type="button" className={deadlineFilter === filter ? 'active' : ''} onClick={() => setDeadlineFilter(filter)}>{filter}</button>
          ))}
        </div>
        <div className="filter-row" role="group" aria-label="Deadline time filters">
          {TIME_FILTERS.map((filter) => (
            <button key={filter} type="button" className={timeFilter === filter ? 'active' : ''} onClick={() => setTimeFilter(timeFilter === filter ? '' : filter)}>{filter}</button>
          ))}
        </div>

        {timeFilter === 'No deadline recorded' ? (
          <div className="deadline-table">
            {pagesWithoutDeadlines.map((page) => (
              <article key={page.id} className="deadline-row">
                <div><strong>{page.title}</strong><span>{page.category || 'Uncategorised'}</span></div>
                <span>No deadline recorded</span>
                <a className="text-link" href={`#/edit/${page.id}`}>Add date</a>
              </article>
            ))}
            {!pagesWithoutDeadlines.length ? <p className="muted">Every visible page has at least one date.</p> : null}
          </div>
        ) : (
          <div className="deadline-table">
            {filteredDeadlines.slice(0, 12).map((item) => (
              <article key={item.id} className={`deadline-row ${item.status.toLowerCase().replace(/\s+/g, '-')}`}>
                <div><strong>{item.page.title}</strong><span>{item.page.category || 'Uncategorised'}</span></div>
                <span>{item.type}</span>
                <time dateTime={item.date}>{item.date}</time>
                <span>{statusLabel(item)}</span>
                <a className="text-link" href={`#/read/${item.page.id}`}>Open</a>
              </article>
            ))}
            {!filteredDeadlines.length ? <p className="muted">No deadlines match these filters.</p> : null}
          </div>
        )}
      </section>

      <section className="library-controls">
        <label className="search-box">
          <span>Search</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search titles, text, categories, tags and sources..." />
        </label>
        <div className="segmented-control">
          <button type="button" className={activeWorkflow === 'all' ? 'active' : ''} onClick={() => setActiveWorkflow('all')}>All</button>
          {['all', 'categories', 'tags', 'sources', 'a-z'].map((item) => (
            <button key={item} type="button" className={section === item ? 'active' : ''} onClick={() => setSection(item)}>
              {item === 'a-z' ? 'A-Z' : item.charAt(0).toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <div className="empty-state">Loading your library...</div> : null}

      {!loading && section === 'all' ? (
        <section className="page-grid">
          {filtered.map((page) => (
            <article className={`page-card ${page.secure ? 'secure-card' : ''}`} key={page.id}>
              <div className="page-card-top">
                <span className="category-pill">{page.secure ? 'Private Vault' : page.category || 'Uncategorised'}</span>
                <small>{formatDate(page.updatedAt)}</small>
              </div>
              <h3>{page.secure ? 'Locked note' : page.title}</h3>
              <p>{page.secure ? 'Encrypted content. Unlock it with your master passphrase.' : page.summary || page.plainText?.slice(0, 180) || 'No summary yet.'}</p>
              {!page.secure && page.tags?.length ? (
                <div className="tag-row">{page.tags.slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}</div>
              ) : null}
              <div className="page-card-actions">
                <a className="text-link" href={`#/read/${page.id}`}>Open</a>
                <a className="text-link" href={`#/edit/${page.id}`}>Edit</a>
              </div>
            </article>
          ))}
          {!filtered.length ? <div className="empty-state wide">No pages match this search.</div> : null}
        </section>
      ) : null}

      {!loading && section === 'categories' ? <CountList title="Category index" values={indexes.categories} /> : null}
      {!loading && section === 'tags' ? <CountList title="Tag index" values={indexes.tags} /> : null}
      {!loading && section === 'sources' ? <CountList title="Source index" values={indexes.sources} /> : null}
      {!loading && section === 'a-z' ? <CountList title="Alphabetical index" values={indexes.letters} /> : null}
    </AppShell>
  );
}