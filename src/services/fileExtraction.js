import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import mammoth from 'mammoth/mammoth.browser';
import JSZip from 'jszip';
import { sanitizeHtml } from '../utils/content';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function extensionForName(name = '') {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
}

function paragraphsFromText(text) {
  const blocks = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  return blocks.length
    ? blocks.map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('')
    : '<p></p>';
}

function summarize(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 320);
}

function csvToHtml(text) {
  const rows = text.split(/\r?\n/).map((line) => line.split(',').map((cell) => cell.trim())).filter((row) => row.some(Boolean));
  if (!rows.length) return '<p>No CSV rows found.</p>';
  const [header, ...body] = rows;
  return `<table><thead><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

async function extractPdf(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
    if (text) pages.push({ pageNumber, text });
  }

  const fullText = pages.map((page) => page.text).join('\n\n');
  return {
    kind: 'pdf',
    text: fullText,
    html: pages.map((page) => `<h3>Page ${page.pageNumber}</h3><p>${escapeHtml(page.text)}</p>`).join('') || '<p>No selectable PDF text was found.</p>',
    summary: summarize(fullText),
  };
}

async function extractDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const cleanHtml = sanitizeHtml(result.value || '<p></p>');
  const text = new DOMParser().parseFromString(cleanHtml, 'text/html').body.textContent || '';
  return {
    kind: 'docx',
    text,
    html: cleanHtml,
    summary: summarize(text),
    warnings: result.messages?.map((message) => message.message).filter(Boolean) || [],
  };
}

async function extractZip(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => ({ name: entry.name, size: entry._data?.uncompressedSize || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const text = entries.map((entry) => entry.name).join('\n');
  return {
    kind: 'zip',
    text,
    html: `<h3>ZIP contents</h3><ul>${entries.map((entry) => `<li>${escapeHtml(entry.name)}</li>`).join('')}</ul>`,
    summary: `${entries.length} file(s) inside ZIP: ${entries.slice(0, 6).map((entry) => entry.name).join(', ')}`.slice(0, 320),
    zipEntries: entries,
  };
}

export async function extractContentFromFile(file) {
  const ext = extensionForName(file.name);
  const type = (file.type || '').toLowerCase();

  if (type === 'application/pdf' || ext === 'pdf') return extractPdf(file);
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx') return extractDocx(file);
  if (type === 'application/msword' || ext === 'doc') {
    return {
      kind: 'doc',
      text: '',
      html: '',
      summary: '',
      unavailable: true,
      message: 'Text extraction is unavailable for older binary DOC files. The file was uploaded and can still be saved as an attachment.',
    };
  }
  if (type === 'application/zip' || type === 'application/x-zip-compressed' || ext === 'zip') return extractZip(file);

  const text = await file.text();
  if (type === 'text/csv' || ext === 'csv') {
    return { kind: 'csv', text, html: csvToHtml(text), summary: summarize(text) };
  }
  if (type === 'application/json' || ext === 'json') {
    let formatted = text;
    try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch { /* Keep original JSON-ish text. */ }
    return { kind: 'json', text: formatted, html: `<pre>${escapeHtml(formatted)}</pre>`, summary: summarize(formatted) };
  }

  return {
    kind: ext === 'md' || ext === 'markdown' ? 'markdown' : 'text',
    text,
    html: paragraphsFromText(text),
    summary: summarize(text),
  };
}