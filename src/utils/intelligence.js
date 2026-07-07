import { getSourceDomain, htmlToText } from './content';
import { extractImportantDates } from './dates';

export const CATEGORY_OPTIONS = [
  'Research Opportunities/Scholarships',
  'Research Opportunities/Postdoctoral Opportunities',
  'Research Opportunities/Fellowships',
  'Research Opportunities/Research Grants',
  'Research Opportunities/Research Jobs',
  'Publishing/Conference Calls',
  'Publishing/Conference Deadlines',
  'Publishing/Journal Calls',
  'Publishing/Special Issues',
  'Publishing/Paper Submission Deadlines',
  'Research/Paper Ideas',
  'Research/Research Papers',
  'Research/Literature Notes',
  'Research/Experiments',
  'Research/Datasets',
  'Research/Research Projects',
  'Research/Collaboration Opportunities',
  'Applications/Scholarship Applications',
  'Applications/Postdoctoral Applications',
  'Applications/Job Applications',
  'Applications/Application Documents',
  'Personal Knowledge/Diary',
  'Personal Knowledge/General Notes',
  'Personal Knowledge/Web References',
  'Personal Knowledge/Books and Reading',
  'Uncategorised',
];

export const DASHBOARD_SECTIONS = [
  { key: 'scholarships', title: 'Scholarships', categories: ['Research Opportunities/Scholarships', 'Applications/Scholarship Applications'] },
  { key: 'postdoctoral', title: 'Postdoctoral Opportunities', categories: ['Research Opportunities/Postdoctoral Opportunities', 'Applications/Postdoctoral Applications'] },
  { key: 'conferences', title: 'Conference Calls and Deadlines', categories: ['Publishing/Conference Calls', 'Publishing/Conference Deadlines', 'Publishing/Paper Submission Deadlines'] },
  { key: 'journals', title: 'Journal Calls and Special Issues', categories: ['Publishing/Journal Calls', 'Publishing/Special Issues'] },
  { key: 'paper-ideas', title: 'Paper Ideas', categories: ['Research/Paper Ideas'] },
  { key: 'reading', title: 'Research Papers and Reading Notes', categories: ['Research/Research Papers', 'Research/Literature Notes', 'Personal Knowledge/Books and Reading'] },
  { key: 'fellowships-grants', title: 'Fellowships and Grants', categories: ['Research Opportunities/Fellowships', 'Research Opportunities/Research Grants'] },
  { key: 'applications', title: 'Applications', categories: ['Applications/Scholarship Applications', 'Applications/Postdoctoral Applications', 'Applications/Job Applications', 'Applications/Application Documents'] },
];

