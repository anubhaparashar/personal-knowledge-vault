import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { APLogo, Icon } from './Branding';

const NAV = [
  { href: '#/', label: 'Overview', icon: 'home' },
  { href: '#/notes', label: 'All Notes', icon: 'notes' },
  { href: '#/deadlines', label: 'Upcoming Deadlines', icon: 'calendarClock' },
  { href: '#/applications', label: 'Applications', icon: 'clipboardCheck' },
  { href: '#/ideas', label: 'Paper Ideas', icon: 'lightbulb', group: 'Research' },
  { href: '#/papers', label: 'Research Papers', icon: 'fileText', group: 'Research' },
  { href: '#/literature', label: 'Literature Notes', icon: 'bookOpen', group: 'Research' },
  { href: '#/projects', label: 'Research Projects', icon: 'grid', group: 'Research' },
  { href: '#/scholarships', label: 'Scholarships', icon: 'landmark', group: 'Opportunities' },
  { href: '#/postdoctoral', label: 'Postdoctoral', icon: 'flask', group: 'Opportunities' },
  { href: '#/fellowships', label: 'Fellowships', icon: 'presentation', group: 'Opportunities' },
  { href: '#/grants', label: 'Research Jobs', icon: 'clipboardCheck', group: 'Opportunities' },
  { href: '#/conferences', label: 'Conferences', icon: 'presentation', group: 'Publishing' },
  { href: '#/journals', label: 'Journals', icon: 'bookOpen', group: 'Publishing' },
  { href: '#/special-issues', label: 'Special Issues', icon: 'fileText', group: 'Publishing' },
  { href: '#/submission-deadlines', label: 'Submission Deadlines', icon: 'calendar', group: 'Publishing' },
  { href: '#/diary', label: 'Diary', icon: 'notebookPen', group: 'Personal' },
  { href: '#/general-notes', label: 'General Notes', icon: 'notes', group: 'Personal' },
  { href: '#/books', label: 'Books and Reading', icon: 'bookOpen', group: 'Personal' },
];

const QUICK_ADD = [
  ['blank', 'Blank Note', 'notes'],
  ['paper-idea', 'Paper Idea', 'lightbulb'],
  ['research-paper', 'Research Paper', 'fileText'],
  ['scholarship', 'Scholarship', 'landmark'],
  ['postdoc', 'Postdoctoral Opportunity', 'flask'],
  ['conference', 'Conference Call', 'presentation'],
  ['journal', 'Journal Call', 'bookOpen'],
  ['application', 'Application', 'clipboardCheck'],
  ['diary', 'Diary Entry', 'notebookPen'],
];

function routeLabel(path) {
  const key = path.replace(/^#\/?/, '').split('/').filter(Boolean)[0] || '';
  return ({
    '': 'Overview',
    notes: 'All Notes',
    deadlines: 'Upcoming Deadlines',
    applications: 'Applications',
    ideas: 'Paper Ideas',
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
    edit: 'Quick Capture',
    read: 'Reading View',
    pdfs: 'PDF Library',
    settings: 'Backup & Settings',
  })[key] || 'Overview';
}

export default function AppShell({ children, title = 'Anubha Parashar Research Vault', contextPanel = null }) {
  const { user, logout } = useAuth();
  const [dark, setDark] = useState(() => localStorage.getItem('aprv-theme') === 'dark');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [search, setSearch] = useState(() => localStorage.getItem('kv-global-search') || '');
  const [route, setRoute] = useState(() => window.location.hash || '#/');

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('aprv-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    document.title = `${title} · Anubha Parashar Research Vault`;
  }, [title]);

  useEffect(() => {
    const sync = () => {
      setRoute(window.location.hash || '#/');
      setDrawerOpen(false);
      setQuickAddOpen(false);
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('drawer-open', drawerOpen);
    return () => document.body.classList.remove('drawer-open');
  }, [drawerOpen]);

  function navigate(href, template = '') {
    if (template) localStorage.setItem('kv-editor-preload', JSON.stringify(template));
    window.location.hash = href;
    setDrawerOpen(false);
    setQuickAddOpen(false);
  }

  function submitSearch(event) {
    event.preventDefault();
    localStorage.setItem('kv-global-search', search.trim());
    window.location.hash = '#/notes';
    setDrawerOpen(false);
    setQuickAddOpen(false);
  }

  const currentRoute = useMemo(() => routeLabel(route), [route]);
  const groups = useMemo(() => {
    const map = new Map();
    NAV.forEach((item) => {
      const group = item.group || 'Overview';
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(item);
    });
    return [...map.entries()];
  }, []);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${drawerOpen ? 'is-open' : ''}`}>
        <a className="brand-link" href="#/" onClick={() => setDrawerOpen(false)}>
          <APLogo />
        </a>

        <nav className="side-nav" aria-label="Primary navigation">
          {groups.map(([group, items]) => (
            <section key={group} className="nav-group">
              {group !== 'Overview' ? <p className="nav-group-title">{group}</p> : null}
              <div className="nav-group-items">
                {items.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className={route.startsWith(item.href.replace(/\/$/, '')) ? 'is-active' : ''}
                    onClick={() => setDrawerOpen(false)}
                  >
                    <Icon name={item.icon} size={18} />
                    <span>{item.label}</span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </nav>

        <div className="sidebar-foot">
          <a className="utility-link" href="#/settings" onClick={() => setDrawerOpen(false)}><Icon name="settings" size={18} /><span>Settings</span></a>
          <a className="utility-link" href="#/settings" onClick={() => setDrawerOpen(false)}><Icon name="lock" size={18} /><span>Secure Notes</span></a>
          <button className="utility-link button-reset" type="button" onClick={logout}><Icon name="logOut" size={18} /><span>Sign Out</span></button>
          <button className="theme-toggle button-reset" type="button" onClick={() => setDark((value) => !value)}>
            <Icon name={dark ? 'sun' : 'maximize'} size={18} />
            <span>{dark ? 'Light mode' : 'Focus mode'}</span>
          </button>
          <div className="user-card">
            {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <APLogo compact />}
            <span>
              <strong>{user?.displayName || 'Anubha Parashar'}</strong>
              <small>{user?.email}</small>
            </span>
          </div>
        </div>
      </aside>

      <button className={`shell-backdrop ${drawerOpen ? 'is-visible' : ''}`} type="button" aria-hidden="true" onClick={() => setDrawerOpen(false)} />

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-only" type="button" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}>
              <Icon name="menu" size={20} />
            </button>
            <div className="breadcrumb-block">
              <span className="breadcrumb">{currentRoute}</span>
              <h1>{title}</h1>
            </div>
          </div>

          <form className="topbar-search" onSubmit={submitSearch}>
            <Icon name="search" size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search papers, ideas, opportunities and deadlines..."
              aria-label="Search"
            />
          </form>

          <div className="topbar-actions">
            <div className={`quick-add ${quickAddOpen ? 'is-open' : ''}`}>
              <button className="button primary quick-add-trigger" type="button" onClick={() => setQuickAddOpen((value) => !value)}>
                <Icon name="plus" size={18} />
                <span>New Entry</span>
                <Icon name="chevronDown" size={16} />
              </button>
              {quickAddOpen ? (
                <div className="quick-add-menu" role="menu">
                  {QUICK_ADD.map(([template, label, icon]) => (
                    <button
                      key={template}
                      type="button"
                      role="menuitem"
                      className="quick-add-item"
                      onClick={() => navigate('#/edit/new', { title: '', category: '', tagsText: '', sourceUrl: '', summary: '', html: '<p></p>', secure: false, template })}
                    >
                      <Icon name={icon} size={18} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button className="icon-button" type="button" aria-label="Deadlines and notifications"><Icon name="bell" size={18} /></button>
            <button className="avatar-button" type="button" aria-label="Account">
              {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <APLogo compact />}
            </button>
          </div>
        </header>

        <main className={`workspace-layout ${contextPanel ? 'has-context' : ''}`}>
          <section className="workspace-main">{children}</section>
          {contextPanel ? <aside className="workspace-context">{contextPanel}</aside> : null}
        </main>
      </div>
    </div>
  );
}
