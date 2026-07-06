import React from 'react';
import {
  driveFileKey,
  formatDriveFileSize,
  getDriveAttachmentKind,
  getDriveFileLink,
} from '../services/drive';

function AttachmentAction({ children, href, onClick, disabled, external = false }) {
  if (href) {
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
  emptyText = 'No attachments yet.',
  showActions = true,
}) {
  if (!items.length) return <p className="muted">{emptyText}</p>;

  return (
    <div className="attachment-stack">
      {items.map((item) => {
        const kind = getDriveAttachmentKind(item);
        const fileSize = formatDriveFileSize(item.size);
        return (
          <div className="attachment-row" key={driveFileKey(item)}>
            <div className="attachment-identity">
              <span className={`attachment-icon attachment-icon-${kind.key}`}>{kind.badge}</span>
              <div className="attachment-text">
                <strong>{item.name}</strong>
                <small>{kind.label} · {fileSize}</small>
              </div>
            </div>
            {showActions ? (
              <div className="attachment-actions">
                <AttachmentAction href={getDriveFileLink(item)} external>
                  Open in Google Drive
                </AttachmentAction>
                {kind.readable && onReadPdf ? (
                  <AttachmentAction onClick={() => onReadPdf(item)}>
                    Read PDF in website
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
