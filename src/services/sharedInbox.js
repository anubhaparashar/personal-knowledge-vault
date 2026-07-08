import { db, firebaseNamespace } from '../firebase';
import { listLocalCaptures, updateLocalCapture } from './shareCapture';
import { withFirestoreWriteTimeout } from './pages';

function requireDb() {
  if (!db) throw new Error('Firebase is not configured.');
  return db;
}

function sharedInboxCollection(uid) {
  return requireDb().collection('users').doc(uid).collection('sharedInbox');
}

function timestampFrom(value) {
  if (!value) return firebaseNamespace.firestore.FieldValue.serverTimestamp();
  if (typeof value?.toDate === 'function') return value;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? firebaseNamespace.firestore.FieldValue.serverTimestamp()
    : firebaseNamespace.firestore.Timestamp.fromDate(date);
}

function cleanDateForFirestore(date = {}) {
  return {
    id: date.id || '',
    type: date.type || date.title || 'Detected date',
    date: date.date || '',
    endDate: date.endDate || '',
    datePrecision: date.datePrecision || date.precision || 'day',
    time: date.time || '',
    timeZone: date.timeZone || '',
    snippet: date.snippet || date.sourceText || '',
    source: date.source || 'automatic',
    confidence: date.confidence || '',
    uncertain: Boolean(date.uncertain),
    confirmed: Boolean(date.confirmed),
    detectionStatus: date.detectionStatus || '',
  };
}

function attachmentMetadata(files = []) {
  return (Array.isArray(files) ? files : []).map((file) => ({
    name: file.name || 'shared-file',
    type: file.type || file.mimeType || 'application/octet-stream',
    size: Number(file.size || 0),
    lastModified: file.lastModified || null,
  }));
}

export function serializeSharedCapture(capture = {}, { isNew = false } = {}) {
  const payload = {
    rawTitle: String(capture.rawTitle || '').slice(0, 600),
    rawText: String(capture.rawText || '').slice(0, 12000),
    rawUrl: String(capture.rawUrl || ''),
    canonicalUrl: capture.canonicalUrl || null,
    sourcePlatform: capture.sourcePlatform || 'unknown',
    receivedAt: timestampFrom(capture.receivedAt),
    suggestedCategory: capture.suggestedCategory || null,
    classificationConfidence: Number(capture.classificationConfidence || 0),
    classificationConfidenceLabel: capture.classificationConfidenceLabel || '',
    suggestedTags: Array.isArray(capture.suggestedTags) ? capture.suggestedTags.slice(0, 12) : [],
    detectedDates: (capture.detectedDates || []).map(cleanDateForFirestore).slice(0, 30),
    extractedContent: capture.extractedContent ? String(capture.extractedContent).slice(0, 30000) : null,
    summary: capture.summary ? String(capture.summary).slice(0, 1000) : null,
    processingStatus: capture.processingStatus || 'received',
    processingError: capture.processingError || null,
    destinationPageId: capture.destinationPageId || null,
    duplicateOf: capture.duplicateOf || null,
    duplicateTitle: capture.duplicateTitle || '',
    origin: capture.origin || 'system-share',
    attachmentIndicator: capture.attachmentIndicator || '',
    attachments: attachmentMetadata(capture.files || capture.attachments),
    archived: Boolean(capture.archived),
    reviewSuggested: Boolean(capture.reviewSuggested),
    updatedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
  };
  if (capture.localId) payload.localId = capture.localId;
  if (isNew) payload.createdAt = firebaseNamespace.firestore.FieldValue.serverTimestamp();
  return payload;
}


function serializeSharedCapturePatch(patch = {}) {
  const payload = {
    updatedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
  };
  const scalarFields = [
    'rawTitle', 'rawText', 'rawUrl', 'canonicalUrl', 'sourcePlatform', 'suggestedCategory',
    'classificationConfidenceLabel', 'extractedContent', 'summary', 'processingStatus',
    'processingError', 'destinationPageId', 'duplicateOf', 'duplicateTitle', 'origin',
    'attachmentIndicator',
  ];
  scalarFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(patch, field)) payload[field] = patch[field] ?? null;
  });
  if (Object.prototype.hasOwnProperty.call(patch, 'classificationConfidence')) {
    payload.classificationConfidence = Number(patch.classificationConfidence || 0);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'receivedAt')) payload.receivedAt = timestampFrom(patch.receivedAt);
  if (Object.prototype.hasOwnProperty.call(patch, 'suggestedTags')) payload.suggestedTags = (patch.suggestedTags || []).slice(0, 12);
  if (Object.prototype.hasOwnProperty.call(patch, 'detectedDates')) payload.detectedDates = (patch.detectedDates || []).map(cleanDateForFirestore).slice(0, 30);
  if (Object.prototype.hasOwnProperty.call(patch, 'files') || Object.prototype.hasOwnProperty.call(patch, 'attachments')) {
    payload.attachments = attachmentMetadata(patch.files || patch.attachments);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'archived')) payload.archived = Boolean(patch.archived);
  if (Object.prototype.hasOwnProperty.call(patch, 'reviewSuggested')) payload.reviewSuggested = Boolean(patch.reviewSuggested);
  return payload;
}
export function subscribeSharedInbox(uid, onData, onError) {
  return sharedInboxCollection(uid)
    .orderBy('receivedAt', 'desc')
    .onSnapshot(
      (snapshot) => onData(snapshot.docs.map((doc) => ({ id: doc.id, synced: true, remoteId: doc.id, ...doc.data() }))),
      onError,
    );
}

export function createSharedInboxId(uid) {
  return sharedInboxCollection(uid).doc().id;
}

export async function saveSharedInboxCapture(uid, captureId, capture, isNew = false) {
  await withFirestoreWriteTimeout(
    sharedInboxCollection(uid).doc(captureId).set(serializeSharedCapture(capture, { isNew }), { merge: true }),
  );
  return captureId;
}

export async function updateSharedInboxCapture(uid, captureId, patch) {
  await withFirestoreWriteTimeout(
    sharedInboxCollection(uid).doc(captureId).set(serializeSharedCapturePatch(patch), { merge: true }),
  );
}

export async function deleteSharedInboxCapture(uid, captureId) {
  await withFirestoreWriteTimeout(sharedInboxCollection(uid).doc(captureId).delete());
}

export async function syncPendingLocalCaptures(uid) {
  const localItems = await listLocalCaptures();
  const synced = [];
  for (const item of localItems) {
    if (item.synced && item.remoteId) continue;
    const captureId = item.remoteId || item.id || createSharedInboxId(uid);
    await saveSharedInboxCapture(uid, captureId, { ...item, localId: item.id }, true);
    await updateLocalCapture(item.id, { synced: true, remoteId: captureId });
    synced.push(captureId);
  }
  return synced;
}
