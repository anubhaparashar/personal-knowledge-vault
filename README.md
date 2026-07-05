# My Knowledge Vault

A private digital knowledge book for capturing web research, links, formatted notes, images, private notes, and restricted Google Drive PDFs.

## Included features

- Google login with an email allowlist
- Rich paste editor based on Tiptap
- Paste or upload inline images
- Non-PDF image, text, Markdown, JSON, and Word attachments in Firebase Storage
- PDF binary files in Google Drive, with only metadata and `driveFileId` in Firestore
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
- Firebase Firestore, Storage, Authentication, and Hosting
- Responsive desktop/mobile layout and dark mode

## Security boundary

Secure notes are encrypted in the browser before being stored in Firestore. The passphrase is not stored by this application. Secure notes intentionally do not permit images or attachments because those files are separate storage objects.

PDF files are private Google Drive files. The app uses the minimum Drive scope, `https://www.googleapis.com/auth/drive.file`, and does not create `Anyone with the link` permissions. Private PDFs are downloaded through the authenticated Google Drive API and passed to PDF.js as Blob/Object URLs.

This project is a starter application, not an audited password manager. Store actual account passwords, banking passwords, recovery codes, and API secrets in a dedicated password manager.

## Requirements

- Node.js 22 or newer
- A Firebase project used only for this private application
- A Google Cloud project with the Google Drive API enabled
- Firebase CLI for deployment

## 1. Install

```bash
npm install
```

## 2. Create a Firebase project

Do not reuse a public website or blog database.

In Firebase Console:

1. Create a new project.
2. Add a Web app.
3. Open Authentication -> Sign-in method and enable Google.
4. Create Cloud Firestore in production mode.
5. Create Cloud Storage for non-PDF images and document attachments.
6. Copy the Web app configuration values.

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
VITE_ALLOWED_EMAIL=your-email@gmail.com
VITE_GOOGLE_OAUTH_CLIENT_ID=
VITE_GOOGLE_APPROVED_EMAIL=your-email@gmail.com
VITE_GOOGLE_DRIVE_FOLDER_ID=
VITE_GOOGLE_API_KEY=
```

Do not commit `.env`. It is already listed in `.gitignore`. Never put real OAuth client IDs, Firebase values, or API keys in `.env.example`.

## 8. Lock Firebase rules to your email

In both files:

- `firestore.rules`
- `storage.rules`

Replace:

```text
REPLACE_WITH_YOUR_EMAIL
```

with the exact same email used in `VITE_ALLOWED_EMAIL`.

Never deploy the placeholder rules unchanged. Firestore stores page records, encrypted note payloads, PDF metadata, and Drive file IDs. Firestore never stores PDF binary files.

## 9. Run locally

```bash
npm run dev
```

Open the local URL shown by Vite. Add `localhost` to Firebase Authentication authorized domains if it is not already present.

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

Deploy rules and hosting:

```bash
npm run build
firebase deploy --only firestore:rules,storage,hosting
```

## How to use

### Capture web material

1. Open Quick Capture.
2. Paste copied content into the editor.
3. Paste the original URL.
4. Add a category such as `Artificial Intelligence/LLM Agents`.
5. Add tags separated by commas.
6. Upload non-PDF attachments if needed.
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

When that page exists, the reader creates a clickable internal link. The destination page displays the source page under Pages linking here. PDFs linked to the current page appear under Related PDFs.

### Create a secure note

1. Remove images and attachments from the page.
2. Enable Encrypt as a secure note.
3. Enter a master passphrase of at least 12 characters.
4. Save.

The index stores only `Locked note`; title, content, category, tags, summary, and source URL are inside the encrypted payload.

There is no passphrase recovery.

## Current starter limitations

- Automatic categorization uses local keyword rules, not an AI API.
- Import restores PDF metadata only. The PDF binary files must still exist in Google Drive.
- Deleting text that references an inline image does not automatically remove the Storage object. The editor lists inline image files so they can be deleted deliberately.
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



