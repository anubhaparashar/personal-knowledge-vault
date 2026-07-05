import React from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, error, isFirebaseConfigured } = useAuth();

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-emblem">KV</div>
        <p className="eyebrow">PRIVATE • INDEXED • ENCRYPTED</p>
        <h1>My Knowledge Vault</h1>
        <p className="login-intro">
          Capture web research, links, images, documents and private notes in one searchable digital book.
        </p>

        {isFirebaseConfigured ? (
          <button className="button primary large full" onClick={login}>Continue with Google</button>
        ) : (
          <div className="setup-box">
            <strong>Firebase setup is required</strong>
            <ol>
              <li>Copy <code>.env.example</code> to <code>.env</code>.</li>
              <li>Add the Firebase web-app configuration values.</li>
              <li>Set <code>VITE_ALLOWED_EMAIL</code>.</li>
              <li>Restart <code>npm run dev</code>.</li>
            </ol>
          </div>
        )}

        {error ? <p className="form-error">{error}</p> : null}
        <div className="login-features">
          <span>Rich paste capture</span>
          <span>Automatic indexes</span>
          <span>Book and scroll reading</span>
          <span>Encrypted secure notes</span>
        </div>
      </section>
    </main>
  );
}
