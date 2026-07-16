import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Bell,
  BookOpen,
  Briefcase,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Database,
  FileText,
  FlaskConical,
  GraduationCap,
  Home,
  Inbox,
  Landmark,
  LayoutGrid,
  Lightbulb,
  Lock,
  LogOut,
  Menu,
  Moon,
  NotebookPen,
  Palette,
  Search,
  Share2,
  Sun,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NewEntryMenu from './NewEntryMenu';
import ImportFromLinkModal from './ImportFromLinkModal';

const NAV = [
  { href: '#/', label: 'Dashboard', icon: Home, group: 'Library' },
  { href: '#/my-entries', label: 'My Entries', icon: NotebookPen, group: 'Library' },
  { href: '#/diary', label: 'Diary', icon: NotebookPen, group: 'Library' },
  { href: '#/shared-inbox', label: 'Shared Inbox', icon: Inbox, group: 'Library' },
  { href: '#/shareable', label: 'Shareable Entries', icon: Share2, group: 'Library' },
  { href: '#/discoveries', label: 'Scraped Entries', icon: Search, group: 'Library' },
  { href: '#/calendar', label: 'Calendar', icon: CalendarDays, group: 'Library' },
  { href: '#/archives', label: 'Archives', icon: Archive, group: 'Library' },

  { href: '#/ideas', label: 'Paper Ideas', icon: Lightbulb, group: 'Research' },
  { href: '#/project-ideas', label: 'Project Ideas', icon: LayoutGrid, group: 'Research' },
  { href: '#/papers', label: 'Research Papers', icon: FileText, group: 'Research' },
  { href: '#/applications', label: 'Applications', icon: ClipboardCheck, group: 'Research' },

  { href: '#/scholarships', label: 'Scholarships', icon: GraduationCap, group: 'Opportunities' },
  { href: '#/postdoctoral', label: 'Postdoctoral', icon: FlaskConical, group: 'Opportunities' },
  { href: '#/fellowships', label: 'Fellowships', icon: Landmark, group: 'Opportunities' },
  { href: '#/grants', label: 'Grants', icon: Landmark, group: 'Opportunities' },
  { href: '#/jobs', label: 'Jobs', icon: Briefcase, group: 'Opportunities' },
  { href: '#/conferences', label: 'Conferences', icon: CalendarClock, group: 'Opportunities' },
  { href: '#/journals', label: 'Journals', icon: BookOpen, group: 'Opportunities' },
  { href: '#/special-issues', label: 'Special Issues', icon: FileText, group: 'Opportunities' },

  { href: '#/settings/sources', label: 'Sources', icon: Database, group: 'Settings' },
  { href: '#/settings/appearance', label: 'Appearance', icon: Palette, group: 'Settings' },
  { href: '#/secure-notes', label: 'Secure Notes', icon: Lock, group: 'Settings' },
  { label: 'Sign Out', icon: LogOut, group: 'Settings', action: 'logout' },
];

