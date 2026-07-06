import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import RichEditor from '../components/RichEditor';
import UnlockPanel from '../components/UnlockPanel';
import { useAuth } from '../context/AuthContext';
import { decryptObject, encryptObject } from '../utils/crypto';
import {
  extractWikiLinks,
  getSourceDomain,
  htmlToText,
  suggestMetadata,
} from '../utils/content';
import {
  approximateFirestorePayloadBytes,
  createPageId,
  getFirebaseErrorCode,
  getFirestoreSaveErrorMessage,
  removePage,
  savePage,
} from '../services/pages';
import {
  deleteDriveFile,
  downloadDriveFileBlob,
  driveFileKey,
  formatDriveFileSize,
  getDriveAttachmentKind,
  getDriveFileLink,
  MAX_FILE_BYTES,
  uploadDriveFile,
} from '../services/drive';
import PdfViewer from '../components/PdfViewer';
import { isGoogleDriveConfigured } from '../services/googleDrive';

const EMPTY_FORM = {
  title: '',
  category: '',
  tagsText: '',
  sourceUrl: '',
  summary: '',
  html: '<p></p>',
};

const SUPPORTED_FORMATS = 'PDF, ZIP, Word, Excel, PowerPoint, images, text, Markdown and JSON';
const FILE_ACCEPT = '.pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*,text/plain,text/markdown,application/json,.txt,.md,.json';
const DRAFT_STORAGE_PREFIX = 'knowledge-vault:editor-draft';
const DRAFT_SAVE_DELAY_MS = 500;
const FIRESTORE_WARN_BYTES = 800 * 1024;
const FIRESTORE_BLOCK_BYTES = 950 * 1024;
const PAGE_TOO_LARGE_MESSAGE = 'This page is too large for one Firestore document. Split it into multiple knowledge pages.';
const DOCUMENT_SIZE_ERROR_CODE = 'document-size-exceeded';
const DRAFT_PRELOAD_KEY = 'kv-editor-preload';

function createUploadRow(file) {
  return {
    localId: crypto.randomUUID(),
    file,
    name: file.name || 'Untitled file',
    type: file.type || 'application/octet-stream',
    size: file.size || 0,
    kind: getDriveAttachmentKind(file),
    progress: 0,
    status: 'Queued',
  };
}

function createStoredRow(file) {
  return {
    ...file,
    localId: driveFileKey(file),
    kind: getDriveAttachmentKind(file),
    progress: 100,
    status: 'Uploaded',
  };
}

