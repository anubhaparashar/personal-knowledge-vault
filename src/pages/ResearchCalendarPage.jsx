import React, { useState } from 'react';
import AppShell from '../components/AppShell';
import ResearchCalendar from '../components/ResearchCalendar';
import { useAuth } from '../context/AuthContext';
import { savePage } from '../services/pages';
import { applyDateToPage, removeDateFromPage } from '../utils/researchDates';

export default function ResearchCalendarPage({ pages, loading, error }) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');

  async function saveDate(input) {
    const page = pages.find((item) => item.id === input.pageId);
    if (!page) throw new Error('Choose a related entry before saving the date.');
    const importantDates = applyDateToPage(page, input);
    await savePage(user.uid, page.id, { importantDates }, false);
    setMessage('Date saved.');
  }

  async function deleteDate(event) {
    const page = pages.find((item) => item.id === event.pageId);
    if (!page) return;
    await savePage(user.uid, page.id, { importantDates: removeDateFromPage(page, event) }, false);
    setMessage('Date deleted.');
  }

  async function completeDate(event) {
    const page = pages.find((item) => item.id === event.pageId);
    if (!page) return;
    const importantDates = applyDateToPage(page, { ...event, completed: true, status: 'completed', confirmed: true });
    await savePage(user.uid, page.id, { importantDates }, false);
    setMessage('Date marked completed.');
  }

  return (
    <AppShell title="Research Calendar">
      {message ? <p className="status-message calendar-status-message">{message}</p> : null}
      <ResearchCalendar
        pages={pages}
        loading={loading}
        error={error}
        onSaveDate={saveDate}
        onDeleteDate={deleteDate}
        onCompleteDate={completeDate}
      />
    </AppShell>
  );
}