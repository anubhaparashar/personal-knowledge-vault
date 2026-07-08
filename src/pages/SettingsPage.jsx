import React, { useEffect, useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import DiscoverySettingsPanel from '../components/DiscoverySettingsPanel';
import { useAuth } from '../context/AuthContext';
import { allowedEmail, allowedUid } from '../firebase';
import { importPages, savePage } from '../services/pages';
import { importPdfs } from '../services/pdfs';
import { bookmarkletSource, countPendingLocalCaptures, productionShareUrl } from '../services/shareCapture';
import { downloadBackup } from '../utils/download';
import { migrateLegacyPageDates } from '../utils/dates';
import { readAutoEnrichPastedLinksMode, writeAutoEnrichPastedLinksMode } from '../utils/sourceLinks';

export default function SettingsPage({ pages, pdfs = [] }) {
  const { user } = useAuth();
  const fileInput = useRef(null);
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [reanalysisProgress, setReanalysisProgress] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installStatus, setInstallStatus] = useState('Installation unavailable in this browser');
  const [manifestStatus, setManifestStatus] = useState('Checking manifest...');
  const [serviceWorkerStatus, setServiceWorkerStatus] = useState('Checking service worker...');
  const [pendingOfflineCaptures, setPendingOfflineCaptures] = useState(0);
  const [autoEnrichPastedLinks, setAutoEnrichPastedLinks] = useState(readAutoEnrichPastedLinksMode);

  const testShareUrl = productionShareUrl({
    title: 'Test share',
    text: 'Postdoctoral vacancy, applications close 31 August 2026.',
    url: 'https://example.edu/postdoc',
  });

  useEffect(() => {
    const dismissed = localStorage.getItem('aprv-install-dismissed') === 'true';
    function updateStandaloneStatus() {
      const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
      if (standalone) setInstallStatus('Already running as app');
      else if (installPrompt && !dismissed) setInstallStatus('Installation available');
      else setInstallStatus('Installation unavailable in this browser');
    }

    const beforeInstall = (event) => {
      event.preventDefault();
      if (!dismissed) {
        setInstallPrompt(event);
        setInstallStatus('Installation available');
      }
    };
    const installed = () => {
      setInstallPrompt(null);
      setInstallStatus('Installed');
    };

    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    updateStandaloneStatus();

    fetch(`${import.meta.env.BASE_URL}manifest.webmanifest`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then((manifest) => {
        const validShareTarget = manifest?.share_target?.action === './?share-target=1'
          && manifest?.start_url === '/personal-knowledge-vault/'
          && manifest?.scope === '/personal-knowledge-vault/';
        setManifestStatus(validShareTarget ? 'Valid share target manifest' : 'Manifest loaded, share target needs review');
      })
      .catch((statusError) => setManifestStatus(`Manifest unavailable: ${statusError.message}`));

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
        .then((registration) => setServiceWorkerStatus(registration ? 'Service worker registered' : 'Service worker not registered yet'))
        .catch((statusError) => setServiceWorkerStatus(`Service worker check failed: ${statusError.message}`));
    } else {
      setServiceWorkerStatus('Service worker unavailable in this browser');
    }

    countPendingLocalCaptures().then(setPendingOfflineCaptures).catch(() => setPendingOfflineCaptures(0));

    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
    };
  }, [installPrompt]);

  function updateAutoEnrichPastedLinks(value) {
    setAutoEnrichPastedLinks(writeAutoEnrichPastedLinksMode(value));
  }
  async function installPwa() {
    if (!installPrompt) {
      const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
      setInstallStatus(standalone ? 'Already running as app' : 'Installation unavailable in this browser');
      return;
    }
    installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
    setInstallPrompt(null);
    if (choice.outcome === 'accepted') setInstallStatus('Installed');
    else {
      localStorage.setItem('aprv-install-dismissed', 'true');
      setInstallStatus('Installation unavailable in this browser');
    }
  }

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
    const confirmed = window.confirm(`Reanalyse ${pages.length} page(s) for important dates? This preserves manually created, manually edited and completed dates.`);
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

        <article className="settings-card sharing-capture-card">
          <h2>Sharing and Capture</h2>
          <p>Install the vault on your phone so it appears when you share links and posts from other applications.</p>
          <div className="settings-status-grid">
            <div><dt>Installation status</dt><dd>{installStatus}</dd></div>
            <div><dt>Manifest status</dt><dd>{manifestStatus}</dd></div>
            <div><dt>Service-worker status</dt><dd>{serviceWorkerStatus}</dd></div>
            <div><dt>Pending offline captures</dt><dd>{pendingOfflineCaptures}</dd></div>
          </div>
          <label className="field-label">Automatically enrich pasted links
            <select value={autoEnrichPastedLinks} onChange={(event) => updateAutoEnrichPastedLinks(event.target.value)}>
              <option value="auto">Automatically enrich</option>
              <option value="ask">Ask before enrichment</option>
              <option value="never">Never enrich automatically</option>
            </select>
          </label>
          <p className="small-note">Even when automatic enrichment is disabled, the editor still shows Link detected - Import source.</p>
          <div className="settings-action-row">
            <button className="button primary" type="button" disabled={!installPrompt && !/available/i.test(installStatus)} onClick={installPwa}>Install AP Research Vault</button>
            <a className="button secondary" href="#/shared-inbox">Open Shared Inbox</a>
          </div>
          <div className="sharing-instructions">
            <h3>Android/Chrome</h3>
            <ol>
              <li>Open AP Research Vault in Chrome.</li>
              <li>Select Install App or Add to Home Screen.</li>
              <li>Open Facebook or LinkedIn.</li>
              <li>Tap Share.</li>
              <li>Select AP Research Vault.</li>
            </ol>
          </div>
          <div className="sharing-test-box">
            <strong>Test Share Target</strong>
            <code>{testShareUrl}</code>
            <button className="button secondary" type="button" onClick={() => navigator.clipboard?.writeText(testShareUrl)}>Copy test URL</button>
          </div>
          <div className="bookmarklet-box">
            <strong>Browser bookmarklet</strong>
            <p>Name it <strong>Save to AP Research Vault</strong>, then use it to capture the current page title, URL and selected text.</p>
            <textarea readOnly rows="4" value={bookmarkletSource()} />
          </div>
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
          <button className="button secondary" disabled={working || !pages.length} onClick={reanalyseExistingPages}>Reanalyse all pages</button>
          {reanalysisProgress ? <p className="status-message">{reanalysisProgress}</p> : null}
        </article>

        <DiscoverySettingsPanel />

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
