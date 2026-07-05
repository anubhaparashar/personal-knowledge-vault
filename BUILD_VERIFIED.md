# Build verification

Verified on 5 July 2026 with:

- Node.js via local npm environment
- Vite 8.1.3
- Firebase Authentication, Cloud Firestore, Firebase Hosting, and Google Drive file storage
- No Firebase Cloud Storage configuration or deploy target

Commands completed successfully:

```bash
npm install
npm run build
```

`npm install` reported 0 vulnerabilities.

The build generated `dist/` with:

- `dist/index.html`
- `dist/assets/index-CCyoioCC.js`
- `dist/assets/index-BXmR0Y5l.css`
- `dist/assets/pdf.worker-xSiVJ7U_.mjs`

Vite reported only a non-blocking large-chunk optimisation warning caused by the PDF viewer/worker bundle.
