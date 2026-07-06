import React, { useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import { allowedEmail, allowedUid } from '../firebase';
import { importPages } from '../services/pages';
import { importPdfs } from '../services/pdfs';
import { downloadBackup } from '../utils/download';

export default function SettingsPage({ pages, pdfs = [] }) {
  const { user } = useAuth();
  const fileInput = useRef(null);
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);

  async function handleImport(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setWorking(true);
    setMessage('');
    try {
      const backup = JSON.parse(await file.text());
      if (backup.format !== 'personal-knowledge-vault' || !Array.isArray(backup.pages)) {
        throw new Error('This is not a valid Knowledge Vault backup.');
      }
      const pdfCount = Array.isArray(backup.pdfs) ? backup.pdfs.length : 0;
      const confirmed = window.confirm(`Import ${backup.pages.length} pages and ${pdfCount} PDF metadata records? Existing records with the same IDs may be replaced.`);
      if (!confirmed) return;
      await importPages(user.uid, backup.pages);
      await importPdfs(user.uid, backup.pdfs || []);
      setMessage(`Imported ${backup.pages.length} pages and ${pdfCount} PDF metadata records.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <AppShell title="Backup & Settings">
      <section className="settings-grid">
        <article className="settings-card">
          <h2>Complete library backup</h2>
          <p>Exports page records and Google Drive PDF metadata as JSON. Secure notes remain encrypted in the backup. Drive file bytes stay in Google Drive.</p>
          <button className="button primary" onClick={() => downloadBackup(pages, pdfs)}>Download JSON backup</button>
          <button className="button secondary" disabled={working} onClick={() => fileInput.current?.click()}>{working ? 'Importing...' : 'Restore JSON backup'}</button>
          <input ref={fileInput} hidden type="file" accept="application/json" onChange={handleImport} />
          {message ? <p className="status-message">{message}</p> : null}
        </article>

        <article className="settings-card">
          <h2>Access control</h2>
          <dl>
            <div><dt>Signed in as</dt><dd>{user.email}</dd></div>
            <div><dt>Allowed UID</dt><dd>{allowedUid || 'Not configured'}</dd></div>
            <div><dt>Allowed email</dt><dd>{allowedEmail || 'Not configured'}</dd></div>
            <div><dt>Stored pages</dt><dd>{pages.length}</dd></div>
            <div><dt>Drive PDFs</dt><dd>{pdfs.length}</dd></div>
          </dl>
          <p>Firestore rules must use the exact UID. The frontend also checks the email and signs out anything else immediately.</p>
        </article>

        <article className="settings-card warning-card">
          <h2>Password safety</h2>
          <p>Do not treat this application as a replacement for a professionally audited password manager. Use secure notes for private references, research and recovery instructions, not as the only copy of banking passwords, API keys or recovery codes.</p>
        </article>

        <article className="settings-card">
          <h2>Download choices</h2>
          <p>Each page includes "Download HTML" and "Print / Save PDF". PDFs and attachments open from Google Drive, and your browser print screen can create a PDF containing the currently unlocked page.</p>
        </article>
      </section>
    </AppShell>
  );
}
