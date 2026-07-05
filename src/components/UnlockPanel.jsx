import React, { useState } from 'react';

export default function UnlockPanel({ onUnlock, title = 'Unlock secure note' }) {
  const [passphrase, setPassphrase] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setWorking(true);
    setError('');
    try {
      await onUnlock(passphrase);
      setPassphrase('');
    } catch (unlockError) {
      setError(unlockError.message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="unlock-card">
      <div className="lock-symbol">🔒</div>
      <h2>{title}</h2>
      <p>The passphrase is used only in this browser to decrypt the note. It is not stored in Firebase.</p>
      <form onSubmit={submit}>
        <label>
          Master passphrase
          <input
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="button primary" disabled={working}>{working ? 'Unlocking…' : 'Unlock note'}</button>
      </form>
      <p className="warning-note"><strong>Important:</strong> use a password manager for actual account passwords. This vault is for encrypted private notes and references.</p>
    </div>
  );
}
