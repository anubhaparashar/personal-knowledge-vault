import { createEmptyTechDetails, MAIN_ENTRY_PAGE_ID, TECHNOLOGY_ENTRY_TYPE } from './pageModel';

export const PRELOAD_KEY = 'kv-editor-preload';

export const MANUAL_ENTRY_TYPES = [
  {
    id: 'scholarship',
    label: 'Add Scholarship',
    shortLabel: '+ Add Scholarship',
    category: 'Research Opportunities/Scholarships',
    title: '',
    tags: ['Scholarship', 'Application deadline'],
    visibleFields: ['institution', 'department', 'country', 'location', 'funding', 'eligibility', 'applicationUrl'],
    dateTypes: ['Opening date', 'Application deadline', 'Expected start date', 'Custom date'],
  },
  {
    id: 'postdoctoral',
    label: 'Add Postdoctoral Opportunity',
    shortLabel: '+ Add Postdoctoral Opportunity',
    category: 'Research Opportunities/Postdoctoral Opportunities',
    title: '',
    tags: ['Postdoctoral opportunity', 'Research fellow'],
    visibleFields: ['institution', 'department', 'laboratory', 'principalInvestigator', 'country', 'location', 'remoteStatus', 'funding', 'eligibility', 'applicationUrl'],
    dateTypes: ['Application deadline', 'Interview date', 'Expected start date', 'Custom date'],
  },
  {
    id: 'conference',
    label: 'Add Conference Call',
    shortLabel: '+ Add Conference Call',
    category: 'Publishing/Conference Calls',
    title: '',
    tags: ['Conference', 'Call for papers'],
    visibleFields: ['conferenceName', 'venue', 'country', 'location', 'sourceUrl', 'applicationUrl'],
    dateTypes: ['Abstract deadline', 'Full-paper deadline', 'Notification date', 'Camera-ready deadline', 'Registration deadline', 'Conference dates', 'Custom date'],
  },
  {
    id: 'journal-call',
    label: 'Add Journal Call or Special Issue',
    shortLabel: '+ Add Journal Call',
    category: 'Publishing/Journal Calls',
    title: '',
    tags: ['Journal call', 'Special issue'],
    visibleFields: ['institution', 'sourceUrl', 'applicationUrl', 'contactPerson', 'contactEmail'],
    dateTypes: ['Opening date', 'Abstract deadline', 'Full-paper deadline', 'Notification date', 'Custom date'],
  },
  {
    id: 'fellowship',
    label: 'Add Fellowship',
    shortLabel: '+ Add Fellowship',
    category: 'Research Opportunities/Fellowships',
    title: '',
    tags: ['Fellowship', 'Application deadline'],
    visibleFields: ['institution', 'country', 'location', 'funding', 'eligibility', 'applicationUrl'],
    dateTypes: ['Opening date', 'Application deadline', 'Interview date', 'Expected start date', 'Custom date'],
  },
  {
    id: 'grant',
    label: 'Add Research Grant',
    shortLabel: '+ Add Research Grant',
    category: 'Research Opportunities/Research Grants',
    title: '',
    tags: ['Research grant', 'Funding call'],
    visibleFields: ['institution', 'country', 'funding', 'eligibility', 'applicationUrl', 'contactPerson', 'contactEmail'],
    dateTypes: ['Opening date', 'Application deadline', 'Notification date', 'Expected start date', 'Custom date'],
  },
  {
    id: 'research-job',
    label: 'Add Research Job',
    shortLabel: '+ Add Research Job',
    category: 'Research Opportunities/Research Jobs',
    title: '',
    tags: ['Research job', 'Application deadline'],
    visibleFields: ['institution', 'department', 'country', 'location', 'remoteStatus', 'funding', 'eligibility', 'applicationUrl', 'contactPerson', 'contactEmail'],
    dateTypes: ['Application deadline', 'Interview date', 'Expected start date', 'Custom date'],
  },
  {
    id: 'research-paper',
    label: 'Add Research Paper',
    shortLabel: '+ Add Research Paper',
    category: 'Research/Research Papers',
    title: '',
    tags: ['Research paper', 'Literature'],
    visibleFields: ['institution', 'sourceUrl', 'notes'],
    dateTypes: ['Publication date', 'Custom date'],
  },
  {
    id: 'paper-idea',
    label: 'Add Paper Idea',
    shortLabel: '+ Add Paper Idea',
    category: 'Research/Paper Ideas',
    title: '',
    tags: ['Paper idea'],
    visibleFields: ['notes'],
    dateTypes: ['Custom date'],
    allowNoDeadline: true,
  },
  {
    id: 'project-idea',
    label: 'Add Project Idea',
    shortLabel: '+ Add Project Idea',
    category: 'Research/Project Ideas',
    title: '',
    tags: ['Project idea'],
    visibleFields: ['problem', 'proposedSystem', 'intendedUsers', 'possibleFeatures', 'technologies', 'relatedSourcePost', 'feasibilityNotes', 'priority', 'projectStatus'],
    dateTypes: ['Custom date'],
    allowNoDeadline: true,
  },
  {
    id: 'special-issue',
    label: 'Add Special Issue',
    shortLabel: '+ Add Special Issue',
    category: 'Publishing/Journal Calls and Special Issues',
    title: '',
    tags: ['Special issue', 'Journal call'],
    visibleFields: ['institution', 'sourceUrl', 'applicationUrl', 'contactPerson', 'contactEmail'],
    dateTypes: ['Opening date', 'Abstract deadline', 'Full-paper deadline', 'Notification date', 'Custom date'],
  },
  {
    id: 'conference-support',
    label: 'Add Conference Support',
    shortLabel: '+ Add Conference Support',
    category: 'Funding and Proposals/Conference Support',
    title: '',
    tags: ['Conference support', 'Travel grant'],
    visibleFields: ['institution', 'country', 'location', 'funding', 'eligibility', 'applicationUrl'],
    dateTypes: ['Opening date', 'Application deadline', 'Notification date', 'Conference dates', 'Custom date'],
  },
  {
    id: 'project-proposal',
    label: 'Add Project Proposal',
    shortLabel: '+ Add Project Proposal',
    category: 'Funding and Proposals/Project Proposals',
    title: '',
    tags: ['Project proposal', 'Proposal deadline'],
    visibleFields: ['institution', 'funding', 'eligibility', 'applicationUrl', 'notes'],
    dateTypes: ['Opening date', 'Proposal deadline', 'Notification date', 'Expected start date', 'Custom date'],
  },
  {
    id: 'technology',
    label: 'Add Technology',
    shortLabel: '+ Add Technology',
    category: 'Tech Reference',
    title: '',
    tags: ['Technology Reference'],
    visibleFields: [],
    dateTypes: ['Custom date'],
    allowNoDeadline: true,
    entryType: TECHNOLOGY_ENTRY_TYPE,
    techDetails: createEmptyTechDetails(),
    pages: [
      { pageId: MAIN_ENTRY_PAGE_ID, title: 'Overview', content: '<p></p>', order: 0 },
      { pageId: 'setup', title: 'Setup', content: '<p></p>', order: 1 },
      { pageId: 'troubleshooting', title: 'Troubleshooting', content: '<p></p>', order: 2 },
      { pageId: 'project-usage', title: 'Project Usage', content: '<p></p>', order: 3 },
      { pageId: 'commands', title: 'Commands', content: '<p></p>', order: 4 },
    ],
  },
  {
    id: 'custom-type',
    label: 'Add Custom Type',
    shortLabel: '+ Add Custom Type',
    category: 'Uncategorised',
    title: '',
    tags: ['Custom'],
    visibleFields: ['sourceUrl', 'notes'],
    dateTypes: ['Custom date'],
    allowNoDeadline: true,
  },
  {
    id: 'application',
    label: 'Add Application',
    shortLabel: '+ Add Application',
    category: 'Applications/Application Documents',
    title: '',
    tags: ['Application'],
    visibleFields: ['institution', 'applicationUrl', 'contactPerson', 'contactEmail', 'notes'],
    dateTypes: ['Application deadline', 'Interview date', 'Expected start date', 'Custom date'],
  },
  {
    id: 'general-note',
    label: 'Add General Note',
    shortLabel: '+ Add General Note',
    category: 'Personal Knowledge/General Notes',
    title: '',
    tags: ['General note'],
    visibleFields: ['notes'],
    dateTypes: ['Custom date'],
    allowNoDeadline: true,
  },
  {
    id: 'diary',
    label: 'Add Diary Entry',
    shortLabel: '+ Add Diary Entry',
    category: 'Personal Knowledge/Diary',
    title: '',
    tags: ['Diary'],
    visibleFields: ['notes'],
    dateTypes: ['Custom date'],
    allowNoDeadline: true,
  },
];

export const MENU_EXTRA_ACTIONS = [
  { id: 'share-paste', label: 'Share to AP Research Vault' },
  { id: 'import-url', label: 'Import from Link' },
  { id: 'paste-text', label: 'Paste Text' },
  { id: 'upload-document', label: 'Upload Document' },
  { id: 'upload-screenshot', label: 'Upload Screenshot' },
  { id: 'google-drive', label: 'Choose from Google Drive' },
];

export const FOCUS_ENTRY_TYPE = {
  scholarships: 'scholarship',
  postdoctoral: 'postdoctoral',
  conferences: 'conference',
  journals: 'journal-call',
  'special-issues': 'special-issue',
  ideas: 'paper-idea',
  'project-ideas': 'project-idea',
  projects: 'project-idea',
  papers: 'research-paper',
  fellowships: 'fellowship',
  grants: 'grant',
  applications: 'application',
  'conference-support': 'conference-support',
  proposals: 'project-proposal',
  diary: 'diary',
  'general-notes': 'general-note',
  'tech-reference': 'technology',
};

export function getEntryType(id) {
  return MANUAL_ENTRY_TYPES.find((item) => item.id === id) || MANUAL_ENTRY_TYPES.find((item) => item.id === 'general-note');
}

export function categoryEntryType(category = '') {
  const value = String(category || '').toLowerCase();
  if (value.includes('scholarship')) return getEntryType('scholarship');
  if (value.includes('postdoc')) return getEntryType('postdoctoral');
  if (value.includes('conference')) return getEntryType('conference');
  if (value.includes('special issue')) return getEntryType('special-issue');
  if (value.includes('journal')) return getEntryType('journal-call');
  if (value.includes('fellowship')) return getEntryType('fellowship');
  if (value.includes('grant')) return getEntryType('grant');
  if (value.includes('job')) return getEntryType('research-job');
  if (value.includes('conference support') || value.includes('travel grant')) return getEntryType('conference-support');
  if (value.includes('project proposal') || value.includes('proposal')) return getEntryType('project-proposal');
  if (value.includes('project idea')) return getEntryType('project-idea');
  if (value.includes('paper idea')) return getEntryType('paper-idea');
  if (value.includes('paper') || value.includes('literature')) return getEntryType('research-paper');
  if (value.includes('application')) return getEntryType('application');
  if (value.includes('diary')) return getEntryType('diary');
  if (value.includes('tech reference') || value.includes('technology')) return getEntryType('technology');
  return getEntryType('general-note');
}

export function entryTypeForFocus(focus) {
  return getEntryType(FOCUS_ENTRY_TYPE[focus] || 'general-note');
}

export function buildManualEntryPreload(entryTypeId, overrides = {}) {
  const entryType = getEntryType(entryTypeId);
  return {
    title: entryType.title || '',
    category: entryType.category,
    tagsText: (entryType.tags || []).join(', '),
    sourceUrl: '',
    summary: '',
    html: '<p></p>',
    secure: false,
    origin: 'manual',
    entryTypeId: entryType.id,
    visibleFields: entryType.visibleFields || [],
    suggestedDateTypes: entryType.dateTypes || [],
    opportunityDetails: {},
    ...(entryType.entryType ? { entryType: entryType.entryType } : {}),
    ...(entryType.techDetails ? { techDetails: createEmptyTechDetails() } : {}),
    ...(entryType.pages ? { pages: entryType.pages } : {}),
    ...overrides,
  };
}

export function openManualEntry(entryTypeId, overrides = {}) {
  const preload = buildManualEntryPreload(entryTypeId, overrides);
  localStorage.setItem(PRELOAD_KEY, JSON.stringify(preload));
  window.location.hash = `#/edit/new-${Date.now()}`;
}

export function openUploadDocumentEntry() {
  openManualEntry('general-note', { focusUpload: true, title: '', tagsText: 'Uploaded document', origin: 'imported-file' });
}
