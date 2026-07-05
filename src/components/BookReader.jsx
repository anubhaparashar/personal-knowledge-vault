import React, { forwardRef, useMemo, useRef } from 'react';
import HTMLFlipBook from 'react-pageflip';
import { sanitizeHtml, splitHtmlIntoPages } from '../utils/content';

const BookPage = forwardRef(function BookPage({ html, number, title, cover }, ref) {
  return (
    <div className={`book-page ${cover ? 'book-cover' : ''}`} ref={ref}>
      <div className="book-page-inner">
        {cover ? (
          <div className="cover-content">
            <p>MY KNOWLEDGE VAULT</p>
            <h2>{title}</h2>
            <span>Private digital edition</span>
          </div>
        ) : (
          <div className="reader-prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
        )}
        {!cover ? <small className="page-number">{number}</small> : null}
      </div>
    </div>
  );
});

export default function BookReader({ title, html }) {
  const bookRef = useRef(null);
  const contentPages = useMemo(() => splitHtmlIntoPages(html), [html]);
  const pages = ['__cover__', ...contentPages];
  if (pages.length % 2 !== 0) pages.push('<p></p>');

  return (
    <div className="book-reader-wrap">
      <div className="book-controls">
        <button className="button secondary" onClick={() => bookRef.current?.pageFlip().flipPrev()}>← Previous</button>
        <button className="button secondary" onClick={() => bookRef.current?.pageFlip().flipNext()}>Next →</button>
      </div>
      <HTMLFlipBook
        ref={bookRef}
        width={430}
        height={610}
        size="stretch"
        minWidth={280}
        maxWidth={520}
        minHeight={420}
        maxHeight={720}
        maxShadowOpacity={0.35}
        showCover
        mobileScrollSupport
        usePortrait
        className="flip-book"
      >
        {pages.map((pageHtml, index) => (
          <BookPage
            key={`${index}-${pageHtml.slice(0, 20)}`}
            title={title}
            html={pageHtml === '__cover__' ? '' : pageHtml}
            number={index}
            cover={pageHtml === '__cover__'}
          />
        ))}
      </HTMLFlipBook>
    </div>
  );
}
