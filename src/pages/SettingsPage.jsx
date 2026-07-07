import React, { useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import { allowedEmail, allowedUid } from '../firebase';
import { importPages, savePage } from '../services/pages';
import { importPdfs } from '../services/pdfs';
import { downloadBackup } from '../utils/download';
import { migrateLegacyPageDates } from '../utils/dates';

export default function SettingsPage({ pages, pdfs = [] }) {
  const { user } = useAuth();
  const fileInput = useRef(null);
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [reanalysisProgress, setReanalysisProgress] = useState('');

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

  async function reanalyseExistingPages() {
    const confirmed = window.confirm(`Reanalyse ${pages.length} existing page(s) for important dates? This preserves manually edited, confirmed and completed dates.`);
    if (!confirmed) return;
    setWorking(true);
    setMessage('');
    setReanalysisProgress('Preparing date analysis...');
    const stats = { pagesAnalysed: 0, datesDetected: 0, requiringConfirmation: 0, noDeadlineFound: 0 };
    try {
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        setReanalysisProgress(`Analysing page ${index + 1} of ${pages.length}`);
        const result = migrateLegacyPageDates(page, { force: true });
        stats.pagesAnalysed += 1;
        stats.datesDetected += result.detectedCount || 0;
        stats.requiringConfirmation += result.requiringConfirmation || 0;
        if (result.noDeadlineFound) stats.noDeadlineFound += 1;
        if (result.changed && result.analysisPatch) {
          await savePage(user.uid, page.id, result.analysisPatch, false);
        }
      }
      setMessage(`Pages analysed: ${stats.pagesAnalysed}. Dates detected: ${stats.datesDetected}. Pages requiring confirmation: ${stats.requiringConfirmation}. Pages with no deadline found: ${stats.noDeadlineFound}.`);
    } catch (error) {
      setMessage(error.message || 'Could not reanalyse existing pages.');
    } finally {
      setWorking(false);
      setReanalysisProgress('');
    }
  }
  return (
    <AppShell title="Backup & Settings">
      <section className="settings-grid">
        <article className="settings-card">
          <h2>Complete library backup</h2>
          <p>Exports page records, Firebase Storage attachment metadata and Google Drive PDF metadata as JSON. Secure notes remain encrypted in the backup. File bytes stay in Firebase Storage or Google Drive.</p>
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

        <article className="settings-card">
          <h2>Automatic date analysis</h2>
          <p>Reanalyse saved pages using the local deterministic date detector. This is safe to run more than once and preserves manually edited dates.</p>
          <button className="button secondary" disabled={working || !pages.length} onClick={reanalyseExistingPages}>Reanalyse existing pages</button>
          {reanalysisProgress ? <p className="status-message">{reanalysisProgress}</p> : null}
        </article>
        <article className="settings-card warning-card">
          <h2>Password safety</h2>
          <p>Do not treat this application as a replacement for a professionally audited password manager. Use secure notes for private references, research and recovery instructions, not as the only copy of banking passwords, API keys or recovery codes.</p>
        </article>

        <article className="settings-card">
          <h2>Download choices</h2>
          <p>Each page includes "Download HTML" and "Print / Save PDF". Page attachments open from Firebase Storage, PDF library files open from Google Drive, and your browser print screen can create a PDF containing the currently unlocked page.</p>
        </article>
      </section>
    </AppShell>
  );
}
