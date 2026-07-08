import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  ExternalLink,
  FileImage,
  Inbox,
  Lightbulb,
  Link2,
  Loader2,
  PenLine,
  Plus,
  RefreshCw,
  Rocket,
  Trash2,
} from 'lucide-react';
import AppShell from '../components/AppShell';
import NewEntryMenu from '../components/NewEntryMenu';
import { Badge, EmptyState, SegmentedControl } from '../components/DashboardUI';
import { useAuth } from '../context/AuthContext';
import { createPageId, savePage } from '../services/pages';
import {
  createLocalCapture,
  deleteLocalCapture,
  listLocalCaptures,
  productionShareUrl,
  updateLocalCapture,
} from '../services/shareCapture';
import {
  deleteSharedInboxCapture,
  saveSharedInboxCapture,
  updateSharedInboxCapture,
} from '../services/sharedInbox';
import {
  analyzeSharedCapture,
  buildApplicationPreloadFromCapture,
  buildEditorPreloadFromCapture,
  buildPageFromSharedCapture,
  confidenceLabel,
  findSharedDuplicate,
} from '../utils/shareClassifier';
import { CATEGORY_OPTIONS, mergeTags } from '../utils/intelligence';
import { PRELOAD_KEY } from '../utils/manualEntry';
import { formatDate } from '../utils/content';
import { formatDetectedDate } from '../utils/dates';

const TABS = [
  { value: 'new', label: 'New' },
  { value: 'processing', label: 'Processing' },
  { value: 'needs-review', label: 'Needs Review' },
  { value: 'categorised', label: 'Categorised' },
  { value: 'failed', label: 'Failed Imports' },
  { value: 'archived', label: 'Archived' },
];

function sourceLabel(value = 'unknown') {
  return ({
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
    twitter: 'X/Twitter',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    browser: 'Browser',
    email: 'Email',
    google: 'Google',
    unknown: 'Unknown',
  })[value] || 'Unknown';
}

function statusTone(status = '') {
  if (status === 'saved') return 'completed';
  if (status === 'needs-review') return 'due-soon';
  if (status === 'failed') return 'overdue';
  if (status === 'processing') return 'upcoming';
  return 'neutral';
}

function confidenceTone(capture = {}) {
  const label = capture.classificationConfidenceLabel || confidenceLabel(capture.classificationConfidence || 0);
  if (label === 'High') return 'completed';
  if (label === 'Medium') return 'due-soon';
  return 'neutral';
}

function dateValue(value) {
  if (!value) return 0;
  const raw = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(raw.getTime()) ? 0 : raw.getTime();
}

function tabForCapture(capture = {}) {
  if (capture.archived) return 'archived';
  if (capture.processingStatus === 'failed') return 'failed';
  if (capture.processingStatus === 'processing' || capture.processingStatus === 'received') return 'processing';
  if (capture.processingStatus === 'needs-review') return 'needs-review';
  if (capture.processingStatus === 'saved') return 'categorised';
  return 'new';
}

function previewText(capture = {}) {
  return (capture.summary || capture.rawText || capture.extractedContent || 'No text preview was shared.').slice(0, 240);
}

function receivedLabel(value) {
  return value ? formatDate(value) : 'Just now';
}

function isProcessing(capture = {}) {
  return ['received', 'processing'].includes(capture.processingStatus);
}

function mergeCaptureLists(remoteItems = [], localItems = []) {
  const map = new Map();
  [...remoteItems, ...localItems].forEach((item) => {
    const key = item.localId || item.remoteId || item.id;
    const existing = map.get(key);
    map.set(key, { ...(existing || {}), ...item, id: existing?.id || item.id });
  });
  return [...map.values()].sort((a, b) => dateValue(b.receivedAt) - dateValue(a.receivedAt));
}

