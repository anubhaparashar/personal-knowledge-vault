import { getSourceDomain, htmlToText, sanitizeHtml } from './content';
import {
  DATE_ANALYSIS_VERSION,
  deduplicateDates,
  selectNextImportantDate,
} from './dates';
import {
  detectImportantDates,
  generateTags,
  mergeTags,
  splitTagsText,
  summarizeText,
} from './intelligence';

const GENERIC_TAGS = new Set([
  'post', 'link', 'shared', 'share', 'content', 'item', 'page', 'website', 'general',
  'note', 'new', 'click', 'apply', 'more', 'read',
]);

const TRACKING_PARAMS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^dclid$/i,
  /^mc_cid$/i,
  /^mc_eid$/i,
  /^igshid$/i,
  /^li_fat_id$/i,
  /^trk$/i,
  /^trackingId$/i,
  /^ref$/i,
  /^ref_src$/i,
  /^spm$/i,
];

const CLASSIFICATION_RULES = [
  {
    category: 'Research Opportunities/Scholarships',
    tags: ['Scholarship', 'Fully Funded'],
    terms: ['scholarship', 'studentship', 'full funding', 'fully funded', 'tuition waiver', 'stipend', 'phd funding', 'masters funding'],
  },
  {
    category: 'Research Opportunities/Postdoctoral Opportunities',
    tags: ['Postdoctoral Position', 'Research Fellowship'],
    terms: ['postdoc', 'postdoctoral', 'post-doctoral', 'post doctoral', 'postdoctoral fellow', 'postdoctoral researcher', 'postdoctoral associate'],
  },
  {
    category: 'Research Opportunities/Fellowships',
    tags: ['Fellowship', 'Research Fellowship'],
    terms: ['fellowship', 'visiting fellow', 'research fellowship', 'fellows program', 'early career fellowship'],
  },
  {
    category: 'Research Opportunities/Research Grants',
    tags: ['Research Grant', 'Funding Call'],
    terms: ['research grant', 'grant call', 'funding call', 'seed grant', 'proposal call', 'call for proposals', 'grant proposal'],
  },
  {
    category: 'Research Opportunities/Research Jobs',
    tags: ['Research Job', 'Academic Job'],
    terms: ['research fellow position', 'research associate', 'research assistant', 'faculty position', 'lecturer position', 'assistant professor', 'job opening', 'vacancy', 'hiring', 'position available'],
  },
  {
    category: 'Research Opportunities/Collaboration Opportunities',
    tags: ['Collaboration Opportunity'],
    terms: ['collaboration opportunity', 'seeking collaborators', 'collaborators wanted', 'research partner', 'consortium', 'joint project'],
  },
  {
    category: 'Publishing/Conference Calls and Deadlines',
    tags: ['Conference CFP', 'Submission Deadline'],
    terms: ['call for papers', 'cfp', 'conference', 'abstract deadline', 'full paper deadline', 'camera-ready', 'camera ready', 'workshop papers', 'symposium'],
  },
  {
    category: 'Publishing/Journal Calls and Special Issues',
    tags: ['Journal Call', 'Special Issue'],
    terms: ['special issue', 'special section', 'journal call', 'call for manuscripts', 'guest editor', 'topical collection'],
  },
  {
    category: 'Publishing/Paper Submission Deadlines',
    tags: ['Paper Submission', 'Submission Deadline'],
    terms: ['paper submission deadline', 'submission deadline', 'manuscript deadline', 'submit manuscript', 'full-paper deadline'],
  },
  {
    category: 'Research/Paper Ideas',
    tags: ['Paper Idea', 'Research Gap'],
    terms: ['research gap', 'paper idea', 'hypothesis', 'proposed method', 'future work', 'existing studies do not', 'limitations of existing', 'cross-dataset', 'evaluation gap'],
  },
  {
    category: 'Research/Project Ideas',
    tags: ['Project Idea', 'Product Idea'],
    terms: ['project idea', 'build an application', 'we need an application', 'product idea', 'prototype', 'minimum viable', 'possible features', 'intended users', 'automatically labels'],
  },
  {
    category: 'Research/Experiment Ideas',
    tags: ['Experiment Idea'],
    terms: ['experiment idea', 'ablation', 'baseline experiment', 'evaluation protocol', 'experimental setup'],
  },
  {
    category: 'Research/Product Ideas',
    tags: ['Product Idea'],
    terms: ['product idea', 'saas', 'tool idea', 'user workflow', 'possible feature', 'feature request'],
  },
  {
    category: 'Research/Research Papers and Reading Notes',
    tags: ['Research Paper', 'Reading Notes'],
    terms: ['doi', 'arxiv', 'published paper', 'new paper', 'abstract', 'tpami', 'journal article', 'research paper', 'read this paper'],
  },
  {
    category: 'Research/Datasets',
    tags: ['Dataset', 'Benchmark'],
    terms: ['dataset', 'benchmark', 'corpus', 'data collection', 'data set', 'open dataset'],
  },
  {
    category: 'Research/Literature Notes',
    tags: ['Literature Note'],
    terms: ['literature review', 'survey paper', 'reading note', 'annotated bibliography', 'related work'],
  },
  {
    category: 'Research/Research Tools',
    tags: ['Research Tool'],
    terms: ['research tool', 'software package', 'github repository', 'open-source tool', 'toolkit', 'library'],
  },
  {
    category: 'Personal Knowledge/Diary',
    tags: ['Diary'],
    terms: ['diary', 'journal entry', 'today i', 'reflection'],
  },
  {
    category: 'Personal Knowledge/Web References',
    tags: ['Web Reference'],
    terms: ['documentation', 'tutorial', 'guide', 'blog post', 'web reference'],
  },
  {
    category: 'Personal Knowledge/General Notes',
    tags: ['General Note'],
    terms: ['note to self', 'general note', 'remember this'],
  },
];

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function htmlFromText(text = '') {
  const blocks = String(text || '').split(/\n{2,}|(?<=\.)\s+(?=[A-Z])/).map((part) => part.trim()).filter(Boolean);
  if (!blocks.length) return '<p></p>';
  return blocks.slice(0, 24).map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('');
}

