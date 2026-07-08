const VAULT_URL = 'https://anubhaparashar.github.io/personal-knowledge-vault/';

function status(message) {
  document.getElementById('status').textContent = message;
}

function captureUrl(payload = {}) {
  const params = new URLSearchParams();
  params.set('share-target', '1');
  if (payload.title) params.set('title', payload.title);
  if (payload.text) params.set('text', payload.text);
  if (payload.url) params.set('url', payload.url);
  if (payload.category) params.set('category', payload.category);
  return `${VAULT_URL}?${params.toString()}`;
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function selectedText(tab) {
  const [{ result = '' } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => String(window.getSelection?.() || ''),
  });
  return result;
}

async function openCapture({ selectionOnly = false } = {}) {
  const tab = await currentTab();
  const text = await selectedText(tab).catch(() => '');
  const category = document.getElementById('category').value;
  if (selectionOnly && !text.trim()) {
    status('No selected text found.');
    return;
  }
  await chrome.tabs.create({
    url: captureUrl({
      title: tab.title || 'Current page',
      text,
      url: tab.url || '',
      category,
    }),
  });
  status('Sent to Shared Inbox.');
}

document.getElementById('save-page').addEventListener('click', () => openCapture());
document.getElementById('save-selection').addEventListener('click', () => openCapture({ selectionOnly: true }));
document.getElementById('open-inbox').addEventListener('click', () => chrome.tabs.create({ url: `${VAULT_URL}#/shared-inbox` }));
