# My Knowledge Vault

A private digital knowledge book for capturing web research, links, formatted notes, Google Drive files, and confidential text notes.

## Included features

- Google login with a UID gate plus an email check
- Rich paste editor based on Tiptap
- Paste or upload inline images to Google Drive
- PDF, image, text, Markdown, JSON, and Word attachments stored in Google Drive
- Google Identity Services OAuth for Drive access
- Dedicated Google Drive folder named `Personal Knowledge Vault`
- PDF upload, folder listing, title search, in-site PDF.js viewing, Drive open, download, delete confirmation, metadata refresh, and page linking
- Continuous PDF scroll mode, page-by-page mode, page-turn/book mode, zoom, thumbnails, full-screen viewing, and PDF text search when supported
- Category paths and comma-separated tags
- Local metadata suggestions
- Full-library search for pages and title search for PDFs
- Category, tag, source, and A-Z indexes
- `[[Exact Page Title]]` internal links and automatic backlinks
- Continuous scroll reading and animated book/page-turn reading for knowledge pages
- Per-page HTML download and browser Print / Save PDF
- Complete JSON backup and restore for pages plus PDF metadata
- Client-side AES-GCM encrypted secure notes
- Firebase Authentication, Cloud Firestore, and Firebase Hosting
- Responsive desktop/mobile layout and dark mode

## Storage model

This project does not use Firebase Cloud Storage, Cloud Functions, or any Firebase service that requires the Blaze billing plan.

Uploaded PDFs, images, and attachments are uploaded directly from the browser to Google Drive with the Drive `drive.file` scope. Firestore stores only file metadata:

- Google Drive file ID
- Drive view/download links
- file name, MIME type, size, and Drive timestamps
- provider marker and page/PDF metadata

Firestore does not store file bytes. JSON backups include page records and Drive metadata, not the Drive files themselves.

## Security boundary

Secure notes are encrypted in the browser before being stored in Firestore. The passphrase is not stored by this application. Secure notes intentionally do not permit images or attachments because those files are separate Google Drive objects.

Google Drive files remain restricted in Drive unless you change their sharing settings yourself. The app uses the minimum Drive scope, `https://www.googleapis.com/auth/drive.file`, and does not create `Anyone with the link` permissions. PDFs opened inside the site are downloaded through the authenticated Google Drive API and passed to PDF.js as Blob/Object URLs.

This project is a starter application, not an audited password manager. Store actual account passwords, banking passwords, recovery codes, and API secrets in a dedicated password manager.

## Requirements

- Node.js 22 or newer
- A Firebase project on the Spark plan
- A Google Cloud project with the Google Drive API enabled
- Firebase CLI for deployment

## 1. Install

```bash
npm install
```

## 2. Create a Firebase Spark project

Do not reuse a public website or blog database.

In Firebase Console:

1. Create a new project.
2. Add a Web app.
3. Open Authentication -> Sign-in method and enable Google.
4. Create Cloud Firestore in production mode.
5. Firebase Cloud Storage is not used for PDFs in this app.
6. Cloud Functions are not required for the PDF flow.
7. Copy the Web app configuration values.

## 3. Enable Google Drive API

In Google Cloud Console for the same or a dedicated project:

1. Open APIs & Services -> Library.
2. Search for Google Drive API.
3. Enable Google Drive API.

## 4. Configure the OAuth consent screen

1. Open APIs & Services -> OAuth consent screen.
2. Choose the appropriate user type. For a private single-user app, External with Testing is acceptable if your account is listed as a test user.
3. Add the approved Google account as a test user when using Testing mode.
4. Add only this Drive scope: `https://www.googleapis.com/auth/drive.file`.
5. Do not add broad Drive scopes such as `drive`, `drive.readonly`, or `drive.metadata`.

## 5. Create an OAuth 2.0 Web Client

1. Open APIs & Services -> Credentials.
2. Create Credentials -> OAuth client ID.
3. Application type: Web application.
4. Add local origins:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
5. Add your production origin, for example:
   - `https://YOUR_PROJECT_ID.web.app`
   - `https://YOUR_CUSTOM_DOMAIN`
6. Copy the OAuth Client ID into `VITE_GOOGLE_OAUTH_CLIENT_ID`.

No Google API key is required for Drive REST upload, list, download, delete, or PDF viewing. A Google API key is required only for the Google Picker based Select Drive folder button. If you want in-app folder selection, create an API key, restrict it to your localhost and production HTTP referrers, and set `VITE_GOOGLE_API_KEY`.

## 6. Select the Drive folder

Create or select a Google Drive folder named exactly:

```text
Personal Knowledge Vault
```

Open the folder in Drive and copy the folder ID from the URL:

```text
https://drive.google.com/drive/folders/FOLDER_ID_HERE
```

Set that value as `VITE_GOOGLE_DRIVE_FOLDER_ID`, or use the PDF Library -> Select Drive folder button after configuring `VITE_GOOGLE_API_KEY` for Google Picker. If you leave both blank, the app can create an app-visible folder with the required name after you connect Drive.

Keep the folder Restricted in Google Drive. Do not change it to Anyone with the link.

## 7. Configure environment variables

Copy the environment template:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Fill the Firebase values and these access-control/Drive values:

```env
VITE_ALLOWED_UID=your-firebase-auth-uid
VITE_ALLOWED_EMAIL=your-email@gmail.com
VITE_GOOGLE_OAUTH_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
VITE_GOOGLE_APPROVED_EMAIL=your-email@gmail.com
VITE_GOOGLE_DRIVE_FOLDER_ID=
VITE_GOOGLE_API_KEY=
```

There is no `VITE_FIREBASE_STORAGE_BUCKET` setting because this app does not use Firebase Cloud Storage.

Do not commit `.env`. It is already listed in `.gitignore`. Never put real OAuth client IDs, Firebase values, or API keys in `.env.example`.

## 8. Lock Firestore rules to your UID

In `firestore.rules`, set the UID literal to:

```text
your-firebase-auth-uid
```

Never deploy the placeholder rules unchanged. Firestore stores page records, encrypted note payloads, PDF metadata, attachment metadata, and Drive file IDs. Firestore never stores uploaded file bytes.

## 9. Run locally

```bash
npm run dev
```

Open the local URL shown by Vite. Add `localhost` to Firebase Authentication authorized domains if it is not already present. The first Drive action may open a Google consent prompt.

## 10. Test a production build

```bash
npm run build
npm run preview
```

The production files are created in `dist/`.

## 11. Deploy to Firebase Hosting

Install and log in to Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
```

Initialize the project from this folder:

```bash
firebase use --add
```

Choose the Firebase project for this vault.

Deploy Firestore rules and hosting:

```bash
npm run build
firebase deploy --only firestore:rules,hosting
```

## How to use

### Capture web material

1. Open Quick Capture.
2. Paste copied content into the editor.
3. Paste the original URL.
4. Add a category such as `Artificial Intelligence/LLM Agents`.
5. Add tags separated by commas.
6. Upload images, PDFs, or other attachments. They are stored in Google Drive.
7. Save.

### Add PDFs

1. Open PDF Library.
2. Connect Google Drive with the approved Google account.
3. Confirm the selected folder is `Personal Knowledge Vault`.
4. Upload PDF files.
5. Edit PDF title, description, categories, tags, source URL, notes, and related pages.
6. Use Open here for the authenticated PDF.js viewer, Open in Drive for Google Drive, Download for authenticated download, Refresh Drive file metadata for Drive metadata sync, and Delete only after confirming removal.

### Create links between pages

Write the exact title inside double square brackets:

```text
This is related to [[Runtime Assurance for LLM Agents]].
```

When that page exists, the reader creates a clickable internal link. The destination page displays the source page under Pages linking here.

### Create a secure note

1. Remove images and attachments from the page.
2. Enable Encrypt as a secure note.
3. Enter a master passphrase of at least 12 characters.
4. Save.

The index stores only `Locked note`; title, content, category, tags, summary, and source URL are inside the encrypted payload.

There is no passphrase recovery.

## Backup and restore

The JSON backup exports page records, encrypted note payloads, categories, tags, backlinks data, PDF records, and Google Drive file metadata. It does not export the actual Google Drive file bytes. Keep important Drive files in Google Drive and back them up separately when needed.

Restoring a JSON backup restores links to Drive files only when those files still exist and the signed-in Google account can access them.

## Current starter limitations

- Automatic categorization uses local keyword rules, not an AI API.
- Import restores Drive metadata only. The file bytes must still exist in Google Drive.
- Inline Drive images use Drive-hosted links; if a browser blocks Google Drive access, open the file from the attachment link.
- Deleting text that references an inline image does not automatically delete the Drive file. The editor lists inline image files so they can be deleted deliberately.
- Book pagination is approximate and based on content size; very large images or code blocks may need manual page splitting in a future version.
- Capturing an arbitrary webpage directly from its URL requires a browser extension or server-side capture service because browser CORS rules prevent reliable scraping from a static site.

## Recommended next upgrades

- Browser extension / bookmarklet for one-click web capture
- AI-assisted categories, tags, and summaries
- Full-text search service for very large libraries
- Category-book PDF generation
- Drive folder health checks and repair tools
- Revision history
- Two-factor reauthentication before opening the secure vault
- Dedicated vault key wrapping and security audit
