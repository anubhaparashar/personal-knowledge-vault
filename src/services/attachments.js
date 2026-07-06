import { storage, storageError } from '../firebase';
import {
  deleteDriveFile as deleteLegacyDriveFile,
  downloadDriveFileBlob as downloadLegacyDriveFileBlob,
  getDriveFileLink as getLegacyDriveFileLink,
} from './drive';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const SUPPORTED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'txt', 'md', 'markdown', 'csv', 'zip', 'png', 'jpg', 'jpeg', 'webp', 'json',
]);

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
  const ext = extensionForName(file.name || file.originalName || file.storagePath || '');

  if (mime === 'application/pdf' || ext === 'pdf') return { key: 'pdf', label: 'PDF', badge: 'PDF', readable: true, extractable: true };
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return { key: 'image', label: 'Image', badge: 'IMG' };
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx') return { key: 'docx', label: 'DOCX', badge: 'DOCX', extractable: true };
  if (mime === 'application/msword' || ext === 'doc') return { key: 'doc', label: 'DOC', badge: 'DOC' };
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
    throw new Error('Unsupported file type. Upload PDF, DOC, DOCX, TXT, Markdown, CSV, ZIP, PNG, JPG, JPEG, WEBP or JSON.');
  }
}

export function attachmentFileKey(file) {
  return file?.storagePath || file?.driveFileId || file?.id || file?.path || file?.downloadUrl || file?.url || file?.name;
}

export function getAttachmentOpenUrl(file) {
  if (file?.provider === 'firebase-storage') return file.downloadUrl || '#';
  if (file?.storagePath && file?.downloadUrl) return file.downloadUrl;
  if (file?.driveFileId) return getLegacyDriveFileLink(file);
  return file?.downloadUrl || file?.url || '#';
}

export async function resolveAttachmentUrl(file) {
  if (file?.downloadUrl) return file.downloadUrl;
  if (file?.storagePath) {
    if (!storage) throw new Error(storageError || 'Firebase Storage is not configured.');
    return storage.ref(file.storagePath).getDownloadURL();
  }
  if (file?.driveFileId) return getLegacyDriveFileLink(file);
  return file?.url || '';
}

export async function uploadAttachmentFile(uid, pageId, file, onProgress = () => {}) {
  if (!storage) throw new Error(storageError || 'Firebase Storage is not configured. Set VITE_FIREBASE_STORAGE_BUCKET and enable Firebase Storage.');
  validateAttachmentFile(file);

  const storagePath = attachmentPath(uid, pageId, file);
  const ref = storage.ref(storagePath);
  const metadata = {
    contentType: file.type || 'application/octet-stream',
    customMetadata: {
      originalName: file.name || 'Untitled file',
      pageId,
      uid,
    },
  };

  onProgress(1);
  const snapshot = await new Promise((resolve, reject) => {
    const task = ref.put(file, metadata);
    task.on(
      'state_changed',
      (nextSnapshot) => {
        const total = nextSnapshot.totalBytes || file.size || 1;
        onProgress(Math.max(1, Math.round((nextSnapshot.bytesTransferred / total) * 100)));
      },
      (error) => reject(error),
      () => resolve(task.snapshot),
    );
  });
  const downloadUrl = await snapshot.ref.getDownloadURL();
  onProgress(100);

  return {
    provider: 'firebase-storage',
    name: file.name || 'Untitled file',
    originalName: file.name || 'Untitled file',
    type: file.type || 'application/octet-stream',
    mimeType: file.type || 'application/octet-stream',
    size: Number(file.size || 0),
    storagePath,
    downloadUrl,
    url: downloadUrl,
    src: file.type?.startsWith('image/') ? downloadUrl : '',
    uploadedAt: new Date().toISOString(),
    pageId,
    uid,
  };
}

export async function deleteAttachmentFile(file) {
  if (!file) return;
  if (file.storagePath) {
    if (!storage) throw new Error(storageError || 'Firebase Storage is not configured.');
    await storage.ref(file.storagePath).delete();
    return;
  }
  if (file.driveFileId) await deleteLegacyDriveFile(file.driveFileId);
}

export async function downloadAttachmentBlob(file) {
  if (!file) throw new Error('Missing attachment.');
  if (file.storagePath || file.downloadUrl) {
    const url = await resolveAttachmentUrl(file);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not download the attachment.');
    return response.blob();
  }
  if (file.driveFileId) return downloadLegacyDriveFileBlob(file.driveFileId);
  throw new Error('This attachment does not have a downloadable file reference.');
}

export function canExtractAttachment(file) {
  return Boolean(getAttachmentKind(file).extractable);
}