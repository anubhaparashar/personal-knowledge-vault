import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
import { entryTypeForPage, getEntryPages, isArchivedPage, isDiscoveryRecord, isMyEntry, isShareEnabledPage, normalizePage, normalizeStringList, normalizeTechDetails, originLabel, originTone, savedDiscoveryPatch, TECHNOLOGY_ENTRY_TYPE, technologyStatusLabel, technologyStatusTone } from '../utils/pageModel';

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

function hasReaderValue(value) {
  if (Array.isArray(value)) return value.some(hasReaderValue);
  if (value && typeof value === 'object') return Object.values(value).some(hasReaderValue);
  return String(value || '').trim().length > 0;
}

function textParagraphs(value = '') {
  return String(value || '').split(/\n{1,}/).map((line) => line.trim()).filter(Boolean);
}

function ReaderText({ value, code = false }) {
  const lines = textParagraphs(value);
  if (!lines.length) return null;
  if (code) return <pre className="tech-reader-code">{lines.join('\n')}</pre>;
  return <>{lines.map((line, index) => <p key={`${index}-${line.slice(0, 18)}`}>{line}</p>)}</>;
}

function DetailList({ items }) {
  const visible = items.filter(([, value]) => hasReaderValue(value));
  if (!visible.length) return null;
  return (
    <dl className="tech-reader-facts">
      {visible.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{Array.isArray(value) ? value.join(', ') : value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ReaderPage({ pageId, pages, pdfs = [], pagesLoaded }) {
  const { user } = useAuth();
  const page = pages.find((item) => item.id === pageId);
  const normalizedPage = page ? normalizePage(page) : null;
  const [decrypted, setDecrypted] = useState(null);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('kv-reader-mode') || 'scroll');
  const [preview, setPreview] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [selectedEntryPageId, setSelectedEntryPageId] = useState('main');

  const content = page?.secure ? decrypted : normalizedPage;
  const entryPages = useMemo(() => (content ? getEntryPages(content) : []), [content]);
  const entryPageKey = useMemo(() => entryPages.map((entryPage) => entryPage.pageId).join('|'), [entryPages]);
  const selectedEntryPage = entryPages.find((entryPage) => entryPage.pageId === selectedEntryPageId) || entryPages[0];
  const selectedEntryPageIndex = Math.max(0, entryPages.findIndex((entryPage) => entryPage.pageId === selectedEntryPage?.pageId));
  const renderedHtml = useMemo(
    () => (selectedEntryPage ? linkifyWikiHtml(selectedEntryPage.content || '', pages) : ''),
    [pages, selectedEntryPage],
  );
  const isTechnologyContent = Boolean(content && entryTypeForPage(content) === TECHNOLOGY_ENTRY_TYPE);
  const techDetails = useMemo(() => normalizeTechDetails(content?.techDetails || {}), [content?.techDetails]);

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
    if (!entryPages.length) return;
    if (!entryPages.some((entryPage) => entryPage.pageId === selectedEntryPageId)) setSelectedEntryPageId(entryPages[0].pageId);
  }, [entryPageKey, entryPages, selectedEntryPageId]);

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

  function renderTechnologyReference() {
    if (!isTechnologyContent) return null;
    const aliases = normalizeStringList(techDetails.aliases);
    const useCases = normalizeStringList(techDetails.useCases);
    const relatedTechnologies = normalizeStringList(techDetails.relatedTechnologies);
    const definitionValues = [techDetails.shortDefinition, techDetails.mainPurpose, techDetails.importantConcepts];
    const whyValues = [techDetails.whyUsed, techDetails.problemSolved, techDetails.advantages];
    const setupValues = [techDetails.setupNotes || techDetails.setupSteps, techDetails.configurationNotes, techDetails.codeSnippets, techDetails.environmentVariables, techDetails.usefulLinks];
    const problemValues = [techDetails.issuesAndSolutions, techDetails.troubleshooting];
    const relatedPagesHtml = techDetails.relatedPages
      ? linkifyWikiHtml(String(techDetails.relatedPages).replace(/\n/g, '<br>'), pages)
      : '';

    return (
      <div className="tech-reader-layout">
        <section className="reader-section tech-reader-section tech-reader-overview">
          <div className="tech-reader-title-row">
            <div>
              <p className="eyebrow">TECHNOLOGY</p>
              <h3>{techDetails.canonicalName || content.title}</h3>
            </div>
            <span className={`badge badge-${technologyStatusTone(techDetails.status)}`}>{technologyStatusLabel(techDetails.status)}</span>
          </div>
          <DetailList items={[
            ['Category', techDetails.technologyCategory],
            ['Aliases', aliases],
            ['Official website', techDetails.officialUrl ? <a href={techDetails.officialUrl} target="_blank" rel="noopener noreferrer">{techDetails.officialUrl}</a> : ''],
            ['Last verified', techDetails.lastVerifiedAt ? formatDate(techDetails.lastVerifiedAt) : ''],
          ]} />
        </section>

        {hasReaderValue(definitionValues) ? (
          <section className="reader-section tech-reader-section">
            <h3>What is it?</h3>
            <ReaderText value={techDetails.shortDefinition} />
            <ReaderText value={techDetails.mainPurpose} />
            <ReaderText value={techDetails.importantConcepts} />
          </section>
        ) : null}

        {hasReaderValue(whyValues) ? (
          <section className="reader-section tech-reader-section">
            <h3>Why I use it</h3>
            <ReaderText value={techDetails.whyUsed} />
            <ReaderText value={techDetails.problemSolved} />
            <ReaderText value={techDetails.advantages} />
          </section>
        ) : null}

        {techDetails.projects.length ? (
          <section className="reader-section tech-reader-section">
            <h3>Projects and usages</h3>
            <div className="tech-reader-card-grid">
              {techDetails.projects.map((usage, index) => (
                <article key={`${usage.projectName || 'usage'}-${index}`} className="tech-reader-mini-card">
                  <div className="tech-reader-mini-card-head">
                    <strong>{usage.projectName || `Usage ${index + 1}`}</strong>
                    {usage.projectUrl ? <a href={usage.projectUrl} target="_blank" rel="noopener noreferrer">Open</a> : null}
                  </div>
                  <ReaderText value={usage.purpose} />
                  {usage.servicesUsed?.length ? <div className="tag-row">{usage.servicesUsed.map((service) => <span key={service}>{service}</span>)}</div> : null}
                  <DetailList items={[
                    ['Environment', usage.environment],
                    ['Date added', usage.dateAdded ? formatDate(usage.dateAdded) : ''],
                    ['Notes', usage.notes],
                  ]} />
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {hasReaderValue(setupValues) ? (
          <section className="reader-section tech-reader-section">
            <h3>Setup and configuration</h3>
            <ReaderText value={techDetails.setupNotes || techDetails.setupSteps} />
            <ReaderText value={techDetails.configurationNotes} code />
            <ReaderText value={techDetails.codeSnippets} code />
            <ReaderText value={techDetails.environmentVariables} code />
            <ReaderText value={techDetails.usefulLinks} />
          </section>
        ) : null}

        {hasReaderValue(techDetails.commonCommands) ? (
          <section className="reader-section tech-reader-section">
            <h3>Commands</h3>
            <ReaderText value={techDetails.commonCommands} code />
          </section>
        ) : null}

        {hasReaderValue(problemValues) ? (
          <section className="reader-section tech-reader-section">
            <h3>Problems and solutions</h3>
            <ReaderText value={techDetails.issuesAndSolutions} />
            {techDetails.troubleshooting.length ? (
              <div className="tech-reader-card-grid">
                {techDetails.troubleshooting.map((item, index) => (
                  <article key={`${item.problem || 'problem'}-${index}`} className="tech-reader-mini-card">
                    <strong>{item.problem || `Problem ${index + 1}`}</strong>
                    <DetailList items={[
                      ['Symptoms', item.symptoms],
                      ['Cause', item.cause],
                      ['Solution', item.solution],
                      ['Date solved', item.dateSolved ? formatDate(item.dateSolved) : ''],
                      ['Related project', item.relatedProject],
                    ]} />
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {hasReaderValue([techDetails.alternatives, techDetails.limitations]) ? (
          <section className="reader-section tech-reader-section">
            <h3>Alternatives and limitations</h3>
            <ReaderText value={techDetails.alternatives} />
            <ReaderText value={techDetails.limitations} />
          </section>
        ) : null}

        {hasReaderValue(techDetails.securityNotes) ? (
          <section className="reader-section tech-reader-section">
            <h3>Security notes</h3>
            <ReaderText value={techDetails.securityNotes} />
          </section>
        ) : null}

        {hasReaderValue([relatedTechnologies, useCases, techDetails.relatedPages, techDetails.references, techDetails.personalNotes]) ? (
          <section className="reader-section tech-reader-section">
            <h3>Related technologies and pages</h3>
            {relatedTechnologies.length ? <div className="tag-row">{relatedTechnologies.map((item) => <span key={item}>{item}</span>)}</div> : null}
            {useCases.length ? <DetailList items={[["Use cases", useCases]]} /> : null}
            {relatedPagesHtml ? <div className="tech-reader-related-pages" dangerouslySetInnerHTML={{ __html: sanitizeHtml(relatedPagesHtml) }} /> : null}
            <ReaderText value={techDetails.references} />
            <ReaderText value={techDetails.personalNotes} />
          </section>
        ) : null}
      </div>
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
              {isTechnologyContent ? <span className={`badge badge-${technologyStatusTone(techDetails.status)}`}>{technologyStatusLabel(techDetails.status)}</span> : null}
              {isArchivedPage(normalizedPage) ? <span>Archived</span> : null}
              {isShareEnabledPage(normalizedPage) ? <span>Shareable</span> : null}
              {page.secure ? <span>Decrypted for this session</span> : null}
            </div>
            <h2>{content.title}</h2>
            <p>{content.summary}</p>
            <small>Updated {formatDate(page.updatedAt)}</small>
          </div>
          <div className="reader-actions">
            {isMyEntry(normalizedPage) ? <a className="button secondary" href={`#/edit/${page.id}`}>Edit</a> : null}
            {isMyEntry(normalizedPage) ? <button className="button secondary" type="button" onClick={() => setShareOpen(true)}>{isShareEnabledPage(normalizedPage) ? 'Share link' : 'Make shareable'}</button> : null}
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

        {renderTechnologyReference()}

        {entryPages.length ? (
          <section className="reader-page-nav" aria-label="Entry page navigation">
            <nav className="reader-page-tabs">
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
            </nav>
            <div className="reader-page-stepper">
              <button type="button" className="button secondary" disabled={selectedEntryPageIndex <= 0} onClick={() => setSelectedEntryPageId(entryPages[selectedEntryPageIndex - 1]?.pageId)}><ChevronLeft size={16} /> Previous page</button>
              <span>{selectedEntryPageIndex + 1} / {entryPages.length}</span>
              <button type="button" className="button secondary" disabled={selectedEntryPageIndex >= entryPages.length - 1} onClick={() => setSelectedEntryPageId(entryPages[selectedEntryPageIndex + 1]?.pageId)}>Next page <ChevronRight size={16} /></button>
            </div>
          </section>
        ) : null}

        <div className="view-switch" role="group" aria-label="Reading mode">
          <button className={viewMode === 'scroll' ? 'active' : ''} onClick={() => changeView('scroll')}>Scroll view</button>
          <button className={viewMode === 'book' ? 'active' : ''} onClick={() => changeView('book')}>Book view</button>
        </div>

        {selectedEntryPage ? (
          <section className="reader-page-title">
            <p className="eyebrow">PAGE {selectedEntryPageIndex + 1}</p>
            <h3>{selectedEntryPage.title || `Page ${selectedEntryPageIndex + 1}`}</h3>
          </section>
        ) : null}

        {viewMode === 'scroll' ? (
          <section className="scroll-reader reader-prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderedHtml) }} />
        ) : (
          <BookReader title={`${content.title} - ${selectedEntryPage?.title || 'Page'}`} html={renderedHtml} />
        )}

        {renderImportantDates()}

        {!page.secure && page.attachments?.length ? (
          <section className="reader-section">
            <h3>{isTechnologyContent ? 'References and attachments' : 'Attachments'}</h3>
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
