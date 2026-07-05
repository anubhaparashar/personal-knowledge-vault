import React, { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import PdfViewer from '../components/PdfViewer';
import { useAuth } from '../context/AuthContext';
import { googleDriveFolderId } from '../firebase';
import {
  DRIVE_FOLDER_NAME,
  DRIVE_PDF_SCOPE,
  approvedDriveEmail,
  canUseGooglePicker,
  deleteDriveFile,
  disconnectDrive,
  downloadDrivePdfBlob,
  driveWebUrl,
  getDriveFileMetadata,
  isGoogleDriveConfigured,
  listDrivePdfs,
  normalizeDrivePdfMetadata,
  pickDriveFolder,
  requestDriveAccess,
  resolveDriveFolder,
  uploadPdfToDrive,
} from '../services/googleDrive';
import { createPdfId, removePdf, savePdf } from '../services/pdfs';
import { formatDate, getSourceDomain } from '../utils/content';

const EMPTY_FORM = {
  title: '',
  description: '',
  categoriesText: '',
  tagsText: '',
  sourceUrl: '',
  notes: '',
  relatedPageIds: [],
};

function splitList(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function baseTitle(name = '') {
  return name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim() || name || 'Untitled PDF';
}

function formFromPdf(pdf) {
  if (!pdf) return EMPTY_FORM;
  return {
    title: pdf.title || baseTitle(pdf.driveName),
    description: pdf.description || '',
    categoriesText: (pdf.categories || []).join(', '),
    tagsText: (pdf.tags || []).join(', '),
    sourceUrl: pdf.sourceUrl || '',
    notes: pdf.notes || '',
    relatedPageIds: pdf.relatedPageIds || [],
  };
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'knowledge-vault.pdf';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (!size) return 'Unknown size';
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PdfsPage({ pages, pdfs, loading, error, initialPdfId = '' }) {
  const { user } = useAuth();
  const fileInput = useRef(null);
  const [driveSession, setDriveSession] = useState(null);
  const [folder, setFolder] = useState(null);
  const [folderFiles, setFolderFiles] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedPdfId, setSelectedPdfId] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [working, setWorking] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [viewerBlobUrl, setViewerBlobUrl] = useState('');
  const [viewerPdfId, setViewerPdfId] = useState('');
  const [viewerBlob, setViewerBlob] = useState(null);

  const selectedPdf = pdfs.find((pdf) => pdf.id === selectedPdfId) || null;
  const openPdf = pdfs.find((pdf) => pdf.id === viewerPdfId) || null;

  useEffect(() => () => {
    if (viewerBlobUrl) URL.revokeObjectURL(viewerBlobUrl);
  }, [viewerBlobUrl]);

  useEffect(() => {
    if (initialPdfId) {
      const routed = pdfs.find((pdf) => pdf.id === initialPdfId);
      if (routed && selectedPdfId !== routed.id) {
        setSelectedPdfId(routed.id);
        setForm(formFromPdf(routed));
      }
      return;
    }
    if (!selectedPdf && pdfs.length && !selectedPdfId) {
      const first = pdfs[0];
      setSelectedPdfId(first.id);
      setForm(formFromPdf(first));
    }
  }, [initialPdfId, pdfs, selectedPdf, selectedPdfId]);

  const filteredPdfs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return pdfs;
    return pdfs.filter((pdf) => (pdf.title || pdf.driveName || '').toLowerCase().includes(query));
  }, [pdfs, search]);

  const linkedPages = useMemo(() => {
    if (!selectedPdf) return [];
    const related = new Set(selectedPdf.relatedPageIds || []);
    return pages.filter((page) => related.has(page.id));
  }, [pages, selectedPdf]);

  function choosePdf(pdf) {
    setSelectedPdfId(pdf.id);
    setForm(formFromPdf(pdf));
  }

  function updateForm(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function ensureDriveReady() {
    const session = await requestDriveAccess();
    setDriveSession(session);
    const resolvedFolder = await resolveDriveFolder(session.accessToken, folder?.id || undefined);
    setFolder(resolvedFolder);
    return { session, resolvedFolder };
  }

  async function connectDrive(forcePrompt = false) {
    setWorking(true);
    setMessage('');
    try {
      const session = await requestDriveAccess({ forcePrompt });
      setDriveSession(session);
      const resolvedFolder = await resolveDriveFolder(session.accessToken, folder?.id || undefined);
      setFolder(resolvedFolder);
      setMessage(`Connected to ${session.user?.emailAddress || 'Google Drive'} and selected "${resolvedFolder.name}".`);
    } catch (connectError) {
      setMessage(connectError.message);
    } finally {
      setWorking(false);
    }
  }

  async function handleDisconnectDrive() {
    await disconnectDrive();
    setDriveSession(null);
    setFolder(null);
    setMessage('Google Drive access disconnected for this session.');
  }

  async function selectDriveFolderWithPicker() {
    setWorking(true);
    setMessage('');
    try {
      const session = await requestDriveAccess();
      setDriveSession(session);
      const picked = await pickDriveFolder(session.accessToken);
      if (!picked?.id) {
        setMessage('Drive folder selection cancelled.');
        return;
      }
      const selectedFolder = await resolveDriveFolder(session.accessToken, picked.id);
      setFolder(selectedFolder);
      setMessage(`Selected "${selectedFolder.name}" as the Drive PDF folder.`);
    } catch (pickerError) {
      setMessage(pickerError.message);
    } finally {
      setWorking(false);
    }
  }

  async function handleUpload(event) {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (!files.length) return;

    setWorking(true);
    setMessage('');
    try {
      const { session, resolvedFolder } = await ensureDriveReady();
      for (const file of files) {
        setUploadProgress(1);
        const driveFile = await uploadPdfToDrive(session.accessToken, resolvedFolder.id, file, setUploadProgress);
        const pdfId = createPdfId(user.uid);
        const metadata = normalizeDrivePdfMetadata(driveFile);
        await savePdf(user.uid, pdfId, {
          ...metadata,
          driveFolderId: resolvedFolder.id,
          title: baseTitle(file.name),
          description: '',
          categories: [],
          tags: [],
          sourceUrl: '',
          sourceDomain: '',
          relatedPageIds: [],
          notes: '',
          provider: 'google-drive',
        }, true);
        setSelectedPdfId(pdfId);
      }
      setMessage(`Uploaded ${files.length} PDF file(s) to Google Drive.`);
    } catch (uploadError) {
      setMessage(uploadError.message);
    } finally {
      setUploadProgress(0);
      setWorking(false);
    }
  }

  async function refreshFolderList() {
    setWorking(true);
    setMessage('');
    try {
      const { session, resolvedFolder } = await ensureDriveReady();
      const driveFiles = await listDrivePdfs(session.accessToken, resolvedFolder.id);
      setFolderFiles(driveFiles);

      for (const driveFile of driveFiles) {
        const existing = pdfs.find((pdf) => pdf.driveFileId === driveFile.id);
        const metadata = normalizeDrivePdfMetadata(driveFile);
        if (existing) {
          await savePdf(user.uid, existing.id, {
            ...metadata,
            driveFolderId: resolvedFolder.id,
            lastDriveRefreshAt: new Date().toISOString(),
          });
        } else {
          await savePdf(user.uid, createPdfId(user.uid), {
            ...metadata,
            driveFolderId: resolvedFolder.id,
            title: baseTitle(driveFile.name),
            description: '',
            categories: [],
            tags: [],
            sourceUrl: '',
            sourceDomain: '',
            relatedPageIds: [],
            notes: '',
            provider: 'google-drive',
            lastDriveRefreshAt: new Date().toISOString(),
          }, true);
        }
      }

      setMessage(`Refreshed ${driveFiles.length} PDF file(s) from the Drive folder.`);
    } catch (refreshError) {
      setMessage(refreshError.message);
    } finally {
      setWorking(false);
    }
  }

  async function refreshSelectedMetadata(pdf = selectedPdf) {
    if (!pdf?.driveFileId) return;
    setWorking(true);
    setMessage('');
    try {
      const { session, resolvedFolder } = await ensureDriveReady();
      const driveFile = await getDriveFileMetadata(session.accessToken, pdf.driveFileId);
      await savePdf(user.uid, pdf.id, {
        ...normalizeDrivePdfMetadata(driveFile),
        driveFolderId: resolvedFolder.id,
        lastDriveRefreshAt: new Date().toISOString(),
      });
      setMessage('Drive file metadata refreshed.');
    } catch (refreshError) {
      setMessage(refreshError.message);
    } finally {
      setWorking(false);
    }
  }

  async function saveSelectedMetadata(event) {
    event.preventDefault();
    if (!selectedPdf) return;
    setWorking(true);
    setMessage('');
    try {
      const title = form.title.trim();
      if (!title) throw new Error('Add a PDF title.');
      const sourceUrl = form.sourceUrl.trim();
      await savePdf(user.uid, selectedPdf.id, {
        title,
        description: form.description.trim(),
        categories: splitList(form.categoriesText),
        tags: splitList(form.tagsText),
        sourceUrl,
        sourceDomain: getSourceDomain(sourceUrl),
        notes: form.notes.trim(),
        relatedPageIds: form.relatedPageIds,
      });
      setMessage('PDF metadata saved.');
    } catch (saveError) {
      setMessage(saveError.message);
    } finally {
      setWorking(false);
    }
  }

  async function openInsideSite(pdf) {
    setWorking(true);
    setMessage('');
    try {
      const { session } = await ensureDriveReady();
      const blob = await downloadDrivePdfBlob(session.accessToken, pdf.driveFileId);
      const objectUrl = URL.createObjectURL(blob);
      if (viewerBlobUrl) URL.revokeObjectURL(viewerBlobUrl);
      setViewerBlob(blob);
      setViewerBlobUrl(objectUrl);
      setViewerPdfId(pdf.id);
      choosePdf(pdf);
    } catch (openError) {
      setMessage(openError.message);
    } finally {
      setWorking(false);
    }
  }

  async function downloadPdf(pdf = openPdf || selectedPdf) {
    if (!pdf?.driveFileId) return;
    setWorking(true);
    setMessage('');
    try {
      let blob = viewerPdfId === pdf.id ? viewerBlob : null;
      if (!blob) {
        const { session } = await ensureDriveReady();
        blob = await downloadDrivePdfBlob(session.accessToken, pdf.driveFileId);
      }
      downloadBlob(blob, pdf.driveName || `${pdf.title || 'knowledge-vault'}.pdf`);
    } catch (downloadError) {
      setMessage(downloadError.message);
    } finally {
      setWorking(false);
    }
  }

  async function deletePdf(pdf) {
    if (!pdf?.driveFileId) return;
    const confirmed = window.confirm(`Delete "${pdf.title || pdf.driveName}" from Google Drive and remove its Firestore metadata? This cannot be undone.`);
    if (!confirmed) return;

    setWorking(true);
    setMessage('');
    try {
      const { session } = await ensureDriveReady();
      await deleteDriveFile(session.accessToken, pdf.driveFileId);
      await removePdf(user.uid, pdf.id);
      if (viewerPdfId === pdf.id) {
        if (viewerBlobUrl) URL.revokeObjectURL(viewerBlobUrl);
        setViewerBlobUrl('');
        setViewerBlob(null);
        setViewerPdfId('');
      }
      setSelectedPdfId('');
      setForm(EMPTY_FORM);
      setMessage('PDF deleted from Google Drive and Firestore metadata removed.');
    } catch (deleteError) {
      setMessage(deleteError.message);
    } finally {
      setWorking(false);
    }
  }

  const canUseDrive = isGoogleDriveConfigured();
  const pickerReady = canUseGooglePicker();

  return (
    <AppShell title="PDF Library">
      <section className="pdf-library-layout">
        <div className="pdf-library-main">
          <section className="pdf-drive-panel">
            <div>
              <p className="eyebrow">GOOGLE DRIVE PDF LIBRARY</p>
              <h2>{folder?.name || DRIVE_FOLDER_NAME}</h2>
              <p>
                PDFs stay restricted in Google Drive. Firestore stores only metadata and the Drive file ID.
              </p>
              <dl className="pdf-drive-details">
                <div><dt>OAuth scope</dt><dd>{DRIVE_PDF_SCOPE}</dd></div>
                <div><dt>Approved account</dt><dd>{approvedDriveEmail || 'Not configured'}</dd></div>
                <div><dt>Drive account</dt><dd>{driveSession?.user?.emailAddress || 'Not connected'}</dd></div>
                <div><dt>Folder ID</dt><dd>{folder?.id || googleDriveFolderId || 'Created or selected after connection'}</dd></div>
              </dl>
            </div>
            <div className="pdf-drive-actions">
              <button className="button primary" type="button" disabled={!canUseDrive || working} onClick={() => connectDrive(false)}>
                {driveSession ? 'Reconnect Drive' : 'Connect Google Drive'}
              </button>
              <button className="button secondary" type="button" disabled={!canUseDrive || working} onClick={selectDriveFolderWithPicker}>Select Drive folder</button>
              <button className="button secondary" type="button" disabled={!canUseDrive || working} onClick={refreshFolderList}>List PDFs from folder</button>
              <button className="button secondary" type="button" disabled={!driveSession || working} onClick={handleDisconnectDrive}>Disconnect</button>
              <button className="button secondary" type="button" disabled={!canUseDrive || working} onClick={() => fileInput.current?.click()}>Upload PDF</button>
              <input ref={fileInput} hidden type="file" accept="application/pdf,.pdf" multiple onChange={handleUpload} />
              {!pickerReady ? <small className="muted">Google Picker folder selection requires VITE_GOOGLE_API_KEY.</small> : null}
              {uploadProgress ? <progress value={uploadProgress} max="100">{uploadProgress}%</progress> : null}
            </div>
          </section>

          {!canUseDrive ? <p className="form-error">Set VITE_GOOGLE_OAUTH_CLIENT_ID before using the PDF Library.</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="status-message">{message}</p> : null}

          <section className="library-controls pdf-controls-row">
            <label className="search-box">
              <span>Search PDFs by title</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search PDF titles..." />
            </label>
            <span className="muted">{folderFiles.length ? `${folderFiles.length} Drive file(s) seen in last folder refresh.` : `${pdfs.length} PDF metadata record(s).`}</span>
          </section>

          {loading ? <div className="empty-state">Loading PDF metadata...</div> : null}

          {!loading ? (
            <section className="pdf-grid">
              {filteredPdfs.map((pdf) => (
                <article className={`pdf-card ${selectedPdfId === pdf.id ? 'active' : ''}`} key={pdf.id}>
                  <button className="pdf-card-select" type="button" onClick={() => choosePdf(pdf)}>
                    <strong>{pdf.title || baseTitle(pdf.driveName)}</strong>
                    <span>{pdf.description || pdf.driveName || 'Google Drive PDF'}</span>
                  </button>
                  <div className="tag-row">
                    {(pdf.categories || []).slice(0, 3).map((category) => <span key={category}>{category}</span>)}
                    {(pdf.tags || []).slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                  <small>{formatBytes(pdf.size)} - Updated {formatDate(pdf.updatedAt || pdf.driveModifiedTime)}</small>
                  {(pdf.relatedPageIds || []).length ? <small>{pdf.relatedPageIds.length} linked page(s)</small> : null}
                  <div className="pdf-card-actions">
                    <button className="text-link" type="button" disabled={working} onClick={() => openInsideSite(pdf)}>Open here</button>
                    <a className="text-link" href={pdf.driveWebViewLink || driveWebUrl(pdf.driveFileId)} target="_blank" rel="noopener noreferrer">Open in Drive</a>
                    <button className="text-link" type="button" disabled={working} onClick={() => downloadPdf(pdf)}>Download</button>
                    <button className="text-link danger-link" type="button" disabled={working} onClick={() => deletePdf(pdf)}>Delete</button>
                  </div>
                </article>
              ))}
              {!filteredPdfs.length ? <div className="empty-state wide">No PDFs match this title search.</div> : null}
            </section>
          ) : null}

          <PdfViewer
            blobUrl={viewerBlobUrl}
            title={openPdf?.title || openPdf?.driveName || 'PDF viewer'}
            onDownload={() => downloadPdf(openPdf)}
          />
        </div>

        <aside className="pdf-metadata-panel">
          <h2>PDF metadata</h2>
          {selectedPdf ? (
            <form onSubmit={saveSelectedMetadata} className="pdf-metadata-form">
              <label className="field-label">Title<input value={form.title} onChange={(event) => updateForm('title', event.target.value)} /></label>
              <label className="field-label">Description<textarea rows="3" value={form.description} onChange={(event) => updateForm('description', event.target.value)} /></label>
              <label className="field-label">Categories<input value={form.categoriesText} onChange={(event) => updateForm('categoriesText', event.target.value)} placeholder="Research, Papers" /></label>
              <label className="field-label">Tags<input value={form.tagsText} onChange={(event) => updateForm('tagsText', event.target.value)} placeholder="LLM, RAG, Safety" /></label>
              <label className="field-label">Source URL<input type="url" value={form.sourceUrl} onChange={(event) => updateForm('sourceUrl', event.target.value)} placeholder="https://..." /></label>
              <label className="field-label">Notes<textarea rows="5" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} /></label>
              <label className="field-label">Related pages
                <select
                  multiple
                  value={form.relatedPageIds}
                  onChange={(event) => updateForm('relatedPageIds', [...event.target.selectedOptions].map((option) => option.value))}
                >
                  {pages.filter((page) => !page.secure).map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}
                </select>
              </label>
              {linkedPages.length ? (
                <div className="backlink-list pdf-related-links">
                  {linkedPages.map((page) => <a key={page.id} href={`#/read/${page.id}`}>{page.title}</a>)}
                </div>
              ) : <p className="muted">No related pages linked yet.</p>}
              <dl className="pdf-file-facts">
                <div><dt>Drive file ID</dt><dd>{selectedPdf.driveFileId}</dd></div>
                <div><dt>Drive name</dt><dd>{selectedPdf.driveName}</dd></div>
                <div><dt>Drive modified</dt><dd>{selectedPdf.driveModifiedTime || 'Unknown'}</dd></div>
                <div><dt>Stored binary</dt><dd>Google Drive only</dd></div>
              </dl>
              <button className="button primary full" disabled={working}>Save metadata</button>
              <button className="button secondary full" type="button" disabled={working} onClick={() => refreshSelectedMetadata(selectedPdf)}>Refresh Drive file metadata</button>
            </form>
          ) : <p className="muted">Select a PDF to edit its Firestore metadata and page links.</p>}
        </aside>
      </section>
    </AppShell>
  );
}




