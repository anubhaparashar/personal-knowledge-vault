import { storage, storageError } from '../firebase';
import {
  deleteDriveFile as deleteRemoteDriveFile,
  driveWebUrl,
  downloadDriveFileBlob,
  getDriveFileLink,
  resolveDriveFolder,
  requestDriveAccess,
  uploadFileToDrive,
} from './drive';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const SUPPORTED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md', 'markdown', 'csv', 'zip', 'png', 'jpg', 'jpeg', 'webp', 'json',
]);

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/csv',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

function extensionForName(name = '') {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

function safeName(name = 'attachment') {
  const cleaned = name.normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return cleaned || 'attachment';
}

function uniqueStorageName(file) {
  return `${Date.now()}-${crypto.randomUUID()}-${safeName(file.name || 'attachment')}`;
}

function attachmentPath(uid, pageId, file) {
  return `users/${uid}/attachments/${pageId}/${uniqueStorageName(file)}`;
}

export function getAttachmentKind(file = {}) {
  const mime = (file.type || file.mimeType || '').toLowerCase();
  const ext = extensionForName(file.name || file.originalName || file.storagePath || file.driveName || '');

  if (mime === 'application/pdf' || ext === 'pdf') return { key: 'pdf', label: 'PDF', badge: 'PDF', readable: true, extractable: true };
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return { key: 'image', label: 'Image', badge: 'IMG' };
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx') return { key: 'docx', label: 'DOCX', badge: 'DOCX', extractable: true };
  if (mime === 'application/msword' || ext === 'doc') return { key: 'doc', label: 'DOC', badge: 'DOC' };
  if (mime === 'application/vnd.ms-powerpoint' || mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || ext === 'ppt' || ext === 'pptx') return { key: 'powerpoint', label: 'PowerPoint', badge: 'PPT' };
  if (mime === 'application/vnd.ms-excel' || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || ext === 'xls' || ext === 'xlsx') return { key: 'excel', label: 'Excel', badge: 'XLS' };
  if (mime === 'text/markdown' || mime === 'text/x-markdown' || ['md', 'markdown'].includes(ext)) return { key: 'markdown', label: 'Markdown', badge: 'MD', extractable: true };
  if (mime === 'text/csv' || mime === 'application/csv' || ext === 'csv') return { key: 'csv', label: 'CSV', badge: 'CSV', extractable: true };
  if (mime === 'text/plain' || ext === 'txt') return { key: 'text', label: 'Text', badge: 'TXT', extractable: true };
  if (mime === 'application/json' || ext === 'json') return { key: 'json', label: 'JSON', badge: 'JSON', extractable: true };
  if (mime === 'application/zip' || mime === 'application/x-zip-compressed' || ext === 'zip') return { key: 'zip', label: 'ZIP', badge: 'ZIP', extractable: true };
  return { key: 'file', label: 'File', badge: 'FILE' };
}

export function formatAttachmentSize(size) {
  const bytes = Number(size || 0);
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateAttachmentFile(file) {
  if (!file) throw new Error('No file selected.');
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`File is larger than ${formatAttachmentSize(MAX_ATTACHMENT_BYTES)}.`);
  const ext = extensionForName(file.name);
  const mime = (file.type || '').toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext) && !SUPPORTED_MIME_TYPES.has(mime)) {
    throw new Error('Unsupported file type. Upload PDF, Word, PowerPoint, Excel, TXT, Markdown, CSV, ZIP, PNG, JPG, JPEG, WEBP or JSON.');
  }
}

export function attachmentFileKey(file) {
  return file?.localId || file?.storagePath || file?.driveFileId || file?.id || file?.path || file?.downloadUrl || file?.url || file?.originalUrl || file?.name;
}

export function getAttachmentOpenUrl(file) {
  if (file?.provider === 'google-drive-link') return file.originalUrl || file.url || '#';
  if (file?.provider === 'firebase-storage') return file.downloadUrl || '#';
  if (file?.storagePath && file?.downloadUrl) return file.downloadUrl;
  if (file?.driveFileId) return getDriveFileLink(file);
  return file?.downloadUrl || file?.url || file?.originalUrl || '#';
}

export async function resolveAttachmentUrl(file) {
  if (file?.downloadUrl) return file.downloadUrl;
  if (file?.storagePath) {
    if (!storage) throw new Error(storageError || 'Firebase Storage is not configured.');
    return storage.ref(file.storagePath).getDownloadURL();
  }
  if (file?.driveFileId) return getDriveFileLink(file);
  return file?.url || file?.originalUrl || '';
}

function normalizeDriveAttachment(file, originalFile, uid, pageId, folderId) {
  const originalName = file.appProperties?.originalName || originalFile?.name || file.name || 'Untitled file';
  return {
    provider: 'google-drive',
    driveFileId: file.id,
    driveFolderId: folderId,
    name: originalName,
    originalName,
    driveName: file.name || originalName,
    type: file.mimeType || originalFile?.type || 'application/octet-stream',
    mimeType: file.mimeType || originalFile?.type || 'application/octet-stream',
    size: Number(file.size || originalFile?.size || 0),
    url: file.webViewLink || driveWebUrl(file.id),
    webViewLink: file.webViewLink || driveWebUrl(file.id),
    webContentLink: file.webContentLink || '',
    thumbnailLink: file.thumbnailLink || '',
    iconLink: file.iconLink || '',
    src: originalFile?.type?.startsWith('image/') ? driveWebUrl(file.id) : '',
    driveCreatedTime: file.createdTime || null,
    driveModifiedTime: file.modifiedTime || null,
    uploadedAt: new Date().toISOString(),
    pageId,
    uid,
    appProperties: file.appProperties || {},
  };
}

export async function uploadAttachmentFile(uid, pageId, file, onProgress = () => {}, options = {}) {
  validateAttachmentFile(file);
  const session = await requestDriveAccess(options.driveAuth || {});
  const folder = await resolveDriveFolder(session.accessToken, options.folderId);
  const driveFile = await uploadFileToDrive(session.accessToken, folder.id, file, onProgress, {
    appProperties: {
      ownerUid: uid,
      pageId,
      purpose: 'note-attachment',
      originalName: file.name || 'Untitled file',
    },
  }, options);
  onProgress(100);
  return normalizeDriveAttachment(driveFile, file, uid, pageId, folder.id);
}

export async function deleteAttachmentFile(file) {
  if (!file) return;
  if (file.storagePath) {
    if (!storage) throw new Error(storageError || 'Firebase Storage is not configured.');
    await storage.ref(file.storagePath).delete();
    return;
  }
  if (file.driveFileId) {
    const session = await requestDriveAccess();
    await deleteRemoteDriveFile(session.accessToken, file.driveFileId);
  }
}

export async function downloadAttachmentBlob(file) {
  if (!file) throw new Error('Missing attachment.');
  if (file.provider === 'google-drive-link') {
    throw new Error('Authorize this Drive link through Google Drive before downloading it.');
  }
  if (file.storagePath || file.downloadUrl) {
    const url = await resolveAttachmentUrl(file);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not download the attachment.');
    return response.blob();
  }
  if (file.driveFileId) {
    const session = await requestDriveAccess();
    return downloadDriveFileBlob(session.accessToken, file.driveFileId);
  }
  throw new Error('This attachment does not have a downloadable file reference.');
}

export function canExtractAttachment(file) {
  return Boolean(getAttachmentKind(file).extractable);
}


