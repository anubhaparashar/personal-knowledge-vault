import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, FileUp, Link2, Plus, Search } from 'lucide-react';
import { MANUAL_ENTRY_TYPES, MENU_EXTRA_ACTIONS, openManualEntry, openUploadDocumentEntry } from '../utils/manualEntry';

const ENTRY_GROUP_CONFIG = [
  {
    title: 'Research',
    ids: ['research-paper', 'conference', 'journal-call', 'special-issue'],
  },
  {
    title: 'Opportunities',
    ids: ['scholarship', 'postdoctoral', 'fellowship', 'grant', 'research-job', 'conference-support', 'project-proposal', 'application'],
  },
  {
    title: 'Ideas and Projects',
    ids: ['paper-idea', 'project-idea'],
  },
  {
    title: 'Personal Knowledge',
    ids: ['technology', 'general-note', 'diary'],
  },
  {
    title: 'Custom',
    ids: ['custom-type'],
  },
];

function normalizeSearch(value = '') {
  return String(value).trim().toLowerCase();
}

function buildEntryGroups() {
  const byId = new Map(MANUAL_ENTRY_TYPES.map((item) => [item.id, item]));
  const used = new Set();
  const groups = ENTRY_GROUP_CONFIG.map((group) => {
    const items = group.ids.map((id) => byId.get(id)).filter(Boolean);
    items.forEach((item) => used.add(item.id));
    return { ...group, items };
  });
  const leftovers = MANUAL_ENTRY_TYPES.filter((item) => !used.has(item.id));
  if (leftovers.length) {
    const custom = groups.find((group) => group.title === 'Custom');
    custom.items = [...custom.items, ...leftovers];
  }
  return groups.filter((group) => group.items.length);
}

export default function NewEntryMenu({ label = '+ New Entry', compact = false, className = '', onImportFromLink }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState({});
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const displayLabel = label.replace(/^\+\s*/, '');
  const entryGroups = useMemo(() => buildEntryGroups(), []);
  const filteredGroups = useMemo(() => {
    const search = normalizeSearch(query);
    if (!search) return entryGroups;
    return entryGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => [
          item.label,
          item.shortLabel,
          item.category,
          ...(item.tags || []),
          group.title,
        ].some((value) => normalizeSearch(value).includes(search))),
      }))
      .filter((group) => group.items.length);
  }, [entryGroups, query]);
  const filteredExtraActions = useMemo(() => {
    const search = normalizeSearch(query);
    if (!search) return MENU_EXTRA_ACTIONS;
    return MENU_EXTRA_ACTIONS.filter((item) => normalizeSearch(item.label).includes(search) || normalizeSearch('Custom').includes(search));
  }, [query]);
  const hasCustomGroup = filteredGroups.some((group) => group.title === 'Custom');
  const hasMatches = filteredGroups.some((group) => group.items.length) || filteredExtraActions.length > 0;

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      const target = event.target;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const closeOnRouteChange = () => setOpen(false);
    window.addEventListener('pointerdown', closeOnOutside);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('hashchange', closeOnRouteChange);
    window.addEventListener('popstate', closeOnRouteChange);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutside);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('hashchange', closeOnRouteChange);
      window.removeEventListener('popstate', closeOnRouteChange);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      if (window.matchMedia('(max-width: 640px)').matches) {
        setMenuStyle({});
        return;
      }
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuStyle({
        top: `${Math.max(12, rect.bottom + 8)}px`,
        right: `${Math.max(16, window.innerWidth - rect.right)}px`,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverscroll = document.body.style.overscrollBehavior;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overscrollBehavior = 'contain';
    if (window.matchMedia('(max-width: 640px)').matches) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overscrollBehavior = previousOverscroll;
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (open) return undefined;
    setQuery('');
    setMenuStyle({});
    return undefined;
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

  function stopMenuScroll(event) {
    event.stopPropagation();
  }

  function renderExtraActions() {
    if (!filteredExtraActions.length) return null;
    return (
      <div className="new-entry-menu-extra-actions">
        {filteredExtraActions.map((item) => (
          <button key={item.id} type="button" className="menu-item-button" role="menuitem" onClick={() => chooseExtra(item.id)}>
            {item.id === 'import-url' ? <Link2 size={15} /> : <FileUp size={15} />}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    );
  }

  const menu = open ? createPortal(
    <>
      <button type="button" className="new-entry-menu-backdrop" aria-label="Close New Entry menu" onClick={() => setOpen(false)} />
      <div ref={menuRef} className="new-entry-menu-list" role="menu" aria-label="New entry types" style={menuStyle} onWheel={stopMenuScroll} onTouchMove={stopMenuScroll}>
        <label className="new-entry-menu-search">
          <Search size={15} strokeWidth={2} aria-hidden="true" />
          <span className="sr-only">Search entry types</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search entry types"
          />
        </label>
        <div className="new-entry-menu-scroll">
          {filteredGroups.map((group) => (
            <section key={group.title} className="new-entry-menu-section" aria-label={group.title}>
              <h3>{group.title}</h3>
              <div>
                {group.items.map((item) => (
                  <button key={item.id} type="button" className="menu-item-button" role="menuitem" onClick={() => choose(item.id)}>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
              {group.title === 'Custom' ? renderExtraActions() : null}
            </section>
          ))}
          {!hasCustomGroup && filteredExtraActions.length ? (
            <section className="new-entry-menu-section" aria-label="Custom actions">
              <h3>Custom</h3>
              {renderExtraActions()}
            </section>
          ) : null}
          {!hasMatches ? <p className="new-entry-menu-empty">No matching entry types</p> : null}
        </div>
      </div>
    </>,
    document.body,
  ) : null;

  return (
    <div className={`new-entry-menu ${open ? 'is-open' : ''} ${className}`} ref={ref}>
      <button ref={buttonRef} type="button" className={`button primary ${compact ? 'compact-button' : ''}`} aria-label={displayLabel} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Plus size={17} />
        <span>{displayLabel}</span>
        <ChevronDown size={15} />
      </button>
      {menu}
    </div>
  );
}
