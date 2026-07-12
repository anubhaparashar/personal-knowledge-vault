import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractImportantDates, formatDetectedDate, selectNextImportantDate } from '../src/utils/dates.js';
import { detectExternalUrls } from '../src/utils/sourceLinks.js';
import { generateSmartMetadata } from '../src/utils/intelligence.js';
import {
  buildLinkedInImportResult,
  extractLinkedInPostFromHtml,
  isLinkedInPostUrl,
  normalizeLinkedInPostUrl,
} from '../functions/linkedin-import.js';

const results = [];


const ACM_TOMM_SPECIAL_ISSUE_PASTE = `Journal: ACM Transactions on Multimedia Computing, Communications, and Applications (IF: 6, Q1)

Special Issue: Towards Responsible and Explainable Multi-Modal Fusion

https://lnkd.in/er3Qsers

Submissions deadline: August 31, 2026
First-round review decisions: October 31, 2026
Deadline for revision submissions: December 15, 2026
Notification of final decisions: February 15, 2027
Tentative publication: April 2027`;

function run(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`ok - ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
  }
}

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

run('Firebase discovery schedules are declared with Asia/Kolkata defaults', () => {
  const functionsIndex = read('functions/index.js');
  assert.match(functionsIndex, /scheduledFullDiscoveryScan/);
  assert.match(functionsIndex, /schedule: '0 6,18 \* \* \*'/);
  assert.match(functionsIndex, /scheduledExistingRecordRefresh/);
  assert.match(functionsIndex, /schedule: '0 \*\/6 \* \* \*'/);
  assert.match(functionsIndex, /timeZone: TZ/);
  assert.match(functionsIndex, /Asia\/Kolkata/);
});

run('GitHub Actions fallback uses requested cron and overlap protection', () => {
  const workflow = read('.github/workflows/research-discovery.yml');
  assert.match(workflow, /cron: "30 0 \* \* \*"/);
  assert.match(workflow, /cron: "30 12 \* \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /scan_type:/);
  assert.match(workflow, /options:/);
  assert.match(workflow, /- quick/);
  assert.match(workflow, /- full/);
  assert.match(workflow, /group: research-discovery/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /FIREBASE_ADMIN_CREDENTIALS/);
});

run('Manual entry menu includes all requested entry types and URL/file actions', () => {
  const manualEntry = read('src/utils/manualEntry.js');
  [
    'Add Scholarship',
    'Add Postdoctoral Opportunity',
    'Add Conference Call',
    'Add Journal Call or Special Issue',
    'Add Fellowship',
    'Add Research Grant',
    'Add Research Job',
    'Add Research Paper',
    'Add Paper Idea',
    'Add Application',
    'Add General Note',
    'Add Diary Entry',
    'Import from Link',
    'Upload Document',
  ].forEach((label) => assert.match(manualEntry, new RegExp(label.replace(/[+]/g, '\\+'))));
});

run('Record origins and backend-not-configured state are represented in frontend', () => {
  const discovery = read('src/services/discovery.js');
  const dashboard = read('src/pages/DashboardPage.jsx');
  assert.match(discovery, /auto-discovered/);
  assert.match(discovery, /manually-added/);
  assert.match(discovery, /imported-from-url/);
  assert.match(discovery, /imported-from-file/);
  assert.match(discovery, /scholarly-api/);
  assert.match(dashboard, /Automatic discovery is not configured/);
  assert.match(dashboard, /Discovery Control Centre/);
  assert.match(dashboard, /Quick Refresh/);
  assert.match(dashboard, /Full Web Scan/);
  assert.match(dashboard, /Scrape a Link/);
  assert.match(dashboard, /Scan One Source/);
});


run('Firestore discovery run schema fields are written by backend', () => {
  const functionsIndex = read('functions/index.js');
  [
    'runType',
    'requestedBy',
    'requestedAt',
    'startedAt',
    'completedAt',
    'currentStage',
    'currentSource',
    'sourcesTotal',
    'sourcesChecked',
    'recordsFound',
    'recordsCreated',
    'recordsUpdated',
    'duplicatesSkipped',
    'datesDetected',
    'errorSummary',
  ].forEach((field) => assert.match(functionsIndex, new RegExp(field)));
  assert.match(functionsIndex, /single-url/);
  assert.match(functionsIndex, /cancel-run/);
});

run('Manual URL import exposes review actions and bounded stages', () => {
  const modal = read('src/components/ImportFromLinkModal.jsx');
  [
    'Import and Analyse Website',
    'Validating link',
    'Connecting to website',
    'Ready for review',
    'Save to Library',
    'Save and Start Application',
    'Edit Before Saving',
    'Change Category',
    'Add to Shared Inbox',
    'Reanalyse',
  ].forEach((label) => assert.match(modal, new RegExp(label.replace(/[+]/g, '\\+'))));
});

run('Important date extraction keeps local labels and month precision', () => {
  const input = `Journal: ACM Transactions on Multimedia Computing, Communications, and Applications

Special Issue: Towards Responsible and Explainable Multi-Modal Fusion

Submissions deadline: August 31, 2026
First-round review decisions: October 31, 2026
Deadline for revision submissions: December 15, 2026
Notification of final decisions: February 15, 2027
Tentative publication: April 2027`;
  const dates = extractImportantDates(input, { pageId: 'special-issue-regression', referenceDate: new Date('2026-07-08T00:00:00') });
  const expected = [
    { type: 'submission-deadline', date: '2026-08-31', label: 'Submission deadline' },
    { type: 'first-round-review-decision', date: '2026-10-31', label: 'First-round review decision' },
    { type: 'revision-submission-deadline', date: '2026-12-15', label: 'Revision submission deadline' },
    { type: 'final-decision-notification', date: '2027-02-15', label: 'Final decision notification' },
    { type: 'tentative-publication', year: 2027, month: 4, day: null, precision: 'month', label: 'Tentative publication' },
  ];
  assert.equal(dates.length, 5);
  expected.forEach((item, index) => {
    assert.equal(dates[index].type, item.type);
    assert.equal(dates[index].displayLabel, item.label);
    if (item.date) assert.equal(dates[index].date, item.date);
    if (item.precision) {
      assert.equal(dates[index].year, item.year);
      assert.equal(dates[index].month, item.month);
      assert.equal(dates[index].day, item.day);
      assert.equal(dates[index].precision, item.precision);
      assert.equal(dates[index].date, null);
    }
  });
  assert.equal(new Set(dates.map((date) => `${date.type}:${date.date || `${date.year}-${date.month}`}`)).size, 5);
  assert.equal(new Set(dates.map((date) => date.sourceText)).size, 5);
  assert.ok(dates.every((date) => (date.sourceText || '').length <= 200));
  assert.deepEqual(dates.filter((date) => date.type === 'final-decision-notification').map((date) => date.date), ['2027-02-15']);
  assert.equal(dates.find((date) => date.type === 'tentative-publication').day, null);
  assert.equal(selectNextImportantDate(dates, { now: new Date('2026-07-08T00:00:00') }).date, '2026-08-31');
  const metadata = generateSmartMetadata({
    title: 'Journal: ACM Transactions on Multimedia Computing, Communications, and Applications (IF: 6, Q1)',
    text: input,
  });
  ['Multimodal Fusion', 'Explainable AI', 'Responsible AI', 'ACM TOMM', 'Special Issue'].forEach((tag) => assert.ok(metadata.tags.includes(tag), `missing ${tag}`));
  ['Learning', 'Journal ACM', 'Transactions Multimedia', 'Multi-modal Fusion.'].forEach((tag) => assert.ok(!metadata.tags.includes(tag), `bad tag ${tag}`));
  assert.equal(metadata.suggestedTitle, 'Towards Responsible and Explainable Multi-Modal Fusion \u2014 ACM TOMM Special Issue');
  assert.equal(metadata.journalTitle, 'ACM Transactions on Multimedia Computing, Communications, and Applications');
});
run('Frontend source does not embed private credential material', () => {
  const files = ['src/firebase.js', 'src/services/discovery.js', 'src/components/ImportFromLinkModal.jsx'];
  for (const file of files) {
    const content = read(file);
    assert.doesNotMatch(content, /-----BEGIN PRIVATE KEY-----/);
    assert.doesNotMatch(content, /client_email.*iam\.gserviceaccount\.com/);
    assert.doesNotMatch(content, /private_key_id/);
  }
});

run('Pasted ACM TOMM LinkedIn shortlink is detected and classified for enrichment', () => {
  const urls = detectExternalUrls(ACM_TOMM_SPECIAL_ISSUE_PASTE);
  assert.deepEqual(urls, ['https://lnkd.in/er3Qsers']);
  const metadata = generateSmartMetadata({ pageId: 'regression-acm-tomm', text: ACM_TOMM_SPECIAL_ISSUE_PASTE, sourceUrl: urls[0] });
  assert.equal(metadata.category, 'Publishing/Special Issues');
  assert.equal(metadata.suggestedTitle, 'Towards Responsible and Explainable Multi-Modal Fusion — ACM TOMM Special Issue');
  ['ACM TOMM', 'Special Issue', 'Multimodal Fusion', 'Responsible AI', 'Explainable AI', 'Submission Deadline'].forEach((tag) => {
    assert.ok(metadata.tags.includes(tag), `Missing tag: ${tag}`);
  });
  const dates = extractImportantDates({ pageId: 'regression-acm-tomm', text: ACM_TOMM_SPECIAL_ISSUE_PASTE });
  const byTitle = new Map(dates.map((date) => [date.title, date]));
  assert.equal(byTitle.get('Submission deadline')?.date, '2026-08-31');
  assert.equal(byTitle.get('First-round review decision')?.date, '2026-10-31');
  assert.equal(byTitle.get('Revision submission deadline')?.date, '2026-12-15');
  assert.equal(byTitle.get('Final decision notification')?.date, '2027-02-15');
  assert.equal(formatDetectedDate(byTitle.get('Tentative publication')), 'April 2027');
  assert.equal(new Set(dates.map((date) => `${date.title}:${date.date || date.year + '-' + date.month}`)).size, dates.length);
});


run('LinkedIn ACM TOMM fixture extracts only the main post and official source evidence', () => {
  const fixture = read('tests/fixtures/linkedin-acm-tomm-post.html');
  const url = 'https://www.linkedin.com/posts/imad-rida-phd-363a15b9_acm-tomm-cfp-responsible-explainable-multi-modal-fusion-activity-7460986095749693440-_0Ut?utm_source=social_share_send&utm_medium=member_desktop_web&rcm=ACoAAAsZkr4BdIT-5A6p4Yh4GWkUbsh57JTQgVQ';
  const canonical = 'https://www.linkedin.com/posts/imad-rida-phd-363a15b9_acm-tomm-cfp-responsible-explainable-multi-modal-fusion-activity-7460986095749693440-_0Ut';
  assert.equal(isLinkedInPostUrl(url), true);
  assert.equal(normalizeLinkedInPostUrl(url), canonical);
  assert.equal(normalizeLinkedInPostUrl(`${canonical}?utm_source=x&rcm=y`), canonical);

  const post = extractLinkedInPostFromHtml(fixture, url);
  assert.equal(post.author, 'Imad Rida, PhD');
  assert.ok(post.text.includes('Journal: ACM Transactions on Multimedia Computing, Communications, and Applications'));
  assert.ok(!post.text.includes('More Relevant Posts'));
  assert.ok(!post.text.includes('January 1, 2030'));
  assert.ok(post.links.some((link) => /ACM-TOMM-CFP-Responsible-Explainable-Multi-Modal-Fusion\.pdf/i.test(link.url)));

  const result = buildLinkedInImportResult({ originalUrl: url, finalUrl: url, html: fixture });
  assert.equal(result.sourcePlatform, 'linkedin');
  assert.equal(result.sourceAuthor, 'Imad Rida, PhD');
  assert.equal(result.canonicalUrl, canonical);
  assert.equal(result.title, 'Towards Responsible and Explainable Multi-Modal Fusion \u2014 ACM TOMM Special Issue');
  assert.equal(result.category, 'Publishing/Special Issues');
  assert.equal(result.recordType, 'Journal special issue call for papers');
  assert.equal(result.structured.journal, 'ACM Transactions on Multimedia Computing, Communications, and Applications');
  assert.equal(result.structured.journalAbbreviation, 'ACM TOMM');
  assert.equal(result.structured.publisher, 'Association for Computing Machinery');
  assert.equal(result.structured.specialIssueTitle, 'Towards Responsible and Explainable Multi-Modal Fusion');
  assert.deepEqual(result.structured.reportedJournalInfo, { impactFactor: '6', quartile: 'Q1', verificationStatus: 'Unverified external claim' });
  assert.deepEqual(result.structured.guestEditors.map((editor) => editor.name), ['Lucia Cascone', 'Emanuela Marasco', 'Imad Rida']);
  assert.equal(result.structured.topics.length, 15);
  ['ACM TOMM', 'Special Issue', 'Multimodal Fusion', 'Responsible AI', 'Explainable AI', 'Multimodal LLMs', 'Privacy-Preserving Learning', 'Adversarial Robustness'].forEach((tag) => assert.ok(result.tags.includes(tag), `missing tag ${tag}`));
  ['Learning', 'Journal ACM', 'Transactions Multimedia', 'Multi-modal Fusion.'].forEach((tag) => assert.ok(!result.tags.includes(tag), `bad tag ${tag}`));
  assert.ok(result.officialPdf);
  assert.equal(result.officialPdf.kind, 'pdf');

  const dates = result.importantDates;
  assert.equal(dates.length, 5);
  const expected = [
    ['submission-deadline', '2026-08-31', 'Submissions deadline: August 31, 2026'],
    ['first-round-review-decision', '2026-10-31', 'First-round review decisions: October 31, 2026'],
    ['revision-submission-deadline', '2026-12-15', 'Deadline for revision submissions: December 15, 2026'],
    ['final-decision-notification', '2027-02-15', 'Notification of final decisions: February 15, 2027'],
  ];
  expected.forEach(([type, date, snippet], index) => {
    assert.equal(dates[index].type, type);
    assert.equal(dates[index].date, date);
    assert.equal(dates[index].sourceText, snippet);
    assert.ok(!dates[index].sourceText.includes('More Relevant Posts'));
  });
  const publication = dates[4];
  assert.equal(publication.type, 'tentative-publication');
  assert.equal(publication.year, 2027);
  assert.equal(publication.month, 4);
  assert.equal(publication.day, null);
  assert.equal(publication.precision, 'month');
  assert.equal(publication.sourceText, 'Tentative publication: April 2027');
  assert.equal(dates[0].date, '2026-08-31');
  assert.equal(new Set(dates.map((date) => `${date.type}:${date.date || date.year + '-' + date.month}`)).size, 5);
});
run('Editor and backend expose truthful pasted-link source enrichment states', () => {
  const editor = read('src/pages/EditorPage.jsx');
  const urlImport = read('src/services/urlImport.js');
  const functionsIndex = read('functions/index.js');
  const settings = read('src/pages/SettingsPage.jsx');
  assert.match(editor, /detectExternalUrls/);
  assert.match(editor, /Source enrichment:/);
  assert.match(editor, /Source enriched - Official page retrieved/);
  assert.match(editor, /LinkedIn did not allow complete automatic extraction/);
  assert.match(editor, /Enrich from detected link/);
  assert.match(editor, /Recheck source/);
  assert.match(urlImport, /Authorization: `Bearer \$\{token\}`/);
  assert.match(functionsIndex, /await requireUser\(req\)/);
  assert.match(functionsIndex, /originalUrl: sourceUrl/);
  assert.match(functionsIndex, /resolvedUrl: finalUrl/);
  assert.match(functionsIndex, /partial: true/);
  assert.match(settings, /Automatically enrich pasted links/);
});
const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`${failed.length} test(s) failed.`);
  process.exit(1);
}
console.log(`${results.length} test(s) passed.`);
