import { db, firebaseNamespace } from '../firebase';
import { withFirestoreWriteTimeout, savePage } from './pages';
import { buildPublicSharePayload, publicShareUrl } from '../utils/pageModel';

function requireDb() {
  if (!db) throw new Error('Firebase is not configured.');
  return db;
}

function publicSharesCollection() {
  return requireDb().collection('publicShares');
}

function createShareId() {
  if (crypto?.randomUUID) return `share_${crypto.randomUUID().replace(/-/g, '')}`;
  return `share_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

function expiryDateFor(value = 'never', customValue = '') {
  if (value === 'never') return null;
  if (value === 'custom' && customValue) {
    const custom = new Date(customValue);
    return Number.isNaN(custom.getTime()) ? null : custom.toISOString();
  }
  const days = value === '7-days' ? 7 : value === '30-days' ? 30 : 0;
  if (!days) return null;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export async function createPublicShare(uid, page, options = {}) {
  if (!uid) throw new Error('Sign in before creating a share link.');
  if (page.secure) throw new Error('Encrypted notes cannot be publicly shared unless you create a separate unencrypted share copy.');
  const shareId = page.shareId || createShareId();
  const shareExpiresAt = expiryDateFor(options.expiry || 'never', options.customExpiry || '');
  const payload = buildPublicSharePayload(page, { ...options, shareExpiresAt });
  const publicShareExpiresAt = shareExpiresAt
    ? firebaseNamespace.firestore.Timestamp.fromDate(new Date(shareExpiresAt))
    : null;
  await withFirestoreWriteTimeout(publicSharesCollection().doc(shareId).set({
    ...payload,
    shareExpiresAt: publicShareExpiresAt,
    updatedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
  }, { merge: true }));
  await savePage(uid, page.id, {
    visibility: 'share-link',
    shareId,
    shareCreatedAt: new Date().toISOString(),
    shareExpiresAt,
  }, false);
  return { shareId, url: publicShareUrl(shareId) };
}

export async function disablePublicShare(uid, page) {
  if (!uid) throw new Error('Sign in before disabling a share link.');
  if (page.shareId) {
    await withFirestoreWriteTimeout(publicSharesCollection().doc(page.shareId).set({
      active: false,
      visibility: 'private',
      disabledAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }));
  }
  await savePage(uid, page.id, {
    visibility: 'private',
    shareId: null,
    shareCreatedAt: null,
    shareExpiresAt: null,
  }, false);
}

export async function getPublicShare(shareId) {
  if (!shareId) return null;
  const snapshot = await publicSharesCollection().doc(shareId).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  if (data.visibility !== 'share-link' || data.active === false) return null;
  if (data.shareExpiresAt) {
    const expires = data.shareExpiresAt?.toDate ? data.shareExpiresAt.toDate() : new Date(data.shareExpiresAt);
    if (!Number.isNaN(expires.getTime()) && expires.getTime() < Date.now()) return null;
  }
  return { id: snapshot.id, ...data };
}