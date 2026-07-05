import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const navigation = [
  ['#/','Library'],
  ['#/edit/new','Quick Capture'],
  ['#/pdfs','PDF Library'],
  ['#/settings','Backup & Settings'],
];

export default function AppShell({ children, title = 'My Knowledge Vault' }) {
  const { user, logout } = useAuth();
  const [dark, setDark] = useState(() => localStorage.getItem('kv-theme') === 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('kv-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#/">
          <span className="brand-mark">KV</span>
          <span>
            <strong>Knowledge Vault</strong>
            <small>Private digital book</small>
          </span>
        </a>

        <nav className="side-nav" aria-label="Primary navigation">
          {navigation.map(([href, label]) => (
            <a key={href} href={href}>{label}</a>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button className="button ghost full" onClick={() => setDark((value) => !value)}>
            {dark ? 'Light mode' : 'Dark mode'}
          </button>
          <div className="user-card">
            {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : null}
            <span>
              <strong>{user?.displayName || 'Private user'}</strong>
              <small>{user?.email}</small>
            </span>
          </div>
          <button className="button ghost full" onClick={logout}>Sign out</button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">PRIVATE LIBRARY</p>
            <h1>{title}</h1>
          </div>
          <a className="button primary" href="#/edit/new">+ Quick Capture</a>
        </header>
        <div className="content-area">{children}</div>
      </main>
    </div>
  );
}


