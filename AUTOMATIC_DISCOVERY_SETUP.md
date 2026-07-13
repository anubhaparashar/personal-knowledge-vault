# Automatic Discovery Setup

## Backend Selected

Discovery uses the GitHub Actions workflow at `.github/workflows/research-discovery.yml`.

Firebase remains in use for:

- Authentication
- Firestore saved pages
- Firestore discovery records
- Firestore queued requests
- Storage for existing attachments

No frontend discovery endpoint variables are required.

## Schedule

Default timezone: `Asia/Kolkata`.

GitHub Actions schedule:

- `30 0 * * *` UTC, which is 06:00 IST.
- `30 12 * * *` UTC, which is 18:00 IST.
- Manual `workflow_dispatch` is enabled with a `scan_type` input: `quick` or `full`.
- `concurrency.group` is `research-discovery` with `cancel-in-progress: false`.

## Required Firebase Services

Enable:

- Firebase Authentication
- Cloud Firestore
- Firebase Storage, for existing attachments

## Deployment Commands

Install frontend dependencies:

```bash
npm ci
```

Install workflow runner dependencies:

```bash
cd functions
npm install
cd ..
```

Deploy rules only when Firestore or Storage rules change:

```bash
firebase deploy --only firestore:rules,storage:rules
```

Deploy Hosting only if you use Firebase Hosting in addition to GitHub Pages:

```bash
npm run build
firebase deploy --only hosting
```

## GitHub Actions Environment

Set at least one scheduled user identifier for workflow scans:

```text
DISCOVERY_USER_UIDS=comma-separated-firebase-auth-uids
```

Required repository secret:

```text
FIREBASE_ADMIN_CREDENTIALS=service-account-json
```

Optional:

```text
DISCOVERY_ALLOWED_EMAIL=approved-email@example.com
DISCOVERY_SCAN_ALL_USERS=true
```

## Dashboard Behavior

The dashboard displays:

```text
Automatic Discovery: GitHub Actions scheduled
Manual scanning: Queue-based, no Firebase Functions
Next scheduled scan: 06:00 IST / 18:00 IST
```

Actions:

- **Scrape a Link** queues a `single-link` request in `users/{uid}/discoveryRequests`.
- **Quick Refresh** queues a `quick-refresh` request.
- **Full Web Scan** points to the Research Discovery workflow.
- **Scan One Source** queues a `single-source` request with the selected source ID.
- **Open Research Discovery Workflow** opens the workflow run page.
- **View Run Log** shows the latest Firestore discovery run path and counters.

Queued request statuses are `Queued`, `Processing`, `Completed`, and `Failed`.

## Workflow Processing

Each run processes:

- enabled discovery sources
- queued single-link scrape requests
- queued quick-refresh requests
- queued single-source scan requests

When processing finishes, the runner writes discoveries to Firestore, updates request status, creates a `discoveryRuns` log, and updates `users/{uid}/discovery/stats`.

## Firestore Paths

- `users/{uid}/pages`
- `users/{uid}/discoverySources`
- `users/{uid}/discoveryRequests`
- `users/{uid}/discoveryRuns`
- `users/{uid}/discovery/stats`
- `users/{uid}/notifications`

## Troubleshooting

- Scheduled scans do not run: verify the workflow is enabled and `FIREBASE_ADMIN_CREDENTIALS` plus `DISCOVERY_USER_UIDS` are set.
- Queued requests stay queued: open the Research Discovery workflow and run it manually.
- Source scan fails: check `users/{uid}/discoveryRequests/{requestId}.error` and the matching `discoveryRuns` log.
- No discovered results appear: ensure at least one source is enabled and a full workflow run completed with records saved under `users/{uid}/pages`.
