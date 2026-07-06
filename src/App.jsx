import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { subscribePages } from './services/pages';
import { subscribePdfs } from './services/pdfs';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EditorPage from './pages/EditorPage';
import ReaderPage from './pages/ReaderPage';
import SettingsPage from './pages/SettingsPage';
import PdfsPage from './pages/PdfsPage';

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const handler = () => setHash(window.location.hash || '#/');
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

  useEffect(() => {
    if (!user) {
      setPages([]);
      setPagesLoaded(false);
      setPdfs([]);
      setPdfsLoaded(false);
      return undefined;
    }
    setPagesError('');
    setPdfsError('');
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
    return () => {
      unsubscribePages?.();
      unsubscribePdfs?.();
    };
  }, [user]);

  if (loading) return <div className="app-loading">Opening your private library...</div>;
  if (!user) return <LoginPage />;

  const [section = '', id] = route;
  if (section === 'edit') return <EditorPage key={`edit-${id}`} routeId={id || 'new'} pages={pages} pagesLoaded={pagesLoaded} />;
  if (section === 'read' && id) return <ReaderPage key={`read-${id}`} pageId={id} pages={pages} pdfs={pdfs} pagesLoaded={pagesLoaded} />;
  if (section === 'pdfs') return <PdfsPage pages={pages} pdfs={pdfs} loading={!pdfsLoaded} error={pdfsError} initialPdfId={id || ''} />;
  if (section === 'settings') return <SettingsPage pages={pages} pdfs={pdfs} />;
  const dashboardFocus = section || 'overview';
  return <DashboardPage pages={pages} pdfs={pdfs} loading={!pagesLoaded} error={pagesError || pdfsError} focus={dashboardFocus} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
