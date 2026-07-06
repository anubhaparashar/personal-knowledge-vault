import React from 'react';
import {
  attachmentFileKey,
  canExtractAttachment,
  formatAttachmentSize,
  getAttachmentKind,
  getAttachmentOpenUrl,
} from '../services/attachments';

function AttachmentAction({ children, href, onClick, disabled, external = false }) {
  if (href && href !== '#') {
    return (
      <a className="button secondary attachment-action" href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer noopener' : undefined}>
        {children}
      </a>
    );
  }

  return (
    <button className="button secondary attachment-action" type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export default function DriveAttachmentList({
  items = [],
  onReadPdf,
  onDownload,
  onRemove,
  onExtract,
  emptyText = 'No attachments yet.',
  showActions = true,
}) {
  if (!items.length) return <p className="muted">{emptyText}</p>;

  return (
    <div className="attachment-stack">
      {items.map((item) => {
        const kind = getAttachmentKind(item);
        const fileSize = formatAttachmentSize(item.size);
        const openUrl = getAttachmentOpenUrl(item);
        const isStorage = item.provider === 'firebase-storage' || Boolean(item.storagePath);
        return (
          <div className="attachment-row" key={attachmentFileKey(item)}>
            <div className="attachment-identity">
              <span className={`attachment-icon attachment-icon-${kind.key}`}>{kind.badge}</span>
              <div className="attachment-text">
                <strong>{item.name || item.originalName || 'Attachment'}</strong>
                <small>{kind.label} - {fileSize} - {isStorage ? 'Firebase Storage' : 'Google Drive'}</small>
                {item.zipEntries?.length ? (
                  <details className="zip-entry-list">
                    <summary>{item.zipEntries.length} file(s) inside ZIP</summary>
                    <ul>{item.zipEntries.map((entry) => <li key={entry.name}>{entry.name}</li>)}</ul>
                  </details>
                ) : null}
              </div>
            </div>
            {showActions ? (
              <div className="attachment-actions">
                <AttachmentAction href={openUrl} external>
                  Open
                </AttachmentAction>
                {kind.readable && onReadPdf ? (
                  <AttachmentAction onClick={() => onReadPdf(item)}>
                    Read PDF
                  </AttachmentAction>
                ) : null}
                {canExtractAttachment(item) && onExtract ? (
                  <AttachmentAction onClick={() => onExtract(item)}>
                    Extract content into note
                  </AttachmentAction>
                ) : null}
                {onDownload ? (
                  <AttachmentAction onClick={() => onDownload(item)}>
                    Download
                  </AttachmentAction>
                ) : null}
                {onRemove ? (
                  <AttachmentAction onClick={() => onRemove(item)}>
                    Remove
                  </AttachmentAction>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}