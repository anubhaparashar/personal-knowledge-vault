import React, { useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import BookReader from '../components/BookReader';
import UnlockPanel from '../components/UnlockPanel';
import { decryptObject } from '../utils/crypto';
import {
  formatDate,
  linkifyWikiHtml,
  sanitizeHtml,
} from '../utils/content';
import { downloadPageAsHtml } from '../utils/download';
import { driveFileKey, getDriveFileLink } from '../services/drive';

export default function ReaderPage({ pageId, pages, pdfs = [], pagesLoaded }) {
  const page = pages.find((item) => item.id === pageId);
  const [decrypted, setDecrypted] = useState(null);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('kv-reader-mode') || 'scroll');

  const content = page?.secure ? decrypted : page;
  const renderedHtml = useMemo(
    () => (content ? linkifyWikiHtml(content.html || '', pages) : ''),
    [content, pages],
  );

  const backlinks = useMemo(() => {
    if (!content?.title) return [];
    const target = content.title.trim().toLowerCase();
    return pages.filter((candidate) => (
      candidate.id !== pageId
      && !candidate.secure
      && (candidate.wikiLinks || []).some((title) => title.trim().toLowerCase() === target)
    ));
  }, [content?.title, pageId, pages]);

  const relatedPdfs = useMemo(
    () => pdfs.filter((pdf) => (pdf.relatedPageIds || []).includes(pageId)),
    [pdfs, pageId],
  );

  function changeView(mode) {
    setViewMode(mode);
    localStorage.setItem('kv-reader-mode', mode);
  }

  async function unlock(passphrase) {
    const result = await decryptObject(page.encryption, passphrase);
    setDecrypted(result);
  }

  if (!pagesLoaded) {
    return <AppShell title="Reader"><div className="empty-state">Loading page...</div></AppShell>;
  }
  if (!page) {
    return <AppShell title="Page not found"><div className="empty-state">This page does not exist.</div></AppShell>;
  }
  if (page.secure && !decrypted) {
    return <AppShell title="Secure note"><UnlockPanel onUnlock={unlock} /></AppShell>;
  }

  return (
    <AppShell title={content.title}>
      <article className="reader-shell">
        <header className="reader-header">
          <div>
            <div className="tag-row">
              <span>{content.category || 'Uncategorised'}</span>
              {page.secure ? <span>Decrypted for this session</span> : null}
            </div>
            <h2>{content.title}</h2>
            <p>{content.summary}</p>
            <small>Updated {formatDate(page.updatedAt)}</small>
          </div>
          <div className="reader-actions">
            <a className="button secondary" href={`#/edit/${page.id}`}>Edit</a>
            <button className="button secondary" onClick={() => downloadPageAsHtml(page, content)}>Download HTML</button>
            <button className="button secondary" onClick={() => window.print()}>Print / Save PDF</button>
            {page.secure ? <button className="button secondary" onClick={() => setDecrypted(null)}>Lock now</button> : null}
          </div>
        </header>

        <section className="reader-meta-row">
          {content.sourceUrl ? <a href={content.sourceUrl} target="_blank" rel="noopener noreferrer">Open original source</a> : <span>Original note</span>}
          {content.tags?.length ? <div className="tag-row">{content.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
        </section>

        <div className="view-switch" role="group" aria-label="Reading mode">
          <button className={viewMode === 'scroll' ? 'active' : ''} onClick={() => changeView('scroll')}>Scroll view</button>
          <button className={viewMode === 'book' ? 'active' : ''} onClick={() => changeView('book')}>Book view</button>
        </div>

        {viewMode === 'scroll' ? (
          <section className="scroll-reader reader-prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderedHtml) }} />
        ) : (
          <BookReader title={content.title} html={renderedHtml} />
        )}

        {!page.secure && page.attachments?.length ? (
          <section className="reader-section">
            <h3>Attachments</h3>
            <div className="attachment-grid">
              {page.attachments.map((item) => (
                <a key={driveFileKey(item)} href={getDriveFileLink(item)} target="_blank" rel="noopener noreferrer">{item.name}<small>{Math.ceil((item.size || 0) / 1024)} KB - Google Drive</small></a>
              ))}
            </div>
          </section>
        ) : null}

        {!page.secure && relatedPdfs.length ? (
          <section className="reader-section">
            <h3>Related PDFs</h3>
            <div className="attachment-grid">
              {relatedPdfs.map((pdf) => (
                <a key={pdf.id} href={`#/pdfs/${pdf.id}`}>{pdf.title || pdf.driveName}<small>Google Drive PDF</small></a>
              ))}
            </div>
          </section>
        ) : null}

        <section className="reader-section">
          <h3>Pages linking here</h3>
          {backlinks.length ? (
            <div className="backlink-list">
              {backlinks.map((item) => <a key={item.id} href={`#/read/${item.id}`}>{item.title}</a>)}
            </div>
          ) : <p className="muted">No backlinks yet. Link to this page using <code>[[{content.title}]]</code>.</p>}
        </section>
      </article>
    </AppShell>
  );
}
