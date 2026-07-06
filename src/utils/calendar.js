function formatCalendarDate(dateValue) {
  return (dateValue || '').replace(/-/g, '');
}

function escapeIcs(value = '') {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\,').replace(/\r?\n/g, '\\n');
}

function pageUrl(pageId) {
  return `${window.location.origin}${window.location.pathname}#/read/${pageId}`;
}

export function googleCalendarUrl(deadline, page) {
  const start = formatCalendarDate(deadline.date);
  const endDate = new Date(`${deadline.date}T00:00:00`);
  endDate.setDate(endDate.getDate() + 1);
  const end = formatCalendarDate(endDate.toISOString().slice(0, 10));
  const details = [deadline.snippet, page.sourceUrl, pageUrl(page.id)].filter(Boolean).join('\n\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${page.title || 'Knowledge page'} - ${deadline.type}`,
    dates: `${start}/${end}`,
    details,
    location: page.sourceUrl || pageUrl(page.id),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadIcs(deadline, page) {
  const start = formatCalendarDate(deadline.date);
  const endDate = new Date(`${deadline.date}T00:00:00`);
  endDate.setDate(endDate.getDate() + 1);
  const end = formatCalendarDate(endDate.toISOString().slice(0, 10));
  const uid = `${deadline.id || crypto.randomUUID()}@personal-knowledge-vault`;
  const description = [deadline.snippet, page.sourceUrl, pageUrl(page.id)].filter(Boolean).join('\n\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Anubha Parashar//Personal Knowledge Vault//EN',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(uid)}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeIcs(`${page.title || 'Knowledge page'} - ${deadline.type}`)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `URL:${escapeIcs(pageUrl(page.id))}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(page.title || 'deadline').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'deadline'}.ics`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}