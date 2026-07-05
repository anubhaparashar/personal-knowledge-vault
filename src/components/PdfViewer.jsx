import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import HTMLFlipBook from 'react-pageflip';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function countMatches(text, query) {
  if (!query) return 0;
  return text.toLowerCase().split(query.toLowerCase()).length - 1;
}

function PdfCanvasPage({ pdf, pageNumber, zoom = 1, className = '' }) {
  const canvasRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!pdf) return undefined;

    let cancelled = false;
    let renderTask = null;

    async function render() {
      try {
        setError('');
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: clamp(zoom, 0.3, 3) });
        const outputScale = window.devicePixelRatio || 1;
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const context = canvas.getContext('2d');
        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
        });
        await renderTask.promise;
      } catch (renderError) {
        if (!cancelled && renderError?.name !== 'RenderingCancelledException') {
          setError(renderError.message || 'Could not render this page.');
        }
      }
    }

    render();

    return () => {
      cancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [pdf, pageNumber, zoom]);

  return (
    <div className={`pdf-page-frame ${className}`}>
      <canvas ref={canvasRef} aria-label={`PDF page ${pageNumber}`} />
      {error ? <p className="form-error">{error}</p> : null}
      <small>Page {pageNumber}</small>
    </div>
  );
}

function PdfThumbnail({ pdf, pageNumber, active, onClick }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!pdf) return undefined;
    let cancelled = false;
    let renderTask = null;

    async function render() {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 0.22 });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      await renderTask.promise.catch(() => {});
    }

    render().catch(() => {});

    return () => {
      cancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [pdf, pageNumber]);

  return (
    <button className={`pdf-thumbnail ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      <canvas ref={canvasRef} />
      <span>{pageNumber}</span>
    </button>
  );
}

const PdfBookPage = forwardRef(function PdfBookPage({ pdf, pageNumber, zoom }, ref) {
  return (
    <div className="pdf-book-page" ref={ref}>
      <PdfCanvasPage pdf={pdf} pageNumber={pageNumber} zoom={zoom} />
    </div>
  );
});

export default function PdfViewer({ blobUrl, title, onDownload }) {
  const viewerRef = useRef(null);
  const bookRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('scroll');
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [activeMatch, setActiveMatch] = useState(0);
  const [searchStatus, setSearchStatus] = useState('');

  useEffect(() => {
    if (!blobUrl) return undefined;
    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument(blobUrl);
    setLoading(true);
    setError('');
    setPdf(null);
    setMatches([]);
    setSearchStatus('');

    loadingTask.promise
      .then((document) => {
        if (cancelled) {
          document.destroy();
          return;
        }
        setPdf(document);
        setPageNumber(1);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || 'Could not load this PDF.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [blobUrl]);

  const pageNumbers = useMemo(() => {
    if (!pdf) return [];
    return Array.from({ length: pdf.numPages }, (_, index) => index + 1);
  }, [pdf]);

  async function runSearch(event) {
    event.preventDefault();
    if (!pdf) return;
    const term = query.trim();
    if (!term) {
      setMatches([]);
      setSearchStatus('');
      return;
    }

    setSearchStatus('Searching...');
    const found = [];
    try {
      for (let current = 1; current <= pdf.numPages; current += 1) {
        const page = await pdf.getPage(current);
        const text = await page.getTextContent();
        const combined = text.items.map((item) => item.str || '').join(' ');
        const count = countMatches(combined, term);
        if (count) found.push({ page: current, count });
      }
      setMatches(found);
      setActiveMatch(0);
      if (found.length) {
        setPageNumber(found[0].page);
        setMode((currentMode) => (currentMode === 'scroll' ? currentMode : 'page'));
        setSearchStatus(`${found.reduce((sum, item) => sum + item.count, 0)} match(es) on ${found.length} page(s).`);
      } else {
        setSearchStatus('No matches found.');
      }
    } catch {
      setMatches([]);
      setSearchStatus('Search text is not available for this PDF.');
    }
  }

  function jumpToMatch(offset) {
    if (!matches.length) return;
    const next = (activeMatch + offset + matches.length) % matches.length;
    setActiveMatch(next);
    setPageNumber(matches[next].page);
    setMode('page');
  }

  function changePage(nextPage) {
    setPageNumber(clamp(nextPage, 1, pdf?.numPages || 1));
  }

  async function toggleFullScreen() {
    if (!document.fullscreenElement) {
      await viewerRef.current?.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  }

  if (loading) return <div className="empty-state">Loading PDF...</div>;
  if (error) return <div className="empty-state form-error">{error}</div>;
  if (!pdf) return <div className="empty-state">Select a PDF to open it here.</div>;

  return (
    <section className="pdf-viewer" ref={viewerRef}>
      <div className="pdf-toolbar">
        <div>
          <strong>{title}</strong>
          <small>{pdf.numPages} page(s)</small>
        </div>
        <div className="segmented-control pdf-mode-switch" role="group" aria-label="PDF viewing mode">
          <button className={mode === 'scroll' ? 'active' : ''} type="button" onClick={() => setMode('scroll')}>Scroll</button>
          <button className={mode === 'page' ? 'active' : ''} type="button" onClick={() => setMode('page')}>Page</button>
          <button className={mode === 'book' ? 'active' : ''} type="button" onClick={() => setMode('book')}>Book</button>
        </div>
        <div className="pdf-zoom-controls">
          <button className="button secondary" type="button" onClick={() => setZoom((value) => clamp(Number((value - 0.1).toFixed(2)), 0.5, 2.5))}>-</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="button secondary" type="button" onClick={() => setZoom((value) => clamp(Number((value + 0.1).toFixed(2)), 0.5, 2.5))}>+</button>
        </div>
        <button className="button secondary" type="button" onClick={toggleFullScreen}>Full screen</button>
        <button className="button secondary" type="button" onClick={onDownload}>Download</button>
      </div>

      <form className="pdf-search-bar" onSubmit={runSearch}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search within PDF" />
        <button className="button secondary" type="submit">Search</button>
        <button className="button secondary" type="button" disabled={!matches.length} onClick={() => jumpToMatch(-1)}>Previous</button>
        <button className="button secondary" type="button" disabled={!matches.length} onClick={() => jumpToMatch(1)}>Next</button>
        {searchStatus ? <span>{searchStatus}</span> : null}
      </form>

      <div className="pdf-workspace">
        <aside className="pdf-thumbnails" aria-label="PDF thumbnails">
          {pageNumbers.map((number) => (
            <PdfThumbnail key={number} pdf={pdf} pageNumber={number} active={number === pageNumber} onClick={() => changePage(number)} />
          ))}
        </aside>

        <div className="pdf-stage">
          {mode === 'scroll' ? (
            <div className="pdf-scroll-pages">
              {pageNumbers.map((number) => <PdfCanvasPage key={number} pdf={pdf} pageNumber={number} zoom={zoom} />)}
            </div>
          ) : null}

          {mode === 'page' ? (
            <div className="pdf-single-page">
              <div className="pdf-page-controls">
                <button className="button secondary" type="button" onClick={() => changePage(pageNumber - 1)} disabled={pageNumber <= 1}>Previous</button>
                <span>Page {pageNumber} of {pdf.numPages}</span>
                <button className="button secondary" type="button" onClick={() => changePage(pageNumber + 1)} disabled={pageNumber >= pdf.numPages}>Next</button>
              </div>
              <PdfCanvasPage pdf={pdf} pageNumber={pageNumber} zoom={zoom} />
            </div>
          ) : null}

          {mode === 'book' ? (
            <div className="pdf-book-wrap">
              <div className="book-controls">
                <button className="button secondary" type="button" onClick={() => bookRef.current?.pageFlip().flipPrev()}>Previous</button>
                <button className="button secondary" type="button" onClick={() => bookRef.current?.pageFlip().flipNext()}>Next</button>
              </div>
              <HTMLFlipBook
                ref={bookRef}
                width={430}
                height={610}
                size="stretch"
                minWidth={280}
                maxWidth={560}
                minHeight={420}
                maxHeight={740}
                maxShadowOpacity={0.35}
                mobileScrollSupport
                usePortrait
                className="pdf-flip-book"
              >
                {pageNumbers.map((number) => <PdfBookPage key={number} pdf={pdf} pageNumber={number} zoom={0.72 * zoom} />)}
              </HTMLFlipBook>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
