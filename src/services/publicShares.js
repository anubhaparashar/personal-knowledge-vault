import { db, firebaseNamespace } from '../firebase';
import { withFirestoreWriteTimeout, savePage } from './pages';
import { buildPublicSharePayload, isMyEntry, normalizePage, publicShareUrl } from '../utils/pageModel';

function requireDb() {
  if (!db) throw new Error('Firebase is not configured.');
  return db;
}

function publicSharesCollection() {
  return requireDb().collection('publicShares');
}

function createShareId() {
  if (globalThis.crypto?.randomUUID) return `share_${globalThis.crypto.randomUUID().replace(/-/g, '')}`;
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
  const normalized = normalizePage(page);
  if (!normalized.id) throw new Error('Save this entry before sharing it.');
  if (!isMyEntry(normalized)) throw new Error('Only manual entries can be made shareable. Scraped entries stay private unless saved to My Entries first.');
  if (normalized.secure) throw new Error('Encrypted notes cannot be publicly shared unless you create a separate unencrypted share copy.');

  const shareId = normalized.shareId || createShareId();
  const shareExpiresAt = expiryDateFor(options.expiry || 'never', options.customExpiry || '');
  const payload = buildPublicSharePayload(normalized, { ...options, shareExpiresAt });
  const publicShareExpiresAt = shareExpiresAt
    ? firebaseNamespace.firestore.Timestamp.fromDate(new Date(shareExpiresAt))
    : null;

  await withFirestoreWriteTimeout(publicSharesCollection().doc(shareId).set({
    ...payload,
    shareExpiresAt: publicShareExpiresAt,
    updatedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
  }, { merge: true }));

  await savePage(uid, normalized.id, {
    visibility: 'shareable',
    shareEnabled: true,
    shareId,
    shareCreatedAt: new Date().toISOString(),
    shareExpiresAt,
  }, false);

  return { shareId, url: publicShareUrl(shareId) };
}

export async function disablePublicShare(uid, page) {
  if (!uid) throw new Error('Sign in before disabling a share link.');
  const normalized = normalizePage(page);
  if (normalized.shareId) {
    await withFirestoreWriteTimeout(publicSharesCollection().doc(normalized.shareId).set({
      active: false,
      visibility: 'private',
      disabledAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebaseNamespace.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }));
  }
  await savePage(uid, normalized.id, {
    visibility: 'private',
    shareEnabled: false,
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