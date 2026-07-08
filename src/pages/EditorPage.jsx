import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import { Icon } from '../components/Branding';
import PdfViewer from '../components/PdfViewer';
import RichEditor from '../components/RichEditor';
import UnlockPanel from '../components/UnlockPanel';
import { useAuth } from '../context/AuthContext';
import { googleApiKey, googleApprovedEmail, googleDriveFolderId, googleOAuthClientId } from '../firebase';
import {
  deleteAttachmentFile,
  downloadAttachmentBlob,
  attachmentFileKey,
  formatAttachmentSize,
  getAttachmentKind,
  MAX_ATTACHMENT_BYTES,
  uploadAttachmentFile,
} from '../services/attachments';
import { extractContentFromFile } from '../services/fileExtraction';
import {
  approximateFirestorePayloadBytes,
  createPageId,
  getFirebaseErrorCode,
  getFirestoreSaveErrorMessage,
  removePage,
  savePage,
} from '../services/pages';
import { importUrlContent, validateImportUrl } from '../services/urlImport';
import { canUseGooglePicker, disconnectDrive, getGooglePickerUnavailableMessage, pickDriveFiles, requestDriveAccess, resolveDriveFolder } from '../services/googleDrive';
import { decryptObject, encryptObject } from '../utils/crypto';
import {
  extractWikiLinks,
  getSourceDomain,
  htmlToText,
  sanitizeHtml,
} from '../utils/content';
import { downloadIcs, googleCalendarUrl } from '../utils/calendar';
import { DATE_ANALYSIS_VERSION, deduplicateDates, formatDetectedDate, migrateLegacyPageDates } from '../utils/dates';
import { detectExternalUrls, readAutoEnrichPastedLinksMode } from '../utils/sourceLinks';
import { categoryEntryType, PRELOAD_KEY as EDITOR_PRELOAD_KEY } from '../utils/manualEntry';
import {
  CATEGORY_OPTIONS,
  deadlineStatus,
  detectImportantDates,
  generateSmartMetadata,
  mergeTags,
  splitTagsText,
} from '../utils/intelligence';

const EMPTY_FORM = {
  title: '',
  category: '',
  tagsText: '',
  sourceUrl: '',
  summary: '',
  html: '<p></p>',
};

const EMPTY_SOURCE_METADATA = {
  sourceName: '',
  author: '',
  publicationDate: '',
  description: '',
  canonicalUrl: '',
  originalUrl: '',
  resolvedUrl: '',
  publisher: '',
  journalTitle: '',
  institution: '',
  conference: '',
  funder: '',
  applicationUrl: '',
  lastChecked: '',
  enrichmentStatus: '',
  enrichmentMessage: '',
};

const EMPTY_OPPORTUNITY_DETAILS = {
  institution: '',
  department: '',
  laboratory: '',
  principalInvestigator: '',
  conferenceName: '',
  venue: '',
  country: '',
  location: '',
  remoteStatus: '',
  applicationUrl: '',
  eligibility: '',
  funding: '',
  contactPerson: '',
  contactEmail: '',
  notes: '',
};

const OPPORTUNITY_FIELD_LABELS = {
  institution: 'Institution',
  department: 'Department or laboratory',
  laboratory: 'Laboratory',
  principalInvestigator: 'Principal investigator',
  conferenceName: 'Conference name',
  venue: 'Venue',
  country: 'Country',
  location: 'Location',
  remoteStatus: 'Remote status',
  applicationUrl: 'Application URL',
  eligibility: 'Eligibility',
  funding: 'Funding or salary',
  contactPerson: 'Contact person',
  contactEmail: 'Contact email',
  notes: 'Notes',
  problem: 'Problem',
  proposedSystem: 'Proposed product or system',
  intendedUsers: 'Intended users',
  possibleFeatures: 'Possible features',
  technologies: 'Technologies',
  relatedSourcePost: 'Related source post',
  feasibilityNotes: 'Feasibility notes',
  priority: 'Priority',
  projectStatus: 'Status',
  researchProblem: 'Research problem',
  researchGap: 'Research gap',
  hypothesis: 'Hypothesis',
  proposedMethod: 'Proposed method',
  dataset: 'Dataset',
  experiments: 'Experiments',
  targetVenue: 'Target venue',
  supportingSources: 'Supporting sources',
};

const LONG_OPPORTUNITY_FIELDS = new Set(['eligibility', 'funding', 'notes', 'problem', 'proposedSystem', 'intendedUsers', 'possibleFeatures', 'technologies', 'relatedSourcePost', 'feasibilityNotes', 'researchProblem', 'researchGap', 'hypothesis', 'proposedMethod', 'dataset', 'experiments', 'targetVenue', 'supportingSources']);
const URL_OPPORTUNITY_FIELDS = new Set(['applicationUrl']);
const EMAIL_OPPORTUNITY_FIELDS = new Set(['contactEmail']);

const SUPPORTED_FORMATS = 'PDF, DOC, DOCX, TXT, Markdown, CSV, ZIP, PNG, JPG/JPEG and WEBP';
const FILE_ACCEPT = '.pdf,.doc,.docx,.txt,.md,.markdown,.csv,.zip,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,application/zip,image/png,image/jpeg,image/webp';
const DRAFT_STORAGE_PREFIX = 'knowledge-vault:editor-draft';
const DRAFT_SAVE_DELAY_MS = 500;
const FIRESTORE_WARN_BYTES = 800 * 1024;
const FIRESTORE_BLOCK_BYTES = 950 * 1024;
const PAGE_TOO_LARGE_MESSAGE = 'This page is too large for one Firestore document. Split it into multiple knowledge pages.';
const DOCUMENT_SIZE_ERROR_CODE = 'document-size-exceeded';
const DRAFT_PRELOAD_KEY = EDITOR_PRELOAD_KEY;

const SOURCE_ENRICHMENT_LABELS = {
  'not-started': 'Not started',
  'link-detected': 'Link detected',
  resolving: 'Resolving link',
  reading: 'Reading source',
  enriched: 'Enriched successfully',
  partial: 'Partially enriched',
  blocked: 'Source blocked',
  failed: 'Failed',
};

const EMPTY_SOURCE_ENRICHMENT = {
  status: 'not-started',
  message: '',
  originalUrl: '',
  resolvedUrl: '',
  canonicalUrl: '',
  sourceName: '',
  lastChecked: '',
  suggestedTitle: '',
  conflicts: [],
};

function sourceStatusLabel(status = 'not-started') {
  return SOURCE_ENRICHMENT_LABELS[status] || SOURCE_ENRICHMENT_LABELS['not-started'];
}

function inferPublisherFromJournal(journalTitle = '') {
  return /acm transactions on multimedia computing/i.test(journalTitle)
    ? 'Association for Computing Machinery'
    : '';
}
function isLinkedInUrl(value = '') {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return host === 'lnkd.in' || host.endsWith('linkedin.com');
  } catch {
    return false;
  }
}
function cleanVisibleText(value = '') {
  return String(value).replace(/<!--\s*SOURCE-CONTENT-(BEGIN|END)\s*-->/gi, '').trim();
}

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function htmlFromText(text = '') {
  const blocks = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  return blocks.length
    ? blocks.map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('')
    : '<p></p>';
}

function appendHtml(currentHtml = '<p></p>', nextHtml = '') {
  const prefix = htmlToText(currentHtml) ? currentHtml : '';
  return sanitizeHtml(`${prefix}${prefix ? '<hr>' : ''}${nextHtml || '<p></p>'}`);
}

function createUploadRow(file) {
  return {
    localId: crypto.randomUUID(),
    file,
    name: file.name || 'Untitled file',
    type: file.type || 'application/octet-stream',
    size: file.size || 0,
    kind: getAttachmentKind(file),
    progress: 0,
    status: 'Queued',
  };
}

function createStoredRow(file) {
  return {
    ...file,
    localId: attachmentFileKey(file),
    kind: getAttachmentKind(file),
    progress: 100,
    status: 'Uploaded',
  };
}

function fileRowKey(file) {
  return file.localId || attachmentFileKey(file);
}

function getInitialConnectionStatus() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Offline';
  return 'Online';
}

function getDraftStorageKey(uid, pageId) {
  return `${DRAFT_STORAGE_PREFIX}:${uid}:${pageId}`;
}

function readStoredDraft(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !parsed.form) return null;
    return parsed;
  } catch (error) {
    console.warn('[EditorPage] Could not read local editor draft:', { error: error?.message });
    return null;
  }
}
function writeStoredDraft(key, draft) {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch (error) {
    console.warn('[EditorPage] Could not save local editor draft:', { error: error?.message });
    return false;
  }
}

function clearStoredDraft(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('[EditorPage] Could not clear local editor draft:', { error: error?.message });
  }
}

function hasSourceMetadata(metadata = {}) {
  return Object.values(metadata || {}).some((value) => String(value || '').trim());
}

function hasOpportunityDetails(details = {}) {
  return Object.values(details || {}).some((value) => String(value || '').trim());
}

function hasDraftContent(form, attachments, inlineFiles, importantDates, sourceMetadata, opportunityDetails = {}) {
  return Boolean(
    form.title.trim()
    || form.category.trim()
    || form.tagsText.trim()
    || form.sourceUrl.trim()
    || form.summary.trim()
    || htmlToText(form.html).trim()
    || attachments.length
    || inlineFiles.length
    || importantDates.length
    || hasSourceMetadata(sourceMetadata)
    || hasOpportunityDetails(opportunityDetails),
  );
}

function formatBytes(bytes) {
  return `${Math.ceil(bytes / 1024)} KB`;
}

function formatDraftTime(value) {
  if (!value) return 'recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'recently';
  return date.toLocaleString();
}

function createDocumentSizeError() {
  const error = new Error(PAGE_TOO_LARGE_MESSAGE);
  error.code = DOCUMENT_SIZE_ERROR_CODE;
  return error;
}

function isDocumentSizeError(error) {
  return getFirebaseErrorCode(error) === DOCUMENT_SIZE_ERROR_CODE;
}

function connectionStatusClass(status) {
  return status.toLowerCase().replace(/\s+/g, '-');
}

function mergeImportantDates(existing = [], detected = [], pageId = 'draft') {
  return deduplicateDates(existing, detected, { pageId }).map((item) => ({ ...item, status: deadlineStatus(item) }));
}

function sourceMetadataFromImport(imported = {}, sourceUrl = '') {
  const metadata = imported.metadata || {};
  const resolvedUrl = metadata.resolvedUrl || imported.resolvedUrl || imported.finalUrl || imported.url || sourceUrl;
  const canonicalUrl = metadata.canonicalUrl || imported.canonicalUrl || resolvedUrl || sourceUrl;
  return {
    sourceName: metadata.sourceName || metadata.siteName || metadata.publisher || (canonicalUrl ? getSourceDomain(canonicalUrl) : ''),
    author: metadata.author || '',
    publicationDate: metadata.publicationDate || metadata.publishedTime || metadata.datePublished || '',
    description: metadata.description || imported.description || '',
    canonicalUrl,
    originalUrl: metadata.originalUrl || imported.originalUrl || sourceUrl,
    resolvedUrl,
    publisher: metadata.publisher || '',
    journalTitle: metadata.journal || metadata.journalTitle || imported.journalTitle || '',
    institution: metadata.institution || imported.institution || '',
    conference: metadata.conference || imported.conference || '',
    funder: metadata.funder || imported.funder || '',
    applicationUrl: metadata.applicationUrl || imported.applicationUrl || '',
    lastChecked: imported.checkedAt || new Date().toISOString(),
    enrichmentStatus: imported.partial || imported.extractionBlocked ? 'partial' : 'enriched',
    enrichmentMessage: imported.metadata?.platformMessage || imported.summary || '',
  };
}

function sourceEnrichmentFromMetadata(metadata = {}, fallbackUrl = '') {
  return {
    ...EMPTY_SOURCE_ENRICHMENT,
    status: metadata.enrichmentStatus || (metadata.canonicalUrl || metadata.resolvedUrl ? 'enriched' : 'not-started'),
    message: metadata.enrichmentMessage || '',
    originalUrl: metadata.originalUrl || fallbackUrl || '',
    resolvedUrl: metadata.resolvedUrl || '',
    canonicalUrl: metadata.canonicalUrl || '',
    sourceName: metadata.sourceName || metadata.publisher || '',
    lastChecked: metadata.lastChecked || '',
  };
}

function dateConflictKey(date = {}) {
  return String(date.type || date.title || '').trim().toLowerCase();
}

function findDateConflicts(existingDates = [], sourceDates = []) {
  const existingByType = new Map();
  existingDates.forEach((date) => {
    if (!date?.date) return;
    const key = dateConflictKey(date);
    if (key && !existingByType.has(key)) existingByType.set(key, date);
  });
  return sourceDates
    .filter((date) => date?.date)
    .map((date) => ({ pasted: existingByType.get(dateConflictKey(date)), official: date }))
    .filter(({ pasted, official }) => pasted && pasted.date !== official.date)
    .map(({ pasted, official }) => ({ id: `${dateConflictKey(official)}:${pasted.date}:${official.date}`, pasted, official }));
}
function makeDeadlinePage(pageId, form, sourceMetadata) {
  return {
    id: pageId,
    title: form.title || 'Knowledge page',
    sourceUrl: form.sourceUrl || sourceMetadata?.canonicalUrl || '',
  };
}

function statusTextFromState(saveStatus, hasLocalChanges) {
  if (saveStatus) return saveStatus;
  return hasLocalChanges ? 'Unsaved changes' : 'Saved';
}

export default function EditorPage({ routeId, pages, pagesLoaded }) {
  const { user } = useAuth();
  const fileInput = useRef(null);
  const importControllerRef = useRef(null);
  const autoEnrichedSourceRef = useRef('');
  const uploadControllersRef = useRef(new Map());
  const leaveWarningRef = useRef('');
  const isNew = routeId === 'new' || String(routeId || '').startsWith('new-');
  const pageId = useMemo(() => (isNew ? createPageId(user.uid) : routeId), [isNew, routeId, user.uid]);
  const draftKey = useMemo(() => getDraftStorageKey(user.uid, pageId), [pageId, user.uid]);
  const existing = pages.find((page) => page.id === routeId);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sourceMetadata, setSourceMetadata] = useState(EMPTY_SOURCE_METADATA);
  const [sourceEnrichment, setSourceEnrichment] = useState(EMPTY_SOURCE_ENRICHMENT);
  const [detectedSourceUrls, setDetectedSourceUrls] = useState([]);
  const [opportunityDetails, setOpportunityDetails] = useState(EMPTY_OPPORTUNITY_DETAILS);
  const [recordOrigin, setRecordOrigin] = useState('manually-added');
  const [importantDates, setImportantDates] = useState([]);
  const [autoCategory, setAutoCategory] = useState({ category: '', confidence: 0 });
  const [categoryManuallyEdited, setCategoryManuallyEdited] = useState(false);
  const [secure, setSecure] = useState(false);
  const [unlocked, setUnlocked] = useState(isNew);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [inlineFiles, setInlineFiles] = useState([]);
  const [uploadRows, setUploadRows] = useState([]);
  const [driveSession, setDriveSession] = useState(null);
  const [driveFolder, setDriveFolder] = useState(null);
  const [driveMessage, setDriveMessage] = useState('');
  const [driveLinkDialogOpen, setDriveLinkDialogOpen] = useState(false);
  const [driveLinkForm, setDriveLinkForm] = useState({ url: '', title: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState('Saved');
  const [importMessage, setImportMessage] = useState('');
  const [lastDetectedDates, setLastDetectedDates] = useState([]);
  const [ignoredDateSuggestions, setIgnoredDateSuggestions] = useState(() => new Set());
  const [editingDateIds, setEditingDateIds] = useState(() => new Set());
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [payloadWarning, setPayloadWarning] = useState('');
  const [connectionStatus, setConnectionStatus] = useState(getInitialConnectionStatus);
  const [draftPrompt, setDraftPrompt] = useState(null);
  const [dateReanalysisPreview, setDateReanalysisPreview] = useState(null);
  const [draftAutosaveReady, setDraftAutosaveReady] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);

  useEffect(() => {
    function updateConnectionStatus() {
      setConnectionStatus(navigator.onLine ? 'Online' : 'Offline');
    }

    updateConnectionStatus();
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    return () => {
      window.removeEventListener('online', updateConnectionStatus);
      window.removeEventListener('offline', updateConnectionStatus);
    };
  }, []);

  useEffect(() => () => {
    importControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    function handleBeforeUnload(event) {
      const busy = uploadRows.some((row) => row.status === 'Uploading');
      if (!hasLocalChanges && !busy) return;
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasLocalChanges, uploadRows]);
  useEffect(() => {
    if (isNew) {
      const preload = (() => {
        try {
          const raw = localStorage.getItem(DRAFT_PRELOAD_KEY);
          if (!raw) return null;
          localStorage.removeItem(DRAFT_PRELOAD_KEY);
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })();
      setForm({
        ...EMPTY_FORM,
        title: preload?.title || '',
        category: preload?.category || '',
        tagsText: preload?.tagsText || '',
        sourceUrl: preload?.sourceUrl || '',
        summary: cleanVisibleText(preload?.summary || ''),
        html: preload?.html || '<p></p>',
      });
      setSourceMetadata(preload?.sourceMetadata || EMPTY_SOURCE_METADATA);
      setSourceEnrichment(sourceEnrichmentFromMetadata(preload?.sourceMetadata || EMPTY_SOURCE_METADATA, preload?.sourceUrl || ''));
      setDetectedSourceUrls([]);
      autoEnrichedSourceRef.current = preload?.sourceUrl || '';
      setOpportunityDetails({ ...EMPTY_OPPORTUNITY_DETAILS, ...(preload?.opportunityDetails || {}) });
      setRecordOrigin(preload?.origin || 'manually-added');
      setImportantDates(preload?.importantDates || []);
      setSecure(Boolean(preload?.secure));
      setUnlocked(true);
      setAttachments([]);
      setInlineFiles([]);
      setUploadRows([]);
      setMessage('');
      setImportMessage('');
      setLastDetectedDates([]);
      setIgnoredDateSuggestions(new Set());
      setEditingDateIds(new Set());
      setPayloadWarning('');
      setSaveStatus('Saved');
      setCategoryManuallyEdited(Boolean(preload?.category));
      setAutoCategory({ category: preload?.category || '', confidence: 0 });
      setHasLocalChanges(false);
      setEditorRevision((current) => current + 1);
      return;
    }
    if (!existing) return;
    setMessage('');
    setImportMessage('');
    setLastDetectedDates([]);
    setEditingDateIds(new Set());
    setPayloadWarning('');
    setHasLocalChanges(false);
    setSaveStatus('Saved');
    setSecure(Boolean(existing.secure));
    setUploadRows([]);
    setAutoCategory({ category: existing.category || '', confidence: existing.categoryConfidence || 0 });
    setCategoryManuallyEdited(false);
    if (existing.secure) {
      setUnlocked(false);
      setForm(EMPTY_FORM);
      setSourceMetadata(EMPTY_SOURCE_METADATA);
      setSourceEnrichment(EMPTY_SOURCE_ENRICHMENT);
      setDetectedSourceUrls([]);
      autoEnrichedSourceRef.current = '';
      setOpportunityDetails(EMPTY_OPPORTUNITY_DETAILS);
      setRecordOrigin(existing.origin || existing.createdOrigin || 'manually-added');
      setImportantDates([]);
      setAttachments([]);
      setInlineFiles([]);
      setEditorRevision((current) => current + 1);
    } else {
      setUnlocked(true);
      setForm({
        title: existing.title || '',
        category: existing.category || '',
        tagsText: (existing.tags || []).join(', '),
        sourceUrl: existing.sourceUrl || '',
        summary: cleanVisibleText(existing.summary || ''),
        html: existing.html || '<p></p>',
      });
      setSourceMetadata(existing.sourceMetadata || EMPTY_SOURCE_METADATA);
      setSourceEnrichment(sourceEnrichmentFromMetadata(existing.sourceMetadata || EMPTY_SOURCE_METADATA, existing.sourceUrl || ''));
      setDetectedSourceUrls([]);
      autoEnrichedSourceRef.current = existing.sourceUrl || existing.sourceMetadata?.originalUrl || '';
      setOpportunityDetails({ ...EMPTY_OPPORTUNITY_DETAILS, ...(existing.opportunityDetails || {}) });
      setRecordOrigin(existing.origin || existing.createdOrigin || 'manually-added');
      const migratedDates = migrateLegacyPageDates(existing);
      setImportantDates(migratedDates.importantDates || existing.importantDates || []);
      setLastDetectedDates((migratedDates.importantDates || []).filter((item) => item.detectedAutomatically || item.source === 'automatic').slice(0, 4));
      setAttachments(existing.attachments || []);
      setInlineFiles(existing.inlineFiles || []);
      setEditorRevision((current) => current + 1);
    }
  }, [existing?.id, isNew]);

  useEffect(() => {
    const storedDraft = readStoredDraft(draftKey);
    setDraftPrompt(storedDraft);
    setDraftSavedAt(storedDraft?.savedAt || null);
    setDraftAutosaveReady(!storedDraft);
  }, [draftKey]);

  useEffect(() => {
    if (!draftAutosaveReady || !hasLocalChanges) return undefined;

    const timeoutId = window.setTimeout(() => {
      if (!hasDraftContent(form, attachments, inlineFiles, importantDates, sourceMetadata, opportunityDetails)) {
        clearStoredDraft(draftKey);
        setDraftSavedAt(null);
        return;
      }

      const savedAt = new Date().toISOString();
      const saved = writeStoredDraft(draftKey, {
        version: 1,
        pageId,
        routeId,
        secure,
        form,
        attachments,
        inlineFiles,
        importantDates,
        sourceMetadata,
        opportunityDetails,
        recordOrigin,
        categoryManuallyEdited,
        savedAt,
      });
      if (saved) setDraftSavedAt(savedAt);
    }, DRAFT_SAVE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [attachments, categoryManuallyEdited, draftAutosaveReady, draftKey, form, hasLocalChanges, importantDates, inlineFiles, opportunityDetails, pageId, recordOrigin, routeId, secure, sourceMetadata]);

  useEffect(() => {
    if (!unlocked || !hasLocalChanges) return undefined;
    const timeoutId = window.setTimeout(() => {
      const metadata = generateSmartMetadata({
        pageId,
        title: form.title,
        html: form.html,
        sourceUrl: form.sourceUrl,
        summary: form.summary,
        tagsText: form.tagsText,
        sourceMetadata,
        category: form.category,
        tags: splitTagsText(form.tagsText),
        fileName: attachments.map((item) => item.name || item.originalName).filter(Boolean).join(' '),
      });
      setAutoCategory({ category: metadata.category, confidence: metadata.categoryConfidence });
      setForm((current) => {
        const manualTags = splitTagsText(current.tagsText);
        const nextTags = mergeTags(manualTags, metadata.tags).join(', ');
        const shouldSetCategory = !categoryManuallyEdited || !current.category.trim() || current.category === 'Uncategorised';
        const next = {
          ...current,
          tagsText: nextTags || current.tagsText,
          category: shouldSetCategory ? metadata.category : current.category,
          summary: current.summary.trim() ? current.summary : metadata.summary,
        };
        return JSON.stringify(next) === JSON.stringify(current) ? current : next;
      });
      if (metadata.journalTitle) {
        setSourceMetadata((current) => {
          const next = {
            ...current,
            journalTitle: current.journalTitle || metadata.journalTitle,
            publisher: current.publisher || inferPublisherFromJournal(metadata.journalTitle),
          };
          return JSON.stringify(next) === JSON.stringify(current) ? current : next;
        });
      }
      setLastDetectedDates(metadata.importantDates);
      setImportantDates((current) => mergeImportantDates(current, metadata.importantDates, pageId));
    }, 900);
    return () => window.clearTimeout(timeoutId);
  }, [attachments, categoryManuallyEdited, form.category, form.html, form.sourceUrl, form.summary, form.tagsText, form.title, hasLocalChanges, pageId, sourceMetadata, unlocked]);

  useEffect(() => {
    if (!unlocked || secure) return undefined;
    const timeoutId = window.setTimeout(() => {
      const urls = detectExternalUrls(htmlToText(form.html));
      setDetectedSourceUrls(urls);
      if (!urls.length) return;
      if (urls.length > 1) {
        setSourceEnrichment((current) => ({
          ...current,
          status: current.status === 'not-started' ? 'link-detected' : current.status,
          message: 'Multiple source links detected. Choose the official source to enrich.',
        }));
        return;
      }

      const [detectedUrl] = urls;
      if (!form.sourceUrl.trim()) {
        markDirty();
        setForm((current) => ({ ...current, sourceUrl: detectedUrl }));
      }
      if (autoEnrichedSourceRef.current === detectedUrl || importing) return;
      autoEnrichedSourceRef.current = detectedUrl;
      setSourceEnrichment((current) => ({
        ...current,
        status: 'link-detected',
        message: 'Source link detected',
        originalUrl: detectedUrl,
      }));
      const mode = readAutoEnrichPastedLinksMode();
      if (mode === 'auto') {
        setImportMessage('Source link detected. Reading source...');
        enrichFromSourceUrl(detectedUrl, { detected: true });
      } else {
        setImportMessage('Link detected - Import source');
      }
    }, 450);
    return () => window.clearTimeout(timeoutId);
  }, [form.html, form.sourceUrl, importing, secure, unlocked]);
  const attachmentRows = useMemo(() => {
    const queuedKeys = new Set(uploadRows.map((row) => attachmentFileKey(row)).filter(Boolean));
    const storedRows = attachments
      .filter((item) => !queuedKeys.has(attachmentFileKey(item)))
      .map(createStoredRow);
    return [...uploadRows, ...storedRows];
  }, [attachments, uploadRows]);

  const inlineRows = useMemo(() => inlineFiles.map(createStoredRow), [inlineFiles]);
  const canUploadFiles = !secure;
  const sourceFacts = useMemo(() => [
    ['Original shared URL', sourceMetadata.originalUrl || form.sourceUrl],
    ['Resolved URL', sourceMetadata.resolvedUrl],
    ['Canonical URL', sourceMetadata.canonicalUrl],
    ['Website/source name', sourceMetadata.sourceName],
    ['Publisher', sourceMetadata.publisher],
    ['Journal', sourceMetadata.journalTitle],
    ['Institution', sourceMetadata.institution],
    ['Author', sourceMetadata.author],
    ['Publication date', sourceMetadata.publicationDate],
    ['Application/submission URL', sourceMetadata.applicationUrl],
    ['Description', sourceMetadata.description],
  ].filter(([, value]) => String(value || '').trim()), [form.sourceUrl, sourceMetadata]);

  function markDirty() {
    setHasLocalChanges(true);
    setSaveStatus('Unsaved changes');
  }

  function persistCurrentDraft() {
    const savedAt = new Date().toISOString();
    const saved = writeStoredDraft(draftKey, {
      version: 1,
      pageId,
      routeId,
      secure,
      form,
      attachments,
      inlineFiles,
      importantDates,
      sourceMetadata,
      categoryManuallyEdited,
      savedAt,
    });
    if (saved) {
      setDraftSavedAt(savedAt);
      setDraftPrompt(null);
      setDraftAutosaveReady(true);
    }
  }

  const update = (name, value) => {
    markDirty();
    setForm((current) => ({ ...current, [name]: value }));
  };

  function updateCategory(value) {
    setCategoryManuallyEdited(true);
    update('category', value);
  }

  function updateSourceMetadata(name, value) {
    markDirty();
    setSourceMetadata((current) => ({ ...current, [name]: value }));
  }

  function updateOpportunityDetail(name, value) {
    markDirty();
    setOpportunityDetails((current) => ({ ...current, [name]: value }));
  }

  const updateUploadRow = (localId, patch) => {
    setUploadRows((current) => current.map((row) => (row.localId === localId ? { ...row, ...patch } : row)));
  };

  function missingDriveConfig() {
    const items = [];
    if (!googleOAuthClientId) items.push('Google OAuth Client ID');
    if (!googleDriveFolderId) items.push('Google Drive folder ID');
    if (!googleApprovedEmail) items.push('Approved Google account');
    return items;
  }

  function isDriveConfigured() {
    return Boolean(googleOAuthClientId && googleDriveFolderId && googleApprovedEmail);
  }

  async function ensureDriveConnection({ forcePrompt = false, prompt = '' } = {}) {
    const session = await requestDriveAccess({ forcePrompt, prompt });
    const folder = await resolveDriveFolder(session.accessToken, driveFolder?.id || googleDriveFolderId || undefined);
    setDriveSession(session);
    setDriveFolder(folder);
    return { session, folder };
  }

  async function connectDrive({ forcePrompt = false, prompt = '' } = {}) {
    if (!googleOAuthClientId) {
      setDriveMessage('Google Drive setup required before connecting.');
      return null;
    }
    try {
      const result = await ensureDriveConnection({ forcePrompt, prompt });
      setDriveMessage(`Connected as ${result.session.user?.emailAddress || result.session.user?.displayName || 'Google Drive'}.`);
      return result;
    } catch (error) {
      setDriveMessage(error.message || 'Could not connect Google Drive.');
      throw error;
    }
  }

  async function disconnectDriveSession() {
    await disconnectDrive();
    setDriveSession(null);
    setDriveFolder(null);
    setDriveMessage('Google Drive disconnected.');
  }

  function parseDriveLink(url) {
    const value = String(url || '').trim();
    if (!value) throw new Error('Paste a Google Drive URL.');
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error('Enter a valid Google Drive URL.');
    }
    const host = parsed.hostname.toLowerCase();
    if (!host.endsWith('google.com') && !host.endsWith('googleusercontent.com')) {
      throw new Error('Only Google Drive, Docs, Sheets, Slides or folder links are allowed.');
    }
    const patterns = [
      /\/file\/d\/([^/]+)/i,
      /\/document\/d\/([^/]+)/i,
      /\/spreadsheets\/d\/([^/]+)/i,
      /\/presentation\/d\/([^/]+)/i,
      /\/folders\/([^/]+)/i,
    ];
    const fileId = patterns.map((pattern) => value.match(pattern)?.[1]).find(Boolean) || parsed.searchParams.get('id') || '';
    return {
      url: value,
      fileId,
      provider: 'google-drive-link',
      displayTitle: driveLinkForm.title.trim() || value,
      description: driveLinkForm.description.trim(),
      addedAt: new Date().toISOString(),
    };
  }

  function upsertAttachment(next) {
    setAttachments((current) => {
      const key = attachmentFileKey(next);
      const index = current.findIndex((item) => attachmentFileKey(item) === key);
      if (index === -1) return [...current, next];
      const copy = [...current];
      copy[index] = { ...copy[index], ...next };
      return copy;
    });
    markDirty();
  }

  function addDriveLink() {
    try {
      const attachment = parseDriveLink(driveLinkForm.url);
      upsertAttachment({
        provider: 'google-drive-link',
        driveFileId: attachment.fileId || '',
        originalUrl: attachment.url,
        url: attachment.url,
        name: attachment.displayTitle,
        title: attachment.displayTitle,
        description: attachment.description,
        addedAt: attachment.addedAt,
        type: 'text/uri-list',
        mimeType: 'text/uri-list',
        size: 0,
      });
      setDriveLinkDialogOpen(false);
      setDriveLinkForm({ url: '', title: '', description: '' });
      setDriveMessage('Drive link added.');
    } catch (error) {
      setDriveMessage(error.message || 'Could not add the Drive link.');
    }
  }

  async function pickExistingDriveFiles() {
    if (!canUseGooglePicker()) {
      setDriveMessage(getGooglePickerUnavailableMessage());
      return;
    }
    const result = await connectDrive();
    if (!result) return;
    try {
      const docs = await pickDriveFiles(result.session.accessToken);
      if (!docs.length) {
        setDriveMessage('Drive file selection cancelled.');
        return;
      }
      const added = docs.map((doc) => ({
        provider: 'google-drive',
        driveFileId: doc.id,
        name: doc.name,
        originalName: doc.name,
        driveName: doc.name,
        type: doc.mimeType || 'application/octet-stream',
        mimeType: doc.mimeType || 'application/octet-stream',
        size: Number(doc.size || 0),
        url: doc.webViewLink || `https://drive.google.com/file/d/${doc.id}/view`,
        webViewLink: doc.webViewLink || `https://drive.google.com/file/d/${doc.id}/view`,
        iconLink: doc.iconLink || '',
        thumbnailLink: doc.thumbnailLink || '',
        uploadedAt: new Date().toISOString(),
        pageId,
        uid: user.uid,
      }));
      setAttachments((current) => [...current, ...added]);
      markDirty();
      applyGeneratedMetadata({ fileName: added.map((item) => item.name).join(' ') });
      setDriveMessage(`Attached ${added.length} Drive file(s).`);
    } catch (error) {
      setDriveMessage(error.message || 'Could not choose files from Google Drive.');
    }
  }

  async function startComputerUpload() {
    if (!driveSession) {
      try {
        await connectDrive();
      } catch {
        return;
      }
    }
    fileInput.current?.click();
  }
  function applyGeneratedMetadata({ title, html, text, sourceUrl, fileName, summary, sourceMetadata: nextSourceMetadata = sourceMetadata } = {}) {
    const metadata = generateSmartMetadata({
      pageId,
      title: title ?? form.title,
      html: html ?? form.html,
      text,
      sourceUrl: sourceUrl ?? form.sourceUrl,
      summary: summary ?? form.summary,
      tagsText: form.tagsText,
      sourceMetadata: nextSourceMetadata,
      category: form.category,
      tags: splitTagsText(form.tagsText),
      fileName,
    });
    setAutoCategory({ category: metadata.category, confidence: metadata.categoryConfidence });
    setForm((current) => {
      const manualTags = splitTagsText(current.tagsText);
      const nextTags = mergeTags(manualTags, metadata.tags).join(', ');
      const shouldSetCategory = !categoryManuallyEdited || !current.category.trim() || current.category === 'Uncategorised';
      return {
        ...current,
        category: shouldSetCategory ? metadata.category : current.category,
        tagsText: nextTags || current.tagsText,
        summary: current.summary.trim() ? current.summary : metadata.summary,
      };
    });
    if (metadata.journalTitle) {
      setSourceMetadata((current) => {
        const next = {
          ...current,
          journalTitle: current.journalTitle || metadata.journalTitle,
          publisher: current.publisher || inferPublisherFromJournal(metadata.journalTitle),
        };
        return JSON.stringify(next) === JSON.stringify(current) ? current : next;
      });
    }
    setLastDetectedDates(metadata.importantDates);
    setImportantDates((current) => mergeImportantDates(current, metadata.importantDates, pageId));
  }

  async function unlockExisting(value) {
    const decrypted = await decryptObject(existing.encryption, value);
    setForm({
      title: decrypted.title || '',
      category: decrypted.category || 'Private Vault',
      tagsText: (decrypted.tags || []).join(', '),
      sourceUrl: decrypted.sourceUrl || '',
      summary: cleanVisibleText(decrypted.summary || ''),
      html: decrypted.html || '<p></p>',
    });
    setSourceMetadata(decrypted.sourceMetadata || EMPTY_SOURCE_METADATA);
    setSourceEnrichment(sourceEnrichmentFromMetadata(decrypted.sourceMetadata || EMPTY_SOURCE_METADATA, decrypted.sourceUrl || ''));
    setDetectedSourceUrls([]);
    autoEnrichedSourceRef.current = decrypted.sourceUrl || decrypted.sourceMetadata?.originalUrl || '';
    setImportantDates(decrypted.importantDates || []);
    setPassphrase(value);
    setUnlocked(true);
    setHasLocalChanges(false);
    setSaveStatus('Saved');
    setEditorRevision((current) => current + 1);
  }

  const handleInlineImage = useCallback(async (file) => {
    if (secure) throw new Error('Images are disabled inside encrypted secure notes.');
    const uploaded = await uploadAttachmentFile(user.uid, pageId, file);
    setInlineFiles((current) => [...current, uploaded]);
    markDirty();
    return uploaded;
  }, [pageId, secure, user.uid]);

  async function uploadSelectedFiles(files) {
    const selectedFiles = [...files];
    if (!selectedFiles.length) return;
    if (secure) {
      setMessage('Encrypted secure notes cannot have separate attachments.');
      return;
    }
    if (!driveSession) {
      try {
        await connectDrive();
      } catch (error) {
        setMessage(error.message || 'Could not connect Google Drive.');
        return;
      }
    }

    setMessage('');
    setImportMessage('');
    const rows = selectedFiles.map(createUploadRow);
    setUploadRows((current) => [...current, ...rows]);

    for (const row of rows) {
      if (row.size > MAX_ATTACHMENT_BYTES) {
        updateUploadRow(row.localId, {
          status: `File is larger than ${formatAttachmentSize(MAX_ATTACHMENT_BYTES)}.`,
          progress: 0,
          error: true,
        });
        continue;
      }

      const controller = new AbortController();
      uploadControllersRef.current.set(row.localId, controller);
      updateUploadRow(row.localId, { status: 'Uploading', progress: 1, cancelable: true, controllerId: row.localId });
      try {
        let uploaded = await uploadAttachmentFile(user.uid, pageId, row.file, (nextProgress) => {
          updateUploadRow(row.localId, {
            progress: Math.max(1, Math.min(99, nextProgress)),
            status: 'Uploading',
          });
        }, { signal: controller.signal });

        if (getAttachmentKind(row.file).key === 'zip') {
          try {
            const extracted = await extractContentFromFile(row.file);
            uploaded = { ...uploaded, zipEntries: extracted.zipEntries || [] };
          } catch (zipError) {
            console.warn('[EditorPage] ZIP listing failed:', { fileName: row.name, error: zipError?.message });
          }
        }

        const uploadedRow = {
          ...uploaded,
          localId: row.localId,
          file: row.file,
          kind: getAttachmentKind(uploaded),
          progress: 100,
          status: 'Uploaded',
        };
        setAttachments((current) => [...current, uploaded]);
        markDirty();
        applyGeneratedMetadata({ fileName: uploaded.name || uploaded.originalName });
        updateUploadRow(row.localId, uploadedRow);
      } catch (error) {
        const cancelled = /cancel/i.test(error.message || '');
        updateUploadRow(row.localId, {
          status: cancelled ? 'Cancelled' : (error.message || 'Upload failed.'),
          progress: 0,
          error: !cancelled,
          cancelled,
        });
        setMessage(cancelled ? 'Upload cancelled.' : (error.message || 'Upload failed.'));
      } finally {
        uploadControllersRef.current.delete(row.localId);
      }
    }
  }

  function cancelUploadRow(localId) {
    const controller = uploadControllersRef.current.get(localId);
    if (controller) controller.abort();
  }

  async function retryUploadRow(item) {
    setUploadRows((current) => current.filter((row) => row.localId !== item.localId));
    await uploadSelectedFiles([item.file]);
  }

  function handleAttachment(event) {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    uploadSelectedFiles(files);
  }

  function handleDrop(event) {
    event.preventDefault();
    uploadSelectedFiles(event.dataTransfer?.files || []);
  }

  function handleDragOver(event) {
    event.preventDefault();
  }

  async function removeAttachment(item, inline = false) {
    const key = fileRowKey(item);
    setUploadRows((current) => current.filter((file) => fileRowKey(file) !== key));
    if (inline) setInlineFiles((current) => current.filter((file) => attachmentFileKey(file) !== attachmentFileKey(item)));
    else setAttachments((current) => current.filter((file) => attachmentFileKey(file) !== attachmentFileKey(item)));
    markDirty();
  }

  async function deleteAttachmentFromDrive(item, inline = false) {
    const key = fileRowKey(item);
    if (!item.storagePath && !item.driveFileId) {
      await removeAttachment(item, inline);
      return;
    }
    if (!window.confirm('Delete ' + (item.name || item.originalName || 'this file') + ' from Google Drive? This cannot be undone.')) return;
    try {
      await deleteAttachmentFile(item);
      await removeAttachment(item, inline);
    } catch (error) {
      setMessage(error.message || 'Could not delete the attachment from Drive.');
    }
  }
  async function downloadAttachment(item) {
    try {
      const blob = await downloadAttachmentBlob(item);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.name || item.originalName || 'attachment';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error.message || 'Could not download the attachment.');
    }
  }

  async function openPdfInWebsite(item) {
    try {
      const blob = await downloadAttachmentBlob(item);
      const url = URL.createObjectURL(blob);
      setPreview({
        item,
        name: item.name || item.originalName || 'PDF',
        title: item.name || item.originalName || 'PDF',
        url,
      });
    } catch (error) {
      setMessage(error.message || 'Could not open the PDF.');
    }
  }
  async function extractAttachment(item) {
    setMessage('');
    try {
      let file = item.file;
      if (!file) {
        const blob = await downloadAttachmentBlob(item);
        file = new File([blob], item.name || item.originalName || 'attachment', { type: item.mimeType || item.type || blob.type });
      }
      const extracted = await extractContentFromFile(file);
      if (extracted.unavailable) {
        setMessage(extracted.message);
        return;
      }

      if (extracted.zipEntries?.length) {
        setAttachments((current) => current.map((fileItem) => (
          attachmentFileKey(fileItem) === attachmentFileKey(item) ? { ...fileItem, zipEntries: extracted.zipEntries } : fileItem
        )));
        markDirty();
      }

      const shouldAppend = window.confirm(`Extracted content from ${item.name || item.originalName || 'this file'}. Add it to the note editor?`);
      if (!shouldAppend) {
        setMessage('Extracted content was not added to the note.');
        return;
      }

      const cleanHtml = sanitizeHtml(extracted.html || htmlFromText(extracted.text));
      setForm((current) => ({
        ...current,
        html: appendHtml(current.html, cleanHtml),
        summary: current.summary.trim() ? current.summary : cleanVisibleText(extracted.summary || ''),
      }));
      setEditorRevision((current) => current + 1);
      markDirty();
      applyGeneratedMetadata({ html: cleanHtml, text: extracted.text, fileName: item.name || item.originalName, summary: extracted.summary });
      setMessage('Extracted content added to the note.');
    } catch (error) {
      setMessage(error.message || 'Could not extract content from this file.');
    }
  }

  function toggleSecure(checked) {
    if (checked && (attachments.length || inlineFiles.length || uploadRows.length || form.html.includes('<img'))) {
      window.alert('Remove Google Drive images and attachments before converting this page into an encrypted secure note.');
      return;
    }
    setSecure(checked);
    markDirty();
  }

  function regenerateTags() {
    const metadata = generateSmartMetadata({
      pageId,
      title: form.title,
      html: form.html,
      sourceUrl: form.sourceUrl,
      summary: form.summary,
      tagsText: form.tagsText,
      sourceMetadata,
      category: form.category,
      tags: splitTagsText(form.tagsText),
      fileName: attachments.map((item) => item.name || item.originalName).filter(Boolean).join(' '),
    });
    const tags = mergeTags(splitTagsText(form.tagsText), metadata.tags).join(', ');
    update('tagsText', tags);
    setAutoCategory({ category: metadata.category, confidence: metadata.categoryConfidence });
    if (!categoryManuallyEdited || !form.category.trim() || form.category === 'Uncategorised') update('category', metadata.category);
    setLastDetectedDates(metadata.importantDates);
    setImportantDates((current) => mergeImportantDates(current, metadata.importantDates, pageId));
  }

  function autoCategorise() {
    const metadata = generateSmartMetadata({
      pageId,
      title: form.title,
      html: form.html,
      sourceUrl: form.sourceUrl,
      summary: form.summary,
      tagsText: form.tagsText,
      sourceMetadata,
      category: form.category,
      tags: splitTagsText(form.tagsText),
      fileName: attachments.map((item) => item.name || item.originalName).filter(Boolean).join(' '),
    });
    setAutoCategory({ category: metadata.category, confidence: metadata.categoryConfidence });
    setCategoryManuallyEdited(false);
    setForm((current) => ({
      ...current,
      category: metadata.category,
      tagsText: mergeTags(splitTagsText(current.tagsText), metadata.tags).join(', '),
      summary: current.summary.trim() ? current.summary : metadata.summary,
    }));
    setLastDetectedDates(metadata.importantDates);
    setImportantDates((current) => mergeImportantDates(current, metadata.importantDates, pageId));
    markDirty();
  }

  function mergedSourceMetadata(current = {}, next = {}) {
    return {
      ...current,
      sourceName: current.sourceName || next.sourceName || '',
      author: current.author || next.author || '',
      publicationDate: current.publicationDate || next.publicationDate || '',
      description: current.description || next.description || '',
      canonicalUrl: next.canonicalUrl || current.canonicalUrl || '',
      originalUrl: next.originalUrl || current.originalUrl || '',
      resolvedUrl: next.resolvedUrl || current.resolvedUrl || '',
      publisher: current.publisher || next.publisher || '',
      journalTitle: current.journalTitle || next.journalTitle || '',
      institution: current.institution || next.institution || '',
      conference: current.conference || next.conference || '',
      funder: current.funder || next.funder || '',
      applicationUrl: current.applicationUrl || next.applicationUrl || '',
      lastChecked: next.lastChecked || current.lastChecked || '',
      enrichmentStatus: next.enrichmentStatus || current.enrichmentStatus || '',
      enrichmentMessage: next.enrichmentMessage || current.enrichmentMessage || '',
    };
  }

  function sourceFailureMessage(error, sourceUrl) {
    const raw = error?.message || 'Could not import this link.';
    if (/URL import endpoint is not configured/i.test(raw)) return 'Source enrichment backend is not configured.';
    if (/Sign in before source enrichment/i.test(raw)) return 'Sign in before source enrichment.';
    if (isLinkedInUrl(sourceUrl)) return 'LinkedIn did not allow complete automatic extraction. The shared text and link were saved.';
    return raw;
  }

  async function enrichFromSourceUrl(rawUrl, options = {}) {
    setMessage('');
    setImportMessage('');
    let sourceUrl;
    try {
      sourceUrl = validateImportUrl(rawUrl || form.sourceUrl);
    } catch (error) {
      setImportMessage(error.message);
      setSourceEnrichment((current) => ({ ...current, status: 'failed', message: error.message }));
      return;
    }

    const currentText = htmlToText(form.html);
    markDirty();
    setDetectedSourceUrls((current) => (current.includes(sourceUrl) ? current : [sourceUrl, ...current]));
    setForm((current) => ({ ...current, sourceUrl }));
    setSourceEnrichment((current) => ({
      ...current,
      status: 'resolving',
      message: 'Source link detected. Reading source...',
      originalUrl: sourceUrl,
    }));
    setImportMessage('Source link detected. Reading source...');

    importControllerRef.current?.abort();
    const controller = new AbortController();
    importControllerRef.current = controller;
    setImporting(true);
    try {
      setSourceEnrichment((current) => ({ ...current, status: 'reading', message: 'Reading source...', originalUrl: sourceUrl }));
      const imported = await importUrlContent(sourceUrl, { signal: controller.signal });
      const cleanHtml = sanitizeHtml(imported.html || htmlFromText(imported.text || ''));
      const importedText = imported.text || htmlToText(cleanHtml);
      const nextSourceMetadata = sourceMetadataFromImport(imported, sourceUrl);
      const combinedText = [form.title, currentText, imported.title, importedText, imported.summary, nextSourceMetadata.description].filter(Boolean).join('\n\n');
      const metadata = generateSmartMetadata({
        pageId,
        title: imported.title || form.title,
        html: form.html,
        text: combinedText,
        sourceUrl: nextSourceMetadata.canonicalUrl || nextSourceMetadata.resolvedUrl || sourceUrl,
        summary: form.summary || imported.summary || imported.description || nextSourceMetadata.description,
        tagsText: form.tagsText,
        sourceMetadata: nextSourceMetadata,
        category: form.category,
        tags: splitTagsText(form.tagsText),
      });
      const officialDates = detectImportantDates({
        pageId,
        title: imported.title || form.title,
        text: importedText,
        summary: imported.summary || imported.description || nextSourceMetadata.description,
        sourceUrl: nextSourceMetadata.canonicalUrl || nextSourceMetadata.resolvedUrl || sourceUrl,
        sourceMetadata: nextSourceMetadata,
      }, { pageId }).map((date) => ({
        ...date,
        source: 'official-source',
        sourceText: date.sourceText || date.snippet || '',
        detectedAutomatically: true,
      }));
      const detectedDates = officialDates.length ? officialDates : (metadata.importantDates || []).map((date) => ({ ...date, source: 'automatic' }));
      const conflicts = findDateConflicts(importantDates, officialDates);
      const nextStatus = imported.partial || imported.extractionBlocked ? 'partial' : 'enriched';
      const nextMessage = imported.partial || imported.extractionBlocked
        ? (imported.metadata?.platformMessage || 'LinkedIn did not allow complete automatic extraction. The shared text and link were saved.')
        : 'Source enriched. Official page retrieved.';

      setSourceMetadata((current) => mergedSourceMetadata(current, nextSourceMetadata));
      setRecordOrigin((current) => current === 'manually-added' && options.detected ? 'manually-added' : current || 'manually-added');
      setAutoCategory({ category: metadata.category, confidence: metadata.categoryConfidence });
      setLastDetectedDates(detectedDates);
      setImportantDates((current) => mergeImportantDates(current, detectedDates, pageId));
      setSourceEnrichment({
        ...EMPTY_SOURCE_ENRICHMENT,
        status: nextStatus,
        message: nextMessage,
        originalUrl: sourceUrl,
        resolvedUrl: nextSourceMetadata.resolvedUrl || '',
        canonicalUrl: nextSourceMetadata.canonicalUrl || '',
        sourceName: nextSourceMetadata.sourceName || nextSourceMetadata.publisher || '',
        lastChecked: nextSourceMetadata.lastChecked || '',
        suggestedTitle: metadata.suggestedTitle || imported.title || '',
        conflicts,
      });
      setForm((current) => {
        const manualTags = splitTagsText(current.tagsText);
        const shouldSetCategory = !categoryManuallyEdited || !current.category.trim() || current.category === 'Uncategorised';
        return {
          ...current,
          sourceUrl,
          title: current.title.trim() ? current.title : (metadata.suggestedTitle || imported.title || current.title),
          category: shouldSetCategory ? metadata.category : current.category,
          tagsText: mergeTags(manualTags, metadata.tags).join(', '),
          summary: current.summary.trim() ? current.summary : cleanVisibleText(imported.summary || metadata.summary || nextSourceMetadata.description || ''),
        };
      });
      if (metadata.journalTitle) {
        setSourceMetadata((current) => ({ ...current, journalTitle: current.journalTitle || metadata.journalTitle, publisher: current.publisher || inferPublisherFromJournal(metadata.journalTitle) }));
      }
      setImportMessage(detectedDates.length ? `${nextMessage} Detected ${detectedDates.length} important date(s).` : nextMessage);
    } catch (error) {
      if (error.name === 'AbortError') {
        setImportMessage('Import cancelled.');
        setSourceEnrichment((current) => ({ ...current, status: 'failed', message: 'Import cancelled.' }));
      } else {
        const displayMessage = sourceFailureMessage(error, sourceUrl);
        const failedStatus = /LinkedIn did not allow/i.test(displayMessage) ? 'blocked' : 'failed';
        setSourceMetadata((current) => ({
          ...current,
          originalUrl: current.originalUrl || sourceUrl,
          enrichmentStatus: failedStatus === 'blocked' ? 'partial' : failedStatus,
          enrichmentMessage: displayMessage,
          lastChecked: new Date().toISOString(),
        }));
        setSourceEnrichment((current) => ({
          ...current,
          status: failedStatus,
          message: displayMessage,
          originalUrl: sourceUrl,
          lastChecked: new Date().toISOString(),
        }));
        applyGeneratedMetadata({ sourceUrl, text: currentText, sourceMetadata: { ...sourceMetadata, originalUrl: sourceUrl } });
        setImportMessage(displayMessage);
      }
    } finally {
      importControllerRef.current = null;
      setImporting(false);
    }
  }

  function selectDetectedSourceUrl(url) {
    let sourceUrl;
    try {
      sourceUrl = validateImportUrl(url);
    } catch (error) {
      setImportMessage(error.message);
      return;
    }
    markDirty();
    setForm((current) => ({ ...current, sourceUrl }));
    setDetectedSourceUrls([sourceUrl]);
    setSourceEnrichment((current) => ({ ...current, status: 'link-detected', message: 'Source link detected', originalUrl: sourceUrl }));
    const mode = readAutoEnrichPastedLinksMode();
    if (mode === 'auto') {
      autoEnrichedSourceRef.current = sourceUrl;
      enrichFromSourceUrl(sourceUrl, { detected: true });
    } else {
      setImportMessage('Link detected - Import source');
    }
  }

  function enrichFromDetectedLink() {
    const urls = detectExternalUrls(htmlToText(form.html));
    setDetectedSourceUrls(urls);
    if (!urls.length) {
      setImportMessage('No external source URL detected in the editor content.');
      setSourceEnrichment((current) => ({ ...current, status: 'not-started', message: 'No external source URL detected.' }));
      return;
    }
    if (urls.length > 1) {
      setImportMessage('Choose a detected source link to enrich.');
      setSourceEnrichment((current) => ({ ...current, status: 'link-detected', message: 'Multiple source links detected. Choose the official source to enrich.' }));
      return;
    }
    selectDetectedSourceUrl(urls[0]);
  }

  function recheckSource() {
    const sourceUrl = form.sourceUrl || sourceMetadata.originalUrl || sourceMetadata.canonicalUrl || sourceMetadata.resolvedUrl;
    if (!sourceUrl) {
      enrichFromDetectedLink();
      return;
    }
    enrichFromSourceUrl(sourceUrl, { recheck: true });
  }

  async function importFromLink() {
    await enrichFromSourceUrl(form.sourceUrl, { manual: true });
  }

  function cancelImport() {
    importControllerRef.current?.abort();
  }

  function restoreDraft() {
    if (!draftPrompt) return;
    setForm({ ...EMPTY_FORM, ...draftPrompt.form, summary: cleanVisibleText(draftPrompt.form?.summary || '') });
    setSecure(Boolean(draftPrompt.secure));
    setAttachments(Array.isArray(draftPrompt.attachments) ? draftPrompt.attachments : []);
    setInlineFiles(Array.isArray(draftPrompt.inlineFiles) ? draftPrompt.inlineFiles : []);
    setImportantDates(Array.isArray(draftPrompt.importantDates) ? draftPrompt.importantDates : []);
    setSourceMetadata(draftPrompt.sourceMetadata || EMPTY_SOURCE_METADATA);
    setSourceEnrichment(sourceEnrichmentFromMetadata(draftPrompt.sourceMetadata || EMPTY_SOURCE_METADATA, draftPrompt.form?.sourceUrl || ''));
    setDetectedSourceUrls([]);
    autoEnrichedSourceRef.current = draftPrompt.form?.sourceUrl || draftPrompt.sourceMetadata?.originalUrl || '';
    setOpportunityDetails({ ...EMPTY_OPPORTUNITY_DETAILS, ...(draftPrompt.opportunityDetails || {}) });
    setRecordOrigin(draftPrompt.recordOrigin || 'manually-added');
    setCategoryManuallyEdited(Boolean(draftPrompt.categoryManuallyEdited));
    setUploadRows([]);
    setUnlocked(true);
    setDraftPrompt(null);
    setDraftAutosaveReady(true);
    setDraftSavedAt(draftPrompt.savedAt || null);
    setHasLocalChanges(true);
    setSaveStatus('Unsaved changes');
    setMessage('Draft restored.');
    setPayloadWarning('');
    setEditorRevision((current) => current + 1);
  }

  function discardDraft() {
    clearStoredDraft(draftKey);
    setDraftPrompt(null);
    setDraftAutosaveReady(true);
    setDraftSavedAt(null);
    setMessage('Draft discarded.');
    setPayloadWarning('');
  }

  function updateDeadline(id, patch, options = {}) {
    markDirty();
    setImportantDates((current) => current.map((item) => {
      if (item.id !== id) return item;
      const manualPatch = options.manual ? { source: 'manual', manuallyEdited: true, detectedAutomatically: false } : {};
      const next = { ...item, ...patch, ...manualPatch };
      if (patch.timeZone && !patch.timezone) next.timezone = patch.timeZone;
      if (patch.timezone && !patch.timeZone) next.timeZone = patch.timezone;
      if (patch.snippet && !patch.sourceText) next.sourceText = patch.snippet;
      if (patch.sourceText && !patch.snippet) next.snippet = patch.sourceText;
      return { ...next, status: deadlineStatus(next) };
    }));
  }

  function editDeadline(id) {
    setEditingDateIds((current) => new Set([...current, id]));
  }

  function closeDeadlineEditor(id) {
    setEditingDateIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function deleteDeadline(id) {
    markDirty();
    setImportantDates((current) => current.filter((item) => item.id !== id));
  }

  function deadlineLabel(deadline = {}) {
    return deadline.displayLabel || deadline.title || deadline.type || 'Important date';
  }

  function dateCompareKey(date = {}) {
    return [date.date || '', date.precision || date.datePrecision || '', date.year || '', date.month || '', date.day ?? '', date.time || ''].join('|');
  }

  function canReplaceInReanalysis(date = {}) {
    return !(date.source === 'manual' || date.origin === 'manual' || date.manuallyEdited);
  }

  function prepareDateReanalysis() {
    const metadata = generateSmartMetadata({
      pageId,
      title: form.title,
      html: form.html,
      sourceUrl: form.sourceUrl,
      summary: form.summary,
      tagsText: form.tagsText,
      sourceMetadata,
      category: form.category,
      tags: splitTagsText(form.tagsText),
      fileName: attachments.map((item) => item.name || item.originalName).filter(Boolean).join(' '),
    });
    const detected = metadata.importantDates || [];
    const merged = deduplicateDates(importantDates, detected, { pageId }).map((item) => ({ ...item, status: deadlineStatus(item) }));
    const changes = [];
    detected.forEach((detectedDate) => {
      const old = importantDates.find((date) => canReplaceInReanalysis(date) && dateCompareKey(date) === dateCompareKey(detectedDate));
      if (old && (old.type !== detectedDate.type || deadlineLabel(old) !== deadlineLabel(detectedDate))) {
        changes.push({ kind: 'corrected', from: old, to: detectedDate });
      } else if (!old && !importantDates.some((date) => dateCompareKey(date) === dateCompareKey(detectedDate))) {
        changes.push({ kind: 'added', to: detectedDate });
      }
    });
    setLastDetectedDates(detected);
    setDateReanalysisPreview({ detected, merged, changes });
    if (!changes.length) setMessage('Date reanalysis found no automatic corrections to apply.');
  }

  function applyDateReanalysis() {
    if (!dateReanalysisPreview) return;
    setImportantDates(finalImportantDates(dateReanalysisPreview.merged));
    setDateReanalysisPreview(null);
    markDirty();
    setMessage('Date corrections applied. Review and save the page to persist them.');
  }

  function addDeadline(typeOverride = '') {
    const template = categoryEntryType(form.category);
    const dateType = typeOverride || template.dateTypes?.[0] || 'Personal reminder';
    const next = {
      id: crypto.randomUUID(),
      type: dateType,
      title: dateType,
      date: '',
      time: '',
      endDate: '',
      endTime: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      allDay: true,
      snippet: '',
      sourceText: '',
      reminderOffsets: [0],
      source: 'manual',
      manuallyEdited: true,
      detectedAutomatically: false,
      uncertain: false,
      confirmed: true,
      completed: false,
      reminder: { inApp: true, browser: false },
      status: 'Unconfirmed',
    };
    setImportantDates((current) => [...current, next]);
    setEditingDateIds((current) => new Set([...current, next.id]));
    markDirty();
  }

  function finalImportantDates(nextDates = importantDates) {
    return nextDates.map((item) => ({
      ...item,
      title: item.title || item.type || 'Important date',
      timezone: item.timezone || item.timeZone || null,
      timeZone: item.timeZone || item.timezone || '',
      sourceText: item.sourceText || item.snippet || null,
      snippet: item.snippet || item.sourceText || '',
      allDay: item.allDay ?? !item.time,
      status: deadlineStatus(item),
    }));
  }
  async function submit(event) {
    event.preventDefault();
    const saveAction = event.nativeEvent?.submitter?.value || 'save';
    setMessage('');
    setPayloadWarning('');
    const plainText = htmlToText(form.html);
    const generated = generateSmartMetadata({
      pageId,
      title: form.title,
      html: form.html,
      sourceUrl: form.sourceUrl,
      summary: form.summary,
      tagsText: form.tagsText,
      sourceMetadata,
      category: form.category,
      tags: splitTagsText(form.tagsText),
      fileName: attachments.map((item) => item.name || item.originalName).filter(Boolean).join(' '),
    });
    const tags = mergeTags(splitTagsText(form.tagsText), generated.tags);
    const selectedCategory = form.category.trim() || generated.category || 'Uncategorised';
    const summary = cleanVisibleText(form.summary || generated.summary || plainText.slice(0, 240));
    const mergedDates = mergeImportantDates(importantDates, generated.importantDates, pageId);
    const dates = finalImportantDates(mergedDates);
    setLastDetectedDates(generated.importantDates);
    setImportantDates(dates);

    if (!form.title.trim()) return setMessage('Add a title.');
    if (!plainText && !attachments.length && !dates.length && !hasOpportunityDetails(opportunityDetails)) return setMessage('Add content, an important date, structured details or an attachment.');
    if (secure && (attachments.length || inlineFiles.length || uploadRows.some((row) => row.storagePath || row.file))) return setMessage('Remove attachments before saving an encrypted secure note.');
    if (secure && passphrase.length < 12) return setMessage('Secure notes require a passphrase of at least 12 characters.');
    if (secure && isNew && passphrase !== confirmPassphrase) return setMessage('The two passphrases do not match.');

    persistCurrentDraft();
    setSaving(true);
    setSaveStatus('Saving...');
    let payloadBytes = 0;

    try {
      console.info('[EditorPage] save started', { uid: user.uid, pageId });
      setConnectionStatus(navigator.onLine ? 'Online' : 'Offline');

      let data;
      if (secure) {
        const encryption = await encryptObject({
          title: form.title.trim(),
          category: selectedCategory,
          tags,
          sourceUrl: form.sourceUrl.trim(),
          summary,
          html: form.html,
          importantDates: dates,
          dateAnalysisVersion: DATE_ANALYSIS_VERSION,
          sourceMetadata,
          opportunityDetails,
          origin: recordOrigin || 'manually-added',
        }, passphrase);

        data = {
          secure: true,
          title: 'Locked note',
          category: 'Private Vault',
          tags: [],
          sourceUrl: '',
          sourceDomain: '',
          summary: '',
          html: '',
          plainText: '',
          wikiLinks: [],
          importantDates: [],
          sourceMetadata: null,
          attachments: [],
          inlineFiles: [],
          origin: recordOrigin || 'manually-added',
          createdOrigin: recordOrigin || 'manually-added',
          opportunityDetails: {},
          encryption,
        };
      } else {
        data = {
          secure: false,
          encryption: null,
          title: form.title.trim(),
          category: selectedCategory,
          categoryAuto: !categoryManuallyEdited,
          categoryConfidence: autoCategory.confidence || generated.categoryConfidence || 0,
          tags,
          sourceUrl: form.sourceUrl.trim(),
          sourceDomain: getSourceDomain(form.sourceUrl.trim()),
          sourceMetadata,
          summary,
          html: sanitizeHtml(form.html),
          plainText,
          wikiLinks: extractWikiLinks(plainText),
          importantDates: dates,
          dateAnalysisVersion: DATE_ANALYSIS_VERSION,
          dateAnalysisAt: new Date().toISOString(),
          dateAnalysisSummary: {
            detectedCount: dates.filter((item) => item.detectedAutomatically || item.source === 'automatic').length,
            requiringConfirmation: dates.filter((item) => item.uncertain && !item.confirmed).length,
            noDeadlineFound: !dates.some((item) => item.date && !/publication|page updated/i.test(item.type || '')),
          },
          attachments,
          inlineFiles,
          opportunityDetails,
          origin: recordOrigin || 'manually-added',
          createdOrigin: recordOrigin || 'manually-added',
        };
      }

      payloadBytes = approximateFirestorePayloadBytes(data, isNew);
      console.info('[EditorPage] save payload prepared', {
        uid: user.uid,
        pageId,
        approximatePayloadBytes: payloadBytes,
      });

      if (payloadBytes >= FIRESTORE_WARN_BYTES) {
        const warning = `This page is close to the Firestore document limit at approximately ${formatBytes(payloadBytes)}. Split it soon if it keeps growing.`;
        setPayloadWarning(warning);
        console.warn('[EditorPage] large Firestore payload warning', { pageId, approximatePayloadBytes: payloadBytes });
      }

      if (payloadBytes > FIRESTORE_BLOCK_BYTES) {
        console.warn('[EditorPage] Firestore payload blocked', { pageId, approximatePayloadBytes: payloadBytes });
        throw createDocumentSizeError();
      }

      await savePage(user.uid, pageId, data, isNew);
      clearStoredDraft(draftKey);
      setDraftSavedAt(null);
      setHasLocalChanges(false);
      setSaveStatus('Saved');
      setConnectionStatus(navigator.onLine ? 'Online' : 'Offline');
      console.info('[EditorPage] save completed', { uid: user.uid, pageId, approximatePayloadBytes: payloadBytes });
      window.setTimeout(() => {
        if (saveAction === 'save-add-another') {
          localStorage.setItem(DRAFT_PRELOAD_KEY, JSON.stringify({
            category: selectedCategory,
            tagsText: tags.join(', '),
            origin: 'manually-added',
            opportunityDetails: {},
          }));
          window.location.hash = `#/edit/new-${Date.now()}`;
          return;
        }
        if (saveAction === 'save-start-application') {
          localStorage.setItem(DRAFT_PRELOAD_KEY, JSON.stringify({
            title: `Application - ${form.title.trim()}`,
            category: 'Applications/Application Documents',
            tagsText: mergeTags(['Application'], tags).join(', '),
            sourceUrl: form.sourceUrl.trim(),
            summary: `Application workspace for ${form.title.trim()}.`,
            html: `<p>Application workspace for <a href="#/read/${pageId}">${form.title.trim()}</a>.</p>`,
            origin: 'manually-added',
            opportunityDetails: { relatedOpportunityId: pageId, institution: opportunityDetails.institution || '' },
          }));
          window.location.hash = `#/edit/new-${Date.now()}`;
          return;
        }
        window.location.hash = `#/read/${pageId}`;
      }, 350);
    } catch (error) {
      const firebaseErrorCode = getFirebaseErrorCode(error);
      console.warn('[EditorPage] save failed', {
        uid: user.uid,
        pageId,
        approximatePayloadBytes: payloadBytes,
        firebaseErrorCode,
      });
      console.warn('[EditorPage] save technical error', error);
      setSaveStatus('Save failed');
      setMessage(isDocumentSizeError(error) ? PAGE_TOO_LARGE_MESSAGE : getFirestoreSaveErrorMessage(error));
      if (!isDocumentSizeError(error)) {
        setConnectionStatus(navigator.onLine ? 'Firestore write failed' : 'Offline');
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrent() {
    if (isNew || !existing) return;
    if (!window.confirm('Delete this page permanently?')) return;
    setSaving(true);
    setSaveStatus('Saving...');
    try {
      const files = [...(existing.attachments || []), ...(existing.inlineFiles || [])];
      await Promise.allSettled(files.map((file) => deleteAttachmentFile(file)));
      await removePage(user.uid, existing.id);
      clearStoredDraft(draftKey);
      window.location.hash = '#/';
    } catch (error) {
      setMessage(error.message || 'Could not delete this page.');
      setSaveStatus('Save failed');
    } finally {
      setSaving(false);
    }
  }

  function renderFileRows(rows, inline = false) {
    if (!rows.length) return null;
    return (
      <div className="file-list upload-file-list">
        {rows.map((item) => {
          const kind = getAttachmentKind(item);
          return (
            <div className={`upload-file-row ${item.error ? 'has-error' : ''}`} key={fileRowKey(item)}>
              <div className="file-kind-badge">{kind.badge || 'FILE'}</div>
              <div className="file-summary">
                <strong>{item.name || item.originalName}</strong>
                <small>{kind.label || item.type || 'File'} - {formatAttachmentSize(item.size)}</small>
              </div>
              <div className="file-progress-cell">
                <progress value={item.progress || 0} max="100">{item.progress || 0}%</progress>
                <span>{item.status || 'Uploaded'}</span>
              </div>
              <div className="file-actions">
                {(item.storagePath || item.driveFileId || item.provider === "google-drive-link") ? <a className="text-link" href={item.webViewLink || item.url || item.originalUrl || "#"} target="_blank" rel="noreferrer">Open in Drive</a> : null}
                {(item.storagePath || item.driveFileId) && kind.readable ? <button type="button" className="text-link" onClick={() => openPdfInWebsite(item)}>Read PDF in website</button> : null}
                {(item.storagePath || item.driveFileId) ? <button type="button" className="text-link" onClick={() => extractAttachment(item)}>Extract content into note</button> : null}
                {(item.storagePath || item.driveFileId) ? <button type="button" className="text-link" onClick={() => downloadAttachment(item)}>Download</button> : null}
                {item.status === "Uploading" ? <button type="button" className="text-link" onClick={() => cancelUploadRow(item.localId)}>Cancel</button> : null}
                {(item.error || item.cancelled) ? <button type="button" className="text-link" onClick={() => retryUploadRow(item)}>Retry</button> : null}
                {(item.storagePath || item.driveFileId || item.provider === "google-drive-link") ? <button type="button" className="text-link" onClick={() => removeAttachment(item, inline)}>Remove from note</button> : null}
                {(item.storagePath || item.driveFileId) ? <button type="button" className="text-link danger-link" onClick={() => deleteAttachmentFromDrive(item, inline)}>Delete from Drive</button> : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function dateSourceLabel(deadline) {
    if (deadline.uncertain && !deadline.confirmed) return 'Needs confirmation';
    if (deadline.source === 'manual' || deadline.manuallyEdited) return 'Added manually';
    if (deadline.source === 'official-source') return 'Detected from official source';
    if (deadline.confidence === 'medium') return 'Detected automatically';
    if (deadline.detectedAutomatically || deadline.source === 'automatic') return 'Detected automatically';
    return 'Saved date';
  }

  function clearSourceConflict(conflictId) {
    setSourceEnrichment((current) => ({
      ...current,
      conflicts: (current.conflicts || []).filter((conflict) => conflict.id !== conflictId),
    }));
  }

  function useOfficialDate(conflict) {
    markDirty();
    setImportantDates((current) => {
      const filtered = current.filter((date) => {
        if (date.source === 'manual' || date.manuallyEdited) return true;
        return dateConflictKey(date) !== dateConflictKey(conflict.official);
      });
      return mergeImportantDates(filtered, [{ ...conflict.official, confirmed: true, uncertain: false }], pageId);
    });
    clearSourceConflict(conflict.id);
  }

  function keepPastedDate(conflict) {
    clearSourceConflict(conflict.id);
  }

  function saveBothDates(conflict) {
    markDirty();
    setImportantDates((current) => mergeImportantDates(current, [{ ...conflict.official, uncertain: true, confirmed: false }], pageId));
    clearSourceConflict(conflict.id);
  }

  function renderDetectedSourceChoices() {
    if (detectedSourceUrls.length <= 1) return null;
    return (
      <div className="detected-source-choice">
        <strong>Source links detected</strong>
        <span>Choose the official source to enrich.</span>
        <div className="source-choice-list">
          {detectedSourceUrls.map((url) => (
            <button type="button" className="text-link" key={url} onClick={() => selectDetectedSourceUrl(url)}>{url}</button>
          ))}
        </div>
      </div>
    );
  }

  function renderSourceEnrichmentStatus() {
    const status = sourceEnrichment.status || 'not-started';
    const originalUrl = sourceEnrichment.originalUrl || sourceMetadata.originalUrl || form.sourceUrl;
    const resolvedUrl = sourceEnrichment.resolvedUrl || sourceMetadata.resolvedUrl;
    const canonicalUrl = sourceEnrichment.canonicalUrl || sourceMetadata.canonicalUrl;
    const sourceName = sourceEnrichment.sourceName || sourceMetadata.sourceName || sourceMetadata.publisher;
    const lastChecked = sourceEnrichment.lastChecked || sourceMetadata.lastChecked;
    const searchQuery = [form.title, sourceMetadata.journalTitle, sourceEnrichment.suggestedTitle].filter(Boolean).join(' ');
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery || originalUrl || 'official source')}`;
    const enriched = status === 'enriched';
    return (
      <div className={`source-enrichment-status source-status-${status}`}>
        <div className="source-status-head">
          <div>
            <strong>Source enrichment: {sourceStatusLabel(status)}</strong>
            {enriched ? <span>Source enriched - Official page retrieved</span> : null}
            {sourceEnrichment.message ? <span>{sourceEnrichment.message}</span> : null}
          </div>
          <div className="source-status-actions">
            <button type="button" className="text-link" onClick={enrichFromDetectedLink}>Enrich from detected link</button>
            <button type="button" className="text-link" onClick={recheckSource}>Recheck source</button>
          </div>
        </div>
        {(originalUrl || resolvedUrl || canonicalUrl || sourceName || lastChecked) ? (
          <dl className="source-status-grid">
            {originalUrl ? <div><dt>Original shared URL</dt><dd>{originalUrl}</dd></div> : null}
            {resolvedUrl ? <div><dt>Resolved URL</dt><dd>{resolvedUrl}</dd></div> : null}
            {canonicalUrl ? <div><dt>Canonical URL</dt><dd>{canonicalUrl}</dd></div> : null}
            {sourceName ? <div><dt>Source website</dt><dd>{sourceName}</dd></div> : null}
            {lastChecked ? <div><dt>Last checked</dt><dd>{new Date(lastChecked).toLocaleString()}</dd></div> : null}
          </dl>
        ) : null}
        {sourceEnrichment.suggestedTitle && sourceEnrichment.suggestedTitle !== form.title ? (
          <div className="source-title-suggestion">
            <span>Suggested title</span>
            <strong>{sourceEnrichment.suggestedTitle}</strong>
            <button type="button" className="text-link" onClick={() => update('title', sourceEnrichment.suggestedTitle)}>Use suggestion</button>
          </div>
        ) : null}
        {(status === 'blocked' || status === 'partial' || status === 'failed') ? (
          <div className="source-fallback-actions">
            <button type="button" className="text-link" onClick={recheckSource}>Retry</button>
            {originalUrl ? <a className="text-link" href={originalUrl} target="_blank" rel="noreferrer">Open original</a> : null}
            <button type="button" className="text-link" onClick={() => setImportMessage('Paste the official source link in Original source URL, then choose Import from link.')}>Paste official source link</button>
            <a className="text-link" href={searchUrl} target="_blank" rel="noreferrer">Search for official source</a>
          </div>
        ) : null}
        {sourceEnrichment.conflicts?.length ? (
          <div className="source-conflict-list">
            <strong>Source date differs from pasted information</strong>
            {sourceEnrichment.conflicts.map((conflict) => (
              <article key={conflict.id}>
                <span>Pasted information: {deadlineLabel(conflict.pasted)} - {formatDetectedDate(conflict.pasted)}</span>
                <span>Official source: {deadlineLabel(conflict.official)} - {formatDetectedDate(conflict.official)}</span>
                <div className="deadline-action-row">
                  <button type="button" className="text-link" onClick={() => useOfficialDate(conflict)}>Use official date</button>
                  <button type="button" className="text-link" onClick={() => keepPastedDate(conflict)}>Keep pasted date</button>
                  <button type="button" className="text-link" onClick={() => saveBothDates(conflict)}>Save both for review</button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  function renderDetectedDateSummary() {
    if (!lastDetectedDates.length) return null;
    return (
      <div className="detected-date-summary" aria-live="polite">
        <strong>Detected dates</strong>
        {lastDetectedDates.slice(0, 4).map((deadline) => (
          <span key={deadline.id || deadline.fingerprint}>
            {deadline.displayLabel || deadline.title || deadline.type || 'Important date'} - {formatDetectedDate(deadline)}
          </span>
        ))}
      </div>
    );
  }

  function renderSmartSuggestions() {
    const metadata = generateSmartMetadata({
      pageId,
      title: form.title,
      html: form.html,
      sourceUrl: form.sourceUrl,
      summary: form.summary,
      tagsText: form.tagsText,
      sourceMetadata,
      category: form.category,
      tags: splitTagsText(form.tagsText),
      fileName: attachments.map((item) => item.name || item.originalName).filter(Boolean).join(' '),
    });
    const suggestedTags = metadata.tags.filter((tag) => !splitTagsText(form.tagsText).map((item) => item.toLowerCase()).includes(tag.toLowerCase()));
    const showTitle = metadata.suggestedTitle && metadata.suggestedTitle !== form.title;
    const showCategory = metadata.category && metadata.category !== 'Uncategorised' && metadata.category !== form.category;
    const showSummary = metadata.summary && !form.summary.trim();
    const showDates = (metadata.importantDates || []).filter((item) => item.date && !ignoredDateSuggestions.has(item.id || `${item.type}-${item.date}`)).slice(0, 4);
    if (!showTitle && !showCategory && !suggestedTags.length && !showSummary && !showDates.length) return null;
    return (
      <section className="smart-suggestions-panel">
        <h3>Smart suggestions</h3>
        {showTitle ? (
          <article>
            <span>Suggested title</span>
            <strong>{metadata.suggestedTitle}</strong>
            <button type="button" className="text-link" onClick={() => { update('title', metadata.suggestedTitle); if (metadata.journalTitle) setSourceMetadata((current) => ({ ...current, journalTitle: metadata.journalTitle, publisher: current.publisher || inferPublisherFromJournal(metadata.journalTitle) })); }}>Accept</button>
          </article>
        ) : null}
        {showCategory ? (
          <article>
            <span>Suggested category</span>
            <strong>{metadata.category}</strong>
            <button type="button" className="text-link" onClick={() => { setCategoryManuallyEdited(false); update('category', metadata.category); }}>Accept</button>
          </article>
        ) : null}
        {suggestedTags.length ? (
          <article>
            <span>Suggested tags</span>
            <strong>{suggestedTags.slice(0, 5).join(', ')}</strong>
            <button type="button" className="text-link" onClick={() => update('tagsText', mergeTags(splitTagsText(form.tagsText), metadata.tags).join(', '))}>Accept</button>
          </article>
        ) : null}
        {showSummary ? (
          <article>
            <span>Suggested summary</span>
            <strong>{metadata.summary}</strong>
            <button type="button" className="text-link" onClick={() => update('summary', metadata.summary)}>Accept</button>
          </article>
        ) : null}
        {showDates.map((date) => (
          <article key={date.id || `${date.type}-${date.date}`}>
            <span>Detected date</span>
            <strong>{date.displayLabel || date.title || date.type || 'Important date'} - {formatDetectedDate(date)}</strong>
            <button type="button" className="text-link" onClick={() => { markDirty(); setImportantDates((current) => mergeImportantDates(current, [date], pageId)); }}>Accept</button>
            <button type="button" className="text-link" onClick={() => { markDirty(); setImportantDates((current) => mergeImportantDates(current, [{ ...date, uncertain: false, confirmed: true }], pageId)); setEditingDateIds((current) => new Set([...current, date.id])); }}>Edit</button>
            <button type="button" className="text-link danger-link" onClick={() => setIgnoredDateSuggestions((current) => new Set([...current, date.id || `${date.type}-${date.date}`]))}>Ignore</button>
          </article>
        ))}
      </section>
    );
  }

  function renderOpportunityDetails() {
    const template = categoryEntryType(form.category);
    const fields = [...new Set([...(template.visibleFields || []), ...Object.keys(opportunityDetails).filter((key) => opportunityDetails[key])])]
      .filter((key) => OPPORTUNITY_FIELD_LABELS[key]);
    if (!fields.length) return null;
    return (
      <section className="manual-opportunity-panel">
        <div className="compact-section-head">
          <div>
            <h3>Manual entry details</h3>
            <p>{template.label.replace(/^Add\s+/, '')} fields are shown first. You can still use the main editor for the full announcement text.</p>
          </div>
        </div>
        <div className="manual-field-grid">
          {fields.map((field) => {
            const common = {
              value: opportunityDetails[field] || '',
              onChange: (event) => updateOpportunityDetail(field, event.target.value),
              placeholder: OPPORTUNITY_FIELD_LABELS[field],
            };
            return (
              <label key={field} className={`field-label ${LONG_OPPORTUNITY_FIELDS.has(field) ? 'full-span' : ''}`}>
                {OPPORTUNITY_FIELD_LABELS[field]}
                {LONG_OPPORTUNITY_FIELDS.has(field)
                  ? <textarea rows="3" {...common} />
                  : <input type={URL_OPPORTUNITY_FIELDS.has(field) ? 'url' : EMAIL_OPPORTUNITY_FIELDS.has(field) ? 'email' : 'text'} {...common} />}
              </label>
            );
          })}
        </div>
      </section>
    );
  }

  function renderCategoryDateShortcuts() {
    const template = categoryEntryType(form.category);
    const dateTypes = template.dateTypes || [];
    if (!dateTypes.length) return null;
    return (
      <div className="date-shortcut-row">
        {dateTypes.map((type) => <button key={type} type="button" className="text-link" onClick={() => addDeadline(type)}>+ {type}</button>)}
      </div>
    );
  }

  function renderImportantDates() {
    const pageForCalendar = makeDeadlinePage(pageId, form, sourceMetadata);
    return (
      <section className="important-dates-editor">
        <div className="compact-section-head">
          <div>
            <h3>Important dates</h3>
            <p>Dates are detected automatically from titles, content, imports, files, metadata, category and tags.</p>
          </div>
          <details className="date-menu">
            <summary aria-label="Date actions"><Icon name="menu" size={18} /></summary>
            <div className="date-menu-content">
              <button type="button" className="text-link" onClick={() => addDeadline()}>Add date manually</button>
              <button type="button" className="text-link" onClick={prepareDateReanalysis}>Reanalyse Dates</button>
            </div>
          </details>
        </div>
        {dateReanalysisPreview ? (
          <div className="date-reanalysis-panel">
            <strong>Date reanalysis preview</strong>
            {dateReanalysisPreview.changes.length ? dateReanalysisPreview.changes.map((change, index) => (
              <article key={`${change.kind}-${index}`}>
                {change.kind === 'corrected' ? (
                  <>
                    <span>Current: {deadlineLabel(change.from)} - {formatDetectedDate(change.from)}</span>
                    <span>Corrected: {deadlineLabel(change.to)} - {formatDetectedDate(change.to)}</span>
                  </>
                ) : <span>New: {deadlineLabel(change.to)} - {formatDetectedDate(change.to)}</span>}
              </article>
            )) : <p>No automatic date corrections found.</p>}
            <div className="deadline-action-row">
              <button type="button" className="button primary" disabled={!dateReanalysisPreview.changes.length} onClick={applyDateReanalysis}>Apply corrections</button>
              <button type="button" className="button secondary" onClick={() => setDateReanalysisPreview(null)}>Cancel</button>
            </div>
          </div>
        ) : null}
        {renderDetectedDateSummary()}
        {renderCategoryDateShortcuts()}
        {importantDates.length ? importantDates.map((deadline) => {
          const status = deadlineStatus(deadline);
          const isEditing = editingDateIds.has(deadline.id);
          const needsConfirmation = deadline.uncertain && !deadline.confirmed;
          if (!isEditing) {
            return (
              <article className={`detected-date-card ${status.toLowerCase().replace(/\s+/g, '-')}`} key={deadline.id}>
                <div className="detected-date-icon"><Icon name={needsConfirmation ? 'calendarClock' : 'calendar'} size={18} /></div>
                <div className="detected-date-main">
                  <strong>{needsConfirmation ? `Possible ${deadlineLabel(deadline)}` : deadlineLabel(deadline)}</strong>
                  <time dateTime={deadline.date || undefined}>{formatDetectedDate(deadline)}</time>
                  {deadline.precision === 'month' || deadline.datePrecision === 'month' ? <small>Exact date not published</small> : null}
                  <small>{dateSourceLabel(deadline)}</small>
                  {(deadline.sourceText || deadline.snippet) ? <p>{deadline.sourceText || deadline.snippet}</p> : null}
                </div>
                <div className="detected-date-actions">
                  {needsConfirmation ? <button type="button" className="text-link" onClick={() => updateDeadline(deadline.id, { confirmed: true, uncertain: false, detectionStatus: 'confirmed' })}>Confirm</button> : null}
                  <button type="button" className="text-link" onClick={() => editDeadline(deadline.id)}>Edit</button>
                  <button type="button" className="text-link danger-link" onClick={() => deleteDeadline(deadline.id)}>Remove</button>
                </div>
              </article>
            );
          }
          return (
            <article className={`date-edit-card ${status.toLowerCase().replace(/\s+/g, '-')}`} key={deadline.id}>
              <label className="field-label">Date title
                <input value={deadline.displayLabel || deadline.title || deadline.type || ''} onChange={(event) => updateDeadline(deadline.id, { displayLabel: event.target.value, title: event.target.value }, { manual: true })} />
              </label>
              <label className="field-label">Type
                <input value={deadline.type || ''} onChange={(event) => updateDeadline(deadline.id, { type: event.target.value }, { manual: true })} />
              </label>
              <div className="date-edit-grid">
                <label className="field-label">Date
                  <input type="date" value={deadline.date || ''} onChange={(event) => updateDeadline(deadline.id, { date: event.target.value, uncertain: false, confirmed: true }, { manual: true })} />
                </label>
                <label className="field-label">Time
                  <input type="time" value={deadline.time || ''} disabled={deadline.allDay === true} onChange={(event) => updateDeadline(deadline.id, { time: event.target.value, allDay: false }, { manual: true })} />
                </label>
                <label className="field-label">Time zone
                  <input value={deadline.timeZone || ''} onChange={(event) => updateDeadline(deadline.id, { timeZone: event.target.value }, { manual: true })} placeholder="IST, UTC, AoE" />
                </label>
              </div>
              <label className="switch-field"><input type="checkbox" checked={deadline.allDay ?? !deadline.time} onChange={(event) => updateDeadline(deadline.id, { allDay: event.target.checked, time: event.target.checked ? '' : deadline.time }, { manual: true })} /><span>All-day</span></label>
              <label className="field-label">Source text
                <textarea rows="2" value={deadline.sourceText || deadline.snippet || ''} onChange={(event) => updateDeadline(deadline.id, { sourceText: event.target.value, snippet: event.target.value }, { manual: true })} />
              </label>
              <div className="deadline-status-row">
                <span className="status-chip">{status}</span>
                {needsConfirmation ? <span className="status-chip warning">Needs confirmation</span> : null}
                <label><input type="checkbox" checked={Boolean(deadline.reminder?.inApp)} onChange={(event) => updateDeadline(deadline.id, { reminder: { ...(deadline.reminder || {}), inApp: event.target.checked } })} /> In-app reminder</label>
                <label><input type="checkbox" checked={Boolean(deadline.reminder?.browser)} onChange={(event) => updateDeadline(deadline.id, { reminder: { ...(deadline.reminder || {}), browser: event.target.checked } })} /> Browser reminder</label>
              </div>
              <div className="deadline-action-row">
                <button type="button" className="text-link" onClick={() => { updateDeadline(deadline.id, { confirmed: true, uncertain: false }); closeDeadlineEditor(deadline.id); }}>Confirm</button>
                <button type="button" className="text-link" onClick={() => updateDeadline(deadline.id, { completed: !deadline.completed })}>{deadline.completed ? 'Reopen' : 'Mark completed'}</button>
                {deadline.date ? <a className="text-link" href={googleCalendarUrl(deadline, pageForCalendar)} target="_blank" rel="noreferrer">Add to Google Calendar</a> : null}
                {deadline.date ? <button type="button" className="text-link" onClick={() => downloadIcs(deadline, pageForCalendar)}>Download .ics</button> : null}
                <button type="button" className="text-link" onClick={() => closeDeadlineEditor(deadline.id)}>Done</button>
                <button type="button" className="text-link danger-link" onClick={() => deleteDeadline(deadline.id)}>Remove</button>
              </div>
            </article>
          );
        }) : <p className="muted">No deadline detected. Manual date entry is available from the date actions menu.</p>}
      </section>
    );
  }
  if (!isNew && !pagesLoaded) {
    return <AppShell title="Edit page"><div className="empty-state">Loading page...</div></AppShell>;
  }

  if (!isNew && pagesLoaded && !existing) {
    return <AppShell title="Page not found"><div className="empty-state">This page does not exist.</div></AppShell>;
  }

  if (existing?.secure && !unlocked) {
    return <AppShell title="Secure note"><UnlockPanel onUnlock={unlockExisting} title="Unlock note to edit" /></AppShell>;
  }

  return (
    <AppShell title={isNew ? 'New Entry' : 'Edit Page'}>
      <form className="editor-layout" onSubmit={submit}>
        <section className="editor-main">
          <label className="field-label title-field">
            Page title
            <input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Give this page a clear title" required />
          </label>

          <RichEditor
            key={`${pageId}-${secure}-${editorRevision}`}
            initialHtml={form.html}
            onChange={(html) => update('html', html)}
            onImageFile={handleInlineImage}
            disableImages={secure}
          />

          <section className="import-panel">
            <div className="compact-section-head">
              <div>
                <p className="eyebrow">URL IMPORT</p>
                <h3>Import from link</h3>
              </div>
              {importing ? <button type="button" className="button secondary" onClick={cancelImport}>Cancel</button> : null}
            </div>
            <div className="source-import-row">
              <label className="field-label">Original source URL
                <input type="url" value={form.sourceUrl} onChange={(event) => update('sourceUrl', event.target.value)} placeholder="https://..." />
              </label>
              <button type="button" className="button primary" disabled={importing} onClick={importFromLink}>{importing ? 'Reading...' : 'Import from link'}</button>
            </div>
            {renderDetectedSourceChoices()}
            {renderSourceEnrichmentStatus()}
            {importMessage ? <p className={['failed', 'blocked'].includes(sourceEnrichment.status) ? 'form-error' : 'status-message'}>{importMessage}</p> : null}
          </section>

          {!secure ? (
            <section className={`attachment-box upload-panel ${secure ? "is-disabled" : ""}`} onDrop={handleDrop} onDragOver={handleDragOver}>
              <div className="upload-panel-header attachment-toolbar">
                <div>
                  <p className="eyebrow">ATTACHMENTS</p>
                  <h3>Attachments</h3>
                  <p>Upload files, choose existing Drive documents, or attach a Drive link.</p>
                </div>
                <div className="attachment-toolbar-actions">
                  <button className="button primary" type="button" disabled={saving || secure} onClick={startComputerUpload}>
                    Upload from computer
                  </button>
                  <button className="button secondary" type="button" disabled={saving || secure} onClick={pickExistingDriveFiles}>
                    Choose from Google Drive
                  </button>
                  <button className="button secondary" type="button" disabled={saving || secure} onClick={() => setDriveLinkDialogOpen(true)}>
                    Add Drive link
                  </button>
                </div>
              </div>

              <div className="drive-connection-row">
                <div>
                  <strong>Google Drive:</strong>{" "}
                  {driveSession ? `Connected as ${driveSession.user?.emailAddress || "Google Drive user"}` : "Not connected"}
                  {driveFolder?.name ? <span> | Folder: {driveFolder.name}</span> : null}
                </div>
                <div className="drive-connection-actions">
                  {!driveSession ? <button className="button secondary" type="button" onClick={() => connectDrive().catch(() => {})}>Connect Google Drive</button> : null}
                  {driveSession ? <button className="button secondary" type="button" onClick={() => connectDrive({ forcePrompt: true, prompt: "consent select_account" }).catch(() => {})}>Change account</button> : null}
                  {driveSession ? <button className="button secondary" type="button" onClick={disconnectDriveSession}>Disconnect</button> : null}
                </div>
              </div>

              <input ref={fileInput} type="file" accept={FILE_ACCEPT} multiple hidden onChange={handleAttachment} />

              <div className="upload-format-grid">
                <span><strong>Supported formats:</strong> {SUPPORTED_FORMATS}</span>
                <span><strong>Maximum size:</strong> 25 MB per file</span>
              </div>

              {missingDriveConfig().length ? <div className="drive-setup-card"><strong>Google Drive setup required</strong><ul>{missingDriveConfig().map((item) => <li key={item}>{item}</li>)}</ul><a className="text-link" href="#/settings">View setup instructions</a></div> : null}
              {driveMessage ? <p className="status-message">{driveMessage}</p> : null}

              {driveLinkDialogOpen ? (
                <div className="drive-link-card">
                  <div className="compact-section-head">
                    <div>
                      <h4>Add Drive link</h4>
                      <p>Save a Drive URL as an external attachment link.</p>
                    </div>
                    <button className="button secondary" type="button" onClick={() => setDriveLinkDialogOpen(false)}>Close</button>
                  </div>
                  <label className="field-label">Google Drive URL
                    <input value={driveLinkForm.url} onChange={(event) => setDriveLinkForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://drive.google.com/..." />
                  </label>
                  <label className="field-label">Optional display title
                    <input value={driveLinkForm.title} onChange={(event) => setDriveLinkForm((current) => ({ ...current, title: event.target.value }))} placeholder="Visible attachment title" />
                  </label>
                  <label className="field-label">Optional description
                    <textarea rows="2" value={driveLinkForm.description} onChange={(event) => setDriveLinkForm((current) => ({ ...current, description: event.target.value }))} placeholder="A short note about this link" />
                  </label>
                  <div className="drive-link-actions">
                    <button type="button" className="button primary" onClick={addDriveLink}>Add link</button>
                    <button type="button" className="button secondary" onClick={() => setDriveLinkDialogOpen(false)}>Cancel</button>
                  </div>
                </div>
              ) : null}

              {renderFileRows(attachmentRows)}
              {inlineRows.length ? (
                <details className="inline-drive-files">
                  <summary>{inlineRows.length} inline image file(s)</summary>
                  {renderFileRows(inlineRows, true)}
                </details>
              ) : null}
            </section>
          ) : (
            <p className="warning-note">Secure notes are text-only. Images and attachments are disabled so separate files do not expose sensitive material.</p>
          )}
        </section>

        <aside className="editor-meta">
          <h2>Page details</h2>

          <label className="field-label">Category path
            <input list="category-options" value={form.category} onChange={(event) => updateCategory(event.target.value)} placeholder="Research Opportunities/Scholarships" />
          </label>
          <datalist id="category-options">
            {CATEGORY_OPTIONS.map((category) => <option key={category} value={category} />)}
          </datalist>
          {autoCategory.category && form.category === autoCategory.category ? <p className="auto-selected-note">Auto-selected category</p> : null}

          <label className="field-label">Tags
            <input value={form.tagsText} onChange={(event) => update('tagsText', event.target.value)} placeholder="Scholarship, Submission deadline, Computer vision" />
          </label>
          <div className="metadata-actions">
            <button type="button" className="button secondary" onClick={regenerateTags}>Regenerate tags</button>
            <button type="button" className="button secondary" onClick={autoCategorise}>Suggest category and tags</button>
          </div>

          {renderSmartSuggestions()}
          {renderOpportunityDetails()}
          {renderImportantDates()}

          <section className="source-info-panel">
            <h3>Original source information</h3>
            <label className="field-label">Website/source name<input value={sourceMetadata.sourceName || ''} onChange={(event) => updateSourceMetadata('sourceName', event.target.value)} /></label>
            <label className="field-label">Publisher<input value={sourceMetadata.publisher || ''} onChange={(event) => updateSourceMetadata('publisher', event.target.value)} /></label>
            <label className="field-label">Journal or venue<input value={sourceMetadata.journalTitle || ''} onChange={(event) => updateSourceMetadata('journalTitle', event.target.value)} /></label>
            <label className="field-label">Institution or organisation<input value={sourceMetadata.institution || ''} onChange={(event) => updateSourceMetadata('institution', event.target.value)} /></label>
            <label className="field-label">Author<input value={sourceMetadata.author || ''} onChange={(event) => updateSourceMetadata('author', event.target.value)} /></label>
            <label className="field-label">Publication date<input value={sourceMetadata.publicationDate || ''} onChange={(event) => updateSourceMetadata('publicationDate', event.target.value)} /></label>
            <label className="field-label">Resolved URL<input type="url" value={sourceMetadata.resolvedUrl || ''} onChange={(event) => updateSourceMetadata('resolvedUrl', event.target.value)} /></label>
            <label className="field-label">Canonical URL<input type="url" value={sourceMetadata.canonicalUrl || ''} onChange={(event) => updateSourceMetadata('canonicalUrl', event.target.value)} /></label>
            <label className="field-label">Application/submission URL<input type="url" value={sourceMetadata.applicationUrl || ''} onChange={(event) => updateSourceMetadata('applicationUrl', event.target.value)} /></label>
            <label className="field-label">Description<textarea rows="2" value={sourceMetadata.description || ''} onChange={(event) => updateSourceMetadata('description', event.target.value)} /></label>
            {sourceFacts.length ? <p className="small-note">Metadata is stored with the page and can be edited.</p> : null}
          </section>

          <label className="field-label">Summary<textarea rows="4" value={form.summary} onChange={(event) => update('summary', cleanVisibleText(event.target.value))} placeholder="Short description for the index" /></label>

          <div className="secure-toggle">
            <label><input type="checkbox" checked={secure} onChange={(event) => toggleSecure(event.target.checked)} /> Encrypt as a secure note</label>
            <p>The title and content will be encrypted. The public index will display only "Locked note".</p>
          </div>

          {secure ? (
            <div className="secure-fields">
              <label className="field-label">Master passphrase<input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} minLength="12" autoComplete="new-password" /></label>
              {isNew ? <label className="field-label">Confirm passphrase<input type="password" value={confirmPassphrase} onChange={(event) => setConfirmPassphrase(event.target.value)} minLength="12" autoComplete="new-password" /></label> : null}
              <p className="small-note">There is no password recovery. Losing this passphrase means losing the note.</p>
            </div>
          ) : null}

          <p className="small-note">Use <code>[[Exact Page Title]]</code> in the editor to create an internal link and backlink.</p>

          <div className={`connection-status ${connectionStatusClass(connectionStatus)}`}>
            <span aria-hidden="true" />
            {connectionStatus}
          </div>

          {draftPrompt ? (
            <div className="draft-panel">
              <strong>Unsaved local draft found</strong>
              <p>Saved in this browser {formatDraftTime(draftPrompt.savedAt)}.</p>
              <div className="draft-actions">
                <button type="button" className="button secondary" onClick={restoreDraft}>Restore draft</button>
                <button type="button" className="button secondary" onClick={discardDraft}>Discard draft</button>
              </div>
            </div>
          ) : draftSavedAt && hasLocalChanges ? (
            <p className="small-note">Draft autosaved locally {formatDraftTime(draftSavedAt)}.</p>
          ) : null}

          <div className="save-state-row">
            <span>{statusTextFromState(saveStatus, hasLocalChanges)}</span>
          </div>
          {payloadWarning ? <div className="save-warning-panel" role="status">{payloadWarning}</div> : null}

          <div className="save-action-row">
            <button className="button primary full" name="saveAction" value="save" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            <button className="button secondary full" name="saveAction" value="save-start-application" disabled={saving}>Save and Start Application</button>
            <button className="button secondary full" name="saveAction" value="save-add-another" disabled={saving}>Save and Add Another</button>
            <button type="button" className="button secondary full" disabled={saving} onClick={() => { if (!hasLocalChanges || window.confirm('Discard unsaved changes?')) window.location.hash = '#/'; }}>Cancel</button>
            {message ? <div className="save-error-panel" role="alert">{message}</div> : null}
          </div>
          {!isNew ? <button type="button" className="button danger full" disabled={saving} onClick={deleteCurrent}>Delete page</button> : null}
        </aside>
      </form>
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
