import React, { useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import { formatDate } from '../utils/content';

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

export default function DashboardPage({ pages, pdfs = [], loading, error }) {
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('all');

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

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return pages;
    return pages.filter((page) => {
      const searchable = page.secure
        ? 'locked note private vault'
        : [page.title, page.plainText, page.category, page.sourceDomain, ...(page.tags || [])].join(' ');
      return searchable.toLowerCase().includes(query);
    });
  }, [pages, search]);

  const totalSources = new Set(pages.filter((page) => page.sourceDomain).map((page) => page.sourceDomain)).size;
  const lockedCount = pages.filter((page) => page.secure).length;

  return (
    <AppShell title="Knowledge Library">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">CAPTURE EVERYTHING. FIND ANYTHING.</p>
          <h2>Your private research scrapbook, diary and digital reference book.</h2>
          <p>Paste formatted material from the web, keep PDFs and attachments in Google Drive, preserve sources, connect related pages with <code>[[Page Title]]</code>, and read entries as a book or continuous document.</p>
        </div>
        <div className="hero-actions">
          <a className="button primary large" href="#/edit/new">Create a page</a>
          <a className="button secondary large" href="#/pdfs">PDF Library</a>
        </div>
      </section>

      <section className="stat-grid">
        <article><strong>{pages.length}</strong><span>Total pages</span></article>
        <article><strong>{pdfs.length}</strong><span>Drive PDFs</span></article>
        <article><strong>{indexes.categories.size}</strong><span>Categories</span></article>
        <article><strong>{totalSources}</strong><span>Sources</span></article>
        <article><strong>{lockedCount}</strong><span>Secure notes</span></article>
      </section>

      <section className="library-controls">
        <label className="search-box">
          <span>Search</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search titles, text, categories, tags and sources..." />
        </label>
        <div className="segmented-control">
          {['all', 'categories', 'tags', 'sources', 'a-z'].map((item) => (
            <button key={item} className={section === item ? 'active' : ''} onClick={() => setSection(item)}>
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
