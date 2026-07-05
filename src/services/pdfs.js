import { db, firebaseNamespace } from '../firebase';

function pdfsCollection(uid) {
  if (!db) throw new Error('Firebase is not configured.');
  return db.collection('users').doc(uid).collection('pdfs');
}

export function createPdfId(uid) {
  return pdfsCollection(uid).doc().id;
}

export function subscribePdfs(uid, onData, onError) {
  return pdfsCollection(uid)
    .orderBy('updatedAt', 'desc')
    .onSnapshot(
      (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      onError,
    );
}

export async function savePdf(uid, pdfId, data, isNew = false) {
  const payload = {
    ...data,
    updatedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
  };
  if (isNew) payload.createdAt = firebaseNamespace.firestore.FieldValue.serverTimestamp();
  await pdfsCollection(uid).doc(pdfId).set(payload, { merge: true });
}

export async function removePdf(uid, pdfId) {
  await pdfsCollection(uid).doc(pdfId).delete();
}

export async function importPdfs(uid, backupPdfs = []) {
  if (!Array.isArray(backupPdfs)) return 0;
  for (const pdf of backupPdfs) {
    const pdfId = pdf.id || createPdfId(uid);
    const { id, createdAt, updatedAt, importedAt, ...rest } = pdf;
    await pdfsCollection(uid).doc(pdfId).set({
      ...rest,
      importedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
      createdAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  return backupPdfs.length;
}
