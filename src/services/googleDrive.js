import {
  allowedEmail,
  googleApiKey,
  googleApprovedEmail,
  googleDriveFolderId,
  googleOAuthClientId,
  googlePickerAppId,
} from '../firebase';

export const DRIVE_FOLDER_NAME = 'Personal Knowledge Vault';
export const DRIVE_PDF_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const LOCAL_FOLDER_KEY = 'kv-google-drive-folder-id';

let cachedToken = null;
let cachedTokenExpiresAt = 0;
let cachedDriveUser = null;

export const approvedDriveEmail = (googleApprovedEmail || allowedEmail || '').trim().toLowerCase();

export function isGoogleDriveConfigured() {
  return Boolean(googleOAuthClientId);
}

export function getPreferredDriveFolderId() {
  return googleDriveFolderId || localStorage.getItem(LOCAL_FOLDER_KEY) || '';
}

export function rememberDriveFolderId(folderId) {
  if (!googleDriveFolderId && folderId) localStorage.setItem(LOCAL_FOLDER_KEY, folderId);
}

export function clearRememberedDriveFolderId() {
  localStorage.removeItem(LOCAL_FOLDER_KEY);
}

function waitForGoogleIdentity() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve(globalThis.google.accounts.oauth2);

  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (globalThis.google?.accounts?.oauth2) {
        window.clearInterval(timer);
        resolve(globalThis.google.accounts.oauth2);
      } else if (Date.now() - started > 10000) {
        window.clearInterval(timer);
        reject(new Error('Google Identity Services did not load. Check the script tag and network access.'));
      }
    }, 100);
  });
}

function loadScriptOnce(id, src) {
  const existing = document.getElementById(id);
  if (existing) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${src}.`));
    document.head.append(script);
  });
}

async function waitForGooglePicker() {
  await loadScriptOnce('google-api-js', 'https://apis.google.com/js/api.js');
  if (!globalThis.gapi?.load) throw new Error('Google API loader is not available.');

  return new Promise((resolve, reject) => {
    globalThis.gapi.load('picker', {
      callback: () => resolve(globalThis.google?.picker),
      onerror: () => reject(new Error('Google Picker could not be loaded.')),
      timeout: 10000,
      ontimeout: () => reject(new Error('Google Picker loading timed out.')),
    });
  });
}

export function canUseGooglePicker() {
  return Boolean(googleApiKey && googlePickerAppId);
}

export async function pickDriveFolder(token) {
  if (!googleApiKey) throw new Error('VITE_GOOGLE_API_KEY is required for Google Picker folder selection.');
  if (!googlePickerAppId) throw new Error('Google Picker App ID could not be derived from the OAuth Client ID.');

  const pickerApi = await waitForGooglePicker();
  if (!pickerApi) throw new Error('Google Picker is not available.');

  return new Promise((resolve, reject) => {
    const view = new pickerApi.DocsView(pickerApi.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes(FOLDER_MIME_TYPE);

    const picker = new pickerApi.PickerBuilder()
      .setTitle(`Select ${DRIVE_FOLDER_NAME}`)
      .setDeveloperKey(googleApiKey)
      .setOAuthToken(token)
      .setAppId(googlePickerAppId)
      .addView(view)
      .setCallback((data) => {
        const action = data[pickerApi.Response.ACTION];
        if (action === pickerApi.Action.PICKED) {
          const doc = data[pickerApi.Response.DOCUMENTS]?.[0];
          resolve({
            id: doc?.[pickerApi.Document.ID] || '',
            name: doc?.[pickerApi.Document.NAME] || '',
          });
        }
        if (action === pickerApi.Action.CANCEL) resolve(null);
      })
      .build();

    try {
      picker.setVisible(true);
    } catch (error) {
      reject(error);
    }
  });
}

function tokenStillValid() {
  return cachedToken && Date.now() < cachedTokenExpiresAt;
}

async function parseDriveError(response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return parsed.error?.message || parsed.error_description || response.statusText;
  } catch {
    return text || response.statusText;
  }
}

async function driveFetchJson(token, path, options = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.body ? { 'Content-Type': 'application/json; charset=UTF-8' } : {}),
    ...(options.headers || {}),
  };
  Object.keys(headers).forEach((key) => {
    if (headers[key] == null) delete headers[key];
  });

  const response = await fetch(`${DRIVE_API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) throw new Error(await parseDriveError(response));
  if (response.status === 204) return null;
  return response.json();
}

