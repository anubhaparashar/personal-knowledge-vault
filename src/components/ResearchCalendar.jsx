import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from './Branding';
import {
  CALENDAR_STARTS_ON,
  DATE_CATEGORY_OPTIONS,
  DATE_RANGE_OPTIONS,
  DATE_STATUS_OPTIONS,
  DATE_TYPE_OPTIONS,
  SORT_OPTIONS,
  addDays,
  addMonths,
  buildResearchDateEvents,
  dateTypeGroup,
  daysRemainingLabel,
  daysUntilDate,
  downloadResearchIcs,
  filterDateEvents,
  formatDateBlock,
  formatDateLong,
  formatDateShort,
  formatMonthTitle,
  formatTimeRange,
  getCalendarDevTestPages,
  getEventsByDate,
  getMonthDays,
  getWeekDays,
  googleCalendarUrlForEvent,
  parseLocalDate,
  sortDateEvents,
  statusClass,
  statusLabel,
  toLocalIsoDate,
  todayIso,
} from '../utils/researchDates';

const VIEWS = ['month', 'week', 'agenda', 'timeline'];
const VIEW_LABELS = { month: 'Month', week: 'Week', agenda: 'Agenda', timeline: 'Timeline' };
const ACTION_KEY = 'aprv-calendar-action';
const EMPTY_FILTERS = { ranges: [], types: [], categories: [], statuses: [] };

function joinClass(...items) {
  return items.filter(Boolean).join(' ');
}

function isSameMonth(a, b) {
  const first = parseLocalDate(a);
  const second = parseLocalDate(b);
  return Boolean(first && second && first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth());
}

function pageOptionLabel(page) {
  return page.secure ? 'Locked note' : (page.title || 'Untitled entry');
}

function activeFilterLabels(filters) {
  const chips = [];
  const rangeLabels = new Map(DATE_RANGE_OPTIONS.map((item) => [item.value, item.label]));
  const statusLabels = new Map(DATE_STATUS_OPTIONS.map((item) => [item.value, item.label]));
  (filters.ranges || []).forEach((value) => chips.push({ group: 'ranges', value, label: rangeLabels.get(value) || value }));
  (filters.types || []).forEach((value) => chips.push({ group: 'types', value, label: value }));
  (filters.categories || []).forEach((value) => chips.push({ group: 'categories', value, label: value }));
  (filters.statuses || []).forEach((value) => chips.push({ group: 'statuses', value, label: statusLabels.get(value) || value }));
  return chips;
}

function highlightText(text = '', query = '') {
  const value = String(text || '');
  const term = query.trim();
  if (!term) return value;
  const index = value.toLowerCase().indexOf(term.toLowerCase());
  if (index < 0) return value;
  return <>{value.slice(0, index)}<mark>{value.slice(index, index + term.length)}</mark>{value.slice(index + term.length)}</>;
}

export function DateStatusBadge({ status }) {
  return <span className={`date-status-badge ${statusClass(status)}`}>{statusLabel(status)}</span>;
}

export function CalendarEventChip({ event, onOpen }) {
  return (
    <button
      type="button"
      className={`calendar-event-chip ${statusClass(event.status)} category-${event.category?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'general'}`}
      title={`${event.title || event.type} - ${event.pageTitle}`}
      aria-label={`${event.title || event.type}, ${event.pageTitle}, ${statusLabel(event.status)}`}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onOpen?.(event);
      }}
    >
      <span className="event-marker" aria-hidden="true" />
      <span>{event.title || event.type}</span>
    </button>
  );
}

export function CalendarDayCell({ day, currentDate, selectedDate, events, onSelectDate, onOpenEvent, onMore, onAdd }) {
  const iso = toLocalIsoDate(day);
  const isToday = iso === todayIso();
  const selected = iso === selectedDate;
  const outside = !isSameMonth(day, currentDate);
  const visible = events.slice(0, 3);
  const moreCount = Math.max(0, events.length - visible.length);

  return (
    <div className={joinClass('calendar-day-cell', outside && 'is-muted', isToday && 'is-today', selected && 'is-selected')} role="gridcell" aria-selected={selected}>
      <button type="button" className="calendar-date-button" aria-label={`Select ${formatDateLong(iso)}`} onClick={() => onSelectDate(iso)}>
        <span>{day.getDate()}</span>
        {events.length ? <em>{events.length}</em> : null}
      </button>
      <div className="calendar-day-events">
        {visible.map((event) => <CalendarEventChip key={event.id} event={event} onOpen={onOpenEvent} />)}
        {moreCount ? <button type="button" className="calendar-more-button" onClick={() => onMore(iso)}>+{moreCount} more</button> : null}
      </div>
      {!events.length ? <button type="button" className="calendar-empty-add" onClick={() => onAdd(iso)}>Add reminder</button> : null}
    </div>
  );
}

