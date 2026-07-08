import React, { useMemo, useRef, useState } from 'react';
import { Link2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createPageId, savePage } from '../services/pages';
import { importDiscoveryUrl } from '../services/discovery';
import { createSharedInboxId, saveSharedInboxCapture } from '../services/sharedInbox';
import { htmlToText, sanitizeHtml, getSourceDomain } from '../utils/content';
import { generateSmartMetadata, mergeTags, splitTagsText } from '../utils/intelligence';
import { PRELOAD_KEY } from '../utils/manualEntry';

const LINK_IMPORT_STAGES = [
  'Validating link',
  'Connecting to website',
  'Reading page',
  'Extracting useful content',
  'Identifying content type',
  'Generating category',
  'Generating tags',
  'Detecting dates',
  'Checking duplicates',
  'Ready for review',
];

function sourceMetadataFromPreview(preview = {}, sourceUrl = '') {
  const metadata = preview.metadata || {};
  return {
    sourceName: metadata.sourceName || metadata.siteName || preview.sourceName || preview.institution || '',
    author: metadata.author || '',
    publicationDate: metadata.publicationDate || metadata.publishedTime || '',
    description: metadata.description || preview.summary || '',
    canonicalUrl: metadata.canonicalUrl || preview.canonicalUrl || preview.sourceUrl || sourceUrl,
    platformMessage: metadata.platformMessage || '',
  };
}

function normalizePreview(preview = {}, sourceUrl = '') {
  const cleanHtml = sanitizeHtml(preview.html || '<p></p>');
  const text = preview.text || htmlToText(cleanHtml);
  const sourceMetadata = sourceMetadataFromPreview(preview, sourceUrl);
  const metadata = generateSmartMetadata({
    title: preview.title || '',
    html: cleanHtml,
    text,
    sourceUrl: sourceMetadata.canonicalUrl || sourceUrl,
    summary: preview.summary || sourceMetadata.description,
    sourceMetadata,
  });
  const opportunityDetails = preview.opportunityDetails || {};
  const importantDates = preview.importantDates?.length ? preview.importantDates : metadata.importantDates;
  return {
    ...preview,
    title: preview.title || 'Imported research entry',
    html: cleanHtml,
    text,
    sourceUrl: sourceMetadata.canonicalUrl || sourceUrl,
    sourceWebsite: getSourceDomain(sourceMetadata.canonicalUrl || sourceUrl),
    sourceMetadata,
    institution: preview.institution || opportunityDetails.institution || sourceMetadata.sourceName || '',
    category: preview.category || preview.suggestedCategory || metadata.category,
    subcategory: preview.suggestedSubcategory || (preview.category || metadata.category || '').split('/').slice(-1)[0] || '',
    tags: mergeTags(preview.tags || [], metadata.tags).slice(0, 8),
    summary: preview.summary || metadata.summary || sourceMetadata.description,
    importantDates,
    opportunityDetails,
    funding: preview.funding || opportunityDetails.funding || '',
    eligibility: preview.eligibility || opportunityDetails.eligibility || '',
    location: preview.location || opportunityDetails.location || '',
    applicationUrl: preview.applicationUrl || opportunityDetails.applicationUrl || sourceMetadata.canonicalUrl || sourceUrl,
    categoryConfidence: preview.categoryConfidence ?? metadata.categoryConfidence,
    relevanceScore: preview.relevanceScore ?? 0.7,
    dateConfidence: preview.dateConfidence ?? (importantDates.length ? 0.72 : 0.3),
    extractionConfidence: preview.extractionConfidence ?? Math.max(preview.relevanceScore || 0, preview.categoryConfidence || 0.35),
  };
}

