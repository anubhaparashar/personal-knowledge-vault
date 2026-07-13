import React, { useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { savePage, subscribePages } from './services/pages';
import { parseShareLaunch, putLocalCapture, replaceShareLaunchUrl } from './services/shareCapture';
import { subscribeSharedInbox, syncPendingLocalCaptures } from './services/sharedInbox';
import { subscribePdfs } from './services/pdfs';
import { DATE_ANALYSIS_VERSION, migrateLegacyPageDates } from './utils/dates';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EditorPage from './pages/EditorPage';
import ReaderPage from './pages/ReaderPage';
import SettingsPage from './pages/SettingsPage';
import PdfsPage from './pages/PdfsPage';
import ResearchCalendarPage from './pages/ResearchCalendarPage';
import ShareCapturePage from './pages/ShareCapturePage';
import SharedInboxPage from './pages/SharedInboxPage';

function currentHashRoute() {
  return window.location.hash || '#/';
}

function logRoute(hash) {
  console.info('[app] current route', { route: hash || '#/' });
}

function useHashRoute() {
  const [hash, setHash] = useState(currentHashRoute);
  useEffect(() => {
    logRoute(currentHashRoute());
    const handler = () => {
      const nextHash = currentHashRoute();
      logRoute(nextHash);
      setHash(nextHash);
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

function AuthenticatedApp() {
  const { user, loading } = useAuth();
  const route = useHashRoute();
  const [pages, setPages] = useState([]);
  const [pagesLoaded, setPagesLoaded] = useState(false);
  const [pagesError, setPagesError] = useState('');
  const [pdfs, setPdfs] = useState([]);
  const [pdfsLoaded, setPdfsLoaded] = useState(false);
  const [pdfsError, setPdfsError] = useState('');
    const [sharedInbox, setSharedInbox] = useState([]);
  const [sharedInboxLoaded, setSharedInboxLoaded] = useState(false);
  const [sharedInboxError, setSharedInboxError] = useState('');
  const [shareLaunchChecked, setShareLaunchChecked] = useState(false);
  const dateMigrationStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function captureLaunchPayload() {
      const payload = parseShareLaunch(window.location.search);
      if (!payload) {
        setShareLaunchChecked(true);
        return;
      }
      try {
        const saved = await putLocalCapture(payload);
        if (cancelled) return;
        replaceShareLaunchUrl(saved.id);
        window.dispatchEvent(new Event('hashchange'));
      } catch (error) {
        console.warn('[ShareCapture] Could not preserve share payload:', error);
      } finally {
        if (!cancelled) setShareLaunchChecked(true);
      }
    }
    captureLaunchPayload();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setPages([]);
      setPagesLoaded(false);
      setPdfs([]);
      setPdfsLoaded(false);
      setSharedInbox([]);
      setSharedInboxLoaded(false);
      return undefined;
    }
    setPagesError('');
    setPdfsError('');
    setSharedInboxError('');
    const unsubscribePages = subscribePages(
      user.uid,
      (items) => {
        setPages(items);
        setPagesLoaded(true);
      },
      (error) => {
        setPagesError(error.message);
        setPagesLoaded(true);
      },
    );
    const unsubscribePdfs = subscribePdfs(
      user.uid,
      (items) => {
        setPdfs(items);
        setPdfsLoaded(true);
      },
      (error) => {
        setPdfsError(error.message);
        setPdfsLoaded(true);
      },
    );
    const unsubscribeSharedInbox = subscribeSharedInbox(
      user.uid,
      (items) => {
        setSharedInbox(items);
        setSharedInboxLoaded(true);
      },
      (error) => {
        setSharedInboxError(error.message);
        setSharedInboxLoaded(true);
      },
    );
    syncPendingLocalCaptures(user.uid).catch((error) => {
      console.warn('[ShareCapture] Pending local sync failed:', error);
    });
    return () => {
      unsubscribePages?.();
      unsubscribePdfs?.();
      unsubscribeSharedInbox?.();
    };
  }, [user]);

  useEffect(() => {
    dateMigrationStartedRef.current = false;
  }, [user?.uid]);

  useEffect(() => {
    if (!user || !pagesLoaded || dateMigrationStartedRef.current) return;
    const migrationKey = `kv-date-migration:${user.uid}:v${DATE_ANALYSIS_VERSION}`;
    if (window.localStorage.getItem(migrationKey) === 'complete') return;

    dateMigrationStartedRef.current = true;
    let cancelled = false;

    async function runLegacyDateMigration() {
      try {
        for (const page of pages) {
          if (cancelled) return;
          const result = migrateLegacyPageDates(page);
          if (!result.changed) continue;
          await savePage(user.uid, page.id, result.analysisPatch, false);
        }
        if (!cancelled) window.localStorage.setItem(migrationKey, 'complete');
      } catch (error) {
        dateMigrationStartedRef.current = false;
        console.warn('Automatic date migration failed', error);
      }
    }

    window.setTimeout(runLegacyDateMigration, 0);
    return () => {
      cancelled = true;
    };
  }, [pages, pagesLoaded, user]);

  if (!shareLaunchChecked) return <div className="app-loading">Capturing shared item...</div>;

  const [section = '', id] = route;
  if (section === 'share-capture' && id) return <ShareCapturePage captureId={id} pages={pages} sharedInbox={sharedInbox} />;
  if (loading) return <div className="app-loading">Opening your private library...</div>;
  if (!user) return <LoginPage />;
  if (section === 'edit') return <EditorPage key={`edit-${id}`} routeId={id || 'new'} pages={pages} pagesLoaded={pagesLoaded} />;
  if (section === 'read' && id) return <ReaderPage key={`read-${id}`} pageId={id} pages={pages} pdfs={pdfs} pagesLoaded={pagesLoaded} />;
  if (section === 'pdfs') return <PdfsPage pages={pages} pdfs={pdfs} loading={!pdfsLoaded} error={pdfsError} initialPdfId={id || ''} />;
  if (section === 'settings') return <SettingsPage pages={pages} pdfs={pdfs} />;
  if (section === 'calendar' || section === 'research-calendar') return <ResearchCalendarPage pages={pages} loading={!pagesLoaded} error={pagesError || pdfsError} />;
  if (section === 'shared-inbox') return <SharedInboxPage pages={pages} captures={sharedInbox} loading={!sharedInboxLoaded} error={sharedInboxError} />;
  const dashboardFocus = section || 'overview';
  return <DashboardPage pages={pages} pdfs={pdfs} loading={!pagesLoaded} error={pagesError || pdfsError || sharedInboxError} focus={dashboardFocus} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