export function CalendarToolbar({ view, currentDate, onViewChange, onPrevious, onToday, onNext, onFilters, onSort, filtersActive, sortLabel }) {
  return (
    <div className="calendar-toolbar">
      <div className="calendar-toolbar-row">
        <div className="calendar-nav-controls" aria-label="Calendar navigation">
          <button type="button" className="icon-button refined" aria-label="Previous period" onClick={onPrevious}><Icon name="chevronRight" size={18} className="rotate-180" /></button>
          <button type="button" className="button secondary compact-button" onClick={onToday}>Today</button>
          <button type="button" className="icon-button refined" aria-label="Next period" onClick={onNext}><Icon name="chevronRight" size={18} /></button>
        </div>
        <h2>{formatMonthTitle(currentDate)}</h2>
      </div>
      <div className="calendar-toolbar-row right">
        <div className="segmented-control calendar-view-switch" role="tablist" aria-label="Calendar views">
          {VIEWS.map((item) => (
            <button key={item} type="button" role="tab" aria-selected={view === item} className={view === item ? 'active' : ''} onClick={() => onViewChange(item)}>
              {VIEW_LABELS[item]}
            </button>
          ))}
        </div>
        <button type="button" className={joinClass('button secondary compact-button', filtersActive && 'has-active-filters')} onClick={onFilters}><Icon name="filter" size={16} /> Filters</button>
        <button type="button" className="button secondary compact-button" onClick={onSort}><Icon name="list" size={16} /> {sortLabel || 'Sort'}</button>
      </div>
    </div>
  );
}

