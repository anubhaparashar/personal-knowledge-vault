import { db, firebaseNamespace } from '../firebase';

function pagesCollection(uid) {
  if (!db) throw new Error('Firebase is not configured.');
  return db.collection('users').doc(uid).collection('pages');
}

export function createPageId(uid) {
  return pagesCollection(uid).doc().id;
}

export function subscribePages(uid, onData, onError) {
  return pagesCollection(uid)
    .orderBy('updatedAt', 'desc')
    .onSnapshot(
      (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      onError,
    );
}

export async function savePage(uid, pageId, data, isNew = false) {
  const payload = {
    ...data,
    updatedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
  };
  if (isNew) payload.createdAt = firebaseNamespace.firestore.FieldValue.serverTimestamp();
  await pagesCollection(uid).doc(pageId).set(payload, { merge: true });
}

export async function removePage(uid, pageId) {
  await pagesCollection(uid).doc(pageId).delete();
}

export async function importPages(uid, backupPages) {
  if (!Array.isArray(backupPages)) throw new Error('Backup does not contain a pages array.');
  for (const page of backupPages) {
    const pageId = page.id || createPageId(uid);
    const { id, createdAt, updatedAt, ...rest } = page;
    await pagesCollection(uid).doc(pageId).set({
      ...rest,
      importedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
      createdAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
    });
  }
}
