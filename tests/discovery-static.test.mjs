import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractImportantDates, formatDetectedDate, selectNextImportantDate } from '../src/utils/dates.js';
import { detectExternalUrls } from '../src/utils/sourceLinks.js';
import { buildPageSearchDocument, entryTypeForPage, isArchivedPage, isDiaryEntry, isDiscoveryRecord, isMyEntry, isShareEnabledPage, normalizePage, pageMatchesSection, savedDiscoveryPatch, searchMatchForPage, sourceTypeForPage, TECHNOLOGY_ENTRY_TYPE } from '../src/utils/pageModel.js';
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

run('GitHub Actions discovery schedules are declared for 06:00 and 18:00 IST', () => {
  const workflow = read('.github/workflows/research-discovery.yml');
  const discovery = read('src/services/discovery.js');
  assert.match(workflow, /cron: "30 0 \* \* \*"/);
  assert.match(workflow, /cron: "30 12 \* \* \*"/);
  assert.match(discovery, /FIXED_DISCOVERY_SCHEDULE_LABEL = '06:00 IST \/ 18:00 IST'/);
  assert.doesNotMatch(read('functions/index.js'), /onSchedule|scheduledFullDiscoveryScan|scheduledExistingRecordRefresh/);
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
    'Add Technology',
    'Add Application',
    'Add General Note',
    'Add Diary Entry',
    'Import from Link',
    'Upload Document',
  ].forEach((label) => assert.match(manualEntry, new RegExp(label.replace(/[+]/g, '\\+'))));
});

run('Record origins and queue-based discovery state are represented in frontend', () => {
  const discovery = read('src/services/discovery.js');
  const dashboard = read('src/pages/DashboardPage.jsx');
  const sourcesPanel = read('src/components/DiscoverySettingsPanel.jsx');
  assert.match(discovery, /auto-discovered/);
  assert.match(discovery, /manual/);
  assert.match(discovery, /imported-link/);
  assert.match(discovery, /imported-file/);
  assert.match(discovery, /scholarly-api/);
  assert.match(discovery, /discoveryRequests/);
  assert.match(dashboard, /Discovery status summary/);
  assert.match(dashboard, /Sources enabled/);
  assert.match(dashboard, /Scraped Entries/);
  assert.match(dashboard, /Shareable Entries/);
  assert.match(dashboard, /const \[discoveryRequests, setDiscoveryRequests\] = useState\(\[\]\)/);
  assert.match(dashboard, /Array\.isArray\(discoveryRequests\)/);
  assert.doesNotMatch(dashboard, /Quick Refresh|Full Web Scan|Scrape a Link|Scan One Source/);
  assert.match(sourcesPanel, /GitHub Actions scheduled/);
  assert.match(sourcesPanel, /Queue-based, no Firebase Functions/);
  assert.match(sourcesPanel, /Open Research Discovery Workflow/);
  assert.match(sourcesPanel, /Scan Now/);
});

run('Origin model separates diary, my entries, discoveries and archives', () => {
  const diary = normalizePage({ id: 'diary-1', title: 'Diary', category: 'Personal/Diary', origin: 'manual' });
  const scholarship = normalizePage({ id: 'disc-1', title: 'Scholarship', category: 'Research Opportunities/Scholarships', origin: 'auto-discovered', createdByUser: false, discoveryRunId: 'run-1' });
  const saved = normalizePage({ ...scholarship, ...savedDiscoveryPatch(scholarship) });
  const archivedManual = normalizePage({ id: 'note-1', title: 'Manual note', origin: 'manual', createdByUser: true, isArchived: true });
  const legacySourceRecord = normalizePage({ id: 'legacy-source', title: 'Old source URL record', sourceUrl: 'https://example.org/call' });
  const shareableManual = normalizePage({ id: 'shareable-1', title: 'Shared manual note', origin: 'manual', createdByUser: true, shareEnabled: true, shareId: 'share_abc' });

  assert.equal(isDiaryEntry(diary), true);
  assert.equal(pageMatchesSection(diary, 'diary'), true);
  assert.equal(pageMatchesSection(scholarship, 'diary'), false);
  assert.equal(isDiscoveryRecord(scholarship), true);
  assert.equal(scholarship.sourceType, 'discovery');
  assert.equal(pageMatchesSection(scholarship, 'discoveries'), true);
  assert.equal(pageMatchesSection(scholarship, 'my-entries'), false);
  assert.equal(isMyEntry(saved), true);
  assert.equal(saved.sourceType, 'manual');
  assert.equal(saved.shareEnabled, false);
  assert.equal(pageMatchesSection(saved, 'my-entries'), true);
  assert.equal(isArchivedPage(archivedManual), true);
  assert.equal(pageMatchesSection(archivedManual, 'my-entries'), false);
  assert.equal(pageMatchesSection(archivedManual, 'archives'), true);
  assert.equal(pageMatchesSection(scholarship, 'notes', { allNotesView: 'my-entries' }), false);
  assert.equal(pageMatchesSection(scholarship, 'notes', { allNotesView: 'everything' }), true);
  assert.equal(sourceTypeForPage(legacySourceRecord), 'discovery');
  assert.equal(isDiscoveryRecord(legacySourceRecord), true);
  assert.equal(pageMatchesSection(legacySourceRecord, 'my-entries'), false);
  assert.equal(isShareEnabledPage(shareableManual), true);
  assert.equal(pageMatchesSection(shareableManual, 'shareable'), true);
});

run('Technology Reference entries stay manual and searchable across tech fields', () => {
  const cloudflare = normalizePage({
    id: 'tech-cloudflare',
    title: 'Cloudflare',
    category: 'Tech Reference/Domain and DNS',
    origin: 'manual',
    createdByUser: true,
    entryType: TECHNOLOGY_ENTRY_TYPE,
    summary: 'A platform used for DNS, website delivery, security and related domain services.',
    tags: ['cloudflare', 'dns', 'domain', 'email-routing', 'ssl', 'github-pages'],
    techDetails: {
      canonicalName: 'Cloudflare',
      aliases: ['cloudfare', 'CF'],
      technologyCategory: 'Domain and DNS',
      shortDefinition: 'A platform used for DNS, website delivery, security and related domain services.',
      whyUsed: 'To manage domain DNS, connect custom domains, handle SSL and configure email routing.',
      mainPurpose: 'DNS management, website security, SSL, CDN, and domain email routing.',
      projects: [
        { projectName: 'gaitai.in', purpose: 'DNS management', servicesUsed: ['DNS'] },
        { projectName: 'GitHub Pages', purpose: 'custom domain connection', servicesUsed: ['DNS records'] },
        { projectName: 'Domain email', purpose: 'Cloudflare Email Routing', servicesUsed: ['Email Routing'] },
      ],
      useCases: ['custom domain', 'domain email', 'email routing', 'SSL', 'GitHub Pages'],
      relatedPages: '[[GitHub Pages]]',
    },
    pages: [
      { pageId: 'main', title: 'Overview', content: '<p>Cloudflare manages DNS for gaitai.in and SSL for custom domains.</p>', order: 0 },
      { pageId: 'setup', title: 'Setup', content: '<p>Email routing and GitHub Pages DNS records are configured here.</p>', order: 1 },
    ],
  });
  const searchDocument = buildPageSearchDocument(cloudflare);

  assert.equal(entryTypeForPage(cloudflare), TECHNOLOGY_ENTRY_TYPE);
  assert.equal(isMyEntry(cloudflare), true);
  assert.equal(isDiscoveryRecord(cloudflare), false);
  assert.equal(pageMatchesSection(cloudflare, 'tech-reference'), true);
  assert.equal(cloudflare.searchText, searchDocument.text);
  assert.ok(searchDocument.text.includes('cloudfare'));
  assert.ok(searchDocument.text.includes('gaitai.in'));

  ['Cloudflare', 'cloudfare', 'CF', 'DNS', 'gaitai.in', 'custom domain', 'domain email', 'email routing', 'SSL', 'GitHub Pages'].forEach((query) => {
    const match = searchMatchForPage(cloudflare, query);
    assert.equal(match.matched, true, `${query} should return the Cloudflare technology entry`);
    assert.ok(match.fieldLabel, `${query} should report the matched field`);
  });
});
run('Archive and public share surfaces are wired without exposing private pages', () => {
  const dashboard = read('src/pages/DashboardPage.jsx');
  const reader = read('src/pages/ReaderPage.jsx');
  const publicShares = read('src/services/publicShares.js');
  const rules = read('firestore.rules');

  assert.match(dashboard, /Save to My Entries/);
  assert.match(dashboard, /Archive selected/);
  assert.match(dashboard, /Mark as Discovery/);
  assert.match(dashboard, /ShareEntryDialog/);
  assert.match(dashboard, /Make shareable/);
  assert.match(reader, /Save to My Entries/);
  assert.match(reader, /Archive/);
  assert.match(publicShares, /publicShares/);
  assert.match(publicShares, /Encrypted notes cannot be publicly shared/);
  assert.match(publicShares, /Only manual entries can be made shareable/);
  assert.match(publicShares, /shareEnabled: true/);
  assert.match(publicShares, /visibility: 'shareable'/);
  assert.match(rules, /match \/publicShares\/\{shareId\}/);
  assert.match(rules, /allow get:/);
  assert.match(rules, /allow list: if false/);
  assert.doesNotMatch(rules, /allow read: if true/);
});


run('GitHub Actions runner writes run logs and queued request statuses', () => {
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
  assert.match(functionsIndex, /processQueuedDiscoveryRequests/);
  assert.match(functionsIndex, /single-link/);
  assert.match(functionsIndex, /quick-refresh/);
  assert.match(functionsIndex, /single-source/);
  assert.match(functionsIndex, /status: 'processing'/);
  assert.match(functionsIndex, /status: 'completed'/);
  assert.match(functionsIndex, /status: 'failed'/);
  assert.doesNotMatch(functionsIndex, /onRequest|firebase-functions|cancel-run/);
});

run('Manual URL import queues link requests and exposes request statuses', () => {
  const modal = read('src/components/ImportFromLinkModal.jsx');
  [
    'Queue link discovery',
    'Queue Link',
    'Open Workflow',
    'Queued link requests',
    'Hybrid discovery mode',
    'Manual entries are saved instantly',
    'Discovery status:',
    'requestStatusLabel',
  ].forEach((label) => assert.match(modal, new RegExp(label.replace(/[+]/g, '\\+'))));
  assert.match(modal, /Array\.isArray\(requests\)/);
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
  assert.equal(metadata.suggestedTitle, 'Towards Responsible and Explainable Multi-Modal Fusion \u2014 ACM TOMM Special Issue');
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
run('Editor and Actions runner expose truthful free source enrichment states', () => {
  const editor = read('src/pages/EditorPage.jsx');
  const urlImport = read('src/services/urlImport.js');
  const functionsIndex = read('functions/index.js');
  const settings = read('src/pages/SettingsPage.jsx');
  assert.match(editor, /detectExternalUrls/);
  assert.match(editor, /Source enrichment:/);
  assert.match(editor, /Automatic discovery requests are queued and processed by GitHub Actions/);
  assert.match(editor, /Enrich from detected link/);
  assert.match(editor, /Recheck source/);
  assert.match(urlImport, /processed by GitHub Actions so the app can stay free/);
  assert.doesNotMatch(urlImport, /VITE_URL_IMPORT_ENDPOINT|Authorization: `Bearer/);
  assert.match(functionsIndex, /discoverFromUrl/);
  assert.match(functionsIndex, /saveRecords/);
  assert.match(functionsIndex, /processQueuedDiscoveryRequests/);
  assert.match(settings, /Automatically enrich pasted links/);
});
const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`${failed.length} test(s) failed.`);
  process.exit(1);
}
console.log(`${results.length} test(s) passed.`);
