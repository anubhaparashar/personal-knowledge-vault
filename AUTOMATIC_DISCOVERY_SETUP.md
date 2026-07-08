# Automatic Discovery Setup

## Backend Selected

Preferred backend: Firebase Cloud Functions v2 with Cloud Scheduler.

Fallback backend: GitHub Actions workflow at `.github/workflows/research-discovery.yml` for projects where Firebase scheduled functions cannot be deployed.

Do not claim automatic web discovery is working until all of these are true:

- Firebase Functions or the fallback workflow is deployed.
- At least one discovery source is enabled.
- A test run completes successfully.
- A run record appears in Firestore.
- A discovered result appears in the interface.

## Schedule

Default timezone: `Asia/Kolkata`.

Firebase scheduled functions:

- Full discovery scan: `0 6,18 * * *`, timezone `Asia/Kolkata`.
- Existing-record refresh: `0 */6 * * *`, timezone `Asia/Kolkata`.
- Configurable schedule dispatcher: every 15 minutes, timezone `Asia/Kolkata`; it checks saved user preferences for custom full-scan times and refresh intervals.

GitHub Actions fallback:

- `30 0 * * *` UTC, approximately 06:00 IST.
- `30 12 * * *` UTC, approximately 18:00 IST.
- Manual `workflow_dispatch` is enabled with a required `scan_type` input: `quick` or `full`.
- `concurrency.group` is `research-discovery` with `cancel-in-progress: false`.

## Required Firebase Services

Enable:

- Firebase Authentication.
- Cloud Firestore.
- Cloud Functions v2.
- Cloud Scheduler.
- Firebase Storage, for existing attachments.

Cloud Scheduler and Functions v2 generally require a billing-enabled Firebase/Google Cloud project.

## Deployment Commands

Install frontend dependencies:

```bash
npm ci
```

Install function dependencies:

```bash
cd functions
npm install
cd ..
```

Deploy rules and functions:

```bash
firebase deploy --only firestore:rules,storage:rules
firebase deploy --only functions
```

After deployment, set these frontend environment variables to the HTTPS trigger URLs:

```text
VITE_DISCOVERY_RUN_ENDPOINT=https://...
VITE_DISCOVERY_IMPORT_ENDPOINT=https://...
VITE_URL_IMPORT_ENDPOINT=https://...
```

Then rebuild and redeploy the frontend.

## Function Environment

Set at least one scheduled user identifier for backend scans:

```text
DISCOVERY_USER_UIDS=comma-separated-firebase-auth-uids
```

Optional:

```text
DISCOVERY_ALLOWED_EMAIL=approved-email@example.com
DISCOVERY_ALLOWED_ORIGINS=https://your-site.example
URL_IMPORT_ALLOWED_ORIGINS=https://your-site.example
DISCOVERY_SCAN_ALL_USERS=false
```

Do not put Firebase Admin private keys in frontend variables.

## GitHub Actions Secrets

For the fallback workflow, configure repository secrets:

```text
FIREBASE_ADMIN_CREDENTIALS={...service account JSON...}
DISCOVERY_USER_UIDS=comma-separated-firebase-auth-uids
DISCOVERY_ALLOWED_EMAIL=approved-email@example.com
```

The workflow writes the service account JSON to a temporary file and does not print it.

## Firestore Collections

Per user under `users/{uid}`:

- `pages`: manual, imported, and discovered records.
- `discovery/settings`: user preferences for schedule and pause controls.
- `discovery/stats`: last attempted scan, last successful scan, latest counts, last error.
- `discovery/scanLock`: overlap-prevention lock.
- `discoverySources`: configured sources, health, last checked, result counts.
- `discoveryRuns`: run records and live progress states at `users/{uid}/discoveryRuns/{runId}`. Each run stores `runType`, `status`, `requestedBy`, `requestedAt`, `startedAt`, `completedAt`, `currentStage`, `currentSource`, `sourcesTotal`, `sourcesChecked`, `recordsFound`, `recordsCreated`, `recordsUpdated`, `duplicatesSkipped`, `datesDetected`, `warnings`, `failures`, and `errorSummary`.
- `discoveryMatches`: possible auto/manual matches that require user review.
- `notifications`: discovery run summaries.

## Discovery Control Centre

The dashboard panel is titled `Discovery Control Centre` and shows backend-derived status only. It displays `Automatic Discovery: Not configured` until a source-backed scan completes successfully and a run record exists in Firestore.

Actions:

- Quick Refresh: rechecks followed and active records, deadline changes, closed records, and days remaining.
- Full Web Scan: checks all enabled sources for new records and updates existing discoveries.
- Scrape a Link: calls the authenticated URL-import endpoint and returns a preview for review.
- Scan One Source: processes only the selected source.
- Manage Sources: opens Settings -> Discovery -> Sources.
- View Run Log: shows the latest Firestore run path and counters.

Manual scan buttons call the authenticated Firebase `runDiscovery` or `importDiscoveryUrl` functions. They do not trigger GitHub Actions from frontend JavaScript and do not use a GitHub token in the browser. Progress shown in the dashboard comes from `discoveryRuns`; it is not a fake percentage bar.

## Pause Scanning

Go to `Settings -> Discovery -> Schedule` and enable `Pause all scanning`, or disable `Enable automatic discovery`. Scheduled functions still wake up, but the backend exits without scanning.

## Add Manual Entry

Use the global `+ New Entry` menu or category-page buttons. Manual entries are saved with `origin: manually-added` and are not overwritten by automatic discovery.

## Add a Custom Source

Go to `Settings -> Discovery -> Sources`.

1. Enter source name, URL, type, expected category, delay, and concurrency.
2. Select `Test`.
3. Review the extraction preview.
4. Save the source.

Saving a source does not start an uncontrolled full-site crawl.

Supported source types:

- API
- RSS
- Atom
- Sitemap
- Structured webpage
- Public webpage
- OpenAlex
- Crossref
- arXiv
- Semantic Scholar
- Manual-only

## Inspect Logs

Firebase:

```bash
firebase functions:log
```

Firestore:

- Check `users/{uid}/discoveryRuns` for run status and warnings.
- Check `users/{uid}/discoverySources` for health and last error.
- Check `users/{uid}/notifications` for run summaries.

GitHub Actions:

- Open the `Research Discovery` workflow run.
- Confirm it finished without printing secrets.
- Check Firestore for a corresponding run record.


## Manual URL Scraping

Use `Scrape a Link` or `+ New Entry -> Import from Link`.

The dialog sends the URL to the authenticated backend import endpoint. The backend validates HTTP/HTTPS URLs, rejects unsafe networks and redirects, fetches permitted public content, sanitizes HTML, classifies the record, generates tags, detects dates, checks duplicates, and returns a preview. DOI and arXiv links use official metadata APIs when recognized. Facebook and LinkedIn links that cannot be fetched preserve the supplied link/text and can be saved to Shared Inbox.

The importer never saves low-confidence results automatically. The user chooses `Save to Library`, `Save and Start Application`, `Edit Before Saving`, `Change Category`, `Add to Shared Inbox`, `Reanalyse`, or `Cancel`.

## Current Verification Status

Repository inspection can verify that the code paths exist. It cannot prove deployment. Do not display or report `Enabled` until all of these are true in the deployed project:

- `VITE_DISCOVERY_RUN_ENDPOINT` and `VITE_DISCOVERY_IMPORT_ENDPOINT` point to deployed Firebase HTTPS functions.
- At least one enabled source exists under `users/{uid}/discoverySources`.
- A real run has checked at least one source or active record.
- `users/{uid}/discoveryRuns/{runId}` exists with `status: completed` or `completed-with-warnings`.
- `users/{uid}/discovery/stats.lastSuccessfulScanAt` is set.
- At least one discovered or updated record appears in the interface.
## Scraping Safety

Every webpage fetch validates HTTP/HTTPS URLs, rejects localhost/private networks/cloud metadata addresses, validates redirects, enforces response size and timeouts, respects basic `robots.txt`, sanitizes HTML, and uses per-source delay/concurrency settings. The system does not bypass CAPTCHA, authentication, or paywalls.

Prefer official APIs, RSS, Atom, and sitemaps over HTML scraping when sources provide them.

## Expected Costs

Potential costs depend on:

- Cloud Functions invocations and runtime.
- Cloud Scheduler jobs.
- Firestore reads/writes.
- Network egress.
- GitHub Actions minutes if using fallback.

Cloud Functions v2 and Cloud Scheduler usually require billing to be enabled even when usage is small.

## Troubleshooting

- Dashboard says automatic discovery is not configured: set `VITE_DISCOVERY_RUN_ENDPOINT` and `VITE_DISCOVERY_IMPORT_ENDPOINT`, rebuild, and redeploy the frontend.
- Scheduled scans do not run: verify `DISCOVERY_USER_UIDS`, Cloud Scheduler jobs, billing, and function logs.
- Discovery Control Centre actions fail with permission errors: verify Firebase Auth token, `DISCOVERY_USER_UIDS`, and `DISCOVERY_ALLOWED_EMAIL`.
- Source test returns no records: try RSS, Atom, or sitemap source type, reduce site complexity, and check robots.txt.
- Duplicate records appear: verify official source URLs are canonical; possible manual matches appear in `discoveryMatches` and require user review.
- No discovered results appear: ensure at least one source is enabled and a full scan completed with records saved under `users/{uid}/pages`.
