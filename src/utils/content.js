import DOMPurify from 'dompurify';

export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html || '', {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
  });
}

export function htmlToText(html) {
  const documentValue = new DOMParser().parseFromString(html || '', 'text/html');
  return (documentValue.body.textContent || '').replace(/\s+/g, ' ').trim();
}

export function getSourceDomain(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function extractWikiLinks(text) {
  const links = new Set();
  const pattern = /\[\[([^\]]{1,160})\]\]/g;
  let match;
  while ((match = pattern.exec(text || '')) !== null) {
    const title = match[1].trim();
    if (title) links.add(title);
  }
  return [...links];
}

export function suggestMetadata(title, text, sourceUrl) {
  const haystack = `${title} ${text} ${sourceUrl}`.toLowerCase();
  const rules = [
    { category: 'Artificial Intelligence/LLM Agents', tags: ['AI Agents', 'LLM'], terms: ['agentic', 'llm agent', 'tool-using', 'prompt injection'] },
    { category: 'Artificial Intelligence/Computer Vision', tags: ['Computer Vision', 'Deep Learning'], terms: ['computer vision', 'yolo', 'image recognition', 'object detection'] },
    { category: 'Artificial Intelligence/Gait Recognition', tags: ['Gait', 'Biometrics'], terms: ['gait', 'walking recognition', 'biometric'] },
    { category: 'Research/Paper Writing', tags: ['Research', 'Academic Writing'], terms: ['research paper', 'journal', 'peer review', 'methodology'] },
    { category: 'Technology/Web Development', tags: ['Web Development'], terms: ['html', 'css', 'javascript', 'react', 'website'] },
    { category: 'Technology/Firebase', tags: ['Firebase', 'Cloud'], terms: ['firebase', 'firestore', 'google drive'] },
    { category: 'Career/Opportunities', tags: ['Career'], terms: ['postdoc', 'job opening', 'fellowship', 'application'] },
    { category: 'Security', tags: ['Security', 'Privacy'], terms: ['security', 'privacy', 'encryption', 'authentication'] },
  ];

  const matched = rules.find((rule) => rule.terms.some((term) => haystack.includes(term)));
  const domain = getSourceDomain(sourceUrl);
  return {
    category: matched?.category || (domain ? `Sources/${domain}` : 'Uncategorised'),
    tags: matched?.tags || [],
    summary: text.trim().slice(0, 240),
  };
}

export function splitHtmlIntoPages(html, maxCharacters = 1700) {
  const clean = sanitizeHtml(html);
  const parsed = new DOMParser().parseFromString(`<main>${clean}</main>`, 'text/html');
  const root = parsed.body.firstElementChild;
  const blocks = root ? [...root.childNodes] : [];
  const pages = [];
  let buffer = '';
  let length = 0;

  for (const block of blocks) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(block.cloneNode(true));
    const blockHtml = wrapper.innerHTML;
    const blockLength = (block.textContent || '').length + 50;

    if (buffer && length + blockLength > maxCharacters) {
      pages.push(buffer);
      buffer = '';
      length = 0;
    }

    buffer += blockHtml;
    length += blockLength;
  }

  if (buffer) pages.push(buffer);
  return pages.length ? pages : ['<p>This page is empty.</p>'];
}

export function linkifyWikiHtml(html, pages) {
  const clean = sanitizeHtml(html);
  const parsed = new DOMParser().parseFromString(`<main>${clean}</main>`, 'text/html');
  const root = parsed.body.firstElementChild;
  if (!root) return clean;

  const pageMap = new Map(
    pages
      .filter((page) => !page.secure && page.title)
      .map((page) => [page.title.trim().toLowerCase(), page]),
  );

  const walker = parsed.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);

  for (const textNode of textNodes) {
    const parentTag = textNode.parentElement?.tagName?.toLowerCase();
    if (['a', 'code', 'pre', 'script', 'style'].includes(parentTag)) continue;
    const value = textNode.nodeValue || '';
    if (!value.includes('[[')) continue;

    const fragment = parsed.createDocumentFragment();
    const pattern = /\[\[([^\]]{1,160})\]\]/g;
    let cursor = 0;
    let match;

    while ((match = pattern.exec(value)) !== null) {
      fragment.append(value.slice(cursor, match.index));
      const title = match[1].trim();
      const target = pageMap.get(title.toLowerCase());
      const element = parsed.createElement(target ? 'a' : 'span');
      element.textContent = title;
      element.className = target ? 'wiki-link' : 'wiki-missing';
      if (target) element.setAttribute('href', `#/read/${target.id}`);
      fragment.append(element);
      cursor = pattern.lastIndex;
    }

    fragment.append(value.slice(cursor));
    textNode.replaceWith(fragment);
  }

  return sanitizeHtml(root.innerHTML);
}

export function timestampToDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value) {
  const date = timestampToDate(value);
  return date
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Just now';
}

