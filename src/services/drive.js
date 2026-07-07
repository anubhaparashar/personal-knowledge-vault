import {
  deleteDriveFile as deleteGoogleDriveFile,
  driveWebUrl,
  requestDriveAccess,
  resolveDriveFolder,
  uploadFileToDrive,
} from './googleDrive';

export { driveWebUrl, requestDriveAccess, resolveDriveFolder, uploadFileToDrive };

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

function driveInlineLink(fileId) {
  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`;
}

function driveDownloadLink(fileId) {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

function kindForFile(file) {
  const mime = (file?.type || '').toLowerCase();
  const name = (file?.name || '').toLowerCase();

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return { key: 'pdf', label: 'PDF', badge: 'PDF', readable: true };
  }
  if (mime.startsWith('image/')) {
    return { key: 'image', label: 'Image', badge: 'IMG' };
  }
  if (mime === 'text/markdown' || mime === 'text/x-markdown' || name.endsWith('.md')) {
    return { key: 'markdown', label: 'Markdown', badge: 'MD' };
  }
  if (mime === 'application/json' || name.endsWith('.json')) {
    return { key: 'json', label: 'JSON', badge: 'JSON' };
  }
  if (mime === 'text/plain' || mime === 'text/csv' || name.endsWith('.txt') || name.endsWith('.csv')) {
    return { key: 'text', label: 'Text', badge: 'TXT' };
  }
  if (
    mime === 'application/msword'
    || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || name.endsWith('.doc')
    || name.endsWith('.docx')
  ) {
    return { key: 'word', label: 'Word', badge: 'DOC' };
  }
  if (
    mime === 'application/vnd.ms-excel'
    || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || name.endsWith('.xls')
    || name.endsWith('.xlsx')
    || name.endsWith('.csv')
  ) {
    return { key: 'excel', label: 'Excel', badge: 'XLS' };
  }
  if (
    mime === 'application/vnd.ms-powerpoint'
    || mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    || name.endsWith('.ppt')
    || name.endsWith('.pptx')
  ) {
    return { key: 'powerpoint', label: 'PowerPoint', badge: 'PPT' };
  }
  if (
    mime === 'application/zip'
    || mime === 'application/x-zip-compressed'
    || name.endsWith('.zip')
    || name.endsWith('.rar')
    || name.endsWith('.7z')
  ) {
    return { key: 'zip', label: 'ZIP', badge: 'ZIP' };
  }
  return { key: 'file', label: 'File', badge: 'FILE' };
}

export function formatDriveFileSize(size) {
  const bytes = Number(size || 0);
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeDrivePageFile(file, originalFile) {
  const driveFileId = file.id;
  const webViewLink = file.webViewLink || driveWebUrl(driveFileId);
  return {
    provider: 'google-drive',
    driveFileId,
    name: file.name || originalFile?.name || 'Untitled file',
    type: file.mimeType || originalFile?.type || 'application/octet-stream',
    size: Number(file.size || originalFile?.size || 0),
    url: webViewLink,
    webViewLink,
    webContentLink: file.webContentLink || '',
    thumbnailLink: file.thumbnailLink || '',
    src: originalFile?.type?.startsWith('image/') ? driveInlineLink(driveFileId) : '',
    driveCreatedTime: file.createdTime || null,
    driveModifiedTime: file.modifiedTime || null,
    uploadedAt: new Date().toISOString(),
  };
}

export async function uploadDriveFile(uid, pageId, file, onProgress = () => {}) {
  if (file.size > MAX_FILE_BYTES) throw new Error('File is larger than the 25 MB limit.');

  onProgress(1);
  const session = await requestDriveAccess();
  const folder = await resolveDriveFolder(session.accessToken);
  const driveFile = await uploadFileToDrive(session.accessToken, folder.id, file, onProgress, {
    appProperties: {
      knowledgeVault: 'true',
      ownerUid: uid,
      pageId,
    },
  });
  onProgress(100);
  return normalizeDrivePageFile(driveFile, file);
}

export async function deleteDriveFile(fileId) {
  if (!fileId) return;
  const session = await requestDriveAccess();
  await deleteGoogleDriveFile(session.accessToken, fileId);
}

export async function downloadDriveFileBlob(fileId) {
  if (!fileId) throw new Error('Missing Drive file ID.');
  const session = await requestDriveAccess();
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!response.ok) {
    let message = 'Could not download the Google Drive file.';
    try {
      const body = await response.json();
      message = body.error?.message || message;
    } catch {
      // The Drive API may return an empty body for some errors.
    }
    throw new Error(message);
  }
  return response.blob();
}

export function driveFileKey(file) {
  return file?.driveFileId || file?.id || file?.path || file?.url || file?.name;
}

export function getDriveFileLink(file) {
  if (file?.webViewLink) return file.webViewLink;
  if (file?.url) return file.url;
  if (file?.driveFileId) return driveWebUrl(file.driveFileId);
  return '#';
}

export function getDriveDownloadLink(file) {
  if (file?.webContentLink) return file.webContentLink;
  if (file?.driveFileId) return driveDownloadLink(file.driveFileId);
  return getDriveFileLink(file);
}

export function getInlineImageSource(file) {
  if (file?.src) return file.src;
  if (file?.thumbnailLink) return file.thumbnailLink;
  if (file?.driveFileId) return driveInlineLink(file.driveFileId);
  return file?.url || '';
}

export function getDriveAttachmentKind(file) {
  return kindForFile(file);
}