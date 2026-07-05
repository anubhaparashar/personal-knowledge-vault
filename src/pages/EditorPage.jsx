import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import RichEditor from '../components/RichEditor';
import UnlockPanel from '../components/UnlockPanel';
import { useAuth } from '../context/AuthContext';
import { decryptObject, encryptObject } from '../utils/crypto';
import {
  extractWikiLinks,
  getSourceDomain,
  htmlToText,
  suggestMetadata,
} from '../utils/content';
import { createPageId, removePage, savePage } from '../services/pages';
import {
  deleteDriveFile,
  driveFileKey,
  getDriveFileLink,
  uploadDriveFile,
} from '../services/drive';

const EMPTY_FORM = {
  title: '',
  category: '',
  tagsText: '',
  sourceUrl: '',
  summary: '',
  html: '<p></p>',
};

export default function EditorPage({ routeId, pages, pagesLoaded }) {
  const { user } = useAuth();
  const isNew = routeId === 'new';
  const pageId = useMemo(() => (isNew ? createPageId(user.uid) : routeId), [isNew, routeId, user.uid]);
  const existing = pages.find((page) => page.id === routeId);
  const [form, setForm] = useState(EMPTY_FORM);
  const [secure, setSecure] = useState(false);
  const [unlocked, setUnlocked] = useState(isNew);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [inlineFiles, setInlineFiles] = useState([]);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isNew) {
      setForm(EMPTY_FORM);
      setSecure(false);
      setUnlocked(true);
      setAttachments([]);
      setInlineFiles([]);
      return;
    }
    if (!existing) return;
    setSecure(Boolean(existing.secure));
    if (existing.secure) {
      setUnlocked(false);
      setForm(EMPTY_FORM);
      setAttachments([]);
      setInlineFiles([]);
    } else {
      setUnlocked(true);
      setForm({
        title: existing.title || '',
        category: existing.category || '',
        tagsText: (existing.tags || []).join(', '),
        sourceUrl: existing.sourceUrl || '',
        summary: existing.summary || '',
        html: existing.html || '<p></p>',
      });
      setAttachments(existing.attachments || []);
      setInlineFiles(existing.inlineFiles || []);
    }
  }, [existing?.id, isNew]);

  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }));

  async function unlockExisting(value) {
    const decrypted = await decryptObject(existing.encryption, value);
    setForm({
      title: decrypted.title || '',
      category: decrypted.category || 'Private Vault',
      tagsText: (decrypted.tags || []).join(', '),
      sourceUrl: decrypted.sourceUrl || '',
      summary: decrypted.summary || '',
      html: decrypted.html || '<p></p>',
    });
    setPassphrase(value);
    setUnlocked(true);
  }

  const handleInlineImage = useCallback(async (file) => {
    if (secure) throw new Error('Images are disabled inside encrypted secure notes.');
    setProgress(1);
    try {
      const uploaded = await uploadDriveFile(user.uid, pageId, file, setProgress);
      setInlineFiles((current) => [...current, uploaded]);
      return uploaded;
    } finally {
      setProgress(0);
    }
  }, [pageId, secure, user.uid]);

  async function handleAttachment(event) {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (!files.length) return;
    if (secure) {
      window.alert('Attachments are disabled for encrypted secure notes. Store passwords in a dedicated password manager.');
      return;
    }
    try {
      for (const file of files) {
        setProgress(1);
        const uploaded = await uploadDriveFile(user.uid, pageId, file, setProgress);
        setAttachments((current) => [...current, uploaded]);
      }
    } catch (error) {
      window.alert(error.message);
    } finally {
      setProgress(0);
    }
  }

  async function removeAttachment(item, inline = false) {
    if (!window.confirm(`Remove ${item.name} from this page and delete the Google Drive file?`)) return;
    try {
      await deleteDriveFile(item.driveFileId);
      const key = driveFileKey(item);
      if (inline) setInlineFiles((current) => current.filter((file) => driveFileKey(file) !== key));
      else setAttachments((current) => current.filter((file) => driveFileKey(file) !== key));
    } catch (error) {
      window.alert(error.message);
    }
  }

  function toggleSecure(checked) {
    if (checked && (attachments.length || inlineFiles.length || form.html.includes('<img'))) {
      window.alert('Remove Google Drive images and attachments before converting this page into an encrypted secure note.');
      return;
    }
    setSecure(checked);
  }

  function autoCategorise() {
    const suggestion = suggestMetadata(form.title, htmlToText(form.html), form.sourceUrl);
    update('category', suggestion.category);
    if (!form.tagsText.trim()) update('tagsText', suggestion.tags.join(', '));
    if (!form.summary.trim()) update('summary', suggestion.summary);
  }

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    const plainText = htmlToText(form.html);
    const tags = form.tagsText.split(',').map((tag) => tag.trim()).filter(Boolean);

    if (!form.title.trim()) return setMessage('Add a title.');
    if (!plainText && !attachments.length) return setMessage('Add some content or an attachment.');
    if (secure && passphrase.length < 12) return setMessage('Secure notes require a passphrase of at least 12 characters.');
    if (secure && isNew && passphrase !== confirmPassphrase) return setMessage('The two passphrases do not match.');

    setSaving(true);
    try {
      let data;
      if (secure) {
        const encryption = await encryptObject({
          title: form.title.trim(),
          category: form.category.trim() || 'Private Vault',
          tags,
          sourceUrl: form.sourceUrl.trim(),
          summary: form.summary.trim(),
          html: form.html,
        }, passphrase);

        data = {
          secure: true,
          title: 'Locked note',
          category: 'Private Vault',
          tags: [],
          sourceUrl: '',
          sourceDomain: '',
          summary: '',
          html: '',
          plainText: '',
          wikiLinks: [],
          attachments: [],
          inlineFiles: [],
          encryption,
        };
      } else {
        data = {
          secure: false,
          encryption: null,
          title: form.title.trim(),
          category: form.category.trim() || 'Uncategorised',
          tags,
          sourceUrl: form.sourceUrl.trim(),
          sourceDomain: getSourceDomain(form.sourceUrl.trim()),
          summary: form.summary.trim() || plainText.slice(0, 240),
          html: form.html,
          plainText,
          wikiLinks: extractWikiLinks(plainText),
          attachments,
          inlineFiles,
        };
      }

      await savePage(user.uid, pageId, data, isNew);
      window.location.hash = `#/read/${pageId}`;
    } catch (error) {
      setMessage(error.message || 'The page could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrent() {
    if (isNew || !existing) return;
    if (!window.confirm('Delete this page permanently?')) return;
    setSaving(true);
    try {
      const files = [...(existing.attachments || []), ...(existing.inlineFiles || [])];
      await Promise.allSettled(files.map((file) => deleteDriveFile(file.driveFileId)));
      await removePage(user.uid, existing.id);
      window.location.hash = '#/';
    } catch (error) {
      setMessage(error.message);
      setSaving(false);
    }
  }

  if (!isNew && !pagesLoaded) {
    return <AppShell title="Edit page"><div className="empty-state">Loading page...</div></AppShell>;
  }

  if (!isNew && pagesLoaded && !existing) {
    return <AppShell title="Page not found"><div className="empty-state">This page does not exist.</div></AppShell>;
  }

  if (existing?.secure && !unlocked) {
    return <AppShell title="Secure note"><UnlockPanel onUnlock={unlockExisting} title="Unlock note to edit" /></AppShell>;
  }

  return (
    <AppShell title={isNew ? 'Quick Capture' : 'Edit Page'}>
      <form className="editor-layout" onSubmit={submit}>
        <section className="editor-main">
          <label className="field-label title-field">
            Page title
            <input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Give this page a clear title" required />
          </label>

          <RichEditor
            key={`${pageId}-${secure}`}
            initialHtml={form.html}
            onChange={(html) => update('html', html)}
            onImageFile={handleInlineImage}
            disableImages={secure}
          />

          {!secure ? (
            <section className="attachment-box">
              <div>
                <h3>Google Drive files</h3>
                <p>Upload images, PDF, text, Markdown, JSON or Word files to Google Drive. Firestore stores only Drive IDs, links and metadata.</p>
              </div>
              <label className="button secondary file-button">
                Add Drive files
                <input type="file" multiple hidden onChange={handleAttachment} />
              </label>
              {progress ? <progress value={progress} max="100">{progress}%</progress> : null}
              {attachments.length ? (
                <div className="file-list">
                  {attachments.map((item) => (
                    <div key={driveFileKey(item)}><a href={getDriveFileLink(item)} target="_blank" rel="noreferrer">{item.name}</a><button type="button" onClick={() => removeAttachment(item)}>Remove</button></div>
                  ))}
                </div>
              ) : null}
              {inlineFiles.length ? (
                <details>
                  <summary>{inlineFiles.length} inline Drive image file(s)</summary>
                  <div className="file-list">
                    {inlineFiles.map((item) => (
                      <div key={driveFileKey(item)}><span>{item.name}</span><button type="button" onClick={() => removeAttachment(item, true)}>Delete file</button></div>
                    ))}
                  </div>
                </details>
              ) : null}
            </section>
          ) : (
            <p className="warning-note">Secure notes are text-only. Images and attachments are disabled so separate Google Drive files do not expose sensitive material.</p>
          )}
        </section>

        <aside className="editor-meta">
          <h2>Page details</h2>
          <label className="field-label">Category path<input value={form.category} onChange={(event) => update('category', event.target.value)} placeholder="AI/LLM Agents" /></label>
          <label className="field-label">Tags<input value={form.tagsText} onChange={(event) => update('tagsText', event.target.value)} placeholder="Research, Safety, LLM" /></label>
          <label className="field-label">Original source URL<input type="url" value={form.sourceUrl} onChange={(event) => update('sourceUrl', event.target.value)} placeholder="https://..." /></label>
          <label className="field-label">Summary<textarea rows="4" value={form.summary} onChange={(event) => update('summary', event.target.value)} placeholder="Short description for the index" /></label>
          <button type="button" className="button secondary full" onClick={autoCategorise}>Suggest category and tags</button>

          <div className="secure-toggle">
            <label><input type="checkbox" checked={secure} onChange={(event) => toggleSecure(event.target.checked)} /> Encrypt as a secure note</label>
            <p>The title and content will be encrypted. The public index will display only "Locked note".</p>
          </div>

          {secure ? (
            <div className="secure-fields">
              <label className="field-label">Master passphrase<input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} minLength="12" autoComplete="new-password" /></label>
              {isNew ? <label className="field-label">Confirm passphrase<input type="password" value={confirmPassphrase} onChange={(event) => setConfirmPassphrase(event.target.value)} minLength="12" autoComplete="new-password" /></label> : null}
              <p className="small-note">There is no password recovery. Losing this passphrase means losing the note.</p>
            </div>
          ) : null}

          <p className="small-note">Use <code>[[Exact Page Title]]</code> in the editor to create an internal link and backlink.</p>
          {message ? <p className="form-error">{message}</p> : null}
          <button className="button primary full" disabled={saving}>{saving ? 'Saving...' : 'Save page'}</button>
          {!isNew ? <button type="button" className="button danger full" disabled={saving} onClick={deleteCurrent}>Delete page</button> : null}
        </aside>
      </form>
    </AppShell>
  );
}