const CATEGORY_RULES = [
  { category: 'Research Opportunities/Scholarships', terms: ['scholarship', 'studentship', 'funded position', 'tuition waiver', 'stipend', 'eligibility', 'application form', 'financial aid'] },
  { category: 'Research Opportunities/Postdoctoral Opportunities', terms: ['postdoc', 'postdoctoral', 'research fellow', 'research associate', 'fellowship position', 'principal investigator', 'lab opening', 'pi group'] },
  { category: 'Research Opportunities/Fellowships', terms: ['fellowship', 'fellows program', 'visiting fellow', 'research fellowship'] },
  { category: 'Research Opportunities/Research Grants', terms: ['research grant', 'grant call', 'funding call', 'seed grant', 'proposal deadline', 'grant proposal'] },
  { category: 'Research Opportunities/Research Jobs', terms: ['research job', 'faculty position', 'lecturer position', 'assistant professor', 'job opening', 'vacancy'] },
  { category: 'Publishing/Conference Calls', terms: ['conference', 'call for papers', 'cfp', 'symposium', 'workshop', 'conference track'] },
  { category: 'Publishing/Conference Deadlines', terms: ['abstract submission', 'paper submission', 'camera ready', 'camera-ready', 'notification date', 'registration deadline'] },
  { category: 'Publishing/Journal Calls', terms: ['journal call', 'call for manuscripts', 'journal submission', 'submit manuscript'] },
  { category: 'Publishing/Special Issues', terms: ['special issue', 'special section', 'guest editor', 'topical collection'] },
  { category: 'Publishing/Paper Submission Deadlines', terms: ['submission deadline', 'full paper deadline', 'paper deadline', 'manuscript deadline'] },
  { category: 'Research/Paper Ideas', terms: ['paper idea', 'proposed method', 'research gap', 'hypothesis', 'future work', 'novel framework', 'experiment idea'] },
  { category: 'Research/Research Papers', terms: ['research paper', 'abstract', 'methodology', 'results', 'related work', 'doi', 'arxiv'] },
  { category: 'Research/Literature Notes', terms: ['literature review', 'reading note', 'citation', 'annotated bibliography', 'survey paper'] },
  { category: 'Research/Experiments', terms: ['experiment', 'ablation', 'baseline', 'evaluation metric', 'protocol'] },
  { category: 'Research/Datasets', terms: ['dataset', 'benchmark', 'corpus', 'data collection', 'data set'] },
  { category: 'Research/Research Projects', terms: ['research project', 'project plan', 'milestone', 'work package'] },
  { category: 'Research/Collaboration Opportunities', terms: ['collaboration', 'collaborator', 'joint project', 'consortium'] },
  { category: 'Applications/Scholarship Applications', terms: ['scholarship application', 'statement of purpose', 'recommendation letter', 'transcript', 'application portal'] },
  { category: 'Applications/Postdoctoral Applications', terms: ['postdoctoral application', 'cover letter', 'research statement', 'cv', 'reference letter'] },
  { category: 'Applications/Job Applications', terms: ['job application', 'resume', 'interview', 'job portal', 'application status'] },
  { category: 'Applications/Application Documents', terms: ['application document', 'personal statement', 'motivation letter', 'supporting document'] },
  { category: 'Personal Knowledge/Diary', terms: ['diary', 'journal entry', 'today i', 'reflection', 'personal note'] },
  { category: 'Personal Knowledge/Web References', terms: ['web reference', 'blog', 'website', 'documentation', 'tutorial', 'guide'] },
  { category: 'Personal Knowledge/Books and Reading', terms: ['book', 'chapter', 'reading list', 'author', 'publisher'] },
  { category: 'Personal Knowledge/General Notes', terms: ['note', 'idea', 'miscellaneous', 'general'] },
];

const KNOWN_TAG_PHRASES = [
  'LLM safety', 'Agent security', 'Postdoctoral fellowship', 'Computer vision', 'Gait recognition',
  'Submission deadline', 'Research grant', 'Scholarship', 'Explainable AI', 'Machine learning',
  'Deep learning', 'Natural language processing', 'Academic writing', 'Paper submission',
  'Conference deadline', 'Journal call', 'Special issue', 'Research fellowship', 'Application deadline',
  'Dataset', 'Research paper', 'Literature review', 'Privacy', 'Authentication', 'Firebase Storage',
];

const STOP_WORDS = new Set('a,an,and,are,as,at,be,by,for,from,has,have,how,in,into,is,it,its,of,on,or,our,that,the,their,there,this,to,with,will,you,your,using,use,can,may,not,new,all,any,one,two,via,per,more,most,about,after,before,between,within'.split(','));