export default function SharedInboxPage({ pages = [], captures = [], loading = false, error = '' }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('new');
  const [localCaptures, setLocalCaptures] = useState([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteForm, setPasteForm] = useState({ title: '', url: '', text: '' });
  const [editingCategoryId, setEditingCategoryId] = useState('');
  const [categoryDraft, setCategoryDraft] = useState('');
  const [message, setMessage] = useState('');

  async function refreshLocal() {
    setLocalCaptures(await listLocalCaptures());
  }

  useEffect(() => {
    refreshLocal().catch(() => {});
    const onFocus = () => refreshLocal().catch(() => {});
    const openPaste = () => setPasteOpen(true);
    window.addEventListener('focus', onFocus);
    window.addEventListener('kv-open-paste-capture', openPaste);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('kv-open-paste-capture', openPaste);
    };
  }, []);

  const allCaptures = useMemo(() => mergeCaptureLists(captures, localCaptures), [captures, localCaptures]);
  const tabCounts = useMemo(() => {
    const counts = new Map(TABS.map((tab) => [tab.value, 0]));
    allCaptures.forEach((capture) => counts.set(tabForCapture(capture), (counts.get(tabForCapture(capture)) || 0) + 1));
    return counts;
  }, [allCaptures]);
  const visibleCaptures = useMemo(() => allCaptures.filter((capture) => tabForCapture(capture) === activeTab), [activeTab, allCaptures]);
  const pendingOffline = allCaptures.filter((capture) => !capture.synced).length;
  const processingCount = allCaptures.filter(isProcessing).length;

  async function updateCapture(capture, patch) {
    const localId = capture.localId || capture.id;
    if (localId) await updateLocalCapture(localId, patch).catch(() => {});
    if (user?.uid && (capture.remoteId || capture.id)) await updateSharedInboxCapture(user.uid, capture.remoteId || capture.id, patch);
    await refreshLocal();
  }

  async function ensureAnalysis(capture) {
    if (capture.suggestedCategory && capture.suggestedTags?.length) return capture;
    const analysis = analyzeSharedCapture(capture);
    const duplicate = findSharedDuplicate(capture, analysis, pages, allCaptures);
    const patch = {
      ...analysis,
      processingStatus: duplicate ? 'needs-review' : 'ready',
      duplicateOf: duplicate?.id || null,
      duplicateTitle: duplicate?.title || '',
    };
    await updateCapture(capture, patch);
    return { ...capture, ...patch };
  }

  async function acceptAndSave(capture, { ignoreDuplicate = false } = {}) {
    if (!user?.uid) {
      setMessage('Sign in before saving this shared item to the vault.');
      return;
    }
    const analysed = await ensureAnalysis(capture);
    const analysis = analyzeSharedCapture(analysed);
    const duplicate = findSharedDuplicate(analysed, analysis, pages, allCaptures);
    if (duplicate && !ignoreDuplicate) {
      await updateCapture(analysed, { duplicateOf: duplicate.id, duplicateTitle: duplicate.title, processingStatus: 'needs-review' });
      setMessage('Already in your vault. Use Add New Note Anyway or Open Existing.');
      return;
    }
    const pageId = createPageId(user.uid);
    await savePage(user.uid, pageId, buildPageFromSharedCapture(analysed, analysis, pageId), true);
    await updateCapture(analysed, { processingStatus: 'saved', destinationPageId: pageId, reviewSuggested: false });
    setMessage(`Saved to ${analysis.suggestedCategory}.`);
    window.location.hash = `#/read/${pageId}`;
  }

  function editBeforeSaving(capture) {
    const analysis = analyzeSharedCapture(capture);
    localStorage.setItem(PRELOAD_KEY, JSON.stringify(buildEditorPreloadFromCapture(capture, analysis)));
    window.location.hash = `#/edit/new-${Date.now()}`;
  }

  function startApplication(capture) {
    const analysis = analyzeSharedCapture(capture);
    localStorage.setItem(PRELOAD_KEY, JSON.stringify(buildApplicationPreloadFromCapture(capture, analysis, capture.destinationPageId || '')));
    window.location.hash = `#/edit/new-${Date.now()}`;
  }

  async function convertCapture(capture, category, tag) {
    const tags = mergeTags([tag], capture.suggestedTags || [], 8);
    await updateCapture(capture, { suggestedCategory: category, suggestedTags: tags, processingStatus: 'needs-review' });
    setMessage(`Converted to ${category}.`);
  }

  function beginCategoryEdit(capture) {
    setEditingCategoryId(capture.id);
    setCategoryDraft(capture.suggestedCategory || 'Personal Knowledge/Web References');
  }

  async function saveCategory(capture) {
    await updateCapture(capture, { suggestedCategory: categoryDraft, processingStatus: capture.processingStatus === 'saved' ? 'saved' : 'needs-review' });
    setEditingCategoryId('');
  }

  async function archiveCapture(capture) {
    await updateCapture(capture, { archived: true, processingStatus: capture.processingStatus || 'needs-review' });
  }

  async function deleteCapture(capture) {
    if (!window.confirm(`Delete "${capture.rawTitle || 'this shared item'}"?`)) return;
    if (capture.localId || capture.id) await deleteLocalCapture(capture.localId || capture.id).catch(() => {});
    if (user?.uid && (capture.remoteId || capture.id)) await deleteSharedInboxCapture(user.uid, capture.remoteId || capture.id).catch(() => {});
    await refreshLocal();
  }

  async function pasteCapture() {
    const saved = await createLocalCapture({
      rawTitle: pasteForm.title,
      rawText: pasteForm.text,
      rawUrl: pasteForm.url,
      sourcePlatform: pasteForm.url ? 'browser' : 'unknown',
      origin: 'system-share',
    });
    if (user?.uid) await saveSharedInboxCapture(user.uid, saved.id, saved, true).catch(() => {});
    setPasteForm({ title: '', url: '', text: '' });
    setPasteOpen(false);
    window.location.hash = `#/share-capture/${saved.id}`;
  }

  const tabOptions = TABS.map((tab) => ({ ...tab, label: `${tab.label} ${tabCounts.get(tab.value) || 0}` }));

  return (
    <AppShell title="Shared Inbox">
      <div className="shared-inbox-page">
        <section className="shared-inbox-header">
          <div>
            <p className="eyebrow">SYSTEM SHARE</p>
            <h2>Shared Inbox</h2>
            <p>Posts, links and ideas shared from your apps.</p>
          </div>
          <div className="shared-inbox-actions">
            <button type="button" className="button primary" onClick={() => setPasteOpen((value) => !value)}><Link2 size={16} /> Paste Link</button>
            <NewEntryMenu label="Add Manually" onImportFromLink={() => window.dispatchEvent(new CustomEvent('kv-open-import-link'))} />
            <Badge tone={processingCount ? 'upcoming' : 'completed'}>{processingCount ? `${processingCount} processing` : 'Processing clear'}</Badge>
          </div>
        </section>

        <section className="shared-inbox-status-grid">
          <article><strong>{allCaptures.length}</strong><span>Total shared captures</span></article>
          <article><strong>{pendingOffline}</strong><span>Pending offline captures</span></article>
          <article><strong>{tabCounts.get('needs-review') || 0}</strong><span>Need review</span></article>
          <article><strong>{tabCounts.get('categorised') || 0}</strong><span>Recently categorised</span></article>
        </section>

        {pasteOpen ? (
          <section className="paste-capture-panel">
            <div className="compact-section-head">
              <div>
                <h3>Paste a link or post text...</h3>
                <p>Use this when the operating system share target is unavailable.</p>
              </div>
              <button type="button" className="button secondary" onClick={() => setPasteOpen(false)}>Close</button>
            </div>
            <div className="paste-capture-grid">
              <label className="field-label">Title<input value={pasteForm.title} onChange={(event) => setPasteForm((current) => ({ ...current, title: event.target.value }))} placeholder="Optional title" /></label>
              <label className="field-label">URL<input value={pasteForm.url} onChange={(event) => setPasteForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://..." /></label>
              <label className="field-label full-span">Post text<textarea rows="5" value={pasteForm.text} onChange={(event) => setPasteForm((current) => ({ ...current, text: event.target.value }))} placeholder="Paste a link or post text..." /></label>
            </div>
            <button type="button" className="button primary" disabled={!pasteForm.url.trim() && !pasteForm.text.trim()} onClick={pasteCapture}>Capture</button>
          </section>
        ) : null}

        <section className="sharing-test-panel">
          <div>
            <strong>Test Share Target</strong>
            <span>{productionShareUrl({ title: 'Test share', text: 'Postdoctoral vacancy, applications close 31 August 2026.', url: 'https://example.edu/postdoc' })}</span>
          </div>
          <button type="button" className="button secondary" onClick={() => navigator.clipboard?.writeText(productionShareUrl({ title: 'Test share', text: 'Postdoctoral vacancy, applications close 31 August 2026.', url: 'https://example.edu/postdoc' }))}>Copy test URL</button>
          <button type="button" className="button secondary" onClick={() => refreshLocal()}><RefreshCw size={16} /> Refresh</button>
        </section>

        {message ? <p className="status-message">{message}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {loading ? <div className="skeleton-panel"><span /><span /><span /></div> : null}

        <SegmentedControl options={tabOptions} value={activeTab} onChange={setActiveTab} ariaLabel="Shared Inbox tabs" className="shared-inbox-tabs" />

        <section className="shared-inbox-list" aria-label="Shared Inbox captures">
          {visibleCaptures.map((capture) => {
            const dates = capture.detectedDates || [];
            const duplicate = capture.duplicateOf || capture.duplicateTitle;
            const editing = editingCategoryId === capture.id;
            return (
              <article key={capture.id} className={`shared-capture-card status-${capture.processingStatus || 'ready'}`}>
                <div className="shared-card-top">
                  <div className="source-chip"><Inbox size={15} /> {sourceLabel(capture.sourcePlatform)}</div>
                  <Badge tone={statusTone(capture.processingStatus)}>{capture.processingStatus || 'ready'}</Badge>
                  <Badge tone={confidenceTone(capture)}>{capture.classificationConfidenceLabel || confidenceLabel(capture.classificationConfidence || 0)}</Badge>
                  {duplicate ? <Badge tone="due-soon">Duplicate warning</Badge> : null}
                  {capture.attachmentIndicator || capture.attachments?.length ? <Badge tone="neutral"><FileImage size={13} /> Attachment</Badge> : null}
                </div>

                <div className="shared-card-body">
                  <div>
                    <h3>{capture.rawTitle || capture.summary || 'Shared item'}</h3>
                    <p>{previewText(capture)}</p>
                    <div className="share-meta-row">
                      <span>Received {receivedLabel(capture.receivedAt)}</span>
                      {capture.rawUrl ? <a href={capture.rawUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open Original</a> : null}
                    </div>
                  </div>
                  <aside>
                    {editing ? (
                      <div className="category-edit-box">
                        <select value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)}>
                          {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}
                        </select>
                        <button type="button" className="button primary" onClick={() => saveCategory(capture)}>Save</button>
                        <button type="button" className="button secondary" onClick={() => setEditingCategoryId('')}>Cancel</button>
                      </div>
                    ) : <span className="category-pill">{capture.suggestedCategory || 'Uncategorised'}</span>}
                    <div className="tag-row">{(capture.suggestedTags || []).slice(0, 8).map((tag) => <span key={tag}>{tag}</span>)}</div>
                    <div className="detected-date-mini-list">
                      {dates.length ? dates.slice(0, 4).map((date) => <span key={date.id || `${date.type}-${date.date}`}>{date.displayLabel || date.title || date.type || 'Date'}: {formatDetectedDate(date)}</span>) : <span>No deadline published</span>}
                    </div>
                    {duplicate ? <p className="duplicate-note">Already in your vault: {capture.duplicateTitle || capture.duplicateOf}</p> : null}
                  </aside>
                </div>

                <div className="shared-card-actions">
                  <button type="button" className="button primary" disabled={!user} onClick={() => acceptAndSave(capture)}><CheckCircle2 size={16} /> Accept and Save</button>
                  <button type="button" className="button secondary" onClick={() => editBeforeSaving(capture)}><PenLine size={16} /> Edit Before Saving</button>
                  <button type="button" className="button secondary" onClick={() => beginCategoryEdit(capture)}>Change Category</button>
                  <button type="button" className="button secondary" onClick={() => startApplication(capture)}><Rocket size={16} /> Add to Applications</button>
                  <button type="button" className="button secondary" onClick={() => convertCapture(capture, 'Research/Paper Ideas', 'Paper Idea')}><Lightbulb size={16} /> Convert to Paper Idea</button>
                  <button type="button" className="button secondary" onClick={() => convertCapture(capture, 'Research/Project Ideas', 'Project Idea')}><Plus size={16} /> Convert to Project Idea</button>
                  <button type="button" className="button secondary" onClick={() => archiveCapture(capture)}><Archive size={16} /> Archive</button>
                  <button type="button" className="button secondary danger-inline" onClick={() => deleteCapture(capture)}><Trash2 size={16} /> Delete</button>
                  {capture.destinationPageId ? <a className="button secondary" href={`#/read/${capture.destinationPageId}`}>Open Entry</a> : null}
                  {duplicate ? <button type="button" className="button secondary" onClick={() => acceptAndSave(capture, { ignoreDuplicate: true })}>Add New Note Anyway</button> : null}
                </div>
              </article>
            );
          })}

          {!visibleCaptures.length ? (
            <EmptyState icon={activeTab === 'processing' ? Loader2 : Inbox} title={`No ${TABS.find((tab) => tab.value === activeTab)?.label || 'shared'} items`} actions={<button type="button" className="button primary" onClick={() => setPasteOpen(true)}><Link2 size={16} /> Paste Link</button>}>
              Shared posts and links will appear here after using Share to AP Research Vault.
            </EmptyState>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}