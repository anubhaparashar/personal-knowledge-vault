import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Link2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  DISCOVERY_QUEUE_MESSAGE,
  RESEARCH_DISCOVERY_WORKFLOW_URL,
  formatDiscoveryTimestamp,
  importDiscoveryUrl,
  requestStatusLabel,
  subscribeDiscoveryRequests,
} from '../services/discovery';

function validPublicUrl(value = '') {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function statusClass(status = 'queued') {
  return `request-status ${status}`;
}

export default function ImportFromLinkModal({ open, onClose }) {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    if (!open || !user?.uid) return undefined;
    return subscribeDiscoveryRequests(user.uid, (items = []) => setRequests(Array.isArray(items) ? items : []), (error) => setMessage(error.message), 20);
  }, [open, user?.uid]);

  const linkRequests = useMemo(() => {
    const requestRows = Array.isArray(requests) ? requests : [];
    return requestRows.filter((request) => request.type === 'single-link').slice(0, 6);
  }, [requests]);

  if (!open) return null;

  async function queueLink() {
    const trimmedUrl = url.trim();
    setMessage('');
    if (!validPublicUrl(trimmedUrl)) {
      setMessage('Enter a valid public HTTP or HTTPS URL.');
      return;
    }
    setWorking(true);
    try {
      await importDiscoveryUrl(user, trimmedUrl);
      setUrl('');
      setMessage(DISCOVERY_QUEUE_MESSAGE);
    } catch (error) {
      setMessage(error.message || 'Could not queue this link.');
    } finally {
      setWorking(false);
    }
  }

  const isPositiveMessage = message.includes('Queued for discovery');

  return (
    <div className="date-modal-backdrop" role="presentation">
      <div className="import-link-modal" role="dialog" aria-modal="true" aria-label="Queue website for discovery">
        <div className="modal-head">
          <div>
            <p className="eyebrow">ADD FROM URL</p>
            <h2>Scrape a Link</h2>
            <span>Instant scraping is disabled to keep the project free. Requests are processed by GitHub Actions.</span>
          </div>
          <button type="button" className="icon-button refined" aria-label="Close import" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="source-import-row compact-url-row">
          <label className="field-label">Public URL
            <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste a public webpage, job post, scholarship, conference, journal, grant, paper or project link..." />
          </label>
          <button type="button" className="button primary" disabled={working || !url.trim()} onClick={queueLink}><Link2 size={16} /> Queue Link</button>
          <a className="button secondary" href={RESEARCH_DISCOVERY_WORKFLOW_URL} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open Workflow</a>
          <button type="button" className="button secondary" disabled={working} onClick={onClose}>Cancel</button>
        </div>
        {message ? <p className={isPositiveMessage ? 'status-message' : 'form-error'}>{message}</p> : null}
        {linkRequests.length ? (
          <section className="request-status-list" aria-label="Queued link request status">
            <h3>Queued link requests</h3>
            {linkRequests.map((request) => (
              <article key={request.id}>
                <div>
                  <strong>{request.sourceUrl || request.url || request.title || 'Queued link'}</strong>
                  <span>{formatDiscoveryTimestamp(request.updatedAt || request.createdAt)}</span>
                </div>
                <span className={statusClass(request.status)}>{requestStatusLabel(request.status)}</span>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
