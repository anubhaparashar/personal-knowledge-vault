import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import PdfViewer from '../components/PdfViewer';
import RichEditor from '../components/RichEditor';
import UnlockPanel from '../components/UnlockPanel';
import { useAuth } from '../context/AuthContext';
import { isStorageConfigured } from '../firebase';
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
import { decryptObject, encryptObject } from '../utils/crypto';
import {
  extractWikiLinks,
  getSourceDomain,
  htmlToText,
  sanitizeHtml,
} from '../utils/content';
import { downloadIcs, googleCalendarUrl } from '../utils/calendar';
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
};

const SUPPORTED_FORMATS = 'PDF, DOC, DOCX, TXT, Markdown, CSV, ZIP, PNG, JPG/JPEG and WEBP';
const FILE_ACCEPT = '.pdf,.doc,.docx,.txt,.md,.markdown,.csv,.zip,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,application/zip,image/png,image/jpeg,image/webp';
const DRAFT_STORAGE_PREFIX = 'knowledge-vault:editor-draft';
const DRAFT_SAVE_DELAY_MS = 500;
const FIRESTORE_WARN_BYTES = 800 * 1024;
const FIRESTORE_BLOCK_BYTES = 950 * 1024;
const PAGE_TOO_LARGE_MESSAGE = 'This page is too large for one Firestore document. Split it into multiple knowledge pages.';
const DOCUMENT_SIZE_ERROR_CODE = 'document-size-exceeded';
const DRAFT_PRELOAD_KEY = 'kv-editor-preload';

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

function hasDraftContent(form, attachments, inlineFiles, importantDates, sourceMetadata) {
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
    || hasSourceMetadata(sourceMetadata),
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

function deadlineKey(deadline) {
  return `${deadline.type || ''}:${deadline.date || ''}:${deadline.snippet || ''}`.toLowerCase();
}

function mergeImportantDates(existing = [], detected = []) {
  const seen = new Set(existing.map(deadlineKey));
  const additions = detected.filter((item) => {
    const key = deadlineKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...existing, ...additions].slice(0, 20).map((item) => ({ ...item, status: deadlineStatus(item) }));
}

function sourceMetadataFromImport(imported = {}, sourceUrl = '') {
  const metadata = imported.metadata || {};
  return {
    sourceName: metadata.sourceName || metadata.siteName || metadata.publisher || '',
    author: metadata.author || '',
    publicationDate: metadata.publicationDate || metadata.publishedTime || metadata.datePublished || '',
    description: metadata.description || imported.description || '',
    canonicalUrl: metadata.canonicalUrl || imported.canonicalUrl || sourceUrl,
  };
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
  const isNew = routeId === 'new';
  const pageId = useMemo(() => (isNew ? createPageId(user.uid) : routeId), [isNew, routeId, user.uid]);
  const draftKey = useMemo(() => getDraftStorageKey(user.uid, pageId), [pageId, user.uid]);
  const existing = pages.find((page) => page.id === routeId);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sourceMetadata, setSourceMetadata] = useState(EMPTY_SOURCE_METADATA);
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState('Saved');
  const [importMessage, setImportMessage] = useState('');
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [payloadWarning, setPayloadWarning] = useState('');
  const [connectionStatus, setConnectionStatus] = useState(getInitialConnectionStatus);
  const [draftPrompt, setDraftPrompt] = useState(null);
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