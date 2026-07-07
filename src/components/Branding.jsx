import React from 'react';

const iconPaths = {
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  search: <path d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  bell: (
    <>
      <path d="M10 18h4" />
      <path d="M6 17h12l-1.2-2.2A7.5 7.5 0 0 1 16 11V9a4 4 0 1 0-8 0v2c0 .95-.22 1.88-.8 2.8L6 17Z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v2.2" />
      <path d="M12 19.3v2.2" />
      <path d="M4.9 4.9l1.6 1.6" />
      <path d="M17.5 17.5l1.6 1.6" />
      <path d="M2.5 12h2.2" />
      <path d="M19.3 12h2.2" />
      <path d="M4.9 19.1l1.6-1.6" />
      <path d="M17.5 6.5l1.6-1.6" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  home: (
    <>
      <path d="M4 11.5 12 5l8 6.5" />
      <path d="M6.5 10.5V19h11v-8.5" />
    </>
  ),
  notes: (
    <>
      <path d="M6 4h10l4 4v12H6z" />
      <path d="M10 4v4h4" />
      <path d="M9 12h6" />
      <path d="M9 15h6" />
    </>
  ),
  calendar: (
    <>
      <path d="M7 3v4" />
      <path d="M17 3v4" />
      <path d="M4 8h16" />
      <path d="M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
    </>
  ),
  calendarDays: (
    <>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 14h.01" />
      <path d="M12 14h.01" />
      <path d="M16 14h.01" />
      <path d="M8 18h.01" />
      <path d="M12 18h.01" />
      <path d="M16 18h.01" />
    </>
  ),  calendarClock: (
    <>
      <path d="M7 3v4" />
      <path d="M17 3v4" />
      <path d="M4 8h10" />
      <path d="M5 6h14a1 1 0 0 1 1 1v6" />
      <path d="M18 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M18 16.5V15l-.8-.8" />
    </>
  ),
  clipboardCheck: (
    <>
      <path d="M9 4h6l1 2h3v14H5V6h3z" />
      <path d="m9 13 2 2 4-4" />
    </>
  ),
  flask: (
    <>
      <path d="M10 3h4" />
      <path d="M10 3v5l-4.5 7.5A3 3 0 0 0 8.1 20h7.8a3 3 0 0 0 2.6-4.5L14 8V3" />
      <path d="M9 14h6" />
    </>
  ),
  presentation: (
    <>
      <path d="M4 5h16v10H4z" />
      <path d="M8 19h8" />
      <path d="M12 15v4" />
      <path d="M8 9l2 2 3-3 2 2" />
    </>
  ),
  bookOpen: (
    <>
      <path d="M12 6c-2-1.3-4-1.7-7-1.7A1.5 1.5 0 0 0 3.5 5.8V18A1.5 1.5 0 0 0 5 19.5c3 0 5 .4 7 1.7" />
      <path d="M12 6c2-1.3 4-1.7 7-1.7A1.5 1.5 0 0 1 20.5 5.8V18A1.5 1.5 0 0 1 19 19.5c-3 0-5 .4-7 1.7" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M8 14a6 6 0 1 1 8 0c-.8.8-1.5 1.8-1.8 3H9.8c-.3-1.2-1-2.2-1.8-3Z" />
    </>
  ),
  fileText: (
    <>
      <path d="M6 3h9l5 5v13H6z" />
      <path d="M15 3v5h5" />
      <path d="M9 12h6" />
      <path d="M9 15h6" />
    </>
  ),
  landmark: (
    <>
      <path d="M4 9h16" />
      <path d="M6 9v8" />
      <path d="M10 9v8" />
      <path d="M14 9v8" />
      <path d="M18 9v8" />
      <path d="M3 19h18" />
      <path d="M12 3 4 8h16z" />
    </>
  ),
  notebookPen: (
    <>
      <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7" />
      <path d="M7 3v18" />
      <path d="M10 8h4" />
      <path d="M10 12h4" />
      <path d="m14 19 5-5 1.5 1.5-5 5H14v-1.5Z" />
    </>
  ),
  paperclip: (
    <>
      <path d="m8 13 5.5-5.5a3 3 0 0 1 4.2 4.2l-6 6a5 5 0 0 1-7.1-7.1l6.4-6.4" />
    </>
  ),
  lock: (
    <>
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <path d="M6 11h12v9H6z" />
    </>
  ),
  settings: (
    <>
      <path d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" />
      <path d="m19.4 15-.2 1.1a1.5 1.5 0 0 1-1.9 1l-1.1-.4a7.8 7.8 0 0 1-1.4.8l-.2 1.2a1.5 1.5 0 0 1-1.5 1.2h-1.6a1.5 1.5 0 0 1-1.5-1.2l-.2-1.2a7.8 7.8 0 0 1-1.4-.8l-1.1.4a1.5 1.5 0 0 1-1.9-1L4.6 15a1.5 1.5 0 0 1 .8-1.7l1-.5a7.8 7.8 0 0 1 0-1.6l-1-.5A1.5 1.5 0 0 1 4.6 9l.2-1.1a1.5 1.5 0 0 1 1.9-1l1.1.4c.4-.3.9-.6 1.4-.8l.2-1.2A1.5 1.5 0 0 1 11 4.1h1.6a1.5 1.5 0 0 1 1.5 1.2l.2 1.2c.5.2 1 .5 1.4.8l1.1-.4a1.5 1.5 0 0 1 1.9 1L19.4 9a1.5 1.5 0 0 1-.8 1.7l-1 .5a7.8 7.8 0 0 1 0 1.6l1 .5a1.5 1.5 0 0 1 .8 1.7Z" />
    </>
  ),
  logOut: (
    <>
      <path d="M10 17H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4" />
      <path d="m15 7 4 5-4 5" />
      <path d="M19 12H10" />
    </>
  ),
  grid: (
    <>
      <path d="M4 4h7v7H4z" />
      <path d="M13 4h7v7h-7z" />
      <path d="M4 13h7v7H4z" />
      <path d="M13 13h7v7h-7z" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h12" />
      <path d="M8 12h12" />
      <path d="M8 18h12" />
      <path d="M4 6h.01" />
      <path d="M4 12h.01" />
      <path d="M4 18h.01" />
    </>
  ),
  filter: (
    <>
      <path d="M4 5h16l-6 7v5l-4 2v-7z" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 1 1 7 7l-1 1" />
      <path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 1 1-7-7l1-1" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7S18 19 12 19 2.5 12 2.5 12Z" />
      <path d="M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  copy: (
    <>
      <path d="M8 8h10v10H8z" />
      <path d="M6 16H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  ),
  archive: (
    <>
      <path d="M4 7h16" />
      <path d="M5 7v12h14V7" />
      <path d="M9 11h6" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </>
  ),
  pin: (
    <>
      <path d="m14 3 7 7-3 1-2 7-3-3-5 5-1-1 5-5-3-3 7-2 1-3Z" />
    </>
  ),
  refresh: (
    <>
      <path d="M4 12a8 8 0 0 1 13-5l1-3v7h-7l2.7-2.7A5.5 5.5 0 1 0 17.5 16" />
    </>
  ),
  maximize: (
    <>
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </>
  ),
  zoomIn: (
    <>
      <path d="M11 8v8" />
      <path d="M7 12h8" />
      <path d="M21 21l-4.35-4.35" />
      <circle cx="11" cy="11" r="7" />
    </>
  ),
  zoomOut: (
    <>
      <path d="M7 12h8" />
      <path d="M21 21l-4.35-4.35" />
      <circle cx="11" cy="11" r="7" />
    </>
  ),
  externalLink: (
    <>
      <path d="M14 4h6v6" />
      <path d="m10 14 10-10" />
      <path d="M20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6" />
    </>
  ),
  check: <path d="m5 12 4 4 10-10" />,
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  clock: (
    <>
      <path d="M12 7v5l3 2" />
      <circle cx="12" cy="12" r="8" />
    </>
  ),
};

export function Icon({ name, size = 20, title, className = '' }) {
  const glyph = iconPaths[name] || iconPaths.notes;
  return (
    <svg
      className={`app-icon app-icon-${name} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      {glyph}
    </svg>
  );
}

export function APLogo({ compact = false, className = '' }) {
  return (
    <div className={`ap-logo ${compact ? 'is-compact' : ''} ${className}`.trim()}>
      <span className="ap-logo-mark" aria-hidden="true">AP</span>
      {compact ? null : (
        <span className="ap-logo-copy">
          <strong>Anubha Parashar</strong>
          <small>Research Vault</small>
        </span>
      )}
    </div>
  );
}
