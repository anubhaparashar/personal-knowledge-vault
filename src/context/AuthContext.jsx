import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  allowedEmail,
  auth,
  googleProvider,
  isFirebaseConfigured,
} from '../firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return undefined;
    }

    return auth.onAuthStateChanged(async (nextUser) => {
      if (
        nextUser
        && allowedEmail
        && nextUser.email?.toLowerCase() !== allowedEmail
      ) {
        await auth.signOut();
        setError(`Access is restricted to ${allowedEmail}.`);
        setUser(null);
      } else {
        setUser(nextUser);
      }
      setLoading(false);
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
      const email = result.user.email?.toLowerCase();
      if (allowedEmail && email !== allowedEmail) {
        await auth.signOut();
        throw new Error(`Access is restricted to ${allowedEmail}.`);
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