function scoreRule(rule, haystack) {
  return rule.terms.reduce((score, term) => {
    if (!haystack.includes(term)) return score;
    return score + Math.max(2, term.split(/\s+/).length + 1);
  }, 0);
}

function classify(haystack, suggestedCategory = '') {
  const scores = CLASSIFICATION_RULES
    .map((rule) => ({ ...rule, score: scoreRule(rule, haystack) }))
    .sort((a, b) => b.score - a.score);
  const preferred = suggestedCategory
    ? scores.find((item) => item.category === suggestedCategory || item.category.toLowerCase().includes(suggestedCategory.toLowerCase()))
    : null;
  const best = preferred?.score ? preferred : scores[0];
  if (!best || best.score < 2) {
    return {
      category: suggestedCategory || 'Personal Knowledge/Web References',
      score: 1,
      hints: ['Web Reference'],
      alternatives: scores.slice(0, 2).filter((item) => item.score > 0).map((item) => item.category),
    };
  }
  return {
    category: best.category,
    score: best.score,
    hints: best.tags,
    alternatives: scores.slice(0, 3).filter((item) => item.score > 0 && item.category !== best.category).map((item) => item.category),
  };
}

export function confidenceLabel(value = 0) {
  if (value >= 0.74) return 'High';
  if (value >= 0.45) return 'Medium';
  return 'Low';
}

export function normalizeUrlForDuplicate(value = '') {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    parsed.hash = '';
    [...parsed.searchParams.keys()].forEach((key) => {
      if (TRACKING_PARAMS.some((pattern) => pattern.test(key))) parsed.searchParams.delete(key);
    });
    const sorted = [...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    parsed.search = '';
    sorted.forEach(([key, val]) => parsed.searchParams.append(key, val));
    const url = parsed.toString();
    return url.endsWith('/') ? url.slice(0, -1) : url;
  } catch {
    return '';
  }
}

export function fingerprintText(value = '') {
  const text = cleanText(value).toLowerCase().replace(/https?:\/\/\S+/g, '').slice(0, 1200);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return text.length < 24 ? '' : (hash >>> 0).toString(36);
}

