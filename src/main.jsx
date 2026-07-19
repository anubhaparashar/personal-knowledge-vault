import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { firebaseConfigPresence, isFirebaseConfigured } from './firebase';
import './styles.css';

const APP_VERSION = __APP_VERSION__;
const APP_BASE = import.meta.env.BASE_URL;
const isGitHubPages = window.location.hostname.endsWith('github.io');

function logStartupDiagnostics() {
  console.info('[app] version', { version: APP_VERSION, base: APP_BASE, mode: import.meta.env.MODE });
  console.info('[app] firebase config', { configured: isFirebaseConfigured, presence: firebaseConfigPresence });
  console.info('[app] current route', { route: window.location.hash || '#/' });
}

function renderStartupFailure(error) {
  const root = document.getElementById('root');
  if (!root) return;
  root.replaceChildren();
  const shell = document.createElement('div');
  shell.className = 'startup-fallback';
  const card = document.createElement('article');
  const title = document.createElement('h1');
  title.textContent = 'The app could not start';
  const detail = document.createElement('p');
  detail.textContent = 'Refresh once to load the newest GitHub Pages build. If it still fails, open DevTools and check the console for the startup error.';
  const reason = document.createElement('p');
  reason.textContent = error?.message ? `Error: ${error.message}` : 'Error details were not available.';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Reload app';
  button.addEventListener('click', () => window.location.reload());
  card.append(title, detail, reason, button);
  shell.append(card);
  root.append(shell);
}

async function unregisterGitHubPagesServiceWorkers() {
  if (!('serviceWorker' in navigator) || !isGitHubPages) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations
      .filter((registration) => registration.scope.includes(APP_BASE))
      .map((registration) => registration.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('ap-research-vault')).map((key) => caches.delete(key)));
    }
    console.info('[app] service worker disabled for GitHub Pages', { base: APP_BASE, registrations: registrations.length });
  } catch (error) {
    console.warn('[app] service worker cleanup failed', { message: error?.message });
  }
}

class StartupErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[app] React startup crash', { message: error?.message, stack: error?.stack, componentStack: info?.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="startup-fallback">
          <article>
            <h1>The app could not start</h1>
            <p>Refresh once to load the newest GitHub Pages build. If it still fails, open DevTools and check the console for the startup error.</p>
            <p>{this.state.error?.message ? `Error: ${this.state.error.message}` : 'Error details were not available.'}</p>
            <button type="button" className="button primary" onClick={() => window.location.reload()}>Reload app</button>
          </article>
        </div>
      );
    }
    return this.props.children;
  }
}

window.addEventListener('error', (event) => {
  console.error('[app] uncaught runtime error', { message: event.message, source: event.filename, line: event.lineno, column: event.colno });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[app] unhandled promise rejection', { reason: event.reason?.message || String(event.reason || '') });
});

try {
  logStartupDiagnostics();
  unregisterGitHubPagesServiceWorkers();
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element #root was not found.');
  createRoot(rootElement).render(
    <React.StrictMode>
      <StartupErrorBoundary>
        <App appVersion={APP_VERSION} />
      </StartupErrorBoundary>
    </React.StrictMode>,
  );
} catch (error) {
  console.error('[app] startup render failed', { message: error?.message, stack: error?.stack });
  renderStartupFailure(error);
}

