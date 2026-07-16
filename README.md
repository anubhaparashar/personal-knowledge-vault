# Anubha Parashar Personal Knowledge Vault

A private research library for formatted notes, source links, categories, tags, backlinks, deadlines, encrypted notes, book/scroll reading, backups, downloadable pages, PDFs and attachments.

## Core Features

- Firebase Authentication with a UID/email gate.
- Cloud Firestore records under `users/{uid}/pages/{pageId}`.
- Rich Tiptap editor with pasted formatting, wiki links and backlinks.
- Automatic category selection from local keyword rules.
- Automatic editable tag generation with a Regenerate tags control.
- Server-backed URL import interface for article extraction and metadata.
- Important date detection, confirmation, editing, completion, Google Calendar links and `.ics` download.
- Upcoming Deadlines dashboard with workflow filters.
- In-app reminder panel and opt-in browser notifications.
- Firebase Storage attachments for PDF, DOC, DOCX, TXT, Markdown, CSV, ZIP, PNG, JPG/JPEG and WEBP files.
- PDF and DOCX text extraction in the browser, direct TXT/Markdown/CSV extraction, and ZIP filename listing.
- Client-side AES-GCM encrypted secure notes.
- Book view, scroll view, HTML download, browser Print / Save PDF, JSON backup and restore.
- Dedicated Google Drive PDF library is preserved for existing PDF workflows.
- GitHub Pages compatible static frontend build.

## Storage Model

Page records live in Cloud Firestore. Uploaded page attachments are stored in Firebase Storage at:

```text
users/{uid}/attachments/{pageId}/{generatedFileName}
```

Firestore stores only attachment metadata:

- original filename
- generated Storage path
- download URL or retrievable reference
- MIME type
- size
- uploaded timestamp
- page ID
- user ID

Firestore does not store file bytes. JSON backups include page records, encrypted payloads, deadline metadata, Firebase Storage attachment metadata and Google Drive PDF metadata, but not the binary files themselves.

Secure notes remain text-only. Attachments and inline images are disabled for encrypted notes so private encrypted content is not accidentally exposed through separate file objects.

## Required Firebase Services

Enable these services in the Firebase project used by this repository:

- Firebase Authentication with Google sign-in
- Cloud Firestore
- Firebase Hosting, if deploying there
- Firebase Storage

Add from URL uses Firestore queued requests processed by GitHub Actions. Hybrid discovery mode keeps manual saves instant while automatic discovery runs in the background.

## Install

```bash
npm install
```

For a clean CI-style install:

```bash
npm ci
```

## Environment Variables

Copy the template locally if running the app outside GitHub Actions:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Fill in project-specific values in `.env`. Do not commit `.env`.

The GitHub Pages workflow reads these repository variables during build:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_ALLOWED_EMAIL
VITE_ALLOWED_UID
VITE_GOOGLE_OAUTH_CLIENT_ID
VITE_GOOGLE_API_KEY
VITE_GOOGLE_DRIVE_FOLDER_ID
VITE_GOOGLE_APPROVED_EMAIL
```

## Firestore Rules

`firestore.rules` intentionally contains the placeholder `REPLACE_WITH_YOUR_UID`. Replace it with the real Firebase Authentication UID and deploy the rules before relying on production saves.

```bash
firebase deploy --only firestore:rules
```

Do not hardcode a fake UID. The deployed rules must match the actual account allowed to use the vault.

## Firebase Storage Rules

Storage rules are in `storage.rules`. They allow authenticated users to read, write and delete only inside their own path:

```text
users/{uid}/attachments/{pageId}/{fileName}
```

They also enforce a 25 MB maximum upload size and restrict content types to supported document, archive and image formats.

Deploy them with:

```bash
firebase deploy --only storage:rules
```

## URL Import Queue

`Scrape a Link` writes Firestore requests to `users/{uid}/discoveryRequests/{requestId}`. The `Research Discovery` GitHub Actions workflow processes those requests on the 06:00 IST / 18:00 IST schedule or when run manually.

No URL import endpoint variable is required. See `URL_IMPORT_SETUP.md`.

## Reminders

See `REMINDER_SETUP.md`.

Works immediately:

- dashboard reminder panel
- session dismissal
- Google Calendar links
- `.ics` download

Requires explicit user permission:

- browser notifications

Requires a scheduled backend:

- email reminders
- reminders while the static website is closed
- scheduled push notifications

## Run Locally

```bash
npm run dev
```

Open the Vite URL. Add `localhost` to Firebase Authentication authorized domains if required.

## Build

```bash
npm run build
```

The production site is written to `dist/`.

Preview locally:

```bash
npm run preview
```

## Deploy Frontend to GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` installs with `npm ci`, builds with repository variables, uploads `dist/`, and deploys to GitHub Pages.

After changing repository variables, rerun the workflow manually or push a commit to `main`.

## Deploy Firebase Rules

```bash
firebase deploy --only firestore:rules,storage:rules
```

Deploy Hosting only if you use Firebase Hosting in addition to GitHub Pages:

```bash
npm run build
firebase deploy --only hosting
```

## Google Drive PDF Library

The existing PDF Library remains Google Drive based and uses the Drive `drive.file` scope. Firestore stores PDF metadata and Drive file IDs. Drive file bytes stay in Google Drive.

Required for the Google Drive PDF library:

```text
VITE_GOOGLE_OAUTH_CLIENT_ID
VITE_GOOGLE_APPROVED_EMAIL
VITE_GOOGLE_DRIVE_FOLDER_ID optional
VITE_GOOGLE_API_KEY optional for Google Picker folder selection
```

## Backups

The JSON backup exports page records, encrypted note payloads, categories, tags, backlinks data, deadline data, Storage attachment metadata and Google Drive PDF metadata. It does not export binary attachment or PDF bytes.

Restoring a JSON backup restores metadata and links only when the referenced Firebase Storage objects or Google Drive files still exist and the signed-in account can access them.

## Security Notes

- Imported HTML is sanitized before insertion into the editor.
- Uploaded files are validated by extension, MIME type and size.
- Firebase Storage rules are scoped to authenticated user paths.
- Secure-note passphrases are never stored by the app.
- Public search/index fields for encrypted notes contain only `Locked note` metadata.
- Do not put service credentials, private API keys or `.env` files in the repository.

## Current Limitations

- Category and tag automation uses local keyword rules, not a paid AI API.
- URL import requires a deployed server endpoint because static GitHub Pages cannot bypass browser CORS restrictions.
- Browser notifications depend on browser permission and tab/app lifecycle.
- Email or background reminders require a scheduled backend.
- Old binary DOC files are uploaded but text extraction is unavailable in the browser.
## Share to AP Research Vault

The app is configured as an installable PWA named **AP Research Vault** with a GitHub Pages-safe manifest:

- `start_url`: `/personal-knowledge-vault/`
- `scope`: `/personal-knowledge-vault/`
- `display`: `standalone`
- GET Web Share Target: `./?share-target=1`

Shared links and text are captured into IndexedDB immediately, before Firebase authentication. After sign-in, pending captures sync to `users/{uid}/sharedInbox/{captureId}` and can be reviewed in **Shared Inbox**. High-confidence captures are saved to the vault automatically when authenticated; medium-confidence captures are saved with review suggested; low-confidence and duplicate captures stay in Shared Inbox until confirmed.

Desktop fallbacks:

- Settings includes a **Save to AP Research Vault** bookmarklet.
- `browser-extension/` contains an optional unpacked Chrome/Edge extension.
- Shared Inbox includes a paste fallback for links and post text.

Current platform notes:

- The reliable production share target is link-and-text GET sharing. Multipart file sharing has a service-worker queue scaffold but is not enabled as the primary manifest target so it does not destabilise link/text sharing on GitHub Pages.
- Facebook and LinkedIn content behind login is not bypassed. The shared title/text/URL is preserved and classified even when page extraction fails.
- Android share-sheet appearance requires installing the production PWA on an Android device and sharing a real URL into it.
