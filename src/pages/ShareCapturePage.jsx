import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Inbox,
  Loader2,
  LogIn,
} from 'lucide-react';
import AppShell from '../components/AppShell';
import { Badge } from '../components/DashboardUI';
import { useAuth } from '../context/AuthContext';
import { importUrlContent } from '../services/urlImport';
import { createPageId, savePage } from '../services/pages';
import {
  getLocalCapture,
  putLocalCapture,
  updateLocalCapture,
} from '../services/shareCapture';
import {
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
import { PRELOAD_KEY } from '../utils/manualEntry';
import { formatDetectedDate, selectNextImportantDate } from '../utils/dates';

const STEPS = [
  'Captured safely',
  'Reading shared content',
  'Identifying content type',
  'Generating category and tags',
  'Detecting important dates',
  'Checking for duplicates',
  'Saved',
];

const SOCIAL_EXTRACTION_NOTE = 'The original platform did not allow automatic page extraction. The shared text and link were saved.';

function dateLabel(value) {
  if (!value) return 'Just now';
  const raw = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(raw.getTime()) ? 'Just now' : raw.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function platformLabel(value = 'unknown') {
  return ({
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
    twitter: 'X/Twitter',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    browser: 'Browser',
    email: 'Email',
    google: 'Google',
    unknown: 'Unknown source',
  })[value] || 'Unknown source';
}

function stepIcon(status) {
  if (status === 'done') return <CheckCircle2 size={17} />;
  if (status === 'active') return <Loader2 size={17} className="spin-icon" />;
  if (status === 'warning') return <AlertTriangle size={17} />;
  return <Clock size={17} />;
}

function normalizeCaptureForDisplay(capture = {}, analysis = null) {
  return {
    ...capture,
    suggestedCategory: analysis?.suggestedCategory || capture.suggestedCategory,
    classificationConfidence: analysis?.classificationConfidence ?? capture.classificationConfidence,
    classificationConfidenceLabel: analysis?.classificationConfidenceLabel || capture.classificationConfidenceLabel || confidenceLabel(capture.classificationConfidence || 0),
    suggestedTags: analysis?.suggestedTags || capture.suggestedTags || [],
    detectedDates: analysis?.detectedDates || capture.detectedDates || [],
    summary: analysis?.summary || capture.summary,
    canonicalUrl: analysis?.canonicalUrl || capture.canonicalUrl,
  };
}

function CaptureSurface({ children, title = 'Share Capture' }) {
  const { user } = useAuth();
  if (user) return <AppShell title={title}>{children}</AppShell>;
  return (
    <main className="share-guest-shell">
      <section className="share-guest-brand">
        <span className="brand-monogram">AP</span>
        <div>
          <strong>AP Research Vault</strong>
          <small>Share capture</small>
        </div>
      </section>
      {children}
    </main>
  );
}

export default function ShareCapturePage({ captureId, pages = [], sharedInbox = [] }) {
  const { user, login } = useAuth();
  const [capture, setCapture] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [steps, setSteps] = useState(() => Object.fromEntries(STEPS.map((step) => [step, 'pending'])));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const processedRef = useRef(new Set());

  const displayCapture = useMemo(() => normalizeCaptureForDisplay(capture || {}, analysis), [analysis, capture]);
  const primaryDate = useMemo(() => selectNextImportantDate(displayCapture.detectedDates || [], { includeOverdue: true }), [displayCapture.detectedDates]);
  const saved = Boolean(displayCapture.destinationPageId);
  const confidence = displayCapture.classificationConfidenceLabel || confidenceLabel(displayCapture.classificationConfidence || 0);

  function mark(step, status) {
    setSteps((current) => ({ ...current, [step]: status }));
  }

  async function persistPatch(patch) {
    if (!capture) return;
    const next = { ...capture, ...patch };
    setCapture(next);
    await updateLocalCapture(capture.id, patch);
    if (user?.uid) {
      const remoteId = next.remoteId || capture.remoteId || capture.id;
      await updateSharedInboxCapture(user.uid, remoteId, patch);
    }
  }

  async function saveResultAsPage({ ignoreDuplicate = false } = {}) {
    if (!capture || !analysis || !user?.uid) return null;
    if (duplicate && !ignoreDuplicate) return null;
    setSaving(true);
    try {
      const pageId = createPageId(user.uid);
      const pagePayload = buildPageFromSharedCapture(capture, analysis, pageId);
      await savePage(user.uid, pageId, pagePayload, true);
      await persistPatch({
        processingStatus: 'saved',
        destinationPageId: pageId,
        reviewSuggested: confidence === 'Medium',
      });
      mark('Saved', 'done');
      setMessage(confidence === 'Medium' ? 'Saved. Review suggested.' : `Saved to ${analysis.suggestedCategory}.`);
      return pageId;
    } catch (saveError) {
      await persistPatch({
        processingStatus: 'needs-review',
        processingError: saveError.message || 'Could not auto-save this capture.',
      });
      mark('Saved', 'warning');
      setError(saveError.message || 'Could not auto-save this capture.');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function processCapture(currentCapture) {
    mark('Captured safely', 'done');
    mark('Reading shared content', 'active');
    let imported = null;
    let importWarning = '';

    if (user?.uid) {
      const remoteId = currentCapture.remoteId || currentCapture.id;
      await saveSharedInboxCapture(user.uid, remoteId, currentCapture, true);
      await updateLocalCapture(currentCapture.id, { synced: true, remoteId });
      currentCapture = { ...currentCapture, synced: true, remoteId };
      setCapture(currentCapture);
    }

    await updateLocalCapture(currentCapture.id, { processingStatus: 'processing' });
    if (user?.uid) await updateSharedInboxCapture(user.uid, currentCapture.remoteId || currentCapture.id, { processingStatus: 'processing' });

    if (currentCapture.rawUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 12000);
        imported = await importUrlContent(currentCapture.rawUrl, { signal: controller.signal });
        window.clearTimeout(timeoutId);
      } catch (importError) {
        importWarning = ['facebook', 'linkedin'].includes(currentCapture.sourcePlatform)
          ? SOCIAL_EXTRACTION_NOTE
          : `Webpage extraction failed. The shared text and link were saved. ${importError.message || ''}`.trim();
      }
    }

    mark('Reading shared content', importWarning ? 'warning' : 'done');
    mark('Identifying content type', 'active');
    const nextAnalysis = analyzeSharedCapture(currentCapture, imported);
    setAnalysis(nextAnalysis);
    mark('Identifying content type', 'done');
    mark('Generating category and tags', 'done');
    mark('Detecting important dates', nextAnalysis.detectedDates?.length ? 'done' : 'warning');
    mark('Checking for duplicates', 'active');

    const foundDuplicate = findSharedDuplicate(currentCapture, nextAnalysis, pages, sharedInbox);
    setDuplicate(foundDuplicate);
    mark('Checking for duplicates', foundDuplicate ? 'warning' : 'done');

    const readyStatus = foundDuplicate
      ? 'needs-review'
      : nextAnalysis.shouldAutoSave || nextAnalysis.shouldSaveWithReview
        ? 'ready'
        : 'needs-review';
    const patch = {
      ...nextAnalysis,
      processingStatus: readyStatus,
      processingError: importWarning || null,
      duplicateOf: foundDuplicate?.id || null,
      duplicateTitle: foundDuplicate?.title || '',
      reviewSuggested: nextAnalysis.shouldSaveWithReview,
    };
    await putLocalCapture({ ...currentCapture, ...patch });
    if (user?.uid) await updateSharedInboxCapture(user.uid, currentCapture.remoteId || currentCapture.id, patch);
    setCapture((existing) => ({ ...(existing || currentCapture), ...patch }));

    if (importWarning) setMessage(importWarning);

    if (!user?.uid) {
      mark('Saved', 'warning');
      setMessage('Your shared item is safe. Sign in to finish saving it.');
      return;
    }

    if (foundDuplicate) {
      mark('Saved', 'warning');
      setMessage('Already in your vault. Choose how to handle the duplicate.');
      return;
    }

    if (nextAnalysis.shouldAutoSave || nextAnalysis.shouldSaveWithReview) {
      await saveResultAsPage({ ignoreDuplicate: true });
      return;
    }

    mark('Saved', 'warning');
    setMessage('Saved to Shared Inbox for review.');
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError('');
      const found = await getLocalCapture(captureId);
      if (cancelled) return;
      if (!found) {
        setError('This shared item was not found in the local capture queue.');
        return;
      }
      setCapture(found);
      if (found.suggestedCategory || found.processingStatus === 'saved' || found.processingStatus === 'needs-review') {
        setAnalysis(analyzeSharedCapture(found, found.imported || null));
      }
      const key = `${captureId}:${user?.uid || 'guest'}:${found.destinationPageId || ''}:${found.processingStatus || ''}`;
      if (processedRef.current.has(key)) return;
      processedRef.current.add(key);
      if (found.destinationPageId) {
        mark('Captured safely', 'done');
        STEPS.slice(1).forEach((step) => mark(step, 'done'));
        return;
      }
      await processCapture(found);
    }
    load().catch((loadError) => {
      if (cancelled) return;
      setError(loadError.message || 'Could not process this shared item.');
      mark('Saved', 'warning');
    });
    return () => {
      cancelled = true;
    };
  }, [captureId, user?.uid]);

  async function acceptAndSave() {
    const pageId = await saveResultAsPage({ ignoreDuplicate: true });
    if (pageId) window.location.hash = `#/read/${pageId}`;
  }

  function editBeforeSaving() {
    localStorage.setItem(PRELOAD_KEY, JSON.stringify(buildEditorPreloadFromCapture(displayCapture, analysis || displayCapture)));
    window.location.hash = `#/edit/new-${Date.now()}`;
  }

  function startApplication() {
    localStorage.setItem(PRELOAD_KEY, JSON.stringify(buildApplicationPreloadFromCapture(displayCapture, analysis || displayCapture, displayCapture.destinationPageId || '')));
    window.location.hash = `#/edit/new-${Date.now()}`;
  }

  async function updateExistingEntry() {
    if (!duplicate?.id || duplicate.type !== 'page' || !user?.uid) return;
    await savePage(user.uid, duplicate.id, {
      shareCaptureUpdatedAt: new Date().toISOString(),
      lastSharedSourceUrl: displayCapture.canonicalUrl || displayCapture.rawUrl || '',
    }, false);
    await persistPatch({ processingStatus: 'saved', destinationPageId: duplicate.id });
    window.location.hash = `#/read/${duplicate.id}`;
  }

  const content = (
    <div className="share-capture-page">
      <section className="share-capture-card">
        <div className="share-capture-head">
          <div>
            <p className="eyebrow">SHARE CAPTURE</p>
            <h2>{saved ? `Saved to ${displayCapture.suggestedCategory || 'your vault'}` : 'Capturing shared item'}</h2>
            <p>{message || 'The incoming shared content is preserved locally before processing.'}</p>
          </div>
          <Badge tone={confidence === 'High' ? 'completed' : confidence === 'Medium' ? 'due-soon' : 'neutral'}>{confidence} confidence</Badge>
        </div>

        {error ? <div className="alert-panel error"><AlertTriangle size={18} /><span>{error}</span></div> : null}

        <div className="share-progress-grid">
          {STEPS.map((step) => (
            <article key={step} className={`share-progress-step ${steps[step] || 'pending'}`}>
              {stepIcon(steps[step])}
              <span>{step}</span>
            </article>
          ))}
        </div>

        {capture ? (
          <section className="share-result-panel">
            <div className="share-result-main">
              <span className="category-pill">{displayCapture.suggestedCategory || 'Classifying...'}</span>
              <h3>{analysis?.title || displayCapture.rawTitle || 'Shared item'}</h3>
              <p>{displayCapture.summary || displayCapture.rawText || 'No text preview was provided by the source app.'}</p>
              <div className="share-meta-row">
                <span>Source: {platformLabel(displayCapture.sourcePlatform)}</span>
                <span>Received: {dateLabel(displayCapture.receivedAt)}</span>
                {displayCapture.attachmentIndicator ? <span>{displayCapture.attachmentIndicator}</span> : null}
              </div>
              {displayCapture.rawUrl ? (
                <a className="share-original-link" href={displayCapture.rawUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} /> Open Original
                </a>
              ) : null}
            </div>

            <div className="share-result-side">
              <article>
                <strong>{primaryDate ? primaryDate.type : 'No deadline published'}</strong>
                <span>{primaryDate ? formatDetectedDate(primaryDate) : 'No deadline published'}</span>
              </article>
              <article>
                <strong>Tags</strong>
                <div className="tag-row">{(displayCapture.suggestedTags || []).slice(0, 8).map((tag) => <span key={tag}>{tag}</span>)}</div>
              </article>
            </div>
          </section>
        ) : null}

        {duplicate ? (
          <section className="duplicate-panel">
            <AlertTriangle size={18} />
            <div>
              <strong>Already in your vault</strong>
              <p>Existing entry: {duplicate.title}</p>
              <div className="share-action-row">
                {duplicate.type === 'page' ? <button className="button primary" type="button" onClick={() => { window.location.hash = `#/read/${duplicate.id}`; }}>Open Existing</button> : null}
                <button className="button secondary" type="button" disabled={saving || !user} onClick={acceptAndSave}>Add New Note Anyway</button>
                {duplicate.type === 'page' ? <button className="button secondary" type="button" disabled={!user} onClick={updateExistingEntry}>Update Existing Entry</button> : null}
                <button className="button secondary" type="button" onClick={() => { window.location.hash = '#/shared-inbox'; }}>Cancel</button>
              </div>
            </div>
          </section>
        ) : null}

        {!user ? (
          <section className="share-auth-panel">
            <LogIn size={18} />
            <div>
              <strong>Your shared item is safe. Sign in to finish saving it.</strong>
              <p>The payload is stored locally in this browser and will sync to Firestore after authentication.</p>
            </div>
            <button className="button primary" type="button" onClick={login}>Continue with Google</button>
          </section>
        ) : null}

        <div className="share-action-row">
          {saved ? <button className="button primary" type="button" onClick={() => { window.location.hash = `#/read/${displayCapture.destinationPageId}`; }}><FileText size={16} /> Open Entry</button> : null}
          {!saved && !duplicate ? <button className="button primary" type="button" disabled={saving || !user || !analysis} onClick={acceptAndSave}><CheckCircle2 size={16} /> Accept and Save</button> : null}
          <button className="button secondary" type="button" disabled={!capture} onClick={editBeforeSaving}>Edit Before Saving</button>
          <button className="button secondary" type="button" disabled={!capture} onClick={startApplication}>Start Application</button>
          <button className="button secondary" type="button" onClick={() => { window.location.hash = '#/shared-inbox'; }}><Inbox size={16} /> Shared Inbox</button>
          {displayCapture.rawUrl ? <a className="button secondary" href={displayCapture.rawUrl} target="_blank" rel="noreferrer">Open Original <ArrowRight size={16} /></a> : null}
        </div>
      </section>
    </div>
  );

  return <CaptureSurface title="Share Capture">{content}</CaptureSurface>;
}
