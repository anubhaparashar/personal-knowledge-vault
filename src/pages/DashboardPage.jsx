import React, { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import { Icon } from '../components/Branding';
import { useAuth } from '../context/AuthContext';
import { removePage } from '../services/pages';
import { formatDate } from '../utils/content';

const LIBRARY_VIEW_KEY = 'aprv-library-view';
const LIBRARY_SEARCH_KEY = 'kv-global-search';
const PINNED_KEY = 'aprv-pinned-pages';
const ARCHIVED_KEY = 'aprv-archived-pages';
const PRELOAD_KEY = 'kv-editor-preload';

const CATEGORY_CARDS = [
  { key: 'Scholarships', label: 'Scholarships', icon: 'landmark', href: '#/scholarships', terms: ['scholarship'] },
  { key: 'Postdoctoral', label: 'Postdoctoral Opportunities', icon: 'flask', href: '#/postdoctoral', terms: ['postdoc', 'postdoctoral'] },
  { key: 'Conferences', label: 'Conference Calls', icon: 'presentation', href: '#/conferences', terms: ['conference', 'cfp'] },
  { key: 'Journals', label: 'Journal Calls', icon: 'bookOpen', href: '#/journals', terms: ['journal', 'special issue'] },
  { key: 'Ideas', label: 'Paper Ideas', icon: 'lightbulb', href: '#/ideas', terms: ['idea', 'hypothesis'] },
  { key: 'Papers', label: 'Research Papers', icon: 'fileText', href: '#/papers', terms: ['paper', 'study'] },
  { key: 'Fellowships', label: 'Fellowships and Grants', icon: 'clipboardCheck', href: '#/fellowships', terms: ['fellowship', 'grant'] },
  { key: 'Applications', label: 'Applications', icon: 'clipboardCheck', href: '#/applications', terms: ['application', 'apply'] },
];

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
function deadlineTone(status) {
  return normalize(status).replace(/\s+/g, '-');
}
function summarizeText(page) {
  return [page.title, page.summary, page.plainText, page.category, page.sourceDomain, ...(page.tags || [])].filter(Boolean).join(' ');
}
function extractDeadline(page) {
  const source = summarizeText(page).toLowerCase();
  const iso = source.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const month = source.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:,?\s*(20\d{2}))?\b/i);
  if (month) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    return new Date(Number(month[3] || new Date().getFullYear()), months.indexOf(month[1].toLowerCase()), Number(month[2]));
  }
  return null;
}
function categoryCount(page, card) {
  const source = normalize(summarizeText(page));
  return card.terms.some((term) => source.includes(term));
}
function sortByUpdated(a, b) { return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0); }

function Metric({ icon, label, value, note }) {
  return (
    <article className="summary-card">
      <div className="summary-card-icon"><Icon name={icon} size={18} /></div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
        {note ? <small>{note}</small> : null}
      </div>
    </article>
  );
}

function NoteAction({ icon, children, onClick, danger = false }) {
  return (
    <button type="button" className={`note-action ${danger ? 'is-danger' : ''}`} onClick={onClick}>
      <Icon name={icon} size={16} />
      <span>{children}</span>
    </button>
  );
}

export default function DashboardPage({ pages, pdfs = [], loading, error, focus = 'overview' }) {
  const { user } = useAuth();
  const [search, setSearch] = useState(() => localStorage.getItem(LIBRARY_SEARCH_KEY) || '');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [deadlineFilter, setDeadlineFilter] = useState('all');
  const [sortMode, setSortMode] = useState('updated');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem(LIBRARY_VIEW_KEY) || 'grid');
  const [pinnedIds, setPinnedIds] = useState(() => readSet(PINNED_KEY));
  const [archivedIds, setArchivedIds] = useState(() => readSet(ARCHIVED_KEY));

  useEffect(() => { localStorage.setItem(LIBRARY_SEARCH_KEY, search); }, [search]);
  useEffect(() => { localStorage.setItem(LIBRARY_VIEW_KEY, viewMode); }, [viewMode]);
  useEffect(() => { saveSet(PINNED_KEY, pinnedIds); }, [pinnedIds]);
  useEffect(() => { saveSet(ARCHIVED_KEY, archivedIds); }, [archivedIds]);

  const activePages = useMemo(() => pages.filter((page) => !archivedIds.has(page.id)), [archivedIds, pages]);

  const deadlines = useMemo(() => activePages
    .map((page) => {
      const deadline = extractDeadline(page);
      if (!deadline) return null;
      const days = daysUntil(deadline);
      return {
        id: page.id,
        page,
        date: deadline,
        days,
        status: statusForDays(days),
        kind: page.category || 'Note',
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date), [activePages]);

  const stats = useMemo(() => ({
    notes: activePages.length,
    applications: activePages.filter((page) => normalize(summarizeText(page)).includes('application')).length,
    deadlines: deadlines.filter((item) => item.days != null && item.days >= 0 && item.days <= 30).length,
    ideas: activePages.filter((page) => normalize(summarizeText(page)).includes('idea')).length,
  }), [activePages, deadlines]);

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

  const recent = useMemo(() => [...activePages].sort(sortByUpdated).slice(0, 5), [activePages]);

  const filteredPages = useMemo(() => {
    const q = search.trim().toLowerCase();
    let items = activePages.filter((page) => {
      if (categoryFilter !== 'all' && normalize(page.secure ? 'Private Vault' : (page.category || 'Uncategorised')) !== normalize(categoryFilter)) return false;
      if (tagFilter !== 'all' && !(page.tags || []).map(normalize).includes(normalize(tagFilter))) return false;
      const deadline = deadlines.find((item) => item.id === page.id);
      if (deadlineFilter === 'due-today' && deadline?.days !== 0) return false;
      if (deadlineFilter === 'due-soon' && !(deadline && deadline.days > 0 && deadline.days <= 7)) return false;
      if (deadlineFilter === 'overdue' && !(deadline && deadline.days < 0)) return false;
      if (q && !((page.secure ? 'locked note private vault' : summarizeText(page)).toLowerCase().includes(q))) return false;
      return true;
    });

    if (sortMode === 'alpha') items = items.slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else if (sortMode === 'category') items = items.slice().sort((a, b) => (a.category || '').localeCompare(b.category || ''));
    else if (sortMode === 'deadline') items = items.slice().sort((a, b) => {
      const da = deadlines.find((item) => item.id === a.id)?.date?.getTime() ?? Number.POSITIVE_INFINITY;
      const db = deadlines.find((item) => item.id === b.id)?.date?.getTime() ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
    else items = items.slice().sort(sortByUpdated);

    return [...items].sort((a, b) => (pinnedIds.has(a.id) === pinnedIds.has(b.id) ? 0 : pinnedIds.has(a.id) ? -1 : 1));
  }, [activePages, categoryFilter, deadlines, deadlineFilter, pinnedIds, search, sortMode, tagFilter]);

  const focusLabel = {
    overview: 'Overview', notes: 'All Notes', deadlines: 'Upcoming Deadlines', applications: 'Applications', ideas: 'Paper Ideas', papers: 'Research Papers', literature: 'Literature Notes', projects: 'Research Projects', scholarships: 'Scholarships', postdoctoral: 'Postdoctoral Opportunities', fellowships: 'Fellowships', grants: 'Grants', conferences: 'Conferences', journals: 'Journals', 'special-issues': 'Special Issues', 'submission-deadlines': 'Submission Deadlines', diary: 'Diary', 'general-notes': 'General Notes', books: 'Books and Reading',
  }[focus] || 'Overview';

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
    if (!window.confirm(`Delete \"${page.title || 'this note'}\" permanently?`)) return;
    await removePage(user.uid, page.id);
  }

  const contextPanel = (
    <div className="context-stack">
      <section className="context-card">
        <div className="context-head"><span>Upcoming deadlines</span><Icon name="calendarClock" size={18} /></div>
        <div className="mini-list">
          {deadlines.slice(0, 5).map((item) => (
            <a key={item.id} className="mini-list-item" href={`#/read/${item.page.id}`}>
              <div><strong>{item.page.title}</strong><span>{formatDate(item.date)} - {item.status}</span></div>
              <Icon name="chevronRight" size={16} />
            </a>
          ))}
          {!deadlines.length ? <p className="muted">No deadlines detected yet.</p> : null}
        </div>
      </section>
      <section className="context-card">
        <div className="context-head"><span>Recently updated</span><Icon name="refresh" size={18} /></div>
        <div className="mini-list">
          {recent.map((page) => <a key={page.id} className="mini-list-item" href={`#/read/${page.id}`}><div><strong>{page.secure ? 'Locked note' : page.title}</strong><span>{page.category || 'Uncategorised'}</span></div><Icon name="chevronRight" size={16} /></a>)}
        </div>
      </section>
    </div>
  );

  return (
    <AppShell title={focusLabel} contextPanel={contextPanel}>
      <div className="dashboard-stack">
        <section className="welcome-panel">
          <div>
            <p className="eyebrow">PRIVATE RESEARCH COMMAND CENTRE</p>
            <h2>Good morning, Anubha</h2>
            <p>Here is what needs your attention in your research workspace.</p>
          </div>
          <div className="welcome-actions">
            <a className="button primary" href="#/edit/new"><Icon name="plus" size={18} /> New Entry</a>
            <a className="button secondary" href="#/pdfs"><Icon name="paperclip" size={18} /> PDF Library</a>
          </div>
        </section>

        <section className="summary-grid">
          <Metric icon="notes" label="Total Notes" value={stats.notes} note="Active research pages" />
          <Metric icon="clipboardCheck" label="Active Applications" value={stats.applications} note="Work in progress" />
          <Metric icon="calendarClock" label="Upcoming Deadlines" value={stats.deadlines} note="Within 30 days" />
          <Metric icon="lightbulb" label="Paper Ideas" value={stats.ideas} note="Ideas worth pursuing" />
        </section>

        <section className="panel-card">
          <div className="section-head"><div><p className="eyebrow">UPCOMING DEADLINES</p><h3>Upcoming Deadlines</h3></div></div>
          <div className="deadline-table-wrap">
            <table className="deadline-table">
              <thead><tr><th>Opportunity</th><th>Type</th><th>Deadline</th><th>Days Remaining</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {deadlines.slice(0, 6).map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.page.title}</strong><span>{item.page.category || 'Uncategorised'}</span></td>
                    <td>{item.kind}</td>
                    <td>{formatDate(item.date)}</td>
                    <td>{item.days == null ? 'Unknown' : item.days < 0 ? `${Math.abs(item.days)} late` : item.days === 0 ? 'Today' : `${item.days} days`}</td>
                    <td><span className={`status-badge ${deadlineTone(item.status)}`}>{item.status}</span></td>
                    <td><a className="text-link" href={`#/read/${item.page.id}`}>Open entry</a></td>
                  </tr>
                ))}
                {!deadlines.length ? <tr><td colSpan="6"><div className="empty-state compact"><Icon name="calendarClock" size={24} /><strong>No upcoming deadlines.</strong><p>Import a scholarship, postdoctoral opening or conference call to begin tracking dates.</p><a className="button primary" href="#/edit/new">Import Opportunity</a></div></td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel-card">
          <div className="section-head"><div><p className="eyebrow">RESEARCH WORKSPACE</p><h3>Research Workspace</h3></div></div>
          <div className="category-grid">
            {CATEGORY_CARDS.map((card) => {
              const count = activePages.filter((page) => card.terms.some((term) => normalize(summarizeText(page)).includes(term))).length;
              return (
                <a key={card.key} className="category-card" href={card.href}>
                  <div className="category-card-top"><span className="category-icon"><Icon name={card.icon} size={18} /></span><Icon name="chevronRight" size={18} className="category-arrow" /></div>
                  <strong>{card.label}</strong>
                  <span>{count} saved items</span>
                  <small>Track calls, notes and application material in one place.</small>
                </a>
              );
            })}
          </div>
        </section>

        <section className="panel-card">
          <div className="section-head"><div><p className="eyebrow">RECENTLY UPDATED</p><h3>Recently Updated</h3></div></div>
          <div className="recent-list">
            {recent.map((page) => (
              <a key={page.id} className="recent-row" href={`#/read/${page.id}`}>
                <div><strong>{page.secure ? 'Locked note' : page.title}</strong><span>{page.category || 'Uncategorised'}</span></div>
                <small>{formatDate(page.updatedAt)}</small>
              </a>
            ))}
          </div>
        </section>

        <section className="panel-card">
          <div className="section-head">
            <div><p className="eyebrow">NOTE LIBRARY</p><h3>Note Library</h3></div>
            <div className="segmented-control compact">
              <button type="button" className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}><Icon name="grid" size={16} /> Card view</button>
              <button type="button" className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}><Icon name="list" size={16} /> List view</button>
            </div>
          </div>

          <div className="library-toolbar">
            <label className="field-inline search-inline"><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search titles, text, categories, tags and sources..." /></label>
            <label className="field-inline"><span>Category</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{[...categories.keys()].sort().map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
            <label className="field-inline"><span>Tag</span><select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="all">All tags</option>{[...tags.keys()].sort().map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></label>
            <label className="field-inline"><span>Deadline</span><select value={deadlineFilter} onChange={(event) => setDeadlineFilter(event.target.value)}><option value="all">Any status</option><option value="due-today">Due today</option><option value="due-soon">Due soon</option><option value="overdue">Overdue</option></select></label>
            <label className="field-inline"><span>Sort</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value)}><option value="updated">Recently updated</option><option value="alpha">Alphabetical</option><option value="category">Category</option><option value="deadline">Deadline</option></select></label>
          </div>

          <div className={`note-library ${viewMode === 'list' ? 'is-list' : 'is-grid'}`}>
            {filteredPages.map((page) => {
              const deadline = deadlines.find((item) => item.id === page.id);
              const preview = page.secure ? 'Encrypted note. Unlock it to read the contents.' : (page.summary || page.plainText || 'No summary yet.').slice(0, 180);
              const attachmentCount = (page.attachments || []).length + (page.inlineFiles || []).length;
              const pinned = pinnedIds.has(page.id);
              return (
                <article key={page.id} className={`note-card ${page.secure ? 'secure-note' : ''}`}>
                  <div className="note-card-head">
                    <span className="category-pill">{page.secure ? 'Private Vault' : page.category || 'Uncategorised'}</span>
                    <div className="note-meta-row">{pinned ? <span className="status-badge pin">Pinned</span> : null}{deadline ? <span className={`status-badge ${deadlineTone(deadline.status)}`}>{deadline.status}</span> : null}</div>
                  </div>
                  <h4>{page.secure ? 'Locked note' : page.title}</h4>
                  <p>{preview}</p>
                  <div className="tag-row">{(page.tags || []).slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}{attachmentCount ? <span><Icon name="paperclip" size={12} /> {attachmentCount} file(s)</span> : null}</div>
                  <div className="note-card-foot">
                    <small>Updated {formatDate(page.updatedAt)}</small>
                    <div className="note-actions">
                      <NoteAction icon="eye" onClick={() => window.location.hash = `#/read/${page.id}`}>Open</NoteAction>
                      <NoteAction icon="edit" onClick={() => window.location.hash = `#/edit/${page.id}`}>Edit</NoteAction>
                      <NoteAction icon="pin" onClick={() => togglePin(page)}>{pinned ? 'Unpin' : 'Pin'}</NoteAction>
                      <NoteAction icon="copy" onClick={() => duplicatePage(page)}>Duplicate</NoteAction>
                      <NoteAction icon="archive" onClick={() => toggleArchive(page)}>{archivedIds.has(page.id) ? 'Restore' : 'Archive'}</NoteAction>
                      <NoteAction icon="trash" danger onClick={() => deletePage(page)}>Delete</NoteAction>
                    </div>
                  </div>
                </article>
              );
            })}
            {!filteredPages.length ? <div className="empty-state compact wide"><Icon name="notes" size={24} /><strong>No pages match this search.</strong><p>Try a different filter or capture a new note from the top bar.</p></div> : null}
          </div>
        </section>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <div className="empty-state">Loading your library...</div> : null}
    </AppShell>
  );
}
