import { timestampToDate } from './content';

export const CALENDAR_STARTS_ON = 'monday';

export const DATE_TYPE_OPTIONS = [
  'Application deadline',
  'Scholarship deadline',
  'Postdoctoral application deadline',
  'Abstract submission',
  'Full-paper submission',
  'Notification date',
  'Camera-ready deadline',
  'Registration deadline',
  'Interview',
  'Event date',
  'Start date',
  'Fellowship closing date',
  'Grant deadline',
  'Publication date',
  'Created date',
  'Updated date',
  'Personal reminder',
];

export const DATE_RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'this-week', label: 'This week' },
  { value: 'next-7', label: 'Next 7 days' },
  { value: 'next-30', label: 'Next 30 days' },
  { value: 'next-90', label: 'Next 90 days' },
  { value: 'this-month', label: 'This month' },
  { value: 'next-month', label: 'Next month' },
  { value: 'past', label: 'Past dates' },
  { value: 'no-date', label: 'No date recorded' },
];

export const DATE_CATEGORY_OPTIONS = [
  'Scholarships',
  'Postdoctoral',
  'Conferences',
  'Journals',
  'Fellowships',
  'Grants',
  'Jobs',
  'Applications',
  'Paper Ideas',
  'Research Papers',
  'Diary',
  'General Notes',
];

export const DATE_STATUS_OPTIONS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'due-soon', label: 'Due soon' },
  { value: 'today', label: 'Due today' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Completed' },
  { value: 'needs-confirmation', label: 'Needs confirmation' },
  { value: 'no-deadline', label: 'No deadline' },
];

export const SORT_OPTIONS = [
  { value: 'date-asc', label: 'Date ascending' },
  { value: 'deadline-nearest', label: 'Deadline: nearest first' },
  { value: 'deadline-farthest', label: 'Deadline: farthest first' },
  { value: 'event-earliest', label: 'Event date: earliest first' },
  { value: 'event-latest', label: 'Event date: latest first' },
  { value: 'created-desc', label: 'Recently created' },
  { value: 'created-asc', label: 'Oldest created' },
  { value: 'updated-desc', label: 'Recently updated' },
  { value: 'updated-asc', label: 'Oldest updated' },
  { value: 'publication-desc', label: 'Publication date: newest' },
  { value: 'publication-asc', label: 'Publication date: oldest' },
  { value: 'title-asc', label: 'Title: A-Z' },
  { value: 'title-desc', label: 'Title: Z-A' },
  { value: 'category', label: 'Category' },
  { value: 'source', label: 'Institution/source' },
  { value: 'attachments-desc', label: 'Most attachments' },
  { value: 'dates-desc', label: 'Most important dates' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'next-date', label: 'Next important date' },
];

const DAY_MS = 86400000;

const DATE_TYPE_MAP = [
  [/abstract/i, 'Abstract submission'],
  [/camera/i, 'Camera-ready deadline'],
  [/registration/i, 'Registration deadline'],
  [/notification/i, 'Notification date'],
  [/interview/i, 'Interview'],
  [/scholarship/i, 'Scholarship deadline'],
  [/postdoc|postdoctoral/i, 'Postdoctoral application deadline'],
  [/fellowship.*closing|closing/i, 'Fellowship closing date'],
  [/grant/i, 'Grant deadline'],
  [/expected start|start/i, 'Start date'],
  [/full[- ]?paper/i, 'Full-paper submission'],
  [/paper submission|submission deadline|manuscript/i, 'Full-paper submission'],
  [/application/i, 'Application deadline'],
  [/publication|published/i, 'Publication date'],
  [/created/i, 'Created date'],
  [/updated/i, 'Updated date'],
  [/reminder/i, 'Personal reminder'],
  [/event/i, 'Event date'],
];

const ACTIONABLE_TYPE_PATTERN = /deadline|submission|registration|interview|event|start|closing|grant|reminder|application/i;
const DEADLINE_TYPE_PATTERN = /deadline|submission|registration|closing|grant|application/i;

export function toLocalIsoDate(value) {
  if (typeof value === 'string') {
    const iso = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, '0')}-${String(Number(iso[3])).padStart(2, '0')}`;
  }
  const date = value instanceof Date ? value : timestampToDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const copy = new Date(value);
    copy.setHours(0, 0, 0, 0);
    return Number.isNaN(copy.getTime()) ? null : copy;
  }
  if (typeof value === 'object') return parseLocalDate(toLocalIsoDate(value));
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

export function todayIso() {
  return toLocalIsoDate(new Date());
}

export function addDays(dateValue, amount) {
  const date = parseLocalDate(dateValue) || new Date();
  date.setDate(date.getDate() + amount);
  return date;
}

export function addMonths(dateValue, amount) {
  const date = parseLocalDate(dateValue) || new Date();
  date.setMonth(date.getMonth() + amount);
  return date;
}

export function startOfMonth(dateValue) {
  const date = parseLocalDate(dateValue) || new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(dateValue) {
  const date = parseLocalDate(dateValue) || new Date();
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function startOfWeek(dateValue, startsOn = CALENDAR_STARTS_ON) {
  const date = parseLocalDate(dateValue) || new Date();
  const startIndex = startsOn === 'monday' ? 1 : 0;
  const diff = (date.getDay() - startIndex + 7) % 7;
  return addDays(date, -diff);
}

export function getWeekDays(dateValue, startsOn = CALENDAR_STARTS_ON) {
  const start = startOfWeek(dateValue, startsOn);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function getMonthDays(dateValue, startsOn = CALENDAR_STARTS_ON) {
  const first = startOfMonth(dateValue);
  const gridStart = startOfWeek(first, startsOn);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export function daysUntilDate(value, baseDate = new Date()) {
  const date = parseLocalDate(value);
  const today = parseLocalDate(baseDate);
  if (!date || !today) return null;
  return Math.round((date.getTime() - today.getTime()) / DAY_MS);
}

export function normalizeDateType(value = '') {
  const text = String(value || '').trim();
  const match = DATE_TYPE_MAP.find(([pattern]) => pattern.test(text));
  if (match) return match[1];
  if (!text || /^deadline$/i.test(text) || /detected date/i.test(text)) return 'Personal reminder';
  return text;
}

export function isDeadlineType(type = '') {
  return DEADLINE_TYPE_PATTERN.test(type);
}

export function isActionableDateType(type = '') {
  return ACTIONABLE_TYPE_PATTERN.test(type);
}

export function dateTypeGroup(type = '') {
  if (isDeadlineType(type)) return 'Deadlines';
  if (/created|updated|publication/i.test(type)) return 'Notes';
  return 'Events';
}

export function readableCategory(category = '') {
  const text = String(category || '').toLowerCase();
  if (text.includes('scholarship')) return 'Scholarships';
  if (text.includes('postdoc')) return 'Postdoctoral';
  if (text.includes('conference')) return 'Conferences';
  if (text.includes('journal') || text.includes('special issue')) return 'Journals';
  if (text.includes('fellowship')) return 'Fellowships';
  if (text.includes('grant')) return 'Grants';
  if (text.includes('job')) return 'Jobs';
  if (text.includes('application')) return 'Applications';
  if (text.includes('paper idea')) return 'Paper Ideas';
  if (text.includes('paper') || text.includes('literature')) return 'Research Papers';
  if (text.includes('diary')) return 'Diary';
  if (text.includes('general')) return 'General Notes';
  return category ? String(category).split('/').pop() : 'General Notes';
}

function stableHash(value = '') {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function calculateDateStatus(event, baseDate = new Date()) {
  if (event?.completed || event?.status === 'completed') return 'completed';
  if (event?.confirmed === false || event?.uncertain) return 'needs-confirmation';
  if (!event?.date) return 'no-deadline';
  const days = daysUntilDate(event.date, baseDate);
  if (days == null) return 'needs-confirmation';
  if (!isActionableDateType(event.type)) return days < 0 ? 'completed' : 'upcoming';
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 7) return 'due-soon';
  return 'upcoming';
}

export function statusLabel(status = '') {
  return DATE_STATUS_OPTIONS.find((item) => item.value === status)?.label || status || 'Upcoming';
}

export function statusClass(status = '') {
  return String(status || 'upcoming').toLowerCase().replace(/\s+/g, '-');
}

export function daysRemainingLabel(event) {
  if (!event?.date) return 'No date recorded';
  if (event.status === 'completed') return 'Completed';
  if (event.status === 'needs-confirmation') return 'Needs confirmation';
  const days = daysUntilDate(event.date);
  if (days == null) return 'Unknown';
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days remaining`;
}

export function relativeDateLabel(dateValue) {
  const days = daysUntilDate(dateValue);
  if (days == null) return '';
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

export function formatDateShort(value) {
  const date = parseLocalDate(value);
  if (!date) return 'Unconfirmed';
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function formatDateLong(value) {
  const date = parseLocalDate(value);
  if (!date) return 'Unconfirmed date';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function formatMonthTitle(value) {
  const date = parseLocalDate(value) || new Date();
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date);
}

export function formatDateBlock(value) {
  const date = parseLocalDate(value);
  if (!date) return { month: '--', day: '--' };
  return {
    month: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date).toUpperCase(),
    day: String(date.getDate()).padStart(2, '0'),
  };
}

export function formatTimeRange(event) {
  if (!event?.time && event?.allDay !== false) return 'All day';
  const start = event.time || '';
  const end = event.endTime ? `-${event.endTime}` : '';
  return `${start}${end}${event.timezone ? ` ${event.timezone}` : ''}`.trim() || 'All day';
}

function sourceForPage(page = {}) {
  return page.sourceMetadata?.sourceName
    || page.sourceMetadata?.author
    || page.sourceDomain
    || page.sourceUrl
    || '';
}

function normalizeImportantDate(page, item, index) {
  const date = toLocalIsoDate(item.date || item.startDate || item.deadlineDate);
  if (!date) return null;
  const type = normalizeDateType(item.type || item.dateType || item.kind);
  const title = item.title || type || page.title || 'Important date';
  const manual = item.origin === 'manual' || item.manual === true || item.detected === false;
  const confirmed = item.confirmed ?? !item.uncertain;
  const idSource = item.id || `${page.id}:${type}:${date}:${item.time || ''}:${title}:${item.sourceText || item.snippet || ''}:${index}`;
  const event = {
    id: `${page.id}:${item.id || stableHash(idSource)}`,
    dateId: item.id || stableHash(idSource),
    pageId: page.id,
    pageTitle: page.secure ? 'Locked note' : (page.title || 'Untitled entry'),
    title,
    type,
    date,
    time: item.time || null,
    endDate: toLocalIsoDate(item.endDate) || null,
    endTime: item.endTime || null,
    timezone: item.timezone || item.timeZone || null,
    allDay: item.allDay ?? !item.time,
    confirmed,
    uncertain: Boolean(item.uncertain),
    sourceText: item.sourceText || item.snippet || null,
    reminderOffsets: Array.isArray(item.reminderOffsets) ? item.reminderOffsets : [],
    completed: Boolean(item.completed),
    origin: manual ? 'manual' : (item.origin || 'automatic'),
    notes: item.notes || '',
    page,
    category: readableCategory(page.category),
    rawCategory: page.category || '',
    source: sourceForPage(page),
    institution: item.institution || sourceForPage(page),
    tags: page.tags || [],
    summary: page.summary || page.plainText || '',
    attachmentCount: (page.attachments || []).length + (page.inlineFiles || []).length,
    createdAt: item.createdAt || page.createdAt || null,
    updatedAt: item.updatedAt || page.updatedAt || null,
    isDerived: false,
    isActionable: isActionableDateType(type),
    isDeadline: isDeadlineType(type),
  };
  return { ...event, status: calculateDateStatus(event) };
}

function derivedEvent(page, type, value, title) {
  const date = toLocalIsoDate(value);
  if (!date) return null;
  const normalizedType = normalizeDateType(type);
  const event = {
    id: `${page.id}:derived:${normalizedType}:${date}`,
    dateId: `derived:${normalizedType}:${date}`,
    pageId: page.id,
    pageTitle: page.secure ? 'Locked note' : (page.title || 'Untitled entry'),
    title,
    type: normalizedType,
    date,
    time: null,
    endDate: null,
    endTime: null,
    timezone: null,
    allDay: true,
    confirmed: true,
    uncertain: false,
    sourceText: null,
    reminderOffsets: [],
    completed: true,
    origin: 'system',
    notes: '',
    page,
    category: readableCategory(page.category),
    rawCategory: page.category || '',
    source: sourceForPage(page),
    institution: sourceForPage(page),
    tags: page.tags || [],
    summary: page.summary || page.plainText || '',
    attachmentCount: (page.attachments || []).length + (page.inlineFiles || []).length,
    createdAt: page.createdAt || null,
    updatedAt: page.updatedAt || null,
    isDerived: true,
    isActionable: isActionableDateType(normalizedType),
    isDeadline: false,
  };
  return { ...event, status: calculateDateStatus(event) };
}

function eventDedupeKey(event) {
  return [event.pageId, event.type, event.date, event.time || '', event.title || '', event.sourceText || '']
    .join('|')
    .toLowerCase();
}

export function buildResearchDateEvents(pages = [], { includeDerived = true } = {}) {
  const eventMap = new Map();

  pages.forEach((page) => {
    if (!page || page.secure) return;
    const dates = Array.isArray(page.importantDates) ? page.importantDates : [];
    dates.forEach((item, index) => {
      const event = normalizeImportantDate(page, item || {}, index);
      if (!event) return;
      const key = eventDedupeKey(event);
      const existing = eventMap.get(key);
      if (!existing || (event.origin === 'manual' && existing.origin !== 'manual') || (event.confirmed && !existing.confirmed)) {
        eventMap.set(key, event);
      }
    });

    if (page.deadline && !dates.length) {
      const event = normalizeImportantDate(page, {
        id: 'legacy-deadline',
        type: 'Application deadline',
        date: page.deadline,
        confirmed: true,
        origin: 'legacy',
      }, 0);
      if (event) eventMap.set(eventDedupeKey(event), event);
    }

    if (includeDerived) {
      [
        derivedEvent(page, 'Publication date', page.sourceMetadata?.publicationDate || page.publicationDate, 'Publication date'),
        derivedEvent(page, 'Created date', page.createdAt, 'Note created'),
        derivedEvent(page, 'Updated date', page.updatedAt, 'Note updated'),
      ].filter(Boolean).forEach((event) => eventMap.set(event.id, event));
    }
  });

  return [...eventMap.values()].sort((a, b) => (
    parseLocalDate(a.date)?.getTime() - parseLocalDate(b.date)?.getTime()
    || (a.time || '').localeCompare(b.time || '')
    || (a.title || '').localeCompare(b.title || '')
  ));
}

export function getEventsByDate(events = []) {
  return events.reduce((map, event) => {
    if (!event.date) return map;
    if (!map.has(event.date)) map.set(event.date, []);
    map.get(event.date).push(event);
    return map;
  }, new Map());
}

export function getNextImportantDateForPage(page, events = []) {
  const candidates = events
    .filter((event) => event.pageId === page?.id && !event.isDerived && event.status !== 'completed')
    .sort((a, b) => {
      const da = daysUntilDate(a.date);
      const db = daysUntilDate(b.date);
      const safeA = da == null || da < 0 ? Number.POSITIVE_INFINITY : da;
      const safeB = db == null || db < 0 ? Number.POSITIVE_INFINITY : db;
      return safeA - safeB;
    });
  return candidates[0] || null;
}

export function filterDateEvents(events = [], filters = {}) {
  const search = String(filters.search || '').trim().toLowerCase();
  const ranges = new Set(filters.ranges || []);
  const types = new Set(filters.types || []);
  const categories = new Set(filters.categories || []);
  const statuses = new Set(filters.statuses || []);
  const today = parseLocalDate(new Date());
  const tomorrow = addDays(today, 1);
  const thisWeekEnd = addDays(startOfWeek(today), 6);
  const thisMonthEnd = endOfMonth(today);
  const nextMonthStart = startOfMonth(addMonths(today, 1));
  const nextMonthEnd = endOfMonth(nextMonthStart);

  return events.filter((event) => {
    if (search) {
      const haystack = [
        event.pageTitle,
        event.title,
        event.type,
        event.institution,
        event.source,
        event.category,
        event.rawCategory,
        event.summary,
        ...(event.tags || []),
      ].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    if (types.size && !types.has(event.type)) return false;
    if (categories.size && !categories.has(event.category)) return false;
    if (statuses.size && !statuses.has(event.status)) return false;

    if (ranges.size) {
      const date = parseLocalDate(event.date);
      const inRange = [...ranges].some((range) => {
        if (range === 'today') return event.date === toLocalIsoDate(today);
        if (range === 'tomorrow') return event.date === toLocalIsoDate(tomorrow);
        if (range === 'this-week') return date >= today && date <= thisWeekEnd;
        if (range === 'next-7') {
          const days = daysUntilDate(event.date);
          return days != null && days >= 0 && days <= 7;
        }
        if (range === 'next-30') {
          const days = daysUntilDate(event.date);
          return days != null && days >= 0 && days <= 30;
        }
        if (range === 'next-90') {
          const days = daysUntilDate(event.date);
          return days != null && days >= 0 && days <= 90;
        }
        if (range === 'this-month') return date >= today && date <= thisMonthEnd;
        if (range === 'next-month') return date >= nextMonthStart && date <= nextMonthEnd;
        if (range === 'past') return date < today;
        return false;
      });
      if (!inRange) return false;
    }

    return true;
  });
}

function dateTime(event) {
  const date = parseLocalDate(event.date);
  return date?.getTime() ?? Number.POSITIVE_INFINITY;
}

function pageDateTime(page, field) {
  const date = timestampToDate(page?.[field]);
  return date?.getTime() ?? 0;
}

export function sortDateEvents(events = [], mode = 'date-asc') {
  const list = [...events];
  const compareDateAsc = (a, b) => dateTime(a) - dateTime(b) || (a.time || '').localeCompare(b.time || '');
  const compareDateDesc = (a, b) => dateTime(b) - dateTime(a) || (b.time || '').localeCompare(a.time || '');

  switch (mode) {
    case 'deadline-farthest':
    case 'date-desc':
    case 'event-latest':
      return list.sort(compareDateDesc);
    case 'created-desc':
      return list.sort((a, b) => pageDateTime(b.page, 'createdAt') - pageDateTime(a.page, 'createdAt'));
    case 'created-asc':
      return list.sort((a, b) => pageDateTime(a.page, 'createdAt') - pageDateTime(b.page, 'createdAt'));
    case 'updated-desc':
      return list.sort((a, b) => pageDateTime(b.page, 'updatedAt') - pageDateTime(a.page, 'updatedAt'));
    case 'updated-asc':
      return list.sort((a, b) => pageDateTime(a.page, 'updatedAt') - pageDateTime(b.page, 'updatedAt'));
    case 'publication-desc':
      return list.sort((a, b) => (b.type === 'Publication date') - (a.type === 'Publication date') || compareDateDesc(a, b));
    case 'publication-asc':
      return list.sort((a, b) => (b.type === 'Publication date') - (a.type === 'Publication date') || compareDateAsc(a, b));
    case 'title-desc':
      return list.sort((a, b) => (b.pageTitle || '').localeCompare(a.pageTitle || ''));
    case 'title-asc':
      return list.sort((a, b) => (a.pageTitle || '').localeCompare(b.pageTitle || ''));
    case 'category':
      return list.sort((a, b) => (a.category || '').localeCompare(b.category || '') || compareDateAsc(a, b));
    case 'source':
      return list.sort((a, b) => (a.institution || a.source || '').localeCompare(b.institution || b.source || '') || compareDateAsc(a, b));
    case 'attachments-desc':
      return list.sort((a, b) => (b.attachmentCount || 0) - (a.attachmentCount || 0) || compareDateAsc(a, b));
    case 'dates-desc':
      return list.sort((a, b) => {
        const aCount = events.filter((event) => event.pageId === a.pageId).length;
        const bCount = events.filter((event) => event.pageId === b.pageId).length;
        return bCount - aCount || compareDateAsc(a, b);
      });
    case 'status':
      return list.sort((a, b) => (a.status || '').localeCompare(b.status || '') || compareDateAsc(a, b));
    case 'priority':
      return list.sort((a, b) => {
        const order = { overdue: 0, today: 1, 'due-soon': 2, 'needs-confirmation': 3, upcoming: 4, completed: 5, 'no-deadline': 6 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9) || compareDateAsc(a, b);
      });
    case 'deadline-nearest':
    case 'event-earliest':
    case 'date-asc':
    default:
      return list.sort(compareDateAsc);
  }
}

export function sortResearchPages(pages = [], events = [], mode = 'updated-desc') {
  const byPage = new Map();
  events.forEach((event) => {
    if (!byPage.has(event.pageId)) byPage.set(event.pageId, []);
    byPage.get(event.pageId).push(event);
  });
  const nextDate = (page) => getNextImportantDateForPage(page, byPage.get(page.id) || []);
  const attachmentCount = (page) => (page.attachments || []).length + (page.inlineFiles || []).length;

  return [...pages].sort((a, b) => {
    if (mode === 'title-asc') return (a.title || '').localeCompare(b.title || '');
    if (mode === 'title-desc') return (b.title || '').localeCompare(a.title || '');
    if (mode === 'category') return (a.category || '').localeCompare(b.category || '');
    if (mode === 'source') return (sourceForPage(a) || '').localeCompare(sourceForPage(b) || '');
    if (mode === 'attachments-desc') return attachmentCount(b) - attachmentCount(a);
    if (mode === 'dates-desc') return (byPage.get(b.id)?.length || 0) - (byPage.get(a.id)?.length || 0);
    if (mode === 'created-desc') return pageDateTime(b, 'createdAt') - pageDateTime(a, 'createdAt');
    if (mode === 'created-asc') return pageDateTime(a, 'createdAt') - pageDateTime(b, 'createdAt');
    if (mode === 'updated-asc') return pageDateTime(a, 'updatedAt') - pageDateTime(b, 'updatedAt');
    if (mode === 'next-date' || mode === 'deadline-nearest' || mode === 'date-asc') {
      return dateTime(nextDate(a) || {}) - dateTime(nextDate(b) || {});
    }
    if (mode === 'deadline-farthest' || mode === 'date-desc') return dateTime(nextDate(b) || {}) - dateTime(nextDate(a) || {});
    return pageDateTime(b, 'updatedAt') - pageDateTime(a, 'updatedAt');
  });
}

export function serializeResearchDateForPage(input, existing = {}) {
  const now = new Date().toISOString();
  const type = normalizeDateType(input.type || existing.type);
  const confirmed = input.confirmed ?? existing.confirmed ?? true;
  const item = {
    id: existing.dateId || existing.id || input.dateId || input.id || crypto.randomUUID(),
    pageId: input.pageId || existing.pageId || null,
    type,
    title: input.title || existing.title || type,
    date: input.date || existing.date || '',
    time: input.time || null,
    endDate: input.endDate || null,
    endTime: input.endTime || null,
    timezone: input.timezone || input.timeZone || existing.timezone || existing.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    timeZone: input.timezone || input.timeZone || existing.timezone || existing.timeZone || '',
    allDay: input.allDay ?? existing.allDay ?? !input.time,
    confirmed,
    uncertain: !confirmed,
    sourceText: input.sourceText || existing.sourceText || existing.snippet || null,
    snippet: input.sourceText || existing.sourceText || existing.snippet || '',
    reminderOffsets: Array.isArray(input.reminderOffsets) ? input.reminderOffsets : (existing.reminderOffsets || []),
    notes: input.notes || existing.notes || '',
    completed: Boolean(input.completed ?? existing.completed),
    origin: input.origin || existing.origin || 'manual',
    createdAt: existing.createdAt || input.createdAt || now,
    updatedAt: now,
  };
  return { ...item, status: calculateDateStatus(item) };
}

export function applyDateToPage(page, input) {
  const current = Array.isArray(page.importantDates) ? page.importantDates : [];
  const existing = current.find((item) => item.id === input.dateId || item.id === input.id || `${page.id}:${item.id}` === input.id);
  const serialized = serializeResearchDateForPage(input, existing || {});
  if (existing) {
    return current.map((item) => (item.id === existing.id ? serialized : item));
  }
  return [...current, serialized];
}

export function removeDateFromPage(page, event) {
  const current = Array.isArray(page.importantDates) ? page.importantDates : [];
  return current.filter((item) => item.id !== event.dateId && `${page.id}:${item.id}` !== event.id);
}

function formatGoogleDate(event) {
  return String(event.date || '').replace(/-/g, '');
}

function pageUrl(pageId) {
  return `${window.location.origin}${window.location.pathname}#/read/${pageId}`;
}

function escapeIcs(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function googleCalendarUrlForEvent(event) {
  const start = formatGoogleDate(event);
  const endDate = event.endDate ? parseLocalDate(event.endDate) : addDays(event.date, 1);
  const end = toLocalIsoDate(endDate).replace(/-/g, '');
  const details = [event.sourceText, event.summary, event.page?.sourceUrl, pageUrl(event.pageId)].filter(Boolean).join('\n\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${event.title || event.type} - ${event.pageTitle || 'Research entry'}`,
    dates: `${start}/${end}`,
    details,
    location: event.page?.sourceUrl || event.source || pageUrl(event.pageId),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadResearchIcs(event) {
  const start = formatGoogleDate(event);
  const endDate = event.endDate ? parseLocalDate(event.endDate) : addDays(event.date, 1);
  const end = toLocalIsoDate(endDate).replace(/-/g, '');
  const description = [event.sourceText, event.summary, event.page?.sourceUrl, pageUrl(event.pageId)].filter(Boolean).join('\n\n');
  const uid = `${event.dateId || event.id}@personal-knowledge-vault`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Anubha Parashar//Personal Knowledge Vault//EN',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(uid)}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeIcs(`${event.title || event.type} - ${event.pageTitle || 'Research entry'}`)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `URL:${escapeIcs(pageUrl(event.pageId))}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(event.title || event.type || 'research-date').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'research-date'}.ics`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function getCalendarDevTestPages(baseDate = new Date()) {
  const iso = (offset) => toLocalIsoDate(addDays(baseDate, offset));
  const nextMonth = addMonths(baseDate, 1);
  const page = (id, title, category, dates) => ({
    id,
    secure: false,
    title,
    category,
    tags: ['Development test'],
    summary: `${title} development-only calendar fixture.`,
    plainText: '',
    sourceDomain: 'example.edu',
    sourceMetadata: { sourceName: 'Example University' },
    importantDates: dates,
    createdAt: iso(-20),
    updatedAt: iso(-1),
    attachments: [],
    inlineFiles: [],
  });
  return [
    page('dev-scholarship', 'Scholarship application', 'Research Opportunities/Scholarships', [{ id: 'today', type: 'Scholarship deadline', title: 'Scholarship deadline today', date: iso(0), confirmed: true }]),
    page('dev-postdoc', 'Postdoctoral role', 'Research Opportunities/Postdoctoral Opportunities', [{ id: 'postdoc', type: 'Postdoctoral application deadline', title: 'Postdoctoral deadline', date: iso(3), confirmed: true }]),
    page('dev-conference', 'Conference CFP', 'Publishing/Conference Calls', [
      { id: 'abstract', type: 'Abstract submission', title: 'Conference abstract deadline', date: iso(14), confirmed: true },
      { id: 'full-paper', type: 'Full-paper submission', title: 'Full-paper submission', date: toLocalIsoDate(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 18)), confirmed: true },
      { id: 'notification', type: 'Notification date', title: 'Journal notification date', date: iso(38), confirmed: true },
    ]),
    page('dev-completed', 'Completed application', 'Applications/Scholarship Applications', [{ id: 'completed', type: 'Application deadline', title: 'Completed application', date: iso(-2), completed: true, confirmed: true }]),
    page('dev-overdue', 'Overdue fellowship', 'Research Opportunities/Fellowships', [{ id: 'overdue', type: 'Fellowship closing date', title: 'Fellowship closing date', date: iso(-5), confirmed: true }]),
    page('dev-interview', 'Interview plan', 'Applications/Postdoctoral Applications', [{ id: 'interview', type: 'Interview', title: 'Postdoctoral interview', date: iso(6), time: '09:00', confirmed: true }]),
    page('dev-ambiguous', 'Ambiguous imported opportunity', 'Research Opportunities/Research Jobs', [{ id: 'ambiguous', type: 'Detected date', title: 'Ambiguous imported date', date: iso(10), confirmed: false, uncertain: true, sourceText: 'Deadline may be 07/16/2026' }]),
    page('dev-no-date', 'Entry with no important date', 'Personal Knowledge/General Notes', []),
  ];
}