function encodeQuery(params) {
  return new URLSearchParams(params).toString();
}

export async function requestDriveAccess({ forcePrompt = false } = {}) {
  if (!googleOAuthClientId) throw new Error('Google OAuth Client ID is not configured.');
  if (tokenStillValid() && !forcePrompt) return { accessToken: cachedToken, user: cachedDriveUser };

  const oauth2 = await waitForGoogleIdentity();

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: googleOAuthClientId,
      scope: DRIVE_PDF_SCOPE,
      hint: approvedDriveEmail || undefined,
      callback: async (response) => {
        if (!response || response.error) {
          reject(new Error(response?.error_description || response?.error || 'Google Drive authorization failed.'));
          return;
        }

        if (!response.access_token) {
          reject(new Error('Google Drive did not return an access token.'));
          return;
        }

        if (!oauth2.hasGrantedAllScopes(response, DRIVE_PDF_SCOPE)) {
          reject(new Error('Google Drive access was not granted for the required Drive file scope.'));
          return;
        }

        cachedToken = response.access_token;
        cachedTokenExpiresAt = Date.now() + Math.max(0, (Number(response.expires_in || 3600) - 60) * 1000);

        try {
          cachedDriveUser = await getDriveUser(cachedToken);
          assertApprovedDriveAccount(cachedDriveUser);
          resolve({ accessToken: cachedToken, user: cachedDriveUser });
        } catch (error) {
          cachedToken = null;
          cachedTokenExpiresAt = 0;
          cachedDriveUser = null;
          reject(error);
        }
      },
      error_callback: (error) => reject(new Error(error?.message || error?.type || 'Google Drive authorization failed.')),
    });

    client.requestAccessToken({ prompt: forcePrompt ? 'consent' : '' });
  });
}

export async function disconnectDrive() {
  if (!cachedToken) return;
  const token = cachedToken;
  cachedToken = null;
  cachedTokenExpiresAt = 0;
  cachedDriveUser = null;
  const oauth2 = await waitForGoogleIdentity();
  oauth2.revoke(token, () => {});
}

export async function getDriveUser(token) {
  const data = await driveFetchJson(token, '/about?fields=user(emailAddress,displayName,photoLink)');
  return data.user || null;
}

export function assertApprovedDriveAccount(user) {
  const email = user?.emailAddress?.toLowerCase();
  if (approvedDriveEmail && email !== approvedDriveEmail) {
    throw new Error(`Google Drive access is restricted to ${approvedDriveEmail}. Reconnect with the approved Google account.`);
  }
}

function requirePdf(file) {
  const isPdf = file?.type === 'application/pdf' || file?.name?.toLowerCase().endsWith('.pdf');
  if (!isPdf) throw new Error('Only PDF files can be uploaded to Google Drive from the PDF library.');
}

export async function getDriveFileMetadata(token, fileId) {
  const fields = 'id,name,mimeType,size,modifiedTime,createdTime,webViewLink,webContentLink,thumbnailLink,md5Checksum,iconLink,parents,trashed';
  return driveFetchJson(token, `/files/${encodeURIComponent(fileId)}?${encodeQuery({ fields })}`);
}

export async function resolveDriveFolder(token, folderId = getPreferredDriveFolderId()) {
  if (folderId) {
    const folder = await getDriveFileMetadata(token, folderId);
    if (folder.trashed) throw new Error('The configured Drive folder is in the trash.');
    if (folder.mimeType !== FOLDER_MIME_TYPE) throw new Error('The configured Google Drive folder ID is not a folder.');
    if (folder.name !== DRIVE_FOLDER_NAME) {
      throw new Error(`The configured Drive folder must be named "${DRIVE_FOLDER_NAME}".`);
    }
    rememberDriveFolderId(folder.id);
    return folder;
  }

  const existing = await findAppVisibleVaultFolder(token);
  if (existing) {
    rememberDriveFolderId(existing.id);
    return existing;
  }

  const created = await driveFetchJson(token, `/files?${encodeQuery({ fields: 'id,name,mimeType,webViewLink,createdTime,modifiedTime' })}`, {
    method: 'POST',
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: FOLDER_MIME_TYPE,
    }),
  });
  rememberDriveFolderId(created.id);
  return created;
}

export async function findAppVisibleVaultFolder(token) {
  const q = `mimeType='${FOLDER_MIME_TYPE}' and name='${DRIVE_FOLDER_NAME.replace(/'/g, "\\'")}' and trashed=false`;
  const params = encodeQuery({
    q,
    spaces: 'drive',
    pageSize: '10',
    fields: 'files(id,name,mimeType,webViewLink,createdTime,modifiedTime)',
  });
  const data = await driveFetchJson(token, `/files?${params}`);
  return data.files?.[0] || null;
}

export async function listDrivePdfs(token, folderId) {
  const q = `'${folderId.replace(/'/g, "\\'")}' in parents and mimeType='application/pdf' and trashed=false`;
  const fields = 'files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,webContentLink,thumbnailLink,md5Checksum,parents)';
  const data = await driveFetchJson(token, `/files?${encodeQuery({ q, spaces: 'drive', pageSize: '100', orderBy: 'modifiedTime desc', fields })}`);
  return data.files || [];
}

export function uploadPdfToDrive(token, folderId, file, onProgress = () => {}) {
  requirePdf(file);

  const boundary = `knowledge_vault_${crypto.randomUUID()}`;
  const metadata = {
    name: file.name,
    mimeType: 'application/pdf',
    parents: [folderId],
  };

  const body = new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\n`,
    'Content-Type: application/pdf\r\n\r\n',
    file,
    `\r\n--${boundary}--`,
  ], { type: `multipart/related; boundary=${boundary}` });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fields = 'id,name,mimeType,size,modifiedTime,createdTime,webViewLink,webContentLink,thumbnailLink,md5Checksum,parents';
    xhr.open('POST', `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&${encodeQuery({ fields })}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new Error('Google Drive upload failed.'));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        try {
          const parsed = JSON.parse(xhr.responseText);
          reject(new Error(parsed.error?.message || 'Google Drive upload failed.'));
        } catch {
          reject(new Error(xhr.responseText || 'Google Drive upload failed.'));
        }
        return;
      }
      resolve(JSON.parse(xhr.responseText));
    };
    xhr.send(body);
  });
}

export async function downloadDrivePdfBlob(token, fileId) {
  const response = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(await parseDriveError(response));
  return response.blob();
}

export async function deleteDriveFile(token, fileId) {
  await driveFetchJson(token, `/files/${encodeURIComponent(fileId)}`, { method: 'DELETE', headers: { 'Content-Type': undefined } });
}

export function driveWebUrl(fileId) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

export function normalizeDrivePdfMetadata(file) {
  return {
    driveFileId: file.id,
    driveName: file.name || '',
    mimeType: file.mimeType || 'application/pdf',
    size: Number(file.size || 0),
    driveCreatedTime: file.createdTime || null,
    driveModifiedTime: file.modifiedTime || null,
    driveWebViewLink: file.webViewLink || driveWebUrl(file.id),
    driveWebContentLink: file.webContentLink || '',
    driveThumbnailLink: file.thumbnailLink || '',
    md5Checksum: file.md5Checksum || '',
    driveParents: file.parents || [],
  };
}





export function uploadFileToDrive(token, folderId, file, onProgress = () => {}, extraMetadata = {}) {
  const mimeType = file.type || 'application/octet-stream';
  const boundary = `knowledge_vault_${crypto.randomUUID()}`;
  const metadata = {
    ...extraMetadata,
    name: file.name || 'Untitled file',
    mimeType,
    parents: [folderId],
  };

  const body = new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${mimeType}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ], { type: `multipart/related; boundary=${boundary}` });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fields = 'id,name,mimeType,size,modifiedTime,createdTime,webViewLink,webContentLink,thumbnailLink,md5Checksum,parents,iconLink';
    xhr.open('POST', `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&${encodeQuery({ fields })}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new Error('Google Drive upload failed.'));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        try {
          const parsed = JSON.parse(xhr.responseText);
          reject(new Error(parsed.error?.message || 'Google Drive upload failed.'));
        } catch {
          reject(new Error(xhr.responseText || 'Google Drive upload failed.'));
        }
        return;
      }
      resolve(JSON.parse(xhr.responseText));
    };
    xhr.send(body);
  });
}