function normalizeText(value = '') {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleCase(value = '') {
  return value.split(/\s+/).filter(Boolean).map((word) => {
    if (/^[A-Z0-9]{2,}$/.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

export function splitTagsText(value = '') {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean);
}

export function mergeTags(manualTags = [], generatedTags = [], limit = 8) {
  const seen = new Set();
  const merged = [];
  [...manualTags, ...generatedTags].forEach((tag) => {
    const clean = titleCase(tag.replace(/\s+/g, ' ').trim());
    const key = clean.toLowerCase();
    if (clean.length < 2 || seen.has(key)) return;
    seen.add(key);
    merged.push(clean);
  });
  return merged.slice(0, Math.max(limit, manualTags.length));
}

function scoreCategory(haystack) {
  const scores = CATEGORY_RULES.map((rule) => {
    const score = rule.terms.reduce((total, term) => total + (haystack.includes(term) ? Math.max(2, term.split(/\s+/).length + 1) : 0), 0);
    return { category: rule.category, score };
  }).sort((a, b) => b.score - a.score);

  const best = scores[0];
  if (!best || best.score < 2) return { category: 'Uncategorised', confidence: 0 };
  return { category: best.category, confidence: Math.min(1, best.score / 10) };
}

function candidatePhrases(text) {
  const words = normalizeText(text).split(/[^a-zA-Z0-9+#.-]+/).filter((word) => {
    const clean = word.toLowerCase();
    return clean.length > 2 && !STOP_WORDS.has(clean) && !/^\d+$/.test(clean);
  });
  const counts = new Map();

  for (let size = 1; size <= 3; size += 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      const phrase = words.slice(index, index + size).join(' ');
      if (phrase.length < 3) continue;
      counts.set(phrase, (counts.get(phrase) || 0) + (size === 1 ? 1 : 3));
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([phrase]) => titleCase(phrase))
    .filter((phrase) => phrase.length > 1);
}

export function generateTags({ title = '', text = '', sourceUrl = '', existingTags = [], fileName = '' } = {}) {
  const haystack = `${title} ${fileName} ${text}`.toLowerCase();
  const tags = [];
  KNOWN_TAG_PHRASES.forEach((phrase) => {
    if (haystack.includes(phrase.toLowerCase())) tags.push(phrase);
  });
  const domain = getSourceDomain(sourceUrl);
  if (domain && !domain.includes('google')) tags.push(domain.split('.')[0]);
  tags.push(...candidatePhrases(`${title} ${fileName}`).slice(0, 4));
  tags.push(...candidatePhrases(text).slice(0, 8));
  return mergeTags(existingTags, tags, 8);
}

export function summarizeText(text = '', fallback = '') {
  const clean = normalizeText(text || fallback);
  if (!clean) return '';
  const sentence = clean.match(/[^.!?]+[.!?]/)?.[0]?.trim();
  return (sentence || clean).slice(0, 320);
}

export function deadlineStatus(deadline) {
  if (deadline.completed) return 'Completed';
  if (!deadline.date) return 'Unconfirmed';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${deadline.date}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Unconfirmed';
  const days = Math.ceil((date - today) / 86400000);
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Today';
  if (days <= 7) return 'Due soon';
  return 'Upcoming';
}

export function daysUntil(dateValue) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date - today) / 86400000);
}

export function detectImportantDates(input = '', options = {}) {
  const payload = typeof input === 'string' ? { text: input } : input;
  return extractImportantDates(payload, options).map((deadline) => ({ ...deadline, status: deadlineStatus(deadline) }));
}

export function generateSmartMetadata({ title = '', html = '', text = '', sourceUrl = '', summary = '', tagsText = '', fileName = '', pageId = '', sourceMetadata = {}, category = '', tags: existingTagList = [] } = {}) {
  const plainText = normalizeText(text || htmlToText(html));
  const haystack = `${title} ${fileName} ${plainText} ${summary} ${tagsText} ${sourceUrl}`.toLowerCase();
  const scored = scoreCategory(haystack);
  const existingTags = mergeTags(splitTagsText(tagsText), existingTagList);
  const tags = generateTags({ title, text: plainText || summary, sourceUrl, existingTags, fileName });
  const suggestedSummary = summary?.trim() || summarizeText(plainText, title);
  const importantDates = detectImportantDates({
    pageId,
    title,
    html,
    text: plainText,
    summary,
    sourceUrl,
    sourceMetadata,
    category,
    tags,
  }, { pageId });

  return {
    category: scored.category,
    categoryConfidence: scored.confidence,
    tags,
    summary: suggestedSummary,
    importantDates,
  };
}