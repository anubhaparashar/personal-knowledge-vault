# URL Import Setup

The GitHub Pages app cannot reliably fetch arbitrary webpages from the browser because most sites block cross-origin scraping. The editor therefore calls a server-side Firebase Function named `importUrl` when you press **Import from link**.

## What the function does

- Accepts only POST requests containing an HTTP or HTTPS URL.
- Blocks localhost, private IP ranges, link-local addresses, metadata-service hostnames and unsafe redirects.
- Limits redirects, response size and request duration.
- Extracts article-style content with Readability.
- Removes scripts, forms, navigation, ads and common boilerplate.
- Returns sanitized HTML, plain text, title, summary and source metadata.

No private API key or service credential is exposed to frontend JavaScript.

## Deploy the function

Firebase Cloud Functions normally require enabling the Cloud Functions service and billing support for the Firebase project. Deploy this only if that project is allowed to use Functions.

```bash
cd functions
npm install
cd ..
firebase deploy --only functions:importUrl
```

After deployment, Firebase prints an HTTPS endpoint similar to:

```text
https://REGION-PROJECT_ID.cloudfunctions.net/importUrl
```

Add that URL as a GitHub Actions repository variable:

```text
VITE_URL_IMPORT_ENDPOINT=https://REGION-PROJECT_ID.cloudfunctions.net/importUrl
```

Then rerun the GitHub Pages deployment workflow so Vite receives the variable during build.

## Optional origin restriction

For stricter CORS, create `functions/.env` locally before deploying:

```env
URL_IMPORT_ALLOWED_ORIGINS=https://anubhaparashar.github.io,https://YOUR_FIREBASE_HOSTING_DOMAIN
```

Do not commit `functions/.env` if you create it.

## Frontend behavior without deployment

If `VITE_URL_IMPORT_ENDPOINT` is blank, the editor still shows the **Import from link** interface, but it returns a visible setup error instead of spinning forever.