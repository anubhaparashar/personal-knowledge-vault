import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  allowedEmail,
  allowedUid,
  auth,
  googleProvider,
  isFirebaseConfigured,
} from '../firebase';

const ACCESS_DENIED = 'Access Denied.';
const accessMessage = (reason) => `${ACCESS_DENIED} ${reason}`;

function isApprovedUser(user) {
  if (!user) return false;
  if (allowedUid && user.uid !== allowedUid) return false;
  if (allowedEmail && user.email?.toLowerCase() !== allowedEmail) return false;
  return true;
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState('');

  useEffect(() => {
    console.info('[app] auth initialization status', {
      firebaseConfigured: isFirebaseConfigured,
      authAvailable: Boolean(auth),
      status: auth ? 'listening' : 'unavailable',
    });

    if (!auth) {
      setLoading(false);
      console.info('[app] auth initialization status', { status: 'ready', signedIn: false });
      return undefined;
    }

    return auth.onAuthStateChanged(async (nextUser) => {
      console.info('[app] auth state changed', { status: nextUser ? 'signed-in' : 'signed-out' });
      if (nextUser && !isApprovedUser(nextUser)) {
        await auth.signOut();
        setUser(null);
        setError(accessMessage('This account is not approved for this vault.'));
        console.warn('[app] auth initialization status', { status: 'access-denied' });
      } else {
        setUser(nextUser);
      }
      setLoading(false);
      console.info('[app] auth initialization status', { status: 'ready', signedIn: Boolean(nextUser) });
    });
  }, []);

  async function login() {
    if (!auth || !googleProvider) {
      setError('Firebase is not configured. Copy .env.example to .env and add your Firebase values.');
      return;
    }

    setError('');
    try {
      const result = await auth.signInWithPopup(googleProvider);
      if (!isApprovedUser(result.user)) {
        await auth.signOut();
        throw new Error(accessMessage('This account is not approved for this vault.'));
      }
    } catch (loginError) {
      setError(loginError.message || 'Sign-in failed.');
    }
  }

  async function logout() {
    if (auth) await auth.signOut();
  }

  const value = useMemo(
    () => ({ user, loading, error, login, logout, isFirebaseConfigured }),
    [user, loading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