export function SortMenu({ value, onChange, open, onToggle, compact = false, options = SORT_OPTIONS }) {
  const selected = options.find((item) => item.value === value) || options[0];
  return (
    <div className={joinClass('sort-menu', open && 'is-open', compact && 'is-compact')}>
      <button type="button" className="sort-menu-trigger" onClick={() => onToggle()} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="list" size={16} />
        <span>{selected?.label || 'Sort'}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open ? (
        <div className="sort-menu-list" role="menu">
          {options.map((option) => (
            <button key={option.value} type="button" role="menuitemradio" aria-checked={value === option.value} className={value === option.value ? 'is-selected' : ''} onClick={() => { onChange(option.value); onToggle(false); }}>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FilterGroup({ title, items, values, onToggle }) {
  return (
    <section className="filter-group">
      <h4>{title}</h4>
      <div className="filter-choice-grid">
        {items.map((item) => {
          const value = typeof item === 'string' ? item : item.value;
          const label = typeof item === 'string' ? item : item.label;
          const checked = values.includes(value);
          return (
            <label key={value} className={checked ? 'is-checked' : ''}>
              <input type="checkbox" checked={checked} onChange={() => onToggle(value)} />
              <span>{label}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

export function DateFilterPanel({ open, filters, onChange, onClose }) {
  if (!open) return null;
  const toggle = (group, value) => {
    const values = new Set(filters[group] || []);
    values.has(value) ? values.delete(value) : values.add(value);
    onChange({ ...filters, [group]: [...values] });
  };
  return (
    <div className="calendar-popover filter-popover" role="dialog" aria-label="Date filters">
      <div className="popover-head"><strong>Filters</strong><button type="button" className="icon-button refined" aria-label="Close filters" onClick={onClose}><Icon name="x" size={16} /></button></div>
      <FilterGroup title="Date ranges" items={DATE_RANGE_OPTIONS} values={filters.ranges || []} onToggle={(value) => toggle('ranges', value)} />
      <FilterGroup title="Date types" items={DATE_TYPE_OPTIONS} values={filters.types || []} onToggle={(value) => toggle('types', value)} />
      <FilterGroup title="Categories" items={DATE_CATEGORY_OPTIONS} values={filters.categories || []} onToggle={(value) => toggle('categories', value)} />
      <FilterGroup title="Statuses" items={DATE_STATUS_OPTIONS} values={filters.statuses || []} onToggle={(value) => toggle('statuses', value)} />
      <button type="button" className="button secondary full" onClick={() => onChange(EMPTY_FILTERS)}>Clear all</button>
    </div>
  );
}

export function ActiveFilterChips({ filters, onRemove, onClear }) {
  const chips = activeFilterLabels(filters);
  if (!chips.length) return null;
  return (
    <div className="active-filter-chips" aria-label="Active filters">
      {chips.map((chip) => (
        <button key={`${chip.group}:${chip.value}`} type="button" onClick={() => onRemove(chip.group, chip.value)}>{chip.label}<Icon name="x" size={14} /></button>
      ))}
      <button type="button" className="clear-filter-chip" onClick={onClear}>Clear all</button>
    </div>
  );
}
export function MonthView({ currentDate, selectedDate, eventsByDate, onSelectDate, onOpenEvent, onMore, onAddDate }) {
  const days = getMonthDays(currentDate, CALENDAR_STARTS_ON);
  const weekDays = getWeekDays(currentDate, CALENDAR_STARTS_ON);

  function handleKeyDown(event) {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = toLocalIsoDate(addDays(selectedDate || todayIso(), moves[event.key]));
    onSelectDate(next);
  }

  return (
    <div className="month-view" role="grid" aria-label="Research calendar month" onKeyDown={handleKeyDown} tabIndex={0}>
      <div className="month-weekdays" role="row">
        {weekDays.map((day) => <span key={day.getDay()} role="columnheader">{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day)}</span>)}
      </div>
      <div className="month-grid" role="rowgroup">
        {days.map((day) => {
          const iso = toLocalIsoDate(day);
          return (
            <CalendarDayCell
              key={iso}
              day={day}
              currentDate={currentDate}
              selectedDate={selectedDate}
              events={eventsByDate.get(iso) || []}
              onSelectDate={onSelectDate}
              onOpenEvent={onOpenEvent}
              onMore={onMore}
              onAdd={onAddDate}
            />
          );
        })}
      </div>
    </div>
  );
}

export function WeekView({ currentDate, eventsByDate, onSelectDate, onOpenEvent, onAddDate }) {
  const days = getWeekDays(currentDate, CALENDAR_STARTS_ON);
  return (
    <div className="week-view">
      {days.map((day) => {
        const iso = toLocalIsoDate(day);
        const events = eventsByDate.get(iso) || [];
        return (
          <section key={iso} className="week-day-column">
            <button type="button" className="week-day-head" onClick={() => onSelectDate(iso)}>
              <span>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day)}</span>
              <strong>{day.getDate()}</strong>
            </button>
            <div className="week-event-list">
              {events.map((event) => <CalendarEventChip key={event.id} event={event} onOpen={onOpenEvent} />)}
              {!events.length ? <button type="button" className="calendar-empty-add visible" onClick={() => onAddDate(iso)}>Add reminder</button> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function agendaHeader(date) {
  const days = daysUntilDate(date);
  if (days === 0) return `TODAY - ${formatDateLong(date)}`;
  if (days === 1) return `TOMORROW - ${formatDateLong(date)}`;
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parseLocalDate(date));
}

function relativeAgenda(event) {
  const days = daysUntilDate(event.date);
  if (days == null) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  return `in ${days}d`;
}

export function AgendaView({ events, search, onOpenEvent }) {
  const [visibleCount, setVisibleCount] = useState(40);
  const [collapsedMonths, setCollapsedMonths] = useState(new Set());
  const grouped = useMemo(() => {
    const map = getEventsByDate(events.slice(0, visibleCount));
    return [...map.entries()].sort(([a], [b]) => parseLocalDate(a) - parseLocalDate(b));
  }, [events, visibleCount]);

  function monthKey(date) {
    const parsed = parseLocalDate(date);
    return parsed ? `${parsed.getFullYear()}-${parsed.getMonth()}` : 'unknown';
  }

  function toggleMonth(key) {
    setCollapsedMonths((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  let previousMonth = '';
  return (
    <div className="agenda-view">
      {grouped.map(([date, items]) => {
        const key = monthKey(date);
        const parsed = parseLocalDate(date);
        const monthLabel = parsed ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(parsed) : 'Undated';
        const showMonth = key !== previousMonth;
        previousMonth = key;
        const collapsed = collapsedMonths.has(key);
        return (
          <React.Fragment key={date}>
            {showMonth ? <button type="button" className="agenda-month-toggle" onClick={() => toggleMonth(key)}>{monthLabel}<Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={16} /></button> : null}
            {!collapsed ? (
              <section className="agenda-day-group">
                <h3>{agendaHeader(date)}</h3>
                <div className="agenda-items">
                  {items.map((event) => (
                    <button key={event.id} type="button" className={`agenda-item ${statusClass(event.status)}`} onClick={() => onOpenEvent(event)}>
                      <time>{formatTimeRange(event)}</time>
                      <span>
                        <strong>{highlightText(event.title || event.pageTitle, search)}</strong>
                        <small>{event.institution || event.source || event.category}</small>
                      </span>
                      <DateStatusBadge status={event.status} />
                      <em>{relativeAgenda(event)}</em>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </React.Fragment>
        );
      })}
      {visibleCount < events.length ? <button type="button" className="button secondary load-more-button" onClick={() => setVisibleCount((count) => count + 40)}>Load more</button> : null}
    </div>
  );
}

function timelineGroup(event) {
  if (event.status === 'completed') return 'Completed';
  const days = daysUntilDate(event.date);
  if (days == null) return 'Later';
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Today';
  if (days <= 7) return 'This week';
  if (days <= 14) return 'Next week';
  const date = parseLocalDate(event.date);
  const now = new Date();
  if (date && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) return 'This month';
  return 'Later';
}

export function TimelineView({ events, onOpenEvent, compact = false }) {
  const groups = ['Overdue', 'Today', 'This week', 'Next week', 'This month', 'Later', 'Completed'];
  const byGroup = new Map(groups.map((group) => [group, []]));
  events.forEach((event) => byGroup.get(timelineGroup(event))?.push(event));
  return (
    <div className={joinClass('timeline-view', compact && 'is-compact')}>
      {groups.map((group) => {
        const items = byGroup.get(group) || [];
        if (!items.length) return null;
        return (
          <section key={group} className="timeline-group">
            <h3>{group}</h3>
            <div className="timeline-items">
              {items.map((event) => {
                const block = formatDateBlock(event.date);
                return (
                  <article key={event.id} className={`timeline-item ${statusClass(event.status)}`}>
                    <button type="button" className="timeline-date-block" onClick={() => onOpenEvent?.(event)}>
                      <span>{block.month}</span>
                      <strong>{block.day}</strong>
                    </button>
                    <button type="button" className="timeline-content" onClick={() => onOpenEvent?.(event)}>
                      <strong>{event.title || event.pageTitle}</strong>
                      <span>{event.institution || event.source || event.category}</span>
                      <small>{event.category} - {event.type}</small>
                    </button>
                    <DateStatusBadge status={event.status} />
                    <a className="text-link" href={`#/read/${event.pageId}`}>Open</a>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function DateDetailsPanel({ date, events, onClose, onOpenEntry, onOpenEvent, onEditEvent, onAddDate, onComplete, onDelete }) {
  const grouped = events.reduce((map, event) => {
    const group = dateTypeGroup(event.type);
    if (!map.has(group)) map.set(group, []);
    map.get(group).push(event);
    return map;
  }, new Map());

  return (
    <aside className="date-details-panel" role="dialog" aria-label={date ? formatDateLong(date) : 'Date details'}>
      <div className="details-panel-head">
        <div><h2>{formatDateLong(date)}</h2><p>{events.length} research item{events.length === 1 ? '' : 's'}</p></div>
        <button type="button" className="icon-button refined" aria-label="Close date details" onClick={onClose}><Icon name="x" size={18} /></button>
      </div>
      {events.length ? [...grouped.entries()].map(([group, items]) => (
        <section key={group} className="details-group">
          <h3>{group}</h3>
          <div className="details-card-list">
            {items.map((event) => (
              <article key={event.id} className={`details-item-card ${statusClass(event.status)}`}>
                <button type="button" className="details-title-button" onClick={() => onOpenEvent(event)}><strong>{event.title || event.pageTitle}</strong><span>{event.type}</span></button>
                <dl>
                  <div><dt>Time</dt><dd>{formatTimeRange(event)}</dd></div>
                  <div><dt>Category</dt><dd>{event.category}</dd></div>
                  <div><dt>Source</dt><dd>{event.institution || event.source || 'Not recorded'}</dd></div>
                  <div><dt>Remaining</dt><dd>{daysRemainingLabel(event)}</dd></div>
                </dl>
                <div className="tag-row compact-tags">{(event.tags || []).slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
                <DateStatusBadge status={event.status} />
                <div className="details-actions">
                  <button type="button" className="text-link" onClick={() => onOpenEntry(event)}>Open Entry</button>
                  {!event.isDerived ? <button type="button" className="text-link" onClick={() => onEditEvent(event)}>Edit Date</button> : null}
                  <button type="button" className="text-link" onClick={() => onAddDate(date)}>Add Reminder</button>
                  <a className="text-link" href={googleCalendarUrlForEvent(event)} target="_blank" rel="noreferrer">Add to Google Calendar</a>
                  <button type="button" className="text-link" onClick={() => downloadResearchIcs(event)}>Download ICS</button>
                  {!event.isDerived ? <button type="button" className="text-link" onClick={() => onComplete(event)}>Mark Completed</button> : null}
                  {!event.isDerived ? <button type="button" className="text-link danger-link" onClick={() => onDelete(event)}>Delete Date</button> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      )) : (
        <EmptyCalendarState compact title="No items on this date" description="Add a reminder or attach a date to a saved research entry." action={(
          <div className="empty-date-actions">
            <button type="button" className="button primary" onClick={() => onAddDate(date, 'Personal reminder')}>Add reminder</button>
            <button type="button" className="button secondary" onClick={() => onAddDate(date, 'Application deadline')}>Add opportunity deadline</button>
            <button type="button" className="button secondary" onClick={() => onAddDate(date, 'Event date')}>Add conference date</button>
            <button type="button" className="button secondary" onClick={() => onAddDate(date, 'Interview')}>Add interview</button>
            <button type="button" className="button secondary" onClick={() => onAddDate(date, 'Personal reminder')}>Add personal event</button>
            <button type="button" className="button secondary" onClick={() => {
              localStorage.setItem('kv-editor-preload', JSON.stringify({
                title: `Note for ${formatDateShort(date)}`,
                category: 'Personal Knowledge/General Notes',
                origin: 'manually-added',
                importantDates: [{ id: crypto.randomUUID(), type: 'Personal reminder', title: 'Personal reminder', date, source: 'manual', confirmed: true, manuallyEdited: true }],
              }));
              window.location.hash = `#/edit/new-${Date.now()}`;
            }}>Create note for this date</button>
          </div>
        )} />
      )}
    </aside>
  );
}

export function EventPreview({ event, onClose, onOpenEntry, onEdit, onComplete }) {
  if (!event) return null;
  return (
    <div className="event-preview" role="dialog" aria-label="Event preview">
      <div className="event-preview-head">
        <div><strong>{event.title || event.pageTitle}</strong><span>{event.type} - {formatDateShort(event.date)} {event.time ? `at ${event.time}` : ''}</span></div>
        <button type="button" className="icon-button refined" aria-label="Close preview" onClick={onClose}><Icon name="x" size={16} /></button>
      </div>
      <p>{event.summary || event.sourceText || 'No summary recorded.'}</p>
      <dl>
        <div><dt>Category</dt><dd>{event.category}</dd></div>
        <div><dt>Source</dt><dd>{event.institution || event.source || 'Not recorded'}</dd></div>
        <div><dt>Attachments</dt><dd>{event.attachmentCount || 0}</dd></div>
        <div><dt>Status</dt><dd><DateStatusBadge status={event.status} /></dd></div>
      </dl>
      <div className="tag-row compact-tags">{(event.tags || []).slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}</div>
      <div className="event-preview-actions">
        <button type="button" className="button primary" onClick={() => onOpenEntry(event)}>Open Entry</button>
        {!event.isDerived ? <button type="button" className="button secondary" onClick={() => onEdit(event)}>Edit</button> : null}
        {!event.isDerived ? <button type="button" className="button secondary" onClick={() => onComplete(event)}>Complete</button> : null}
        <a className="button secondary" href={googleCalendarUrlForEvent(event)} target="_blank" rel="noreferrer">Add to Calendar</a>
        {event.page?.sourceUrl ? <button type="button" className="button secondary" onClick={() => navigator.clipboard?.writeText(event.page.sourceUrl)}>Copy Source Link</button> : null}
        <button type="button" className="button secondary" onClick={() => downloadResearchIcs(event)}>More</button>
      </div>
    </div>
  );
}
export function DateFormModal({ open, pages, event, initialDate, initialType = 'Personal reminder', onClose, onSave }) {
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      pageId: event?.pageId || pages.find((page) => !page.secure)?.id || '',
      dateId: event?.dateId || '',
      title: event?.title || '',
      type: event?.type || initialType || 'Personal reminder',
      date: event?.date || initialDate || todayIso(),
      endDate: event?.endDate || '',
      allDay: event?.allDay ?? true,
      time: event?.time || '',
      timezone: event?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      status: event?.status || 'upcoming',
      reminderOffsets: event?.reminderOffsets || [0],
      notes: event?.notes || '',
      sourceText: event?.sourceText || '',
      confirmed: event?.confirmed ?? true,
      completed: event?.completed || false,
      origin: event?.origin || 'manual',
    });
  }, [open, event, initialDate, initialType, pages]);

  if (!open || !form) return null;
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleReminder = (offset) => {
    const values = new Set(form.reminderOffsets || []);
    values.has(offset) ? values.delete(offset) : values.add(offset);
    set('reminderOffsets', [...values]);
  };
  const save = (addAnother = false) => {
    onSave({ ...form, completed: form.status === 'completed' || form.completed });
    if (addAnother) setForm((current) => ({ ...current, dateId: '', title: '', notes: '', sourceText: '', origin: 'manual' }));
    else onClose();
  };

  return (
    <div className="date-modal-backdrop" role="presentation">
      <div className="date-form-modal" role="dialog" aria-modal="true" aria-label={event ? 'Edit important date' : 'Add important date'}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">RESEARCH PLANNER</p>
            <h2>{event ? 'Edit Important Date' : 'Add Important Date'}</h2>
            <span>{event?.origin === 'automatic' ? 'Detected automatically from source text' : 'Manual calendar entry'}</span>
          </div>
          <button type="button" className="icon-button refined" aria-label="Close date form" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="date-form-grid">
          <label className="field-label">Date title<input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Postdoctoral application deadline" /></label>
          <label className="field-label">Date type<select value={form.type} onChange={(e) => set('type', e.target.value)}>{DATE_TYPE_OPTIONS.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="field-label">Start date<input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></label>
          <label className="field-label">Optional end date<input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></label>
          <label className="switch-field"><input type="checkbox" checked={form.allDay} onChange={(e) => set('allDay', e.target.checked)} /><span>All-day</span></label>
          <label className="field-label">Time<input type="time" value={form.time} disabled={form.allDay} onChange={(e) => set('time', e.target.value)} /></label>
          <label className="field-label">Time zone<input value={form.timezone} onChange={(e) => set('timezone', e.target.value)} /></label>
          <label className="field-label">Related entry<select value={form.pageId} onChange={(e) => set('pageId', e.target.value)}>{pages.filter((page) => !page.secure).map((page) => <option key={page.id} value={page.id}>{pageOptionLabel(page)}</option>)}</select></label>
          <label className="field-label">Status<select value={form.status} onChange={(e) => set('status', e.target.value)}>{DATE_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          <label className="field-label full-span">Notes<textarea rows="3" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></label>
          <label className="field-label full-span">Detected source snippet<textarea rows="2" value={form.sourceText} onChange={(e) => set('sourceText', e.target.value)} /></label>
        </div>
        <fieldset className="reminder-fieldset">
          <legend>Reminder</legend>
          {[0, 1, 3, 7, 14].map((offset) => <label key={offset}><input type="checkbox" checked={(form.reminderOffsets || []).includes(offset)} onChange={() => toggleReminder(offset)} /> {offset === 0 ? 'At time of event' : `${offset} day${offset === 1 ? '' : 's'} before`}</label>)}
        </fieldset>
        <label className="switch-field confirm-field"><input type="checkbox" checked={form.confirmed} onChange={(e) => set('confirmed', e.target.checked)} /><span>Confirmed date</span></label>
        <div className="modal-actions">
          <button type="button" className="button primary" disabled={!form.pageId || !form.date} onClick={() => save(false)}>Save Date</button>
          <button type="button" className="button secondary" disabled={!form.pageId || !form.date} onClick={() => save(true)}>Save and Add Another</button>
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function MiniCalendar({ events, selectedDate, onSelectDate }) {
  const [currentDate, setCurrentDate] = useState(parseLocalDate(selectedDate) || new Date());
  const eventsByDate = useMemo(() => getEventsByDate(events), [events]);
  const days = getMonthDays(currentDate, CALENDAR_STARTS_ON);
  const weekdays = getWeekDays(currentDate, CALENDAR_STARTS_ON);
  return (
    <section className="mini-calendar-widget">
      <div className="mini-calendar-head">
        <button type="button" className="icon-button refined" aria-label="Previous month" onClick={() => setCurrentDate(addMonths(currentDate, -1))}><Icon name="chevronRight" size={16} className="rotate-180" /></button>
        <strong>{formatMonthTitle(currentDate)}</strong>
        <button type="button" className="icon-button refined" aria-label="Next month" onClick={() => setCurrentDate(addMonths(currentDate, 1))}><Icon name="chevronRight" size={16} /></button>
      </div>
      <div className="mini-calendar-weekdays">{weekdays.map((day) => <span key={day.getDay()}>{new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }).format(day)}</span>)}</div>
      <div className="mini-calendar-grid">
        {days.map((day) => {
          const iso = toLocalIsoDate(day);
          const count = eventsByDate.get(iso)?.length || 0;
          return (
            <button key={iso} type="button" className={joinClass(!isSameMonth(day, currentDate) && 'is-muted', iso === todayIso() && 'is-today', iso === selectedDate && 'is-selected')} onClick={() => onSelectDate(iso)}>
              {day.getDate()}
              {count ? <em>{count}</em> : null}
            </button>
          );
        })}
      </div>
      <a className="text-link open-full-calendar" href="#/calendar">Open full calendar</a>
    </section>
  );
}

export function UpcomingDatesWidget({ events, onAddDate, limit = 6 }) {
  const actionable = sortDateEvents(events.filter((event) => !event.isDerived && event.status !== 'completed'), 'deadline-nearest').slice(0, limit);
  const grouped = {
    Today: actionable.filter((event) => daysUntilDate(event.date) === 0),
    'Next 7 days': actionable.filter((event) => {
      const days = daysUntilDate(event.date);
      return days != null && days > 0 && days <= 7;
    }),
    'Later this month': actionable.filter((event) => {
      const days = daysUntilDate(event.date);
      const date = parseLocalDate(event.date);
      const now = new Date();
      return days != null && days > 7 && date?.getFullYear() === now.getFullYear() && date?.getMonth() === now.getMonth();
    }),
  };
  const uncategorized = actionable.filter((event) => !Object.values(grouped).some((items) => items.includes(event)));

  return (
    <section className="upcoming-dates-widget panel-card">
      <div className="upcoming-widget-head">
        <div><p className="eyebrow">UPCOMING DATES</p><h3>Upcoming Dates</h3></div>
        <div className="widget-actions"><a className="button secondary compact-button" href="#/calendar">View Calendar</a><button type="button" className="button primary compact-button" onClick={onAddDate}>Add Date</button></div>
      </div>
      {actionable.length ? (
        <div className="upcoming-date-groups">
          {[...Object.entries(grouped), ['Later', uncategorized]].map(([group, items]) => items.length ? (
            <section key={group}>
              <h4>{group}</h4>
              {items.map((event) => <UpcomingDateRow key={event.id} event={event} />)}
            </section>
          ) : null)}
          <a className="text-link view-all-dates" href="#/calendar">View all dates</a>
        </div>
      ) : (
        <EmptyCalendarState
          title="No important dates recorded"
          description="Import an opportunity or add a date manually to start planning your applications and submissions."
          action={<><a className="button secondary" href="#/edit/new">Import Opportunity</a><button type="button" className="button primary" onClick={onAddDate}>Add Date</button></>}
        />
      )}
    </section>
  );
}

function UpcomingDateRow({ event }) {
  const block = formatDateBlock(event.date);
  return (
    <a className={`upcoming-date-row ${statusClass(event.status)}`} href={`#/read/${event.pageId}`}>
      <span className="date-block"><em>{block.month}</em><strong>{block.day}</strong></span>
      <span className="upcoming-date-main"><strong>{event.title || event.pageTitle}</strong><small>{event.category} - {event.institution || event.source || event.pageTitle}</small></span>
      <span>{daysRemainingLabel(event)}</span>
      <DateStatusBadge status={event.status} />
      <Icon name="chevronRight" size={16} />
    </a>
  );
}

export function EmptyCalendarState({ title = 'No calendar items', description = 'Add an important date to start planning.', action = null, compact = false }) {
  return (
    <div className={joinClass('empty-calendar-state', compact && 'is-compact')}>
      <Icon name="calendarDays" size={compact ? 28 : 42} />
      <strong>{title}</strong>
      <p>{description}</p>
      {action ? <div className="empty-actions">{action}</div> : null}
    </div>
  );
}
export default function ResearchCalendar({ pages = [], loading = false, error = '', onSaveDate, onDeleteDate, onCompleteDate }) {
  const effectivePages = useMemo(() => (import.meta.env.DEV && !pages.length ? getCalendarDevTestPages() : pages), [pages]);
  const events = useMemo(() => buildResearchDateEvents(effectivePages), [effectivePages]);
  const initialView = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches ? 'agenda' : 'month';
  const [view, setView] = useState(initialView);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [previewEvent, setPreviewEvent] = useState(null);
  const [modalState, setModalState] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sortMode, setSortMode] = useState(() => localStorage.getItem('aprv-calendar-sort') || 'date-asc');

  useEffect(() => { localStorage.setItem('aprv-calendar-sort', sortMode); }, [sortMode]);
  useEffect(() => {
    const raw = localStorage.getItem(ACTION_KEY);
    if (!raw) return;
    localStorage.removeItem(ACTION_KEY);
    try {
      const action = JSON.parse(raw);
      if (action?.type === 'add') setModalState({ mode: 'add', initialDate: action.date || selectedDate });
    } catch {}
  }, [selectedDate]);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key !== 'Escape') return;
      setPreviewEvent(null);
      setModalState(null);
      setFiltersOpen(false);
      setSortOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const filteredEvents = useMemo(() => sortDateEvents(filterDateEvents(events, { ...filters, search }), sortMode), [events, filters, search, sortMode]);
  const eventsByDate = useMemo(() => getEventsByDate(filteredEvents), [filteredEvents]);
  const selectedEvents = eventsByDate.get(selectedDate) || [];
  const filtersActive = activeFilterLabels(filters).length > 0;
  const sortLabel = SORT_OPTIONS.find((option) => option.value === sortMode)?.label;

  const openDate = (date) => {
    setSelectedDate(date);
    setDetailsOpen(true);
    const parsed = parseLocalDate(date);
    if (parsed) setCurrentDate(parsed);
  };
  const openAddDate = (date = selectedDate, initialType = 'Personal reminder') => setModalState({ mode: 'add', initialDate: date, initialType });
  const openEntry = (event) => { window.location.hash = `#/read/${event.pageId}`; };
  const saveDate = async (input) => { await onSaveDate?.(input); };
  const completeDate = async (event) => { await onCompleteDate?.(event); setPreviewEvent(null); };
  const deleteDate = async (event) => { if (window.confirm('Delete this date from the related entry?')) await onDeleteDate?.(event); };

  return (
    <div className="research-calendar-page">
      <section className="calendar-hero-panel">
        <div>
          <p className="eyebrow">RESEARCH CALENDAR</p>
          <h2>Research Calendar</h2>
          <p>Plan applications, submissions, interviews, publication dates and reminders without losing the source entry.</p>
        </div>
        <button type="button" className="button primary" onClick={() => openAddDate(selectedDate)}><Icon name="plus" size={18} /> Add Date</button>
      </section>

      <section className="research-calendar-shell">
        <div className="calendar-search-row">
          <label className="calendar-search-field"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dates, entries, institutions, categories and tags..." /></label>
        </div>
        <CalendarToolbar
          view={view}
          currentDate={currentDate}
          onViewChange={setView}
          onPrevious={() => setCurrentDate(view === 'week' ? addDays(currentDate, -7) : addMonths(currentDate, -1))}
          onToday={() => { const today = new Date(); setCurrentDate(today); openDate(toLocalIsoDate(today)); }}
          onNext={() => setCurrentDate(view === 'week' ? addDays(currentDate, 7) : addMonths(currentDate, 1))}
          onFilters={() => setFiltersOpen((value) => !value)}
          onSort={() => setSortOpen((value) => !value)}
          filtersActive={filtersActive}
          sortLabel={sortLabel}
        />
        <div className="calendar-popover-layer">
          <DateFilterPanel open={filtersOpen} filters={filters} onChange={setFilters} onClose={() => setFiltersOpen(false)} />
          {sortOpen ? <SortMenu value={sortMode} onChange={setSortMode} open={sortOpen} onToggle={(value) => setSortOpen(typeof value === 'boolean' ? value : !sortOpen)} /> : null}
        </div>
        <ActiveFilterChips
          filters={filters}
          onRemove={(group, value) => setFilters((current) => ({ ...current, [group]: current[group].filter((item) => item !== value) }))}
          onClear={() => setFilters(EMPTY_FILTERS)}
        />
        {error ? <p className="form-error">{error}</p> : null}
        {loading ? <div className="empty-state">Loading research calendar...</div> : null}
        {!filteredEvents.length && !loading ? <EmptyCalendarState action={<button type="button" className="button primary" onClick={() => openAddDate(selectedDate)}>Add Date</button>} /> : null}
        {filteredEvents.length ? (
          <div className="calendar-view-surface">
            {view === 'month' ? <MonthView currentDate={currentDate} selectedDate={selectedDate} eventsByDate={eventsByDate} onSelectDate={openDate} onOpenEvent={setPreviewEvent} onMore={openDate} onAddDate={openAddDate} /> : null}
            {view === 'week' ? <WeekView currentDate={currentDate} eventsByDate={eventsByDate} onSelectDate={openDate} onOpenEvent={setPreviewEvent} onAddDate={openAddDate} /> : null}
            {view === 'agenda' ? <AgendaView events={filteredEvents} search={search} onOpenEvent={setPreviewEvent} /> : null}
            {view === 'timeline' ? <TimelineView events={filteredEvents} onOpenEvent={setPreviewEvent} /> : null}
          </div>
        ) : null}
      </section>

      {detailsOpen ? <DateDetailsPanel date={selectedDate} events={selectedEvents} onClose={() => setDetailsOpen(false)} onOpenEntry={openEntry} onOpenEvent={setPreviewEvent} onEditEvent={(event) => setModalState({ mode: 'edit', event })} onAddDate={openAddDate} onComplete={completeDate} onDelete={deleteDate} /> : null}
      <EventPreview event={previewEvent} onClose={() => setPreviewEvent(null)} onOpenEntry={openEntry} onEdit={(event) => setModalState({ mode: 'edit', event })} onComplete={completeDate} />
      <DateFormModal open={Boolean(modalState)} pages={effectivePages} event={modalState?.event} initialDate={modalState?.initialDate} initialType={modalState?.initialType} onClose={() => setModalState(null)} onSave={saveDate} />
    </div>
  );
}

export function requestCalendarAdd(date = todayIso()) {
  localStorage.setItem(ACTION_KEY, JSON.stringify({ type: 'add', date }));
  window.location.hash = '#/calendar';
}
