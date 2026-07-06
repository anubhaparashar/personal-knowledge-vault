import { sanitizeHtml, timestampToDate } from './content';

function downloadBlob(contents, fileName, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(value) {
  return (value || 'page').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '').slice(0, 90) || 'page';
}

function normalizeTimestamps(record) {
  return {
    ...record,
    createdAt: timestampToDate(record.createdAt)?.toISOString() || null,
    updatedAt: timestampToDate(record.updatedAt)?.toISOString() || null,
  };
}

export function downloadPageAsHtml(page, resolvedContent) {
  const title = resolvedContent.title || page.title || 'Knowledge page';
  const html = sanitizeHtml(resolvedContent.html || '');
  const documentHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/[<>&"]/g, '')}</title>
<style>
body{max-width:850px;margin:40px auto;padding:0 24px;font:18px/1.7 Georgia,serif;color:#172033}img{max-width:100%;height:auto}a{color:#174a7e}header{border-bottom:1px solid #ccd5df;margin-bottom:32px}small{color:#667085}
</style>
</head>
<body>
<header><h1>${title.replace(/[<>&]/g, '')}</h1><p><small>${resolvedContent.category || ''}</small></p></header>
${html}
</body>
</html>`;
  downloadBlob(documentHtml, `${safeFileName(title)}.html`, 'text/html;charset=utf-8');
}

export function downloadBackup(pages, pdfs = []) {
  const backup = {
    format: 'personal-knowledge-vault',
    version: 2,
    exportedAt: new Date().toISOString(),
    pages: pages.map(normalizeTimestamps),
    pdfs: pdfs.map(normalizeTimestamps),
  };
  downloadBlob(
    JSON.stringify(backup, null, 2),
    `knowledge-vault-backup-${new Date().toISOString().slice(0, 10)}.json`,
    'application/json;charset=utf-8',
  );
}
