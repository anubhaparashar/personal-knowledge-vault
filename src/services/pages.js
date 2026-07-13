import { db, firebaseNamespace } from '../firebase';
import {
  archivePatch,
  buildOriginMigrationPatch,
  normalizePage,
  normalizePageForSave,
  normalizePagePatch,
  unarchivePatch,
} from '../utils/pageModel';

export const FIRESTORE_WRITE_TIMEOUT_MS = 15_000;
export const FIRESTORE_SAVE_TIMEOUT_MESSAGE = 'Saving timed out. Check that Firestore is created, your security rules allow this account, and your internet connection is working.';

class FirestoreWriteTimeoutError extends Error {
  constructor() {
    super(FIRESTORE_SAVE_TIMEOUT_MESSAGE);
    this.name = 'FirestoreWriteTimeoutError';
    this.code = 'deadline-exceeded';
    this.isFirestoreWriteTimeout = true;
  }
}

function pagesCollection(uid) {
  if (!db) throw new Error('Firebase is not configured.');
  return db.collection('users').doc(uid).collection('pages');
}

function hasFullPageShape(data = {}) {
  return ['title', 'category', 'html', 'summary', 'plainText', 'tags', 'sourceUrl', 'origin'].some((field) => Object.prototype.hasOwnProperty.call(data, field));
}

function buildPagePayload(data, isNew = false) {
  const base = isNew || hasFullPageShape(data) ? normalizePageForSave(data, { isNew }) : normalizePagePatch(data);
  const payload = {
    ...base,
    updatedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
  };
  if (isNew) payload.createdAt = firebaseNamespace.firestore.FieldValue.serverTimestamp();
  return payload;
}

function buildSizePayload(data, isNew = false) {
  const serverTimestamp = { __type: 'serverTimestamp' };
  const base = isNew || hasFullPageShape(data) ? normalizePageForSave(data, { isNew }) : normalizePagePatch(data);
  const payload = {
    ...base,
    updatedAt: serverTimestamp,
  };
  if (isNew) payload.createdAt = serverTimestamp;
  return payload;
}

export function approximateFirestorePayloadBytes(data, isNew = false) {
  const json = JSON.stringify(buildSizePayload(data, isNew));
  return new TextEncoder().encode(json).length;
}

export function getFirebaseErrorCode(error) {
  const rawCode = error?.code || error?.name || '';
  const code = String(rawCode).trim();
  if (!code) return 'unknown';
  return code.includes('/') ? code.split('/').pop() : code;
}

export function getFirestoreSaveErrorMessage(error) {
  if (error?.isFirestoreWriteTimeout) return FIRESTORE_SAVE_TIMEOUT_MESSAGE;

  switch (getFirebaseErrorCode(error)) {
    case 'permission-denied':
      return 'Firestore denied this save. Check the deployed security rules and UID.';
    case 'unavailable':
      return 'Firestore is temporarily unavailable or the browser is offline.';
    case 'not-found':
      return 'The Firestore database may not have been created.';
    case 'unauthenticated':
      return 'Your login session expired. Sign in again.';
    default:
      return error?.message || 'The page could not be saved.';
  }
}

export function withFirestoreWriteTimeout(writePromise, timeoutMs = FIRESTORE_WRITE_TIMEOUT_MS) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new FirestoreWriteTimeoutError()), timeoutMs);
  });

  return Promise.race([writePromise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

export function createPageId(uid) {
  return pagesCollection(uid).doc().id;
}

export function subscribePages(uid, onData, onError) {
  return pagesCollection(uid)
    .orderBy('updatedAt', 'desc')
    .onSnapshot(
      (snapshot) => onData(snapshot.docs.map((item) => normalizePage({ id: item.id, ...item.data() }))),
      onError,
    );
}

export async function savePage(uid, pageId, data, isNew = false) {
  await withFirestoreWriteTimeout(
    pagesCollection(uid).doc(pageId).set(buildPagePayload(data, isNew), { merge: true }),
  );
}

export async function archivePage(uid, pageId, reason = 'Archived by user') {
  await savePage(uid, pageId, archivePatch(reason), false);
}

export async function unarchivePage(uid, pageId) {
  await savePage(uid, pageId, unarchivePatch(), false);
}

export async function migratePageOriginFields(uid, page) {
  const patch = buildOriginMigrationPatch(page);
  if (!patch) return false;
  await savePage(uid, page.id, patch, false);
  return true;
}

export async function removePage(uid, pageId) {
  await withFirestoreWriteTimeout(pagesCollection(uid).doc(pageId).delete());
}

export async function importPages(uid, backupPages) {
  if (!Array.isArray(backupPages)) throw new Error('Backup does not contain a pages array.');
  for (const page of backupPages) {
    const pageId = page.id || createPageId(uid);
    const { id, createdAt, updatedAt, ...rest } = page;
    await withFirestoreWriteTimeout(
      pagesCollection(uid).doc(pageId).set({
        ...normalizePageForSave(rest, { isNew: true }),
        importedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
        createdAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
      }),
    );
  }
}