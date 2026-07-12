import {
  buildLinkedInImportResult,
  extractLinkedInPostFromHtml,
} from '../functions/linkedin-import.js';

const LINKEDIN_URL = 'https://www.linkedin.com/posts/imad-rida-phd-363a15b9_acm-tomm-cfp-responsible-explainable-multi-modal-fusion-activity-7460986095749693440-_0Ut?utm_source=social_share_send&utm_medium=member_desktop_web&rcm=ACoAAAsZkr4BdIT-5A6p4Yh4GWkUbsh57JTQgVQ';

if (process.env.RUN_LIVE_LINKEDIN_IMPORT !== '1') {
  console.log(JSON.stringify({
    status: 'skipped',
    reason: 'Set RUN_LIVE_LINKEDIN_IMPORT=1 to run the opt-in live LinkedIn import test.',
  }, null, 2));
  process.exit(0);
}

try {
  const response = await fetch(LINKEDIN_URL, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'PersonalKnowledgeVaultDiscovery/1.0',
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
    },
  });
  const html = await response.text();
  const post = extractLinkedInPostFromHtml(html, response.url || LINKEDIN_URL);
  const result = buildLinkedInImportResult({ originalUrl: LINKEDIN_URL, finalUrl: response.url || LINKEDIN_URL, html });
  const blocked = /captcha|authwall|sign in|join linkedin|log in/i.test(html) || response.status === 999;
  const useful = post.text.length > 500 || result.importantDates.length > 0 || Boolean(result.officialPdf);
  const status = blocked && useful ? 'partial-success' : blocked ? 'blocked' : (post.text.length > 500 ? 'full-success' : response.ok ? 'partial-success' : 'failed');
  console.log(JSON.stringify({
    status,
    httpStatus: response.status,
    finalUrl: response.url,
    mainPostLength: post.text.length,
    author: post.author,
    mainLinksDetected: post.links.map((link) => link.url).slice(0, 10),
    pdfAttachmentDetected: Boolean(result.officialPdf || result.links.some((link) => /pdf/i.test(link.kind || link.url || ''))),
    datesDetected: result.importantDates.map((date) => ({
      type: date.type,
      date: date.date,
      year: date.year,
      month: date.month,
      precision: date.precision,
      sourceText: date.sourceText,
    })),
    extractionWarnings: result.warnings || [],
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    status: 'failed',
    error: error.message || 'Live LinkedIn import failed.',
  }, null, 2));
}

