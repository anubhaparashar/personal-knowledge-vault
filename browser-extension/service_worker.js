const VAULT_URL = 'https://anubhaparashar.github.io/personal-knowledge-vault/';

function captureUrl({ title = '', text = '', url = '', category = '' } = {}) {
  const params = new URLSearchParams();
  params.set('share-target', '1');
  if (title) params.set('title', title);
  if (text) params.set('text', text);
  if (url) params.set('url', url);
  if (category) params.set('category', category);
  return `${VAULT_URL}?${params.toString()}`;
}

async function openCapture(payload) {
  await chrome.tabs.create({ url: captureUrl(payload) });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-page',
    title: 'Save current page to AP Research Vault',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'save-selection',
    title: 'Save selected text to AP Research Vault',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'save-link',
    title: 'Save link to AP Research Vault',
    contexts: ['link'],
  });
  chrome.contextMenus.create({
    id: 'save-image',
    title: 'Save image URL to AP Research Vault',
    contexts: ['image'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'save-link') {
    openCapture({ title: info.linkText || tab?.title || 'Shared link', text: info.selectionText || '', url: info.linkUrl });
    return;
  }
  if (info.menuItemId === 'save-image') {
    openCapture({ title: tab?.title || 'Shared image', text: info.selectionText || 'Image URL', url: info.srcUrl, category: 'Personal Knowledge/Web References' });
    return;
  }
  if (info.menuItemId === 'save-selection') {
    openCapture({ title: tab?.title || 'Selected text', text: info.selectionText || '', url: tab?.url || '' });
    return;
  }
  openCapture({ title: tab?.title || 'Current page', text: info.selectionText || '', url: tab?.url || '' });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'save-to-vault') return false;
  openCapture(message.payload || {}).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
