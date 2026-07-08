import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  DEFAULT_DISCOVERY_SETTINGS,
  SOURCE_TYPES,
  deleteDiscoverySource,
  formatDiscoveryTimestamp,
  isDiscoveryBackendConfigured,
  nextScheduledScan,
  pauseDiscoverySource,
  saveDiscoverySettings,
  saveDiscoverySource,
  scanDiscoverySource,
  subscribeDiscoverySettings,
  subscribeDiscoverySources,
  subscribeDiscoveryStats,
  subscribeLatestDiscoveryRun,
  testDiscoverySource,
} from '../services/discovery';

const EMPTY_SOURCE = {
  name: '',
  url: '',
  type: 'Public webpage',
  expectedCategory: 'Research Opportunities/Scholarships',
  enabled: true,
  requestDelayMs: 1500,
  concurrencyLimit: 1,
  refreshFrequency: 'daily',
};

function splitTimes(value = []) {
  return [value[0] || '06:00', value[1] || '18:00'];
}

function normalizeDraft(source = {}) {
  return {
    ...EMPTY_SOURCE,
    ...source,
    requestDelayMs: Number(source.requestDelayMs || EMPTY_SOURCE.requestDelayMs),
    concurrencyLimit: Number(source.concurrencyLimit || EMPTY_SOURCE.concurrencyLimit),
    refreshFrequency: source.refreshFrequency || EMPTY_SOURCE.refreshFrequency,
  };
}

export default function DiscoverySettingsPanel() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_DISCOVERY_SETTINGS);
  const [sources, setSources] = useState([]);
  const [stats, setStats] = useState(null);
  const [latestRun, setLatestRun] = useState(null);
  const [sourceDraft, setSourceDraft] = useState(EMPTY_SOURCE);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const unsubscribers = [
      subscribeDiscoverySettings(user.uid, setSettings, (error) => setMessage(error.message)),
      subscribeDiscoverySources(user.uid, setSources, (error) => setMessage(error.message)),
      subscribeDiscoveryStats(user.uid, setStats, (error) => setMessage(error.message)),
      subscribeLatestDiscoveryRun(user.uid, setLatestRun, (error) => setMessage(error.message)),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
  }, [user?.uid]);

  const [timeOne, timeTwo] = splitTimes(settings.fullScanTimes);
  const configured = isDiscoveryBackendConfigured();
  const editingExisting = Boolean(sourceDraft.id);
  const canSaveSource = editingExisting || Boolean(preview?.ok);

  function updateSetting(name, value) {
    setSettings((current) => ({ ...current, [name]: value }));
  }

  function updateTime(index, value) {
    const next = splitTimes(settings.fullScanTimes);
    next[index] = value;
    updateSetting('fullScanTimes', next.filter(Boolean).slice(0, 2));
  }

  function updateSource(name, value) {
    setPreview(null);
    setSourceDraft((current) => ({ ...current, [name]: value }));
  }

  async function saveSchedule() {
    setWorking(true);
    setMessage('');
    try {
      await saveDiscoverySettings(user.uid, settings);
      setMessage('Discovery schedule preferences saved. Backend scheduler ownership remains in Firebase Functions.');
    } catch (error) {
      setMessage(error.message || 'Could not save discovery settings.');
    } finally {
      setWorking(false);
    }
  }

  async function testSource(source = sourceDraft) {
    setWorking(true);
    setMessage('');
    setPreview(null);
    try {
      const result = await testDiscoverySource(user, normalizeDraft(source));
      setPreview(result);
      setMessage(result.preview?.length ? `Source test found ${result.preview.length} preview record(s).` : 'Source test completed with no records.');
    } catch (error) {
      setMessage(error.message || 'Could not test this source.');
    } finally {
      setWorking(false);
    }
  }

  async function saveSource() {
    setWorking(true);
    setMessage('');
    try {
      await saveDiscoverySource(user.uid, normalizeDraft(sourceDraft));
      setSourceDraft(EMPTY_SOURCE);
      setPreview(null);
      setMessage('Source saved. It will be used only by configured backend scans.');
    } catch (error) {
      setMessage(error.message || 'Could not save source.');
    } finally {
      setWorking(false);
    }
  }

  async function scanSource(source) {
    setWorking(true);
    setMessage('');
    try {
      await scanDiscoverySource(user, source.id);
      setMessage('Single-source scan started. Watch the latest run status on the dashboard.');
    } catch (error) {
      setMessage(error.message || 'Could not scan this source.');
    } finally {
      setWorking(false);
    }
  }

  async function removeSource(source) {
    if (!window.confirm(`Delete source "${source.name || source.url}"?`)) return;
    await deleteDiscoverySource(user.uid, source.id);
  }

  return (
    <section className="discovery-settings-stack">
      <article className="settings-card full-width discovery-schedule-card">
        <h2>Discovery Schedule</h2>
        {!configured ? <p className="form-error">Automatic discovery is not configured. Deploy the Firebase Functions and set the discovery endpoints before claiming scans are active.</p> : null}
        <div className="settings-form-grid">
          <label className="switch-field"><input type="checkbox" checked={settings.automaticDiscoveryEnabled} onChange={(event) => updateSetting('automaticDiscoveryEnabled', event.target.checked)} /><span>Enable automatic discovery</span></label>
          <label className="switch-field"><input type="checkbox" checked={settings.pauseAllScanning} onChange={(event) => updateSetting('pauseAllScanning', event.target.checked)} /><span>Pause all scanning</span></label>
          <label className="field-label">Timezone<input value={settings.timezone} onChange={(event) => updateSetting('timezone', event.target.value)} placeholder="Asia/Kolkata" /></label>
          <label className="field-label">First full-scan time<input type="time" value={timeOne} onChange={(event) => updateTime(0, event.target.value)} /></label>
          <label className="field-label">Second full-scan time<input type="time" value={timeTwo} onChange={(event) => updateTime(1, event.target.value)} /></label>
          <label className="field-label">Existing-record refresh interval<select value={settings.refreshIntervalHours} onChange={(event) => updateSetting('refreshIntervalHours', Number(event.target.value))}><option value="3">Every 3 hours</option><option value="6">Every 6 hours</option><option value="12">Every 12 hours</option><option value="24">Every 24 hours</option></select></label>
          <label className="switch-field"><input type="checkbox" checked={settings.weekendScansEnabled} onChange={(event) => updateSetting('weekendScansEnabled', event.target.checked)} /><span>Enable weekend scans</span></label>
          <label className="field-label">Maximum sources per run<input type="number" min="1" max="100" value={settings.maxSourcesPerRun} onChange={(event) => updateSetting('maxSourcesPerRun', Number(event.target.value))} /></label>
        </div>
        <dl>
          <div><dt>Next scheduled scan</dt><dd>{configured ? nextScheduledScan(settings) : 'Automatic discovery is not configured'}</dd></div>
          <div><dt>Last successful scan</dt><dd>{formatDiscoveryTimestamp(stats?.lastSuccessfulScanAt)}</dd></div>
          <div><dt>Last attempted scan</dt><dd>{formatDiscoveryTimestamp(stats?.lastAttemptedScanAt || latestRun?.createdAt)}</dd></div>
        </dl>
        <button className="button primary" disabled={working} onClick={saveSchedule}>Save Discovery Schedule</button>
      </article>

      <article className="settings-card full-width discovery-source-card">
        <h2>Discovery Sources</h2>
        <p>Adding a source saves its configuration only after a test preview. It does not start a full-site crawl.</p>
        <div className="settings-form-grid">
          <label className="field-label">Source name<input value={sourceDraft.name} onChange={(event) => updateSource('name', event.target.value)} placeholder="University scholarships page" /></label>
          <label className="field-label">URL<input type="url" value={sourceDraft.url} onChange={(event) => updateSource('url', event.target.value)} placeholder="https://..." /></label>
          <label className="field-label">Type<select value={sourceDraft.type} onChange={(event) => updateSource('type', event.target.value)}>{SOURCE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="field-label">Expected category<input value={sourceDraft.expectedCategory} onChange={(event) => updateSource('expectedCategory', event.target.value)} /></label>
          <label className="field-label">Per-source request delay (ms)<input type="number" min="500" value={sourceDraft.requestDelayMs} onChange={(event) => updateSource('requestDelayMs', Number(event.target.value))} /></label>
          <label className="field-label">Concurrency limit<input type="number" min="1" max="3" value={sourceDraft.concurrencyLimit} onChange={(event) => updateSource('concurrencyLimit', Number(event.target.value))} /></label>
          <label className="field-label">Refresh frequency<select value={sourceDraft.refreshFrequency} onChange={(event) => updateSource('refreshFrequency', event.target.value)}><option value="manual">Manual only</option><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
          <label className="switch-field"><input type="checkbox" checked={sourceDraft.enabled !== false} onChange={(event) => updateSource('enabled', event.target.checked)} /><span>Enabled</span></label>
        </div>
        <div className="source-form-actions">
          <button className="button secondary" disabled={working || !configured || !sourceDraft.url} onClick={() => testSource()}>Test Source</button>
          <button className="button primary" disabled={working || !canSaveSource || !sourceDraft.name || !sourceDraft.url} onClick={saveSource}>{editingExisting ? 'Update Source' : 'Save Source'}</button>
          <button className="button secondary" disabled={working} onClick={() => { setSourceDraft(EMPTY_SOURCE); setPreview(null); }}>Clear</button>
        </div>
        {preview?.preview?.length ? (
          <div className="source-preview-list">
            {preview.preview.slice(0, 3).map((item) => <article key={item.url || item.title}><strong>{item.title || 'Untitled record'}</strong><span>{item.category || sourceDraft.expectedCategory}</span><small>{item.url}</small></article>)}
          </div>
        ) : null}
        {message ? <p className={message.includes('Could not') || message.includes('not configured') ? 'form-error' : 'status-message'}>{message}</p> : null}
        <div className="source-table">
          {sources.map((source) => (
            <article key={source.id} className="source-row-card">
              <div><strong>{source.name}</strong><span>{source.url}</span><small>{source.type} - {source.expectedCategory || 'Uncategorised'}</small></div>
              <dl>
                <div><dt>Enabled</dt><dd>{source.enabled !== false && !source.paused ? 'Yes' : 'No'}</dd></div>
                <div><dt>Last checked</dt><dd>{formatDiscoveryTimestamp(source.lastCheckedAt)}</dd></div>
                <div><dt>Last successful</dt><dd>{formatDiscoveryTimestamp(source.lastSuccessfulAt)}</dd></div>
                <div><dt>Results found</dt><dd>{source.resultCount || source.resultsFound || 0}</dd></div>
                <div><dt>Health</dt><dd>{source.health || 'Not tested'}</dd></div>
                <div><dt>Next scan</dt><dd>{configured && source.enabled !== false ? nextScheduledScan(settings) : 'Paused'}</dd></div>
              </dl>
              <div className="source-row-actions">
                <button type="button" className="text-link" disabled={working || !configured} onClick={() => testSource(source)}>Test Source</button>
                <button type="button" className="text-link" disabled={working || !configured} onClick={() => scanSource(source)}>Scan Now</button>
                <button type="button" className="text-link" onClick={() => setMessage(`${source.name || source.url}: ${source.resultCount || source.resultsFound || 0} result(s) found in the last run.`)}>View Results</button>
                <button type="button" className="text-link" onClick={() => setMessage(source.lastError ? `${source.name || source.url}: ${source.lastError}` : 'No errors recorded for this source.')}>View Errors</button>
                <button type="button" className="text-link" onClick={() => { setSourceDraft(normalizeDraft(source)); setPreview(null); }}>Edit</button>
                <button type="button" className="text-link" onClick={() => pauseDiscoverySource(user.uid, source, source.enabled !== false)}>{source.enabled !== false ? 'Pause' : 'Resume'}</button>
                <button type="button" className="text-link danger-link" onClick={() => removeSource(source)}>Delete</button>
              </div>
            </article>
          ))}
          {!sources.length ? <p className="muted">No discovery sources configured yet.</p> : null}
        </div>
      </article>
    </section>
  );
}
