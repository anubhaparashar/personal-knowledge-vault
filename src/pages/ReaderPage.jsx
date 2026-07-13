import React, { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import ShareEntryDialog from '../components/ShareEntryDialog';
import BookReader from '../components/BookReader';
import DriveAttachmentList from '../components/DriveAttachmentList';
import PdfViewer from '../components/PdfViewer';
import UnlockPanel from '../components/UnlockPanel';
import { useAuth } from '../context/AuthContext';
import { decryptObject } from '../utils/crypto';
import {
  formatDate,
  linkifyWikiHtml,
  sanitizeHtml,
} from '../utils/content';
import { downloadPageAsHtml } from '../utils/download';
import { downloadAttachmentBlob } from '../services/attachments';
import { archivePage, savePage, unarchivePage } from '../services/pages';
import { daysUntil, deadlineStatus } from '../utils/intelligence';
import { downloadIcs, googleCalendarUrl } from '../utils/calendar';
import { formatDetectedDate } from '../utils/dates';
import { formatDiscoveryTimestamp } from '../services/discovery';
import { isArchivedPage, isDiscoveryRecord, isMyEntry, normalizePage, originLabel, originTone, savedDiscoveryPatch } from '../utils/pageModel';

function deadlineLabel(deadline) {
  const status = deadlineStatus(deadline);
  const days = daysUntil(deadline.date);
  if (deadline.uncertain && !deadline.confirmed) return 'Needs confirmation';
  if (status === 'Completed') return 'Completed';
  if (status === 'Overdue') return `Overdue by ${Math.abs(days || 0)} day(s)`;
  if (status === 'Today') return 'Due today';
  if (status === 'Due soon') return `Due in ${days} day(s)`;
  if (status === 'Upcoming') return `Due in ${days} day(s)`;
  return 'Detected automatically';
}

function dateSourceLabel(deadline) {
  if (deadline.uncertain && !deadline.confirmed) return 'Needs confirmation';
  if (deadline.source === 'manual' || deadline.manuallyEdited) return 'Added manually';
  if (deadline.detectedAutomatically || deadline.source === 'automatic') return 'Detected automatically';
  return 'Saved date';
}

export default function ReaderPage({ pageId, pages, pdfs = [], pagesLoaded }) {
  const { user } = useAuth();
  const page = pages.find((item) => item.id === pageId);
  const normalizedPage = page ? normalizePage(page) : null;
  const [decrypted, setDecrypted] = useState(null);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('kv-reader-mode') || 'scroll');
  const [preview, setPreview] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);

  const content = page?.secure ? decrypted : normalizedPage;
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

  useEffect(() => {
    if (!preview?.url) return undefined;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  function changeView(mode) {
    setViewMode(mode);
    localStorage.setItem('kv-reader-mode', mode);
  }

  async function unlock(passphrase) {
    const result = await decryptObject(page.encryption, passphrase);
    setDecrypted(result);
  }
  async function toggleArchive() {
    if (!user?.uid || !normalizedPage) return;
    try {
      if (isArchivedPage(normalizedPage)) await unarchivePage(user.uid, normalizedPage.id);
      else await archivePage(user.uid, normalizedPage.id, 'Archived from reader');
    } catch (error) {
      window.alert(error.message || 'Could not update archive status.');
    }
  }

  async function saveDiscoveryToMyEntries() {
    if (!user?.uid || !normalizedPage) return;
    try {
      await savePage(user.uid, normalizedPage.id, savedDiscoveryPatch(normalizedPage), false);
      window.alert('Saved to My Entries.');
    } catch (error) {
      window.alert(error.message || 'Could not save discovery.');
    }
  }

  function startApplication() {
    if (!normalizedPage) return;
    localStorage.setItem('kv-editor-preload', JSON.stringify({
      title: `Application - ${normalizedPage.title || 'Opportunity'}`,
      category: 'Applications/Application Documents',
      tagsText: ['Application', ...(normalizedPage.tags || [])].join(', '),
      sourceUrl: normalizedPage.sourceUrl || '',
      summary: `Application workspace for ${normalizedPage.title || 'this opportunity'}.`,
      html: `<p>Application workspace for <a href="#/read/${normalizedPage.id}">${normalizedPage.title || 'this opportunity'}</a>.</p>`,
      origin: 'manual',
      opportunityDetails: { relatedOpportunityId: normalizedPage.id, applicationUrl: normalizedPage.sourceUrl || '' },
    }));
    window.location.hash = '#/edit/new';
  }

  async function openPdfInWebsite(item) {
    try {
      const blob = await downloadAttachmentBlob(item);
      const url = URL.createObjectURL(blob);
      setPreview({
        item,
        name: item.name || item.title || 'PDF',
        title: item.name || item.title || 'PDF',
        url,
      });
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function downloadAttachment(item) {
    try {
      const blob = await downloadAttachmentBlob(item);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.name || item.title || 'attachment';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(error.message);
    }
  }

  function renderImportantDates() {
    const dates = content?.importantDates || [];
    if (!dates.length) return null;
    const pageForCalendar = { ...page, ...content, id: page.id };
    return (
      <section className="reader-section important-dates-read">
        <h3>Important dates</h3>
        <div className="deadline-table reader-deadline-table">
          {dates.map((deadline) => {
            const status = deadlineStatus(deadline);
            return (
              <article key={deadline.id || `${deadline.type}-${deadline.date}`} className={`deadline-row ${status.toLowerCase().replace(/\s+/g, '-')}`}>
                <div>
                  <strong>{deadline.displayLabel || deadline.title || deadline.type || 'Deadline'}</strong>
                  <span>{deadline.snippet || dateSourceLabel(deadline)}</span>
                </div>
                <time dateTime={deadline.date || undefined}>{formatDetectedDate(deadline)}</time>
                <span>{deadlineLabel(deadline)}</span>
                {deadline.date ? <a className="text-link" href={googleCalendarUrl(deadline, pageForCalendar)} target="_blank" rel="noreferrer">Add to Google Calendar</a> : null}
                {deadline.date ? <button type="button" className="text-link" onClick={() => downloadIcs(deadline, pageForCalendar)}>Download .ics</button> : null}
              </article>
            );
          })}
        </div>
      </section>
    );
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
              <span className={`origin-badge badge-${originTone(normalizedPage?.origin || content.origin)}`}>{originLabel(normalizedPage?.origin || content.origin)}</span>
              {isArchivedPage(normalizedPage) ? <span>Archived</span> : null}
              {normalizedPage?.visibility === 'share-link' ? <span>Shared</span> : null}
              {page.secure ? <span>Decrypted for this session</span> : null}
            </div>
            <h2>{content.title}</h2>
            <p>{content.summary}</p>
            <small>Updated {formatDate(page.updatedAt)}</small>
          </div>
          <div className="reader-actions">
            {isMyEntry(normalizedPage) ? <a className="button secondary" href={`#/edit/${page.id}`}>Edit</a> : null}
            {isMyEntry(normalizedPage) ? <button className="button secondary" type="button" onClick={() => setShareOpen(true)}>Share</button> : null}
            {isDiscoveryRecord(normalizedPage) ? <button className="button secondary" type="button" onClick={saveDiscoveryToMyEntries}>Save to My Entries</button> : null}
            {isDiscoveryRecord(normalizedPage) ? <button className="button secondary" type="button" onClick={startApplication}>Start Application</button> : null}
            <button className="button secondary" type="button" onClick={toggleArchive}>{isArchivedPage(normalizedPage) ? 'Restore' : 'Archive'}</button>
            <button className="button secondary" onClick={() => downloadPageAsHtml(page, content)}>Download HTML</button>
            <button className="button secondary" onClick={() => window.print()}>Print / Save PDF</button>
            {page.secure ? <button className="button secondary" onClick={() => setDecrypted(null)}>Lock now</button> : null}
          </div>
        </header>

        <section className="reader-meta-row">
          {content.sourceUrl ? <a href={content.sourceUrl} target="_blank" rel="noopener noreferrer">Open original source</a> : <span>Original note</span>}
          {content.tags?.length ? <div className="tag-row">{content.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
        </section>

        <section className="record-origin-panel reader-section">
          {isDiscoveryRecord(normalizedPage) || normalizedPage?.origin === 'saved-discovery' ? (
            <dl>
              <div><dt>Source</dt><dd>{content.discovery?.sourceName || content.sourceDomain || content.sourceUrl || 'Official source'}</dd></div>
              <div><dt>First discovered</dt><dd>{formatDiscoveryTimestamp(content.discovery?.firstDiscoveredAt)}</dd></div>
              <div><dt>Last checked</dt><dd>{formatDiscoveryTimestamp(content.discovery?.lastCheckedAt)}</dd></div>
              <div><dt>Relevance score</dt><dd>{Math.round((content.discovery?.relevanceScore || 0) * 100)}%</dd></div>
              <div><dt>Date confidence</dt><dd>{Math.round((content.discovery?.dateConfidence || 0) * 100)}%</dd></div>
              <div><dt>Current status</dt><dd>{content.discovery?.status || 'active'}</dd></div>
            </dl>
          ) : (
            <dl>
              <div><dt>Created</dt><dd>{formatDate(page.createdAt)}</dd></div>
              <div><dt>Last updated</dt><dd>{formatDate(page.updatedAt)}</dd></div>
            </dl>
          )}
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

        {renderImportantDates()}

        {!page.secure && page.attachments?.length ? (
          <section className="reader-section">
            <h3>Attachments</h3>
            <DriveAttachmentList
              items={page.attachments}
              onReadPdf={openPdfInWebsite}
              onDownload={downloadAttachment}
            />
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
      <ShareEntryDialog page={normalizedPage} open={shareOpen} onClose={() => setShareOpen(false)} />
      {preview ? (
        <div className="attachment-preview-modal" role="dialog" aria-modal="true" aria-label={preview.title}>
          <div className="attachment-preview-surface">
            <div className="attachment-preview-head">
              <strong>{preview.title}</strong>
              <button type="button" className="button secondary" onClick={() => setPreview(null)}>Close</button>
            </div>
            <PdfViewer
              blobUrl={preview.url}
              title={preview.title}
              onDownload={() => downloadAttachment(preview.item)}
            />
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