function validPublicUrl(value = '') {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export default function ImportFromLinkModal({ open, onClose }) {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [lastRequest, setLastRequest] = useState(null);
  const controllerRef = useRef(null);
  const normalized = useMemo(() => preview ? normalizePreview(preview, url) : null, [preview, url]);

  if (!open) return null;

  async function analyse(nextUrl = url) {
    const trimmedUrl = nextUrl.trim();
    setMessage('');
    setPreview(null);
    setStageIndex(0);
    if (!validPublicUrl(trimmedUrl)) {
      setMessage('Enter a valid public HTTP or HTTPS URL.');
      return;
    }
    setWorking(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    setLastRequest(trimmedUrl);
    let tick;
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    try {
      tick = window.setInterval(() => setStageIndex((index) => Math.min(index + 1, LINK_IMPORT_STAGES.length - 2)), 1200);
      const result = await importDiscoveryUrl(user, trimmedUrl, {}, { signal: controller.signal });
      window.clearInterval(tick);
      setStageIndex(LINK_IMPORT_STAGES.length - 1);
      setPreview(result.preview || result);
      setMessage('Preview ready. Review the extracted fields before saving.');
    } catch (error) {
      window.clearInterval(tick);
      setMessage(error.name === 'AbortError' ? 'Analysis timed out. Retry or save the link to Shared Inbox with pasted text.' : (error.message || 'Could not import this URL.'));
    } finally {
      window.clearTimeout(timeout);
      setWorking(false);
      controllerRef.current = null;
    }
  }

  function cancelAnalysis() {
    controllerRef.current?.abort();
    setWorking(false);
    setMessage('Analysis cancelled. Existing vault entries were not changed.');
  }

  function editBeforeSaving(overrides = {}) {
    if (!normalized) return;
    localStorage.setItem(PRELOAD_KEY, JSON.stringify({
      title: normalized.title,
      category: normalized.category,
      tagsText: normalized.tags.join(', '),
      sourceUrl: normalized.sourceUrl,
      sourceMetadata: normalized.sourceMetadata,
      summary: normalized.summary,
      html: normalized.html,
      importantDates: normalized.importantDates,
      origin: 'imported-from-url',
      opportunityDetails: normalized.opportunityDetails || {},
      ...overrides,
    }));
    onClose();
    window.location.hash = `#/edit/new-${Date.now()}`;
  }

  async function saveImported({ startApplication = false } = {}) {
    if (!normalized) return;
    setWorking(true);
    setMessage('Saving imported entry...');
    try {
      const pageId = createPageId(user.uid);
      const data = {
        secure: false,
        encryption: null,
        title: normalized.title,
        category: normalized.category || 'Uncategorised',
        categoryAuto: true,
        categoryConfidence: normalized.categoryConfidence || 0,
        tags: normalized.tags,
        sourceUrl: normalized.sourceUrl,
        sourceDomain: getSourceDomain(normalized.sourceUrl),
        sourceMetadata: normalized.sourceMetadata,
        summary: normalized.summary,
        html: normalized.html,
        plainText: normalized.text,
        wikiLinks: [],
        importantDates: normalized.importantDates || [],
        attachments: [],
        inlineFiles: [],
        origin: 'imported-from-url',
        createdOrigin: 'imported-from-url',
        discovery: {
          firstDiscoveredAt: new Date().toISOString(),
          lastCheckedAt: new Date().toISOString(),
          sourceUrl: normalized.sourceUrl,
          relevanceScore: normalized.relevanceScore,
          dateConfidence: normalized.dateConfidence,
          status: 'active',
        },
        opportunityDetails: {
          ...(normalized.opportunityDetails || {}),
          applicationUrl: normalized.applicationUrl,
          funding: normalized.funding,
          eligibility: normalized.eligibility,
          location: normalized.location,
        },
      };
      await savePage(user.uid, pageId, data, true);
      if (startApplication) {
        localStorage.setItem(PRELOAD_KEY, JSON.stringify({
          title: `Application - ${normalized.title}`,
          category: 'Applications/Application Documents',
          tagsText: mergeTags(['Application'], splitTagsText(normalized.tags.join(', '))).join(', '),
          sourceUrl: normalized.sourceUrl,
          summary: `Application workspace for ${normalized.title}.`,
          html: `<p>Application workspace for <a href="#/read/${pageId}">${normalized.title}</a>.</p>`,
          origin: 'manually-added',
          opportunityDetails: { relatedOpportunityId: pageId, institution: normalized.institution || '' },
        }));
        onClose();
        window.location.hash = `#/edit/new-${Date.now()}`;
        return;
      }
      onClose();
      window.location.hash = `#/read/${pageId}`;
    } catch (error) {
      setMessage(error.message || 'Could not save the imported entry.');
    } finally {
      setWorking(false);
    }
  }

  async function addToSharedInbox() {
    const targetUrl = normalized?.sourceUrl || url.trim();
    if (!targetUrl) return;
    setWorking(true);
    try {
      const captureId = createSharedInboxId(user.uid);
      await saveSharedInboxCapture(user.uid, captureId, {
        rawTitle: normalized?.title || '',
        rawText: normalized?.text || normalized?.summary || '',
        rawUrl: targetUrl,
        canonicalUrl: normalized?.sourceUrl || targetUrl,
        sourcePlatform: normalized?.sourceWebsite || 'web',
        suggestedCategory: normalized?.category || 'Personal Knowledge/Web References',
        classificationConfidence: normalized?.extractionConfidence || 0,
        classificationConfidenceLabel: (normalized?.extractionConfidence || 0) >= 0.7 ? 'High' : (normalized?.extractionConfidence || 0) >= 0.45 ? 'Medium' : 'Low',
        suggestedTags: normalized?.tags || [],
        detectedDates: normalized?.importantDates || [],
        extractedContent: normalized?.text || '',
        summary: normalized?.summary || '',
        processingStatus: 'ready-for-review',
        processingError: normalized?.sourceMetadata?.platformMessage || null,
        origin: 'imported-from-url',
        reviewSuggested: true,
      }, true);
      setMessage('Saved to Shared Inbox for review.');
    } catch (error) {
      setMessage(error.message || 'Could not add this link to Shared Inbox.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="date-modal-backdrop" role="presentation">
      <div className="import-link-modal" role="dialog" aria-modal="true" aria-label="Import and analyse website">
        <div className="modal-head">
          <div>
            <p className="eyebrow">ADD FROM URL</p>
            <h2>Import and Analyse Website</h2>
            <span>Public pages are analysed by the backend and saved only after your confirmation.</span>
          </div>
          <button type="button" className="icon-button refined" aria-label="Close import" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="source-import-row compact-url-row">
          <label className="field-label">Public URL
            <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste a public webpage, job post, scholarship, conference, journal, grant, paper or project link..." />
          </label>
          <button type="button" className="button primary" disabled={working || !url.trim()} onClick={() => analyse()}><Link2 size={16} /> Analyse Link</button>
          <button type="button" className="button secondary" disabled={working} onClick={onClose}>Cancel</button>
        </div>
        {working ? (
          <div className="link-import-progress">
            {LINK_IMPORT_STAGES.map((stage, index) => <span key={stage} className={index < stageIndex ? 'done' : index === stageIndex ? 'active' : ''}>{stage}</span>)}
            <div className="modal-actions compact"><button type="button" className="button secondary" onClick={cancelAnalysis}>Cancel analysis</button></div>
          </div>
        ) : null}
        {message ? <p className={message.includes('ready') || message.includes('Saving') || message.includes('Saved') ? 'status-message' : 'form-error'}>{message}</p> : null}
        {normalized ? (
          <section className="url-preview-card">
            <div className="url-preview-head">
              <span className="category-pill">{normalized.category || 'Uncategorised'}</span>
              <span className="small-note">Extraction confidence {Math.round((normalized.extractionConfidence || 0) * 100)}%</span>
            </div>
            {normalized.sourceMetadata?.platformMessage ? <p className="form-error">{normalized.sourceMetadata.platformMessage}</p> : null}
            {normalized.duplicateWarning ? <p className="form-error">{normalized.duplicateWarning}</p> : null}
            <h3>{normalized.title}</h3>
            <div className="url-preview-details">
              <article><span>Source website</span><strong>{normalized.sourceWebsite || 'Not detected'}</strong></article>
              <article><span>Institution or organisation</span><strong>{normalized.institution || 'Not detected'}</strong></article>
              <article><span>Suggested subcategory</span><strong>{normalized.subcategory || 'Not detected'}</strong></article>
              <article><span>Location</span><strong>{normalized.location || 'Not detected'}</strong></article>
              <article><span>Application or submission URL</span><strong>{normalized.applicationUrl || 'Not detected'}</strong></article>
              <article><span>Funding amount</span><strong>{normalized.funding || 'Not explicitly available'}</strong></article>
            </div>
            <p>{normalized.summary || 'No summary extracted.'}</p>
            {normalized.eligibility ? <div className="preview-text-block"><strong>Eligibility</strong><p>{normalized.eligibility}</p></div> : null}
            <div className="tag-row">{normalized.tags.slice(0, 8).map((tag) => <span key={tag}>{tag}</span>)}</div>
            <div className="preview-date-list">
              {(normalized.importantDates || []).length ? normalized.importantDates.slice(0, 8).map((date) => (
                <article key={date.id || `${date.type}-${date.date}`}>
                  <strong>{date.type || 'Detected date'}</strong>
                  <span>{date.date || 'Needs confirmation'}{date.uncertain ? ' - Needs confirmation' : ''}</span>
                </article>
              )) : <article><strong>No deadline published</strong><span>The record can still be saved.</span></article>}
            </div>
            <div className="modal-actions">
              <button type="button" className="button primary" disabled={working} onClick={() => saveImported()}>Save to Library</button>
              <button type="button" className="button secondary" disabled={working} onClick={() => saveImported({ startApplication: true })}>Save and Start Application</button>
              <button type="button" className="button secondary" disabled={working} onClick={() => editBeforeSaving()}>Edit Before Saving</button>
              <button type="button" className="button secondary" disabled={working} onClick={() => editBeforeSaving({ focusCategory: true })}>Change Category</button>
              <button type="button" className="button secondary" disabled={working} onClick={addToSharedInbox}>Add to Shared Inbox</button>
              <button type="button" className="button secondary" disabled={working || !lastRequest} onClick={() => analyse(lastRequest)}>Reanalyse</button>
              <button type="button" className="button secondary" disabled={working} onClick={onClose}>Cancel</button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}