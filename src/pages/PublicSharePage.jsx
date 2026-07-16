import React, { useEffect, useMemo, useState } from 'react';
import { getPublicShare } from '../services/publicShares';
import { formatDate, sanitizeHtml } from '../utils/content';
import { formatDetectedDate } from '../utils/dates';
import { getEntryPages } from '../utils/pageModel';

export default function PublicSharePage({ shareId }) {
  const [share, setShare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEntryPageId, setSelectedEntryPageId] = useState('main');
  const entryPages = useMemo(() => (share ? getEntryPages(share) : []), [share]);
  const selectedEntryPage = entryPages.find((page) => page.pageId === selectedEntryPageId) || entryPages[0];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPublicShare(shareId)
      .then((item) => {
        if (cancelled) return;
        setShare(item);
        setError(item ? '' : 'This shared link is no longer available.');
      })
      .catch(() => {
        if (!cancelled) setError('This shared link is no longer available.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [shareId]);

  useEffect(() => {
    if (entryPages.length && !entryPages.some((page) => page.pageId === selectedEntryPageId)) setSelectedEntryPageId(entryPages[0].pageId);
  }, [entryPages, selectedEntryPageId]);

  if (loading) return <main className="public-share-page"><section className="public-share-card"><p>Loading shared entry...</p></section></main>;
  if (error || !share) return <main className="public-share-page"><section className="public-share-card"><h1>This shared link is no longer available.</h1></section></main>;

  return (
    <main className="public-share-page">
      <article className="public-share-card">
        <header>
          <p className="eyebrow">SHARED ENTRY</p>
          <h1>{share.title || 'Shared entry'}</h1>
          {share.category ? <span className="category-pill">{share.category}</span> : null}
          {share.tags?.length ? <div className="tag-row">{share.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
        </header>

        {share.summary ? <p className="public-share-summary">{share.summary}</p> : null}
        {entryPages.length ? (
          <section className="public-share-page-nav" aria-label="Shared entry pages">
            <div className="reader-page-tabs">
              {entryPages.map((entryPage, index) => (
                <button
                  type="button"
                  key={entryPage.pageId}
                  className={entryPage.pageId === selectedEntryPage?.pageId ? 'is-active' : ''}
                  onClick={() => setSelectedEntryPageId(entryPage.pageId)}
                >
                  <span>{entryPage.pageId === 'main' ? 'Main Page' : `Page ${index + 1}`}</span>
                  <strong>{entryPage.title || `Page ${index + 1}`}</strong>
                </button>
              ))}
            </div>
          </section>
        ) : null}
        {selectedEntryPage ? <section className="reader-prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedEntryPage.content || '') }} /> : null}

        {share.importantDates?.length ? (
          <section className="public-share-section">
            <h2>Important dates</h2>
            <div className="deadline-table reader-deadline-table">
              {share.importantDates.map((date) => (
                <article key={date.id || `${date.type}-${date.date}`} className="deadline-row">
                  <div><strong>{date.displayLabel || date.title || date.type || 'Important date'}</strong><span>{date.snippet || date.sourceText || ''}</span></div>
                  <time dateTime={date.date || undefined}>{formatDetectedDate(date)}</time>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {share.sourceUrl ? <p><a className="text-link" href={share.sourceUrl} target="_blank" rel="noreferrer">Open Source</a></p> : null}

        {share.attachments?.length ? (
          <section className="public-share-section">
            <h2>Attachments</h2>
            <div className="attachment-grid">
              {share.attachments.map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer">{item.name || 'Attachment'}</a>)}
            </div>
          </section>
        ) : null}

        <footer className="public-share-footer">
          <span>Shared by {share.sharedBy || 'Anubha Parashar'}</span>
          <span>Shared {formatDate(share.sharedAt || share.shareCreatedAt)}</span>
        </footer>
      </article>
    </main>
  );
}