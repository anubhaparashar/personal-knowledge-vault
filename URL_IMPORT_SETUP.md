# URL Import Setup

The static website does not fetch arbitrary webpages directly from the browser. To keep the project free, **Scrape a Link** writes a queued request to Firestore instead:

```text
users/{uid}/discoveryRequests/{requestId}
```

The GitHub Actions workflow processes queued link requests during the next scheduled discovery run or when you run the workflow manually.

Workflow URL:

```text
https://github.com/anubhaparashar/personal-knowledge-vault/actions/workflows/research-discovery.yml
```

## Frontend behavior

- User opens **Scrape a Link**.
- User pastes an HTTP or HTTPS URL.
- The app saves a `single-link` request with `status: queued`.
- The UI shows: `Queued for discovery. Run Research Discovery workflow now, or it will process at the next scheduled scan.`
- Request status is displayed as `Queued`, `Processing`, `Completed`, or `Failed`.

No URL import endpoint variable is required.

## Workflow behavior

The workflow reads queued requests from Firestore, validates and fetches public URLs from the GitHub Actions runner, writes discovered records to Firestore, updates request status, creates a run log, and updates dashboard stats.

## Safety

The runner validates HTTP/HTTPS URLs, rejects unsafe private/local destinations, limits redirects, response size and request duration, sanitizes extracted HTML, and uses per-source delay settings. It does not bypass CAPTCHA, authentication, or paywalls.