export function analyzeSharedCapture(capture = {}, imported = null) {
  const rawTitle = cleanText(capture.rawTitle);
  const rawText = cleanText(capture.rawText);
  const rawUrl = capture.rawUrl || '';
  const sourceDomain = getSourceDomain(imported?.canonicalUrl || rawUrl);
  const importedHtml = sanitizeHtml(imported?.html || '');
  const importedText = cleanText(imported?.text || htmlToText(importedHtml));
  const importedTitle = cleanText(imported?.title || '');
  const sourceMetadata = {
    sourceName: imported?.metadata?.sourceName || imported?.metadata?.siteName || sourceDomain || capture.sourcePlatform || '',
    author: imported?.metadata?.author || '',
    publicationDate: imported?.metadata?.publicationDate || imported?.metadata?.publishedTime || imported?.metadata?.datePublished || '',
    description: imported?.metadata?.description || imported?.summary || '',
    canonicalUrl: imported?.canonicalUrl || imported?.metadata?.canonicalUrl || rawUrl || '',
  };
  const title = importedTitle || rawTitle || sourceMetadata.description?.slice(0, 80) || 'Shared item';
  const combinedText = [rawTitle, rawText, rawUrl, importedTitle, importedText, sourceMetadata.description, sourceDomain].filter(Boolean).join('\n');
  const haystack = combinedText.toLowerCase();
  const classification = classify(haystack, capture.suggestedCategory || '');
  const confidence = Math.min(0.98, Math.max(0.18, classification.score / 12 + (sourceDomain ? 0.06 : 0) + (rawText.length > 80 ? 0.06 : 0)));
  const dates = detectImportantDates({
    title,
    text: combinedText,
    html: importedHtml || htmlFromText(rawText),
    summary: imported?.summary || sourceMetadata.description,
    sourceUrl: sourceMetadata.canonicalUrl || rawUrl,
    sourceMetadata,
    category: classification.category,
  });
  const generatedTags = generateTags({
    title,
    text: combinedText,
    sourceUrl: sourceMetadata.canonicalUrl || rawUrl,
    existingTags: classification.hints,
  }).filter((tag) => {
    const value = tag.toLowerCase().trim();
    return value.length > 1 && value.length < 48 && !GENERIC_TAGS.has(value) && !/[.!?]$/.test(value);
  });
  const tags = mergeTags(classification.hints, generatedTags, 8);
  const summary = imported?.summary || sourceMetadata.description || summarizeText(rawText || importedText, title);
  const html = importedHtml || [
    rawText ? htmlFromText(rawText) : '',
    rawUrl ? `<p><strong>Original link:</strong> <a href="${escapeHtml(rawUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(rawUrl)}</a></p>` : '',
  ].filter(Boolean).join('') || '<p></p>';
  const label = confidenceLabel(confidence);

  return {
    rawTitle,
    rawText,
    rawUrl,
    title,
    sourceDomain,
    sourceMetadata,
    canonicalUrl: sourceMetadata.canonicalUrl || rawUrl || null,
    suggestedCategory: classification.category,
    classificationConfidence: confidence,
    classificationConfidenceLabel: label,
    alternativeCategories: classification.alternatives,
    suggestedTags: tags,
    detectedDates: dates,
    noDeadlinePublished: !dates.some((date) => date.date && !/publication|page updated/i.test(date.type || '')),
    extractedContent: importedText || rawText || null,
    summary,
    html,
    imported,
    shouldAutoSave: label === 'High',
    shouldSaveWithReview: label === 'Medium',
  };
}

function pageUrlKeys(page = {}) {
  return [
    page.sourceUrl,
    page.canonicalUrl,
    page.sourceMetadata?.canonicalUrl,
    page.discovery?.sourceUrl,
  ].map(normalizeUrlForDuplicate).filter(Boolean);
}

export function findSharedDuplicate(capture = {}, analysis = {}, pages = [], inboxItems = []) {
  const urlKeys = new Set([
    normalizeUrlForDuplicate(capture.rawUrl),
    normalizeUrlForDuplicate(analysis.canonicalUrl),
  ].filter(Boolean));
  const titleKey = cleanText(analysis.title || capture.rawTitle).toLowerCase();
  const textKey = fingerprintText(`${capture.rawTitle} ${capture.rawText}`);

  for (const page of pages || []) {
    if (page.secure) continue;
    if (pageUrlKeys(page).some((key) => urlKeys.has(key))) return { type: 'page', id: page.id, title: page.title || 'Existing entry' };
    const pageTitle = cleanText(page.title).toLowerCase();
    if (titleKey.length > 18 && pageTitle === titleKey) return { type: 'page', id: page.id, title: page.title || 'Existing entry' };
    if (textKey && fingerprintText(page.plainText || page.summary || '') === textKey) return { type: 'page', id: page.id, title: page.title || 'Existing entry' };
  }

  for (const item of inboxItems || []) {
    if (!item?.id || item.id === capture.id || item.id === capture.remoteId) continue;
    const itemKeys = [item.rawUrl, item.canonicalUrl].map(normalizeUrlForDuplicate).filter(Boolean);
    if (itemKeys.some((key) => urlKeys.has(key))) return { type: 'capture', id: item.destinationPageId || item.id, captureId: item.id, title: item.rawTitle || item.summary || 'Existing shared item' };
    if (textKey && fingerprintText(`${item.rawTitle || ''} ${item.rawText || ''}`) === textKey) {
      return { type: 'capture', id: item.destinationPageId || item.id, captureId: item.id, title: item.rawTitle || 'Existing shared item' };
    }
  }
  return null;
}

