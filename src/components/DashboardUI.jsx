import React from 'react';
import {
  ArrowRight,
  Grid2X2,
  List,
  Search,
} from 'lucide-react';

function joinClasses(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function PrimaryButton({ as: Component = 'button', className = '', children, ...props }) {
  const finalProps = Component === 'button' ? { type: 'button', ...props } : props;
  return <Component className={joinClasses('button primary', className)} {...finalProps}>{children}</Component>;
}

export function SecondaryButton({ as: Component = 'button', className = '', children, ...props }) {
  const finalProps = Component === 'button' ? { type: 'button', ...props } : props;
  return <Component className={joinClasses('button secondary', className)} {...finalProps}>{children}</Component>;
}

export function IconButton({ className = '', label, children, ...props }) {
  return (
    <button type="button" className={joinClasses('icon-button', className)} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

export function Badge({ tone = 'neutral', children, className = '' }) {
  return <span className={joinClasses('badge', `badge-${tone}`, className)}>{children}</span>;
}

export function StatCard({ icon: Icon, value, label, helper }) {
  return (
    <article className="stat-card">
      <span className="stat-card-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.8} /></span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
        {helper ? <small>{helper}</small> : null}
      </div>
    </article>
  );
}

export function WorkspaceCard({ icon: Icon, title, count, description, href }) {
  return (
    <a className="workspace-card" href={href}>
      <div className="workspace-card-top">
        <span className="workspace-card-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.8} /></span>
        <span className="workspace-card-count">{count} {count === 1 ? 'item' : 'items'}</span>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="workspace-card-action">View <ArrowRight size={16} strokeWidth={1.9} /></span>
    </a>
  );
}

export function SectionPanel({ eyebrow, title, actions, children, className = '' }) {
  return (
    <section className={joinClasses('section-panel', className)}>
      {(title || actions) ? (
        <div className="section-panel-head">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? <h2>{title}</h2> : null}
          </div>
          {actions ? <div className="section-panel-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function SegmentedControl({ options, value, onChange, ariaLabel, className = '' }) {
  return (
    <div className={joinClasses('segmented-control', className)} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button key={option.value} type="button" className={selected ? 'active' : ''} aria-pressed={selected} onClick={() => onChange(option.value)}>
            {option.icon ? <option.icon size={16} strokeWidth={1.8} /> : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SearchToolbar({
  search,
  onSearchChange,
  scope,
  onScopeChange,
  filter,
  onFilterChange,
  filterOptions,
  sort,
  onSortChange,
  view,
  onViewChange,
}) {
  return (
    <div className="search-toolbar" role="search">
      <label className="search-control">
        <Search size={18} strokeWidth={1.9} aria-hidden="true" />
        <span className="sr-only">Search library</span>
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search titles, content, categories, tags and sources..."
        />
      </label>
      <label className="select-control">
        <span>Scope</span>
        <select value={scope} onChange={(event) => onScopeChange(event.target.value)}>
          <option value="all">All</option>
          <option value="titles">Titles</option>
          <option value="content">Content</option>
          <option value="categories">Categories</option>
          <option value="tags">Tags</option>
          <option value="sources">Sources</option>
        </select>
      </label>
      <label className="select-control">
        <span>Filter</span>
        <select value={filter} onChange={(event) => onFilterChange(event.target.value)}>
          {filterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="select-control sort-control">
        <span>Sort</span>
        <select value={sort} onChange={(event) => onSortChange(event.target.value)}>
          <option value="deadline-nearest">Deadline: nearest first</option>
          <option value="deadline-farthest">Deadline: farthest first</option>
          <option value="event-earliest">Event date: earliest first</option>
          <option value="event-latest">Event date: latest first</option>
          <option value="created-desc">Recently created</option>
          <option value="created-asc">Oldest created</option>
          <option value="updated-desc">Recently updated</option>
          <option value="updated-asc">Oldest updated</option>
          <option value="publication-desc">Publication date: newest</option>
          <option value="publication-asc">Publication date: oldest</option>
          <option value="title-asc">Title: A-Z</option>
          <option value="title-desc">Title: Z-A</option>
          <option value="category">Category</option>
          <option value="source">Institution/source</option>
          <option value="attachments-desc">Most attachments</option>
          <option value="dates-desc">Most important dates</option>
          <option value="status">Status</option>
          <option value="priority">Priority</option>
          <option value="next-date">Next important date</option>
        </select>
      </label>
      <div className="view-toggle" role="group" aria-label="Library view">
        <button type="button" className={view === 'grid' ? 'active' : ''} aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => onViewChange('grid')}>
          <Grid2X2 size={17} strokeWidth={1.9} />
        </button>
        <button type="button" className={view === 'list' ? 'active' : ''} aria-label="List view" aria-pressed={view === 'list'} onClick={() => onViewChange('list')}>
          <List size={18} strokeWidth={1.9} />
        </button>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, actions, compact = false }) {
  return (
    <div className={joinClasses('empty-state', compact && 'compact')}>
      {Icon ? <span className="empty-state-icon" aria-hidden="true"><Icon size={28} strokeWidth={1.7} /></span> : null}
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {actions ? <div className="empty-state-actions">{actions}</div> : null}
    </div>
  );
}