const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const configuredStorageBucket = (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim();
if (configuredStorageBucket) firebaseConfig.storageBucket = configuredStorageBucket;

const firebaseNamespace = globalThis.firebase;
export const isFirebaseConfigured = Boolean(firebaseNamespace) && Object.values(firebaseConfig).every(Boolean);
export const allowedUid = (import.meta.env.VITE_ALLOWED_UID || '').trim();
export const allowedEmail = (import.meta.env.VITE_ALLOWED_EMAIL || '').trim().toLowerCase();
export const googleOAuthClientId = (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '').trim();
export const googleApiKey = (import.meta.env.VITE_GOOGLE_API_KEY || '').trim();
export const googlePickerAppId = googleOAuthClientId.split('-')[0] || '';
export const googleDriveFolderId = (import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID || '').trim();
export const googleApprovedEmail = (import.meta.env.VITE_GOOGLE_APPROVED_EMAIL || allowedEmail || '').trim().toLowerCase();
export const firebaseConfigPresence = Object.freeze({
  sdkLoaded: Boolean(firebaseNamespace),
  apiKey: Boolean(firebaseConfig.apiKey),
  authDomain: Boolean(firebaseConfig.authDomain),
  projectId: Boolean(firebaseConfig.projectId),
  messagingSenderId: Boolean(firebaseConfig.messagingSenderId),
  appId: Boolean(firebaseConfig.appId),
  storageBucket: Boolean(configuredStorageBucket),
});
export const firebaseStorageBucket = configuredStorageBucket;

let app = null;
let auth = null;
let db = null;
let storage = null;
let storageError = '';
let googleProvider = null;

if (isFirebaseConfigured) {
  app = firebaseNamespace.apps.length
    ? firebaseNamespace.app()
    : firebaseNamespace.initializeApp(firebaseConfig);
  auth = app.auth();
  db = app.firestore();
  if (!configuredStorageBucket) {
    storageError = 'Firebase Storage bucket is not configured. Set VITE_FIREBASE_STORAGE_BUCKET.';
  } else if (firebaseNamespace.storage) {
    try {
      storage = app.storage();
    } catch (error) {
      storageError = error?.message || 'Firebase Storage could not be initialised.';
      console.warn('[Firebase] Storage initialisation failed:', { message: storageError });
    }
  } else {
    storageError = 'Firebase Storage SDK did not load.';
  }
  googleProvider = new firebaseNamespace.auth.GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  auth.setPersistence(firebaseNamespace.auth.Auth.Persistence.LOCAL).catch((error) => {
    console.warn('Could not set Firebase auth persistence:', error);
  });
}

export const isStorageConfigured = Boolean(storage && configuredStorageBucket);
export { app, auth, db, storage, storageError, googleProvider, firebaseNamespace };