export function buildPageFromSharedCapture(capture = {}, analysis = {}, pageId = '') {
  const importantDates = deduplicateDates([], analysis.detectedDates || [], { pageId });
  return {
    secure: false,
    encryption: null,
    title: analysis.title || capture.rawTitle || 'Shared item',
    category: analysis.suggestedCategory || 'Personal Knowledge/Web References',
    categoryAuto: true,
    categoryConfidence: analysis.classificationConfidence || 0,
    tags: analysis.suggestedTags || [],
    sourceUrl: analysis.canonicalUrl || capture.rawUrl || '',
    sourceDomain: analysis.sourceDomain || getSourceDomain(analysis.canonicalUrl || capture.rawUrl),
    sourceMetadata: analysis.sourceMetadata || {},
    summary: analysis.summary || '',
    html: sanitizeHtml(analysis.html || htmlFromText(capture.rawText || analysis.summary || '')),
    plainText: cleanText(analysis.extractedContent || capture.rawText || analysis.summary || ''),
    wikiLinks: [],
    importantDates,
    dateAnalysisVersion: DATE_ANALYSIS_VERSION,
    dateAnalysisAt: new Date().toISOString(),
    dateAnalysisSummary: {
      detectedCount: importantDates.length,
      requiringConfirmation: importantDates.filter((item) => item.uncertain && !item.confirmed).length,
      noDeadlineFound: !selectNextImportantDate(importantDates, { includeOverdue: true }),
    },
    attachments: [],
    inlineFiles: [],
    origin: 'shared-inbox',
    createdOrigin: 'shared-inbox',
    sourceType: 'manual',
    createdByUser: true,
    isArchived: false,
    archived: false,
    archivedAt: null,
    archivedReason: null,
    visibility: 'private',
    shareEnabled: false,
    shareId: null,
    shareCreatedAt: null,
    shareExpiresAt: null,
    shareCapture: {
      captureId: capture.remoteId || capture.id || '',
      sourcePlatform: capture.sourcePlatform || 'unknown',
      receivedAt: capture.receivedAt || new Date().toISOString(),
      classificationConfidenceLabel: analysis.classificationConfidenceLabel || confidenceLabel(analysis.classificationConfidence || 0),
    },
    opportunityDetails: {
      applicationUrl: analysis.canonicalUrl || capture.rawUrl || '',
      notes: capture.rawText || '',
      relatedSourcePost: analysis.canonicalUrl || capture.rawUrl || '',
    },
  };
}

export function buildEditorPreloadFromCapture(capture = {}, analysis = {}) {
  return {
    title: analysis.title || capture.rawTitle || '',
    category: analysis.suggestedCategory || capture.suggestedCategory || 'Personal Knowledge/Web References',
    tagsText: (analysis.suggestedTags || capture.suggestedTags || []).join(', '),
    sourceUrl: analysis.canonicalUrl || capture.rawUrl || '',
    sourceMetadata: analysis.sourceMetadata || {},
    summary: analysis.summary || '',
    html: analysis.html || htmlFromText(capture.rawText || ''),
    importantDates: analysis.detectedDates || capture.detectedDates || [],
    secure: false,
    origin: 'shared-inbox',
    opportunityDetails: {
      applicationUrl: analysis.canonicalUrl || capture.rawUrl || '',
      notes: capture.rawText || '',
      relatedSourcePost: analysis.canonicalUrl || capture.rawUrl || '',
    },
  };
}

export function buildApplicationPreloadFromCapture(capture = {}, analysis = {}, relatedOpportunityId = '') {
  const tags = mergeTags(['Application'], splitTagsText((analysis.suggestedTags || capture.suggestedTags || []).join(', ')));
  const title = analysis.title || capture.rawTitle || 'Shared opportunity';
  return {
    title: `Application - ${title}`,
    category: 'Applications/Application Documents',
    tagsText: tags.join(', '),
    sourceUrl: analysis.canonicalUrl || capture.rawUrl || '',
    summary: `Application workspace for ${title}.`,
    html: `<p>Application workspace for ${escapeHtml(title)}.</p>${relatedOpportunityId ? `<p>Related opportunity: <a href="#/read/${relatedOpportunityId}">${escapeHtml(title)}</a></p>` : ''}`,
    origin: 'manual',
    opportunityDetails: {
      relatedOpportunityId,
      applicationUrl: analysis.canonicalUrl || capture.rawUrl || '',
      notes: capture.rawText || '',
    },
  };
}