function fileRowKey(file) {
  return file.localId || driveFileKey(file);
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

function hasDraftContent(form, attachments, inlineFiles) {
  return Boolean(
    form.title.trim()
    || form.category.trim()
    || form.tagsText.trim()
    || form.sourceUrl.trim()
    || form.summary.trim()
    || htmlToText(form.html).trim()
    || attachments.length
    || inlineFiles.length,
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

export default function EditorPage({ routeId, pages, pagesLoaded }) {
  const { user } = useAuth();
  const fileInput = useRef(null);
  const isNew = routeId === 'new';
  const pageId = useMemo(() => (isNew ? createPageId(user.uid) : routeId), [isNew, routeId, user.uid]);
  const draftKey = useMemo(() => getDraftStorageKey(user.uid, pageId), [pageId, user.uid]);
  const existing = pages.find((page) => page.id === routeId);
  const driveConfigured = isGoogleDriveConfigured();
  const [form, setForm] = useState(EMPTY_FORM);
  const [secure, setSecure] = useState(false);
  const [unlocked, setUnlocked] = useState(isNew);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [inlineFiles, setInlineFiles] = useState([]);
  const [uploadRows, setUploadRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
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
        summary: preload?.summary || '',
        html: preload?.html || '<p></p>',
      });
      setSecure(Boolean(preload?.secure));
      setUnlocked(true);
      setAttachments([]);
      setInlineFiles([]);
      setUploadRows([]);
      setMessage('');
      setPayloadWarning('');
      setHasLocalChanges(false);
      setEditorRevision((current) => current + 1);
      return;
    }
    if (!existing) return;
    setMessage('');
    setPayloadWarning('');
    setHasLocalChanges(false);
    setSecure(Boolean(existing.secure));
    setUploadRows([]);
    if (existing.secure) {
      setUnlocked(false);
      setForm(EMPTY_FORM);
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
        summary: existing.summary || '',
        html: existing.html || '<p></p>',
      });
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
      if (!hasDraftContent(form, attachments, inlineFiles)) {
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
        savedAt,
      });
      if (saved) setDraftSavedAt(savedAt);
    }, DRAFT_SAVE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [attachments, draftAutosaveReady, draftKey, form, hasLocalChanges, inlineFiles, pageId, routeId, secure]);

  const attachmentRows = useMemo(() => {
    const queuedDriveIds = new Set(uploadRows.map((row) => row.driveFileId).filter(Boolean));
    const storedRows = attachments
      .filter((item) => !queuedDriveIds.has(item.driveFileId))
      .map(createStoredRow);
    return [...uploadRows, ...storedRows];
  }, [attachments, uploadRows]);

  const inlineRows = useMemo(() => inlineFiles.map(createStoredRow), [inlineFiles]);
  const canUploadFiles = !secure && driveConfigured;

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
      savedAt,
    });
    if (saved) {
      setDraftSavedAt(savedAt);
      setDraftPrompt(null);
      setDraftAutosaveReady(true);
    }
  }

  const update = (name, value) => {
    setHasLocalChanges(true);
    setForm((current) => ({ ...current, [name]: value }));
  };

  const updateUploadRow = (localId, patch) => {
    setUploadRows((current) => current.map((row) => (row.localId === localId ? { ...row, ...patch } : row)));
  };

  async function unlockExisting(value) {
    const decrypted = await decryptObject(existing.encryption, value);
    setForm({
      title: decrypted.title || '',
      category: decrypted.category || 'Private Vault',
      tagsText: (decrypted.tags || []).join(', '),
      sourceUrl: decrypted.sourceUrl || '',
      summary: decrypted.summary || '',
      html: decrypted.html || '<p></p>',
    });
    setPassphrase(value);
    setUnlocked(true);
    setHasLocalChanges(false);
    setEditorRevision((current) => current + 1);
  }

  const handleInlineImage = useCallback(async (file) => {
    if (secure) throw new Error('Images are disabled inside encrypted secure notes.');
    if (!driveConfigured) throw new Error('Google Drive connection must be configured before uploading files.');
    const uploaded = await uploadDriveFile(user.uid, pageId, file);
    setInlineFiles((current) => [...current, uploaded]);
    setHasLocalChanges(true);
    return uploaded;
  }, [driveConfigured, pageId, secure, user.uid]);

  async function uploadSelectedFiles(files) {
    const selectedFiles = [...files];
    if (!selectedFiles.length) return;
    if (secure) {
      setMessage('Encrypted secure notes cannot have separate Drive attachments.');
      return;
    }
    if (!driveConfigured) {
      setMessage('Google Drive connection must be configured before uploading files.');
      return;
    }

    setMessage('');
    const rows = selectedFiles.map(createUploadRow);
    setUploadRows((current) => [...current, ...rows]);

    for (const row of rows) {
      if (row.size > MAX_FILE_BYTES) {
        updateUploadRow(row.localId, {
          status: `File is larger than ${formatDriveFileSize(MAX_FILE_BYTES)}.`,
          progress: 0,
          error: true,
        });
        continue;
      }

      updateUploadRow(row.localId, { status: 'Uploading', progress: 1 });
      try {
        const uploaded = await uploadDriveFile(user.uid, pageId, row.file, (nextProgress) => {
          updateUploadRow(row.localId, {
            progress: Math.max(1, Math.min(99, nextProgress)),
            status: 'Uploading',
          });
        });
        const uploadedRow = {
          ...uploaded,
          localId: row.localId,
          kind: getDriveAttachmentKind(uploaded),
          progress: 100,
          status: 'Uploaded',
        };
        setAttachments((current) => [...current, uploaded]);
        setHasLocalChanges(true);
        updateUploadRow(row.localId, uploadedRow);
      } catch (error) {
        updateUploadRow(row.localId, {
          status: error.message || 'Upload failed.',
          progress: 0,
          error: true,
        });
      }
    }
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
    if (!item.driveFileId) {
      setUploadRows((current) => current.filter((file) => fileRowKey(file) !== key));
      setHasLocalChanges(true);
      return;
    }
    if (!window.confirm(`Remove ${item.name} from this page and delete the Google Drive file?`)) return;
    try {
      await deleteDriveFile(item.driveFileId);
      setUploadRows((current) => current.filter((file) => fileRowKey(file) !== key));
      if (inline) setInlineFiles((current) => current.filter((file) => driveFileKey(file) !== driveFileKey(item)));
      else setAttachments((current) => current.filter((file) => driveFileKey(file) !== driveFileKey(item)));
      setHasLocalChanges(true);
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function downloadAttachment(item) {
    try {
      const blob = await downloadDriveFileBlob(item.driveFileId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.name || 'attachment';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function openPdfInWebsite(item) {
    try {
      const blob = await downloadDriveFileBlob(item.driveFileId);
      const url = URL.createObjectURL(blob);
      setPreview({
        fileId: item.driveFileId,
        name: item.name || 'PDF',
        title: item.name || 'PDF',
        url,
      });
    } catch (error) {
      window.alert(error.message);
    }
  }

  function toggleSecure(checked) {
    if (checked && (attachments.length || inlineFiles.length || uploadRows.length || form.html.includes('<img'))) {
      window.alert('Remove Google Drive images and attachments before converting this page into an encrypted secure note.');
      return;
    }
    setSecure(checked);
    setHasLocalChanges(true);
  }

  function autoCategorise() {
    const suggestion = suggestMetadata(form.title, htmlToText(form.html), form.sourceUrl);
    update('category', suggestion.category);
    if (!form.tagsText.trim()) update('tagsText', suggestion.tags.join(', '));
    if (!form.summary.trim()) update('summary', suggestion.summary);
  }

  function restoreDraft() {
    if (!draftPrompt) return;
    setForm({ ...EMPTY_FORM, ...draftPrompt.form });
    setSecure(Boolean(draftPrompt.secure));
    setAttachments(Array.isArray(draftPrompt.attachments) ? draftPrompt.attachments : []);
    setInlineFiles(Array.isArray(draftPrompt.inlineFiles) ? draftPrompt.inlineFiles : []);
    setUploadRows([]);
    setUnlocked(true);
    setDraftPrompt(null);
    setDraftAutosaveReady(true);
    setDraftSavedAt(draftPrompt.savedAt || null);
    setHasLocalChanges(true);
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

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setPayloadWarning('');
    const plainText = htmlToText(form.html);
    const tags = form.tagsText.split(',').map((tag) => tag.trim()).filter(Boolean);

    if (!form.title.trim()) return setMessage('Add a title.');
    if (!plainText && !attachments.length) return setMessage('Add some content or an attachment.');
    if (secure && passphrase.length < 12) return setMessage('Secure notes require a passphrase of at least 12 characters.');
    if (secure && isNew && passphrase !== confirmPassphrase) return setMessage('The two passphrases do not match.');

    persistCurrentDraft();
    setSaving(true);
    let payloadBytes = 0;

    try {
      console.info('[EditorPage] save started', { uid: user.uid, pageId });
      setConnectionStatus(navigator.onLine ? 'Online' : 'Offline');

      let data;
      if (secure) {
        const encryption = await encryptObject({
          title: form.title.trim(),
          category: form.category.trim() || 'Private Vault',
          tags,
          sourceUrl: form.sourceUrl.trim(),
          summary: form.summary.trim(),
          html: form.html,
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
          attachments: [],
          inlineFiles: [],
          encryption,
        };
      } else {
        data = {
          secure: false,
          encryption: null,
          title: form.title.trim(),
          category: form.category.trim() || 'Uncategorised',
          tags,
          sourceUrl: form.sourceUrl.trim(),
          sourceDomain: getSourceDomain(form.sourceUrl.trim()),
          summary: form.summary.trim() || plainText.slice(0, 240),
          html: form.html,
          plainText,
          wikiLinks: extractWikiLinks(plainText),
          attachments,
          inlineFiles,
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
      setConnectionStatus(navigator.onLine ? 'Online' : 'Offline');
      console.info('[EditorPage] save completed', { uid: user.uid, pageId, approximatePayloadBytes: payloadBytes });
      window.location.hash = `#/read/${pageId}`;
    } catch (error) {
      const firebaseErrorCode = getFirebaseErrorCode(error);
      console.warn('[EditorPage] save failed', {
        uid: user.uid,
        pageId,
        approximatePayloadBytes: payloadBytes,
        firebaseErrorCode,
      });
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
    try {
      const files = [...(existing.attachments || []), ...(existing.inlineFiles || [])];
      await Promise.allSettled(files.map((file) => deleteDriveFile(file.driveFileId)));
      await removePage(user.uid, existing.id);
      window.location.hash = '#/';
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  function renderFileRows(rows, inline = false) {
    if (!rows.length) return null;
    return (
      <div className="file-list upload-file-list">
        {rows.map((item) => (
          <div className={`upload-file-row ${item.error ? 'has-error' : ''}`} key={fileRowKey(item)}>
            <div className="file-kind-badge">{item.kind?.badge || 'FILE'}</div>
            <div className="file-summary">
              <strong>{item.name}</strong>
              <small>{item.kind?.label || item.type || 'File'} - {formatDriveFileSize(item.size)}</small>
            </div>
            <div className="file-progress-cell">
              <progress value={item.progress || 0} max="100">{item.progress || 0}%</progress>
              <span>{item.status || 'Uploaded'}</span>
            </div>
            <div className="file-actions">
              {item.driveFileId ? <a className="text-link" href={getDriveFileLink(item)} target="_blank" rel="noreferrer">Open in Drive</a> : <button type="button" className="text-link" disabled>Open in Drive</button>}
              {item.kind?.readable && item.driveFileId ? <button type="button" className="text-link" onClick={() => openPdfInWebsite(item)}>Read PDF in website</button> : null}
              {item.driveFileId ? <button type="button" className="text-link" onClick={() => downloadAttachment(item)}>Download</button> : <button type="button" className="text-link" disabled>Download</button>}
              <button type="button" className="text-link danger-link" onClick={() => removeAttachment(item, inline)} disabled={item.status === 'Uploading'}>Remove</button>
            </div>
          </div>
        ))}
      </div>
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
    <AppShell title={isNew ? 'Quick Capture' : 'Edit Page'}>
      <form className="editor-layout" onSubmit={submit}>
        <section className="editor-main">
          <label className="field-label title-field">
            Page title
            <input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Give this page a clear title" required />
          </label>

          {!secure ? (
            <section
              className={`attachment-box upload-panel ${canUploadFiles ? '' : 'is-disabled'}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <div className="upload-panel-header">
                <div>
                  <p className="eyebrow">GOOGLE DRIVE FILES</p>
                  <h3>Attach files</h3>
                  <p>Drag files here or click to browse</p>
                </div>
                <div className="upload-panel-actions">
                  <button
                    className="button primary"
                    type="button"
                    disabled={!canUploadFiles || saving}
                    onClick={() => fileInput.current?.click()}
                  >
                    Add Drive files
                  </button>
                  <small>25 MB per file</small>
                </div>
              </div>
              <input ref={fileInput} type="file" accept={FILE_ACCEPT} multiple hidden onChange={handleAttachment} />
              <div className="upload-format-grid">
                <span><strong>Supported formats:</strong> {SUPPORTED_FORMATS}</span>
                <span><strong>Maximum size:</strong> 25 MB per file</span>
              </div>
              {!driveConfigured ? <p className="form-error">Google Drive connection must be configured before uploading files.</p> : null}
              {renderFileRows(attachmentRows)}
              {inlineRows.length ? (
                <details className="inline-drive-files">
                  <summary>{inlineRows.length} inline Drive image file(s)</summary>
                  {renderFileRows(inlineRows, true)}
                </details>
              ) : null}
            </section>
          ) : (
            <p className="warning-note">Secure notes are text-only. Images and attachments are disabled so separate Google Drive files do not expose sensitive material.</p>
          )}

          <RichEditor
            key={`${pageId}-${secure}-${driveConfigured}-${editorRevision}`}
            initialHtml={form.html}
            onChange={(html) => update('html', html)}
            onImageFile={handleInlineImage}
            disableImages={secure || !driveConfigured}
          />
        </section>

        <aside className="editor-meta">
          <h2>Page details</h2>
          <label className="field-label">Category path<input value={form.category} onChange={(event) => update('category', event.target.value)} placeholder="AI/LLM Agents" /></label>
          <label className="field-label">Tags<input value={form.tagsText} onChange={(event) => update('tagsText', event.target.value)} placeholder="Research, Safety, LLM" /></label>
          <label className="field-label">Original source URL<input type="url" value={form.sourceUrl} onChange={(event) => update('sourceUrl', event.target.value)} placeholder="https://..." /></label>
          <label className="field-label">Summary<textarea rows="4" value={form.summary} onChange={(event) => update('summary', event.target.value)} placeholder="Short description for the index" /></label>
          <button type="button" className="button secondary full" onClick={autoCategorise}>Suggest category and tags</button>

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

          {payloadWarning ? <div className="save-warning-panel" role="status">{payloadWarning}</div> : null}

          <div className="save-action-row">
            <button className="button primary full" disabled={saving}>{saving ? 'Saving...' : 'Save page'}</button>
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
              onDownload={async () => {
                try {
                  const blob = await downloadDriveFileBlob(preview.fileId);
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement('a');
                  anchor.href = url;
                  anchor.download = preview.name || 'attachment.pdf';
                  document.body.append(anchor);
                  anchor.click();
                  anchor.remove();
                  URL.revokeObjectURL(url);
                } catch (error) {
                  window.alert(error.message);
                }
              }}
            />
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