function routeTitle(path) {
  const parts = path.replace(/^#\/?/, '').split('/').filter(Boolean);
  const key = parts[0] || '';
  if (key === 'settings' && parts[1] === 'sources') return 'Sources';
  if (key === 'settings' && parts[1] === 'appearance') return 'Appearance';
  return ({
    '': 'Dashboard',
    'my-entries': 'My Entries',
    notes: 'All Notes',
    calendar: 'Calendar',
    'shared-inbox': 'Shared Inbox',
    shareable: 'Shareable Entries',
    archives: 'Archives',
    discoveries: 'Scraped Entries',
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
    conferences: 'Conference Calls',
    journals: 'Journal Calls',
    'special-issues': 'Special Issues',
    'submission-deadlines': 'Submission Deadlines',
    diary: 'Diary',
    'general-notes': 'Manual Notes',
    'personal-notes': 'General Notes',
    books: 'Books and Reading',
    'secure-notes': 'Secure Notes',
    edit: 'New Entry',
    read: 'Reading View',
    entry: 'Reading View',
    pdfs: 'PDF Library',
    settings: 'Settings',
  })[key] || 'Research Library';
}

function isActiveRoute(route, href) {
  if (!href) return false;
  if (href === '#/') return route === '#/' || route === '';
  return route === href || route.startsWith(`${href}/`);
}

function navigate(href) {
  window.location.hash = href;
}

export default function AppShell({ children, title = 'Research Library', contextPanel = null }) {
  const { user, logout } = useAuth();
  const [dark, setDark] = useState(() => localStorage.getItem('aprv-theme') === 'dark');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [route, setRoute] = useState(() => window.location.hash || '#/');
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('aprv-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    document.title = `${title} - Anubha Parashar Research Vault`;
  }, [title]);

  useEffect(() => {
    const sync = () => {
      setRoute(window.location.hash || '#/');
      setDrawerOpen(false);
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('drawer-open', drawerOpen);
    return () => document.body.classList.remove('drawer-open');
  }, [drawerOpen]);

  useEffect(() => {
    const openImport = () => setImportOpen(true);
    window.addEventListener('kv-open-import-link', openImport);
    return () => window.removeEventListener('kv-open-import-link', openImport);
  }, []);

  const groups = useMemo(() => {
    const map = new Map();
    NAV.forEach((item) => {
      const group = item.group || 'Library';
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(item);
    });
    return [...map.entries()];
  }, []);

  const displayTitle = title || routeTitle(route);
  const accountName = user?.displayName || 'Anubha Parashar';
  const accountEmail = user?.email || '';

  return (
    <div className="app-shell">
      <aside className={`sidebar ${drawerOpen ? 'is-open' : ''}`} aria-label="Primary">
        <div className="sidebar-inner">
          <a className="brand-link" href="#/" onClick={() => setDrawerOpen(false)} aria-label="Anubha Parashar Research Vault">
            <span className="brand-monogram" aria-hidden="true">AP</span>
            <span className="brand-copy">
              <strong>Anubha Parashar</strong>
              <small>Research Vault</small>
            </span>
          </a>

          <nav className="side-nav" aria-label="Primary navigation">
            {groups.map(([group, items]) => (
              <section key={group} className="nav-group">
                <p className="nav-group-title">{group}</p>
                <div className="nav-group-items">
                  {items.map((item) => {
                    const Icon = item.icon;
                    if (item.action === 'logout') {
                      return (
                        <button key={item.label} type="button" className="nav-action" onClick={logout}>
                          <Icon size={18} strokeWidth={1.8} />
                          <span>{item.label}</span>
                        </button>
                      );
                    }
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        className={isActiveRoute(route, item.href) ? 'is-active' : ''}
                        onClick={() => setDrawerOpen(false)}
                      >
                        <Icon size={18} strokeWidth={1.8} />
                        <span>{item.label}</span>
                      </a>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>

          <footer className="sidebar-foot">
            <div className="user-card">
              {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="avatar-fallback">AP</span>}
              <span>
                <strong>{accountName}</strong>
                <small title={accountEmail}>{accountEmail}</small>
              </span>
            </div>
          </footer>
        </div>
      </aside>

      <button className={`shell-backdrop ${drawerOpen ? 'is-visible' : ''}`} type="button" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} />

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu-button" type="button" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}>
              <Menu size={21} />
            </button>
            <div className="page-heading">
              <p className="eyebrow">PRIVATE LIBRARY</p>
              <h1>{displayTitle}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" aria-label="Search library" onClick={() => navigate('#/my-entries')}>
              <Search size={19} />
            </button>
            <button className="icon-button" type="button" aria-label="Open upcoming deadlines" onClick={() => navigate('#/deadlines')}>
              <Bell size={19} />
            </button>
            <button className="icon-button" type="button" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setDark((value) => !value)}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <NewEntryMenu className="topbar-new-entry-menu" onImportFromLink={() => setImportOpen(true)} />
          </div>
        </header>

        <main className={`workspace-layout ${contextPanel ? 'has-context' : ''}`}>
          <section className="workspace-main">{children}</section>
          {contextPanel ? <aside className="workspace-context">{contextPanel}</aside> : null}
        </main>
      </div>
      <ImportFromLinkModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
