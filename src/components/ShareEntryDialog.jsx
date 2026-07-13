import React, { useMemo, useState } from 'react';
import { Copy, ExternalLink, Share2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createPublicShare, disablePublicShare } from '../services/publicShares';
import { normalizePage, privateEntryUrl, publicShareUrl } from '../utils/pageModel';

export default function ShareEntryDialog({ page, open, onClose }) {
  const { user } = useAuth();
  const normalized = useMemo(() => (page ? normalizePage(page) : null), [page]);
  const [options, setOptions] = useState({
    includeSummary: true,
    includeFullNote: false,
    includeSourceUrl: true,
    includeImportantDates: true,
    includeAttachments: false,
    expiry: 'never',
    customExpiry: '',
  });
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);

  if (!open || !normalized) return null;

  const privateUrl = privateEntryUrl(normalized.id);
  const currentPublicUrl = normalized.shareId ? publicShareUrl(normalized.shareId) : '';

  function update(key, value) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  async function copy(text, label = 'Link') {
    await navigator.clipboard?.writeText(text);
    setMessage(`${label} copied.`);
  }

  async function createShare() {
    setMessage('');
    if (normalized.secure) {
      setMessage('Encrypted notes cannot be publicly shared unless you create a separate unencrypted share copy.');
      return;
    }
    setWorking(true);
    try {
      const result = await createPublicShare(user?.uid, normalized, options);
      await copy(result.url, 'Public share link');
    } catch (error) {
      setMessage(error.message || 'Could not create public share link.');
    } finally {
      setWorking(false);
    }
  }

  async function disableShare() {
    setMessage('');
    setWorking(true);
    try {
      await disablePublicShare(user?.uid, normalized);
      setMessage('Public share link disabled.');
    } catch (error) {
      setMessage(error.message || 'Could not disable share link.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="date-modal-backdrop" role="presentation">
      <div className="share-entry-modal" role="dialog" aria-modal="true" aria-label="Share entry">
        <div className="modal-head">
          <div>
            <p className="eyebrow">SHARE</p>
            <h2>Share Entry</h2>
            <span>{normalized.title || 'Untitled entry'}</span>
          </div>
          <button type="button" className="icon-button refined" aria-label="Close share dialog" onClick={onClose}><X size={18} /></button>
        </div>

        <section className="share-option-panel">
          <h3>Private app link</h3>
          <p>Only the signed-in authorised account can open this internal entry link.</p>
          <div className="share-link-row"><code>{privateUrl}</code><button type="button" className="button secondary" onClick={() => copy(privateUrl, 'Private app link')}><Copy size={16} /> Copy private app link</button></div>
        </section>

        <section className="share-option-panel">
          <h3>Public read-only link</h3>
          {normalized.secure ? (
            <p className="form-error">Encrypted notes cannot be publicly shared unless you create a separate unencrypted share copy.</p>
          ) : (
            <>
              <div className="share-checkbox-grid">
                <label><input type="checkbox" checked={options.includeSummary} onChange={(event) => update('includeSummary', event.target.checked)} /> Include summary only</label>
                <label><input type="checkbox" checked={options.includeFullNote} onChange={(event) => update('includeFullNote', event.target.checked)} /> Include full note</label>
                <label><input type="checkbox" checked={options.includeSourceUrl} onChange={(event) => update('includeSourceUrl', event.target.checked)} /> Include source URL</label>
                <label><input type="checkbox" checked={options.includeImportantDates} onChange={(event) => update('includeImportantDates', event.target.checked)} /> Include important dates</label>
                <label><input type="checkbox" checked={options.includeAttachments} onChange={(event) => update('includeAttachments', event.target.checked)} /> Include attachments</label>
              </div>
              <label className="field-label">Expiry
                <select value={options.expiry} onChange={(event) => update('expiry', event.target.value)}>
                  <option value="never">Never</option>
                  <option value="7-days">7 days</option>
                  <option value="30-days">30 days</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              {options.expiry === 'custom' ? <label className="field-label">Custom expiry<input type="datetime-local" value={options.customExpiry} onChange={(event) => update('customExpiry', event.target.value)} /></label> : null}
              {currentPublicUrl ? <div className="share-link-row"><code>{currentPublicUrl}</code><button type="button" className="button secondary" onClick={() => copy(currentPublicUrl, 'Public share link')}><Copy size={16} /> Copy link</button></div> : null}
              <div className="modal-actions">
                <button type="button" className="button primary" disabled={working} onClick={createShare}><Share2 size={16} /> Create shareable public link</button>
                <button type="button" className="button secondary" disabled={working || !normalized.shareId} onClick={disableShare}>Disable share link</button>
              </div>
            </>
          )}
        </section>

        {normalized.sourceUrl ? (
          <section className="share-option-panel">
            <h3>Citation/source link</h3>
            <div className="share-link-row"><code>{normalized.sourceUrl}</code><button type="button" className="button secondary" onClick={() => copy(normalized.sourceUrl, 'Source link')}><ExternalLink size={16} /> Copy citation/source link</button></div>
          </section>
        ) : null}

        {message ? <p className={message.includes('Could not') || message.includes('cannot') ? 'form-error' : 'status-message'}>{message}</p> : null}
      </div>
    </div>
  );
}