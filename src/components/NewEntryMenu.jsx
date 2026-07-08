import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileUp, Link2, Plus } from 'lucide-react';
import { MANUAL_ENTRY_TYPES, MENU_EXTRA_ACTIONS, openManualEntry, openUploadDocumentEntry } from '../utils/manualEntry';

export default function NewEntryMenu({ label = '+ New Entry', compact = false, className = '', onImportFromLink }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', (event) => { if (event.key === 'Escape') setOpen(false); }, { once: true });
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  function choose(typeId) {
    setOpen(false);
    openManualEntry(typeId);
  }

  function chooseExtra(actionId) {
    setOpen(false);
    if (actionId === 'share-paste') {
      window.location.hash = '#/shared-inbox';
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('kv-open-paste-capture')), 0);
      return;
    }
    if (actionId === 'import-url') {
      onImportFromLink?.();
      window.dispatchEvent(new CustomEvent('kv-open-import-link'));
      return;
    }
    if (actionId === 'paste-text') {
      openManualEntry('general-note', { title: '', tagsText: 'Pasted text', html: '<p></p>' });
      return;
    }
    if (actionId === 'upload-document') openUploadDocumentEntry();
    if (actionId === 'upload-screenshot') openManualEntry('general-note', { title: '', tagsText: 'Screenshot, Shared capture', focusUpload: true });
    if (actionId === 'google-drive') openManualEntry('general-note', { title: '', tagsText: 'Google Drive attachment', focusDrive: true });
  }

  return (
    <div className={`new-entry-menu ${open ? 'is-open' : ''} ${className}`} ref={ref}>
      <button type="button" className={`button primary ${compact ? 'compact-button' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Plus size={17} />
        <span>{label.replace(/^\+\s*/, '')}</span>
        <ChevronDown size={15} />
      </button>
      {open ? (
        <div className="new-entry-menu-list" role="menu" aria-label="New entry types">
          {MANUAL_ENTRY_TYPES.map((item) => (
            <button key={item.id} type="button" role="menuitem" onClick={() => choose(item.id)}>{item.label}</button>
          ))}
          <div className="new-entry-menu-divider" />
          {MENU_EXTRA_ACTIONS.map((item) => (
            <button key={item.id} type="button" role="menuitem" onClick={() => chooseExtra(item.id)}>
              {item.id === 'import-url' ? <Link2 size={15} /> : <FileUp size={15} />}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
