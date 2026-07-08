export const DATE_ANALYSIS_VERSION = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_PATTERN = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const WEEKDAY_PATTERN = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';
const TIME_ZONE_PATTERN = 'AoE|UTC|GMT|IST|CET|CEST|PST|PDT|EST|EDT|CST|CDT|MST|MDT|BST|AEST|AEDT|ET|PT';
const ORDINAL = '(?:st|nd|rd|th)?';

const MONTHS = [
  ['jan', 0], ['january', 0],
  ['feb', 1], ['february', 1],
  ['mar', 2], ['march', 2],
  ['apr', 3], ['april', 3],
  ['may', 4],
  ['jun', 5], ['june', 5],
  ['jul', 6], ['july', 6],
  ['aug', 7], ['august', 7],
  ['sep', 8], ['sept', 8], ['september', 8],
  ['oct', 9], ['october', 9],
  ['nov', 10], ['november', 10],
  ['dec', 11], ['december', 11],
];

const WEEKDAYS = new Map([
  ['sunday', 0],
  ['monday', 1],
  ['tuesday', 2],
  ['wednesday', 3],
  ['thursday', 4],
  ['friday', 5],
  ['saturday', 6],
]);

const NUMBER_WORDS = new Map([
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['thirteen', 13],
  ['fourteen', 14],
  ['fifteen', 15],
  ['sixteen', 16],
  ['seventeen', 17],
  ['eighteen', 18],
  ['nineteen', 19],
  ['twenty', 20],
  ['thirty', 30],
  ['forty', 40],
  ['fifty', 50],
  ['sixty', 60],
]);

const EXPLICIT_DATE_LABELS = [
  'deadline for revision submissions',
  'revision submission deadline',
  'revision submission',
  'revision deadline',
  'revised manuscript deadline',
  'resubmission deadline',
  'notification of final decisions',
  'notification of final decision',
  'final decision notification',
  'final acceptance decision',
  'final review decision',
  'first-round review decisions',
  'first-round review decision',
  'first round decision',
  'initial review decision',
  'first review result',
  'abstract submission deadline',
  'abstract submission',
  'abstract deadline',
  'extended abstract deadline',
  'full-paper submission deadline',
  'full paper deadline',
  'paper submission',
  'manuscript deadline',
  'submission deadline',
  'submissions deadline',
  'submission closes',
  'submit by',
  'application deadline',
  'last date to apply',
  'closing date',
  'apply by',
  'apply before',
  'acceptance notification',
  'notification of acceptance',
  'notification date',
  'camera-ready deadline',
  'camera-ready',
  'camera ready',
  'final manuscript submission',
  'registration deadline',
  'author registration',
  'early registration',
  'tentative publication',
  'expected publication month',
  'planned publication',
  'publication date',
  'expected publication',
  'publication scheduled',
  'conference dates',
  'event dates',
  'symposium dates',
  'workshop dates',
  'opening date',
  'interview date',
];

const PRIMARY_PRIORITY = [
  [/submission-deadline|application-deadline|scholarship-deadline|postdoctoral-application-deadline|fellowship-deadline|general-deadline|submission|application|apply|closing|last date/i, 1],
  [/revision-submission-deadline|revision/i, 2],
  [/registration-deadline|registration/i, 3],
  [/camera-ready-deadline|camera/i, 4],
  [/first-round-review-decision|final-decision-notification|notification-date|review|notification|decision/i, 5],
  [/conference-dates|event-date|conference|event|symposium|workshop/i, 6],
  [/tentative-publication|publication-date|publication/i, 7],
];

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanKey(value = '') {
  return cleanText(value).toLowerCase();
}

function slug(value = '') {
  return cleanKey(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const DATE_TYPE_RULES = [
  { type: 'revision-submission-deadline', label: 'Revision submission deadline', patterns: ['deadline for revision submissions', 'revision submission deadline', 'revision submission', 'revision deadline', 'revised manuscript deadline', 'resubmission deadline'] },
  { type: 'final-decision-notification', label: 'Final decision notification', patterns: ['notification of final decisions', 'notification of final decision', 'final decision notification', 'final decision', 'final acceptance decision', 'final review decision'] },
  { type: 'first-round-review-decision', label: 'First-round review decision', patterns: ['first-round review decisions', 'first-round review decision', 'first round decision', 'initial review decision', 'first review result'] },
  { type: 'abstract-submission-deadline', label: 'Abstract submission deadline', patterns: ['abstract submission deadline', 'abstract submission', 'abstract deadline', 'extended abstract deadline'] },
  { type: 'full-paper-submission-deadline', label: 'Full-paper submission deadline', patterns: ['full-paper submission deadline', 'full paper submission deadline', 'full paper deadline', 'paper submission', 'manuscript deadline'] },
  { type: 'camera-ready-deadline', label: 'Camera-ready deadline', patterns: ['camera-ready deadline', 'camera ready deadline', 'camera-ready', 'camera ready', 'final manuscript submission'] },
  { type: 'registration-deadline', label: 'Registration deadline', patterns: ['registration deadline', 'author registration', 'early registration'] },
  { type: 'submission-deadline', label: 'Submission deadline', patterns: ['submissions deadline', 'submission deadline', 'submission closes', 'submit by', 'paper submission deadline', 'manuscript submission deadline'] },
  { type: 'notification-date', label: 'Notification date', patterns: ['acceptance notification', 'notification of acceptance', 'notification date'] },
  { type: 'tentative-publication', label: 'Tentative publication', patterns: ['tentative publication', 'expected publication month', 'planned publication'] },
  { type: 'publication-date', label: 'Publication date', patterns: ['publication date', 'expected publication', 'publication scheduled', 'published', 'date published'] },
  { type: 'conference-dates', label: 'Conference dates', patterns: ['conference dates', 'event dates', 'symposium dates', 'workshop dates'] },
  { type: 'application-deadline', label: 'Application deadline', patterns: ['application deadline', 'applications close', 'application closes', 'last date to apply', 'apply by', 'apply before', 'closing date'] },
  { type: 'opening-date', label: 'Opening date', patterns: ['opening date', 'applications open', 'application opens', 'opens on'] },
  { type: 'interview-date', label: 'Interview date', patterns: ['interview date', 'interview'] },
  { type: 'general-deadline', label: 'Deadline', patterns: ['deadline', 'due date', 'due by'] },
  { type: 'event-date', label: 'Event date', patterns: ['event date', 'conference date', 'symposium date', 'workshop date'] },
  { type: 'detected-date', label: 'Detected date', patterns: [] },
];

const DATE_TYPE_BY_TYPE = new Map(DATE_TYPE_RULES.map((rule) => [rule.type, rule]));
const LEGACY_DATE_TYPE_MAP = new Map(DATE_TYPE_RULES.flatMap((rule) => [
  [cleanKey(rule.label), rule],
  [rule.type, rule],
]));

function startOfDay(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return startOfDay(new Date());
  date.setHours(0, 0, 0, 0);
  return date;
}

function makeDate(year, monthIndex, day = 1) {
  const date = new Date(Number(year), Number(monthIndex), Number(day));
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== Number(year)
    || date.getMonth() !== Number(monthIndex)
    || date.getDate() !== Number(day)
  ) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function isoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthIndex(value = '') {
  const key = value.toLowerCase().replace(/\.$/, '');
  const found = MONTHS.find(([name]) => key === name || key.startsWith(name));
  return found ? found[1] : null;
}

function numberValue(value = '') {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return NUMBER_WORDS.get(value.toLowerCase()) || null;
}

function stableHash(value = '') {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function parseReferenceDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return startOfDay(value);
  if (typeof value?.toDate === 'function') return startOfDay(value.toDate());
  if (typeof value?.seconds === 'number') return startOfDay(new Date(value.seconds * 1000));

  const text = cleanText(value);
  if (!text) return null;

  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return makeDate(iso[1], Number(iso[2]) - 1, iso[3]);

  const dayMonth = text.match(new RegExp(`\\b(\\d{1,2})${ORDINAL}\\s+(${MONTH_PATTERN})(?:,)?\\s+(20\\d{2})\\b`, 'i'));
  if (dayMonth) return makeDate(dayMonth[3], monthIndex(dayMonth[2]), dayMonth[1]);

  const monthDay = text.match(new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})${ORDINAL}(?:,)?\\s+(20\\d{2})\\b`, 'i'));
  if (monthDay) return makeDate(monthDay[3], monthIndex(monthDay[1]), monthDay[2]);

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function resolveReference(input = {}) {
  const metadata = input.sourceMetadata || {};
  const explicitPublication = parseReferenceDate(
    metadata.publicationDate
    || metadata.publishedTime
    || metadata.datePublished
    || input.publicationDate,
  );
  if (explicitPublication) return { date: explicitPublication, source: 'publication', reliable: true };

  const importedPublication = parseReferenceDate(input.importedPublicationDate || input.importedAt);
  if (importedPublication) return { date: importedPublication, source: 'import', reliable: true };

  const fallback = parseReferenceDate(input.referenceDate);
  if (fallback) return { date: fallback, source: 'provided', reliable: true };

  return { date: startOfDay(new Date()), source: 'current', reliable: true };
}

function nearbyYear(text, index) {
  const windowText = text.slice(Math.max(0, index - 90), Math.min(text.length, index + 120));
  const match = windowText.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function resolveYear({ explicitYear, text, index, month, day, reference }) {
  if (explicitYear) return { year: Number(explicitYear), inferred: false };
  const localYear = nearbyYear(text, index);
  if (localYear) return { year: localYear, inferred: true };

  let year = reference.getFullYear();
  const candidate = makeDate(year, month, day);
  if (candidate && candidate.getTime() + DAY_MS < reference.getTime()) year += 1;
  return { year, inferred: true };
}

function snippetAround(text, start, end, heading = '') {
  const block = String(text || '');
  const beforeBoundary = Math.max(
    0,
    block.lastIndexOf('\n', start - 1) + 1,
    block.lastIndexOf(';', start - 1) + 1,
    block.lastIndexOf('|', start - 1) + 1,
  );
  const afterCandidates = [
    block.indexOf('\n', end),
    block.indexOf(';', end),
    block.indexOf('|', end),
  ].filter((value) => value >= 0);
  const afterBoundary = afterCandidates.length ? Math.min(...afterCandidates) : block.length;
  const snippet = cleanText(block.slice(Math.max(0, beforeBoundary), afterBoundary));
  return cleanText([heading, snippet].filter(Boolean).join(' - ')).slice(0, 200);
}

function labelForCandidate(context = {}, start = 0, end = 0) {
  const text = String(context.text || '');
  const before = text.slice(0, start).split(/[\n;|]/).pop() || '';
  const after = text.slice(end).split(/[\n;|]/)[0] || '';
  const colonLabel = before.includes(':') ? before.slice(before.lastIndexOf(':') + 1) : before;
  const label = cleanText(colonLabel || before || after || context.heading || text).slice(-140);
  return cleanText([context.heading, label].filter(Boolean).join(' '));
}

function hasOverlap(used, start, end) {
  return used.some(([usedStart, usedEnd]) => start < usedEnd && end > usedStart);
}

function parseTimeAndZone(text, start, end) {
  const windowText = text.slice(Math.max(0, start - 25), Math.min(text.length, end + 60));
  const timeMatch = windowText.match(/\b(?:at|by|before|until|,)?\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)\b/);
  let time = '';
  if (timeMatch) {
    let hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2] || '0');
    const meridiem = timeMatch[3].toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    if (hours <= 23 && minutes <= 59) time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  const zoneMatch = windowText.match(new RegExp(`\\b(${TIME_ZONE_PATTERN})\\b`, 'i'));
  const timeZone = zoneMatch ? zoneMatch[1] : '';
  return { time, timeZone };
}

function addAbsoluteCandidate(candidates, used, context, match, start, end, parsed) {
  const hasPreciseDate = parsed?.date instanceof Date && !Number.isNaN(parsed.date.getTime());
  const hasPartialMonth = parsed?.precision === 'month' && Number(parsed.year) && Number(parsed.month);
  if ((!hasPreciseDate && !hasPartialMonth) || hasOverlap(used, start, end)) return;
  used.push([start, end]);
  const { time, timeZone } = parseTimeAndZone(context.text, start, end);
  const label = labelForCandidate(context, start, end);
  candidates.push({
    ...parsed,
    time,
    timeZone,
    snippet: snippetAround(context.text, start, end, context.heading),
    context: label || context.text,
    sourceBlock: context.text,
    sourceBlockIndex: context.index ?? 0,
    sourceRole: context.role,
    localLabel: label,
  });
}

function scanAbsoluteDates(context, referenceInfo) {
  const text = context.text || '';
  const reference = referenceInfo.date;
  const candidates = [];
  const used = [];

  const rangePatterns = [
    new RegExp(`\\b(\\d{1,2})${ORDINAL}\\s*[\\u2013\\u2014-]\\s*(\\d{1,2})${ORDINAL}\\s+(${MONTH_PATTERN})(?:,)?\\s*(20\\d{2})?\\b`, 'gi'),
    new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})${ORDINAL}\\s*[\\u2013\\u2014-]\\s*(\\d{1,2})${ORDINAL}(?:,)?\\s*(20\\d{2})?\\b`, 'gi'),
  ];

  for (const pattern of rangePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const isMonthFirst = Number.isNaN(Number(match[1]));
      const month = monthIndex(isMonthFirst ? match[1] : match[3]);
      const startDay = Number(isMonthFirst ? match[2] : match[1]);
      const endDay = Number(isMonthFirst ? match[3] : match[2]);
      if (month == null || startDay > endDay) continue;
      const yearValue = isMonthFirst ? match[4] : match[4];
      const { year, inferred } = resolveYear({ explicitYear: yearValue, text, index: match.index, month, day: startDay, reference });
      const startDate = makeDate(year, month, startDay);
      const endDate = makeDate(year, month, endDay);
      addAbsoluteCandidate(candidates, used, context, match, match.index, match.index + match[0].length, {
        date: startDate,
        endDate,
        precision: 'day',
        yearInferred: inferred,
        isRange: true,
        ambiguous: false,
      });
    }
  }

  const isoPattern = /\b(20\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/g;
  let match;
  while ((match = isoPattern.exec(text)) !== null) {
    addAbsoluteCandidate(candidates, used, context, match, match.index, match.index + match[0].length, {
      date: makeDate(match[1], Number(match[2]) - 1, match[3]),
      precision: 'day',
      yearInferred: false,
      ambiguous: false,
    });
  }

  const slashPattern = /\b([0-3]?\d)[/-]([0-3]?\d)[/-](\d{2,4})\b/g;
  while ((match = slashPattern.exec(text)) !== null) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    const ambiguous = first <= 12 && second <= 12;
    addAbsoluteCandidate(candidates, used, context, match, match.index, match.index + match[0].length, {
      date: makeDate(year, second - 1, first),
      precision: 'day',
      yearInferred: false,
      ambiguous,
    });
  }

  const dayMonthPattern = new RegExp(`\\b(?:${WEEKDAY_PATTERN},?\\s+)?(\\d{1,2})${ORDINAL}\\s+(${MONTH_PATTERN})(?:,)?\\s*(20\\d{2})?\\b`, 'gi');
  while ((match = dayMonthPattern.exec(text)) !== null) {
    const month = monthIndex(match[2]);
    const day = Number(match[1]);
    const { year, inferred } = resolveYear({ explicitYear: match[3], text, index: match.index, month, day, reference });
    addAbsoluteCandidate(candidates, used, context, match, match.index, match.index + match[0].length, {
      date: makeDate(year, month, day),
      precision: 'day',
      yearInferred: inferred,
      ambiguous: false,
    });
  }

  const monthDayPattern = new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})${ORDINAL}(?:,)?\\s*(20\\d{2})?\\b`, 'gi');
  while ((match = monthDayPattern.exec(text)) !== null) {
    const month = monthIndex(match[1]);
    const day = Number(match[2]);
    const { year, inferred } = resolveYear({ explicitYear: match[3], text, index: match.index, month, day, reference });
    addAbsoluteCandidate(candidates, used, context, match, match.index, match.index + match[0].length, {
      date: makeDate(year, month, day),
      precision: 'day',
      yearInferred: inferred,
      ambiguous: false,
    });
  }

  const monthYearPattern = new RegExp(`\\b(${MONTH_PATTERN})\\s+(20\\d{2})\\b`, 'gi');
  while ((match = monthYearPattern.exec(text)) !== null) {
    const month = monthIndex(match[1]);
    addAbsoluteCandidate(candidates, used, context, match, match.index, match.index + match[0].length, {
      date: makeDate(match[2], month, 1),
      precision: 'month',
      yearInferred: false,
      ambiguous: false,
    });
  }

  return candidates;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfMonth(date) {
  const value = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  value.setHours(0, 0, 0, 0);
  return value;
}

function nextWeekday(reference, weekday) {
  const current = reference.getDay();
  let delta = (weekday - current + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(reference, delta);
}

function scanRelativeDates(context, referenceInfo) {
  const text = context.text || '';
  const lower = text.toLowerCase();
  const candidates = [];
  const baseReference = referenceInfo.date;

  function addRelative(match, date, options = {}) {
    if (!date) return;
    candidates.push({
      date,
      precision: 'day',
      yearInferred: true,
      ambiguous: Boolean(options.ambiguous),
      relative: true,
      snippet: snippetAround(text, match.index, match.index + match[0].length, context.heading),
      context: cleanText([context.heading, text].filter(Boolean).join(' ')),
      sourceRole: context.role,
      relativeSource: options.relativeSource || referenceInfo.source,
    });
  }

  let match;
  const tomorrowPattern = /\btomorrow\b/gi;
  while ((match = tomorrowPattern.exec(text)) !== null) addRelative(match, addDays(baseReference, 1));

  const nextWeekdayPattern = new RegExp(`\\bnext\\s+(${WEEKDAY_PATTERN})\\b`, 'gi');
  while ((match = nextWeekdayPattern.exec(text)) !== null) {
    addRelative(match, nextWeekday(baseReference, WEEKDAYS.get(match[1].toLowerCase())));
  }

  const inPattern = /\b(?:in|within)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|twenty|thirty|forty|fifty|sixty)\s+(day|days|week|weeks|month|months)\b/gi;
  while ((match = inPattern.exec(text)) !== null) {
    const amount = numberValue(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = unit.startsWith('week') ? 7 : unit.startsWith('month') ? 30 : 1;
    const publicationBased = /\b(publication|published|posted|advertisement|advertised)\b/.test(lower);
    const reference = publicationBased ? referenceInfo.date : baseReference;
    addRelative(match, addDays(reference, amount * multiplier), {
      ambiguous: publicationBased && referenceInfo.source === 'current',
      relativeSource: publicationBased ? 'publication' : referenceInfo.source,
    });
  }

  const openForPattern = /\b(?:open|remain open|available)\s+(?:for\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|twenty|thirty|forty|fifty|sixty)\s+(day|days|week|weeks|month|months)\s+(?:from|after)\s+(?:publication|posting|advertisement|notification)\b/gi;
  while ((match = openForPattern.exec(text)) !== null) {
    const amount = numberValue(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = unit.startsWith('week') ? 7 : unit.startsWith('month') ? 30 : 1;
    addRelative(match, addDays(referenceInfo.date, amount * multiplier), {
      ambiguous: referenceInfo.source === 'current',
      relativeSource: 'publication',
    });
  }

  const afterNotificationPattern = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|twenty|thirty)\s+days?\s+after\s+notification\b/gi;
  while ((match = afterNotificationPattern.exec(text)) !== null) {
    addRelative(match, addDays(baseReference, numberValue(match[1])), {
      ambiguous: true,
      relativeSource: 'notification',
    });
  }

  const endMonthPattern = /\bend\s+of\s+(?:this|the)\s+month\b/gi;
  while ((match = endMonthPattern.exec(text)) !== null) addRelative(match, endOfMonth(baseReference));

  return candidates;
}

function htmlContexts(html = '') {
  if (!html || typeof DOMParser === 'undefined') return [];
  try {
    const parsed = new DOMParser().parseFromString(`<main>${html}</main>`, 'text/html');
    const root = parsed.body.firstElementChild;
    if (!root) return [];
    const contexts = [];
    let heading = '';
    root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,tr,dt,dd,blockquote').forEach((node) => {
      const tag = node.tagName.toLowerCase();
      const text = tag === 'tr'
        ? [...node.children].map((cell) => cleanText(cell.textContent)).filter(Boolean).join(' | ')
        : cleanText(node.textContent || '');
      if (!text) return;
      if (/^h[1-6]$/.test(tag)) {
        heading = text;
        contexts.push({ text, heading: '', role: 'heading', index: contexts.length });
        return;
      }
      contexts.push({ text, heading, role: tag === 'tr' ? 'table-row' : 'html', index: contexts.length });
    });
    return contexts;
  } catch {
    return [];
  }
}

function textWithBlockBoundaries(value = '') {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/(p|li|tr|h[1-6]|div|section|article|blockquote|dt|dd)\s*>/gi, '\n')
    .replace(/<\s*(li|tr|h[1-6]|p|dt|dd)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/(^|\n)\s*[\u2022\u25AA\u25E6]\s+/g, '$1')
    .replace(/(^|\n)\s*[-*]\s+(?=\S)/g, '$1')
    .replace(/[ \t]+/g, ' ');
}

function splitTextContexts(text = '', role = 'text') {
  const clean = textWithBlockBoundaries(text);
  if (!clean.trim()) return [];
  const lines = clean
    .split(/\n+/)
    .flatMap((line) => line.split(/\s+[\u2022\u25AA\u25E6]\s+|\s+\*\s+(?=\S)/))
    .map((line) => cleanText(line))
    .filter(Boolean);
  const parts = lines.length > 1
    ? lines
    : cleanText(clean).split(/(?<=[.!?])\s+|;\s+/).map((part) => cleanText(part)).filter(Boolean);
  return parts.map((part, index) => ({ text: part, heading: '', role, index }));
}

function buildDateContexts(input = {}) {
  if (typeof input === 'string') return splitTextContexts(input);
  const contexts = [];
  const metadata = input.sourceMetadata || {};

  function add(text, role, heading = '') {
    const value = cleanText(text);
    if (value) contexts.push({ text: value, heading, role, index: contexts.length });
  }

  add(input.title, 'title');
  add(input.summary, 'summary');
  add(input.category, 'category');
  add(Array.isArray(input.tags) ? input.tags.join(', ') : input.tags, 'tags');
  add(input.sourceUrl, 'source-url');
  add(metadata.description, 'source-description');
  add(metadata.publicationDate || metadata.publishedTime || metadata.datePublished, 'source-publication-date', 'Publication date');
  add(metadata.sourceName, 'source-name');
  add(metadata.canonicalUrl, 'source-url');
  contexts.push(...htmlContexts(input.html));
  const combinedText = [
    input.importedText,
    input.importedContent,
    input.webpageContent,
    input.fileText,
    input.extractedText,
    input.documentText,
    input.content,
    input.text,
    input.plainText,
  ].filter(Boolean).join('\n');
  contexts.push(...splitTextContexts(combinedText, 'text'));
  return contexts.map((context, index) => ({ ...context, index: context.index ?? index })).filter((context) => /\d|tomorrow|next|within|in |end of this month/i.test(context.text));
}

function normaliseDateType(value = '') {
  const key = cleanKey(value);
  if (!key) return null;
  if (LEGACY_DATE_TYPE_MAP.has(key)) return LEGACY_DATE_TYPE_MAP.get(key);
  const keySlug = slug(key);
  if (DATE_TYPE_BY_TYPE.has(keySlug)) return DATE_TYPE_BY_TYPE.get(keySlug);
  return null;
}

export function classifyDateType(context = '') {
  const direct = normaliseDateType(context);
  if (direct && direct.type !== 'detected-date') return direct;
  const value = cleanKey(context).replace(/[\u2013\u2014]/g, '-');
  if (/\b(page|last)\s+(updated|modified)\b|updated on|last modified/.test(value)) return { type: 'page-updated-date', label: 'Page updated date' };
  for (const rule of DATE_TYPE_RULES) {
    if (rule.type === 'detected-date') continue;
    const patterns = [...rule.patterns].sort((a, b) => b.length - a.length);
    if (patterns.some((phrase) => value.includes(phrase))) return rule;
  }
  if (/scholarship/.test(value) && /deadline|close|apply|last date|submission/.test(value)) return { type: 'scholarship-deadline', label: 'Scholarship deadline' };
  if (/postdoc|postdoctoral/.test(value) && /deadline|close|apply|last date|submission/.test(value)) return { type: 'postdoctoral-application-deadline', label: 'Postdoctoral application deadline' };
  if (/fellowship/.test(value) && /deadline|close|apply|last date|submission/.test(value)) return { type: 'fellowship-deadline', label: 'Fellowship deadline' };
  if (/deadline|due date|due by/.test(value)) return DATE_TYPE_BY_TYPE.get('general-deadline');
  if (/conference|symposium|workshop|event/.test(value)) return DATE_TYPE_BY_TYPE.get('event-date');
  return DATE_TYPE_BY_TYPE.get('detected-date');
}

function hasExplicitDateLabel(context = '') {
  const value = cleanKey(context);
  return EXPLICIT_DATE_LABELS.some((label) => value.includes(label));
}

export function calculateDateConfidence(candidate = {}) {
  const typeRule = normaliseDateType(candidate.type) || classifyDateType(candidate.localLabel || candidate.context || candidate.snippet);
  const labelled = typeRule.type !== 'detected-date' || hasExplicitDateLabel(candidate.localLabel || candidate.context || candidate.snippet);
  if (candidate.ambiguous) return 'low';
  if (typeRule.type === 'tentative-publication' || candidate.precision === 'month') return labelled ? 'medium' : 'low';
  if (labelled && candidate.precision === 'day' && !candidate.yearInferred) return 'high';
  if (labelled && candidate.precision === 'day') return 'medium';
  return 'low';
}

function primaryPriority(type = '') {
  const found = PRIMARY_PRIORITY.find(([pattern]) => pattern.test(type));
  return found ? found[1] : Number.POSITIVE_INFINITY;
}

export function isPrimaryDateType(date = {}) {
  return Number.isFinite(primaryPriority(`${date.type || ''} ${date.displayLabel || date.title || ''}`));
}

export function isCalendarImportantDate(date = {}) {
  const type = `${date.type || ''} ${date.displayLabel || date.title || ''}`;
  if (/publication|page updated/i.test(type)) return false;
  return isPrimaryDateType(date) || /opening|results/i.test(type);
}

export function normaliseDetectedDate(candidate = {}, options = {}) {
  const pageId = options.pageId || candidate.pageId || 'draft';
  const typeRule = normaliseDateType(candidate.type) || classifyDateType(candidate.localLabel || candidate.context || candidate.snippet || candidate.displayLabel);
  const type = typeRule.type;
  const displayLabel = candidate.displayLabel || candidate.title || typeRule.label || 'Detected date';
  const confidence = candidate.confidence || calculateDateConfidence({ ...candidate, type });
  const preciseDate = candidate.date instanceof Date ? isoDate(candidate.date) : String(candidate.date || '');
  const endDate = candidate.endDate instanceof Date ? isoDate(candidate.endDate) : String(candidate.endDate || '');
  const parsedDate = preciseDate ? parseReferenceDate(preciseDate) : null;
  const year = Number(candidate.year || (parsedDate ? parsedDate.getFullYear() : 0)) || null;
  const month = Number(candidate.month || (parsedDate ? parsedDate.getMonth() + 1 : 0)) || null;
  const day = candidate.day === null ? null : (Number(candidate.day || (parsedDate ? parsedDate.getDate() : 0)) || null);
  const precision = candidate.precision || candidate.datePrecision || (preciseDate ? 'day' : year && month ? 'month' : year ? 'year' : 'day');
  const date = precision === 'day' ? preciseDate : '';
  const snippet = cleanText(candidate.sourceText || candidate.snippet || candidate.sourceBlock || candidate.context || '').slice(0, 200);
  const time = candidate.time || null;
  const timeZone = candidate.timeZone || candidate.timezone || null;
  const origin = candidate.origin || candidate.source || 'automatic';
  const source = origin === 'manual' ? 'manual' : (candidate.source || 'automatic');
  const fingerprintSource = [
    pageId,
    cleanKey(type),
    date,
    endDate,
    precision,
    year || '',
    month || '',
    day ?? '',
    time || '',
    Number(candidate.sourceBlockIndex ?? 0),
    cleanKey(snippet).slice(0, 120),
  ].join('|');
  const fingerprint = candidate.fingerprint || stableHash(fingerprintSource);
  const needsConfirmation = confidence === 'low' || precision !== 'day' || Boolean(candidate.ambiguous);

  return {
    id: candidate.id || `date_${fingerprint}`,
    type,
    displayLabel,
    title: displayLabel,
    date: date || null,
    endDate,
    year,
    month,
    day: precision === 'day' ? day : null,
    precision,
    datePrecision: precision,
    time,
    timeZone,
    timezone: timeZone,
    sourceText: snippet,
    snippet,
    sourceBlockIndex: Number(candidate.sourceBlockIndex ?? 0),
    source,
    origin,
    confidence,
    detectionStatus: needsConfirmation ? 'needs_confirmation' : 'detected',
    detectedAutomatically: candidate.detectedAutomatically ?? source !== 'manual',
    detectedAt: candidate.detectedAt || new Date().toISOString(),
    fingerprint,
    uncertain: candidate.uncertain ?? needsConfirmation,
    confirmed: candidate.confirmed ?? !needsConfirmation,
    manuallyEdited: Boolean(candidate.manuallyEdited || source === 'manual'),
    completed: Boolean(candidate.completed),
    reminder: candidate.reminder || { inApp: isPrimaryDateType({ type }), browser: false },
  };
}

function equivalentDateKey(date = {}) {
  return [
    cleanKey(date.type || ''),
    date.date || '',
    date.endDate || '',
    date.precision || date.datePrecision || '',
    date.year || '',
    date.month || '',
    date.day ?? '',
    date.time || '',
  ].join('|');
}

function dateOnlyKey(date = {}) {
  return [
    date.date || '',
    date.precision || date.datePrecision || '',
    date.year || '',
    date.month || '',
    date.day ?? '',
    date.time || '',
  ].join('|');
}

function canUpdateAutomaticDate(date = {}) {
  if (date.completed || date.source === 'manual' || date.origin === 'manual' || date.manuallyEdited) return false;
  return date.source === 'automatic' || date.detectedAutomatically || date.origin === 'automatic' || date.uncertain || date.confirmed;
}

export function deduplicateDates(existing = [], detected = [], options = {}) {
  const pageId = options.pageId || 'draft';
  const merged = (Array.isArray(existing) ? existing : []).map((item) => {
    const source = item.source || item.origin || (item.manuallyEdited ? 'manual' : item.detectedAutomatically ? 'automatic' : undefined);
    const inferredSource = source || (item.sourceText || item.snippet || item.fingerprint ? 'automatic' : 'manual');
    return normaliseDetectedDate({
      ...item,
      source: inferredSource,
      origin: item.origin || inferredSource,
      detectedAutomatically: inferredSource === 'automatic',
    }, { pageId });
  });
  const byFingerprint = new Map(merged.map((item) => [item.fingerprint, item]));
  const byEquivalent = new Map(merged.map((item) => [equivalentDateKey(item), item]));
  const byDateOnly = new Map(merged.filter(canUpdateAutomaticDate).map((item) => [dateOnlyKey(item), item]));

  (Array.isArray(detected) ? detected : []).forEach((item) => {
    const normalised = normaliseDetectedDate(item, { pageId });
    const match = byFingerprint.get(normalised.fingerprint) || byEquivalent.get(equivalentDateKey(normalised)) || byDateOnly.get(dateOnlyKey(normalised));
    if (!match) {
      merged.push(normalised);
      byFingerprint.set(normalised.fingerprint, normalised);
      byEquivalent.set(equivalentDateKey(normalised), normalised);
      if (canUpdateAutomaticDate(normalised)) byDateOnly.set(dateOnlyKey(normalised), normalised);
      return;
    }

    if (!canUpdateAutomaticDate(match)) return;
    const updated = {
      ...match,
      ...normalised,
      id: match.id,
      completed: match.completed,
      reminder: match.reminder || normalised.reminder,
    };
    const index = merged.findIndex((date) => date.id === match.id);
    if (index >= 0) merged[index] = updated;
    byFingerprint.set(updated.fingerprint, updated);
    byEquivalent.set(equivalentDateKey(updated), updated);
    if (canUpdateAutomaticDate(updated)) byDateOnly.set(dateOnlyKey(updated), updated);
  });

  return merged.slice(0, 60);
}

function dedupeDetectedDates(detected = [], pageId = 'draft') {
  return deduplicateDates([], detected, { pageId }).filter((date) => date.date || date.precision === 'month' || date.uncertain);
}

export function extractImportantDates(input = {}, options = {}) {
  const payload = typeof input === 'string' ? { text: input } : { ...input };
  const pageId = options.pageId || payload.pageId || 'draft';
  const referenceInfo = resolveReference({ ...payload, referenceDate: options.referenceDate || payload.referenceDate });
  const contexts = buildDateContexts(payload);
  const detected = [];

  contexts.forEach((context) => {
    const candidates = [
      ...scanAbsoluteDates(context, referenceInfo),
      ...scanRelativeDates(context, referenceInfo),
    ];
    candidates.forEach((candidate) => {
      detected.push(normaliseDetectedDate(candidate, { pageId }));
    });
  });

  return dedupeDetectedDates(detected, pageId);
}

export function selectNextImportantDate(dates = [], options = {}) {
  const today = startOfDay(options.now || new Date());
  const includeOverdue = Boolean(options.includeOverdue);
  return [...(Array.isArray(dates) ? dates : [])]
    .filter((date) => date?.date && !date.completed && Number.isFinite(primaryPriority(`${date.type || ''} ${date.displayLabel || date.title || ''}`)))
    .filter((date) => {
      if (includeOverdue) return true;
      const end = parseReferenceDate(date.endDate || date.date);
      return end && end.getTime() >= today.getTime();
    })
    .sort((a, b) => {
      const priority = primaryPriority(`${a.type || ''} ${a.displayLabel || a.title || ''}`) - primaryPriority(`${b.type || ''} ${b.displayLabel || b.title || ''}`);
      if (priority !== 0) return priority;
      return String(a.date).localeCompare(String(b.date));
    })[0] || null;
}

export function daysUntilDate(dateValue, now = new Date()) {
  const date = parseReferenceDate(dateValue);
  if (!date) return null;
  return Math.ceil((date.getTime() - startOfDay(now).getTime()) / DAY_MS);
}

export function formatDetectedDate(date = {}) {
  if (!date?.date && (date.precision === 'month' || date.datePrecision === 'month') && date.year && date.month) {
    const monthDate = makeDate(date.year, Number(date.month) - 1, 1);
    return monthDate ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(monthDate) : 'Exact date not published';
  }
  if (!date?.date) return 'Unconfirmed';
  const start = parseReferenceDate(date.date);
  const end = parseReferenceDate(date.endDate);
  if (!start) return date.date;
  const formatter = new Intl.DateTimeFormat(undefined, {
    day: date.datePrecision === 'month' ? undefined : 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const startLabel = formatter.format(start);
  let label = startLabel;
  if (end && date.endDate && date.endDate !== date.date) {
    const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
    label = sameMonth
      ? `${start.getDate()}-${end.getDate()} ${new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(start)}`
      : `${startLabel} - ${formatter.format(end)}`;
  }
  const timeBits = [date.time, date.timeZone].filter(Boolean).join(' ');
  return timeBits ? `${label}, ${timeBits}` : label;
}

function pageInput(page = {}) {
  return {
    pageId: page.id,
    title: page.title,
    html: page.html,
    plainText: page.plainText,
    summary: page.summary,
    sourceUrl: page.sourceUrl,
    sourceMetadata: page.sourceMetadata || {},
    category: page.category,
    tags: page.tags || [],
    publicationDate: page.sourceMetadata?.publicationDate,
    referenceDate: page.createdAt || page.updatedAt,
  };
}

function canonicalDateList(dates = []) {
  return (Array.isArray(dates) ? dates : []).map((date) => ({
    id: date.id,
    type: date.type,
    date: date.date,
    endDate: date.endDate || '',
    time: date.time || '',
    timeZone: date.timeZone || '',
    snippet: date.snippet || '',
    source: date.source || '',
    confidence: date.confidence || '',
    uncertain: Boolean(date.uncertain),
    confirmed: Boolean(date.confirmed),
    completed: Boolean(date.completed),
    fingerprint: date.fingerprint || '',
  }));
}

export function migrateLegacyPageDates(page = {}, options = {}) {
  if (page.secure) {
    return {
      changed: false,
      skipped: true,
      reason: 'secure',
      importantDates: page.importantDates || [],
      detectedCount: 0,
      requiringConfirmation: 0,
      noDeadlineFound: true,
    };
  }

  const existing = Array.isArray(page.importantDates) ? page.importantDates : [];
  const alreadyAnalysed = Number(page.dateAnalysisVersion || 0) >= DATE_ANALYSIS_VERSION;
  if (alreadyAnalysed && !options.force) {
    return {
      changed: false,
      importantDates: existing,
      detectedCount: 0,
      requiringConfirmation: existing.filter((date) => date.uncertain && !date.confirmed).length,
      noDeadlineFound: !selectNextImportantDate(existing, { includeOverdue: true }),
    };
  }

  const detected = extractImportantDates(pageInput(page), { pageId: page.id });
  const merged = deduplicateDates(existing, detected, { pageId: page.id });
  const before = JSON.stringify(canonicalDateList(existing));
  const after = JSON.stringify(canonicalDateList(merged));
  const existingKeys = new Set(existing.map(equivalentDateKey));
  const detectedCount = merged.filter((date) => !existingKeys.has(equivalentDateKey(date))).length;
  const requiringConfirmation = merged.filter((date) => date.uncertain && !date.confirmed).length;
  const noDeadlineFound = !selectNextImportantDate(merged, { includeOverdue: true });

  return {
    changed: before !== after || !alreadyAnalysed || options.force,
    importantDates: merged,
    detectedCount,
    requiringConfirmation,
    noDeadlineFound,
    analysisPatch: {
      importantDates: merged,
      dateAnalysisVersion: DATE_ANALYSIS_VERSION,
      dateAnalysisAt: new Date().toISOString(),
      dateAnalysisSummary: {
        detectedCount,
        requiringConfirmation,
        noDeadlineFound,
      },
    },
  };
}
