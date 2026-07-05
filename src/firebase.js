const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseNamespace = globalThis.firebase;
export const isFirebaseConfigured = Boolean(firebaseNamespace) && Object.values(firebaseConfig).every(Boolean);
export const allowedUid = (import.meta.env.VITE_ALLOWED_UID || '').trim();
export const allowedEmail = (import.meta.env.VITE_ALLOWED_EMAIL || '').trim().toLowerCase();
export const googleOAuthClientId = (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '').trim();
export const googleApiKey = (import.meta.env.VITE_GOOGLE_API_KEY || '').trim();
export const googlePickerAppId = googleOAuthClientId.split('-')[0] || '';
export const googleDriveFolderId = (import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID || '').trim();
export const googleApprovedEmail = (import.meta.env.VITE_GOOGLE_APPROVED_EMAIL || allowedEmail || '').trim().toLowerCase();

let app = null;
let auth = null;
let db = null;
let googleProvider = null;

if (isFirebaseConfigured) {
  app = firebaseNamespace.apps.length
    ? firebaseNamespace.app()
    : firebaseNamespace.initializeApp(firebaseConfig);
  auth = app.auth();
  db = app.firestore();
  googleProvider = new firebaseNamespace.auth.GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  auth.setPersistence(firebaseNamespace.auth.Auth.Persistence.LOCAL).catch((error) => {
    console.warn('Could not set Firebase auth persistence:', error);
  });
}

export { app, auth, db, googleProvider, firebaseNamespace };
