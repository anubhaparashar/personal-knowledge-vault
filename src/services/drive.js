import {
  deleteDriveFile as deleteGoogleDriveFile,
  driveWebUrl,
  requestDriveAccess,
  resolveDriveFolder,
  uploadFileToDrive,
} from './googleDrive';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function driveInlineLink(fileId) {
  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`;
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

export function driveFileKey(file) {
  return file?.driveFileId || file?.id || file?.path || file?.url || file?.name;
}

export function getDriveFileLink(file) {
  if (file?.webViewLink) return file.webViewLink;
  if (file?.url) return file.url;
  if (file?.driveFileId) return driveWebUrl(file.driveFileId);
  return '#';
}

export function getInlineImageSource(file) {
  if (file?.src) return file.src;
  if (file?.thumbnailLink) return file.thumbnailLink;
  if (file?.driveFileId) return driveInlineLink(file.driveFileId);
  return file?.url || '';
}
