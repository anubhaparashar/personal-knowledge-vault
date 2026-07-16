import React, { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Link2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createPublicShare, disablePublicShare } from '../services/publicShares';
import { isMyEntry, normalizePage, privateEntryUrl, publicShareUrl } from '../utils/pageModel';

export default function ShareEntryDialog({ page, open, onClose }) {
  const { user } = useAuth();
  const normalized = useMemo(() => (page ? normalizePage(page) : null), [page]);
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareDisabled, setShareDisabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMessage('');
    setWorking(false);
    setShareUrl('');
    setShareDisabled(false);
  }, [open, normalized?.id]);

  if (!open || !normalized) return null;

  const privateUrl = privateEntryUrl(normalized.id);
  const canSharePublicly = isMyEntry(normalized);
  const currentShareUrl = !shareDisabled && (shareUrl || (normalized.shareEnabled && normalized.shareId ? publicShareUrl(normalized.shareId) : ''));

  async function copy(text, label = 'Link') {
    try {
      await navigator.clipboard?.writeText(text);
      setMessage(`${label} copied.`);
    } catch {
      setMessage('Could not copy the link in this browser.');
    }
  }

  async function makeShareable() {
    if (!user?.uid) return setMessage('Sign in before creating a share link.');
    setWorking(true);
    setMessage('');
    try {
      const result = await createPublicShare(user.uid, normalized, { includeFullNote: true });
      setShareUrl(result.url);
      setShareDisabled(false);
      setMessage('Share link enabled.');
    } catch (error) {
      setMessage(error.message || 'Could not create a share link.');
    } finally {
      setWorking(false);
    }
  }

  async function turnOffSharing() {
    if (!user?.uid) return setMessage('Sign in before disabling a share link.');
    setWorking(true);
    setMessage('');
    try {
      await disablePublicShare(user.uid, normalized);
      setShareUrl('');
      setShareDisabled(true);
      setMessage('Share link disabled.');
    } catch (error) {
      setMessage(error.message || 'Could not disable this share link.');
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
          <div className="share-link-row">
            <code>{privateUrl}</code>
            <button type="button" className="button secondary" onClick={() => copy(privateUrl, 'Private app link')}><Copy size={16} /> Copy private link</button>
          </div>
        </section>

        <section className="share-option-panel">
          <h3>Public sharing</h3>
          {!canSharePublicly ? (
            <p>Scraped entries stay private. Save one to My Entries before making a public share link.</p>
          ) : currentShareUrl ? (
            <>
              <p>This entry is shareable through the public read-only link below.</p>
              <div className="share-link-row">
                <code>{currentShareUrl}</code>
                <button type="button" className="button secondary" onClick={() => copy(currentShareUrl, 'Share link')}><Copy size={16} /> Copy share link</button>
              </div>
              <div className="share-action-row">
                <button type="button" className="button secondary" disabled={working} onClick={turnOffSharing}>Disable sharing</button>
              </div>
            </>
          ) : (
            <>
              <p>Private by default. Create a public read-only link only when you want this manual entry to be shareable.</p>
              <button type="button" className="button primary" disabled={working} onClick={makeShareable}><Link2 size={16} /> {working ? 'Creating...' : 'Make shareable'}</button>
            </>
          )}
        </section>

        {normalized.sourceUrl ? (
          <section className="share-option-panel">
            <h3>Citation/source link</h3>
            <div className="share-link-row">
              <code>{normalized.sourceUrl}</code>
              <button type="button" className="button secondary" onClick={() => copy(normalized.sourceUrl, 'Source link')}><ExternalLink size={16} /> Copy source link</button>
            </div>
          </section>
        ) : null}

        {message ? <p className="status-message">{message}</p> : null}
      </div>
    </div>
  );
}