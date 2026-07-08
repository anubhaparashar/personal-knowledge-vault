import { auth, urlImportEndpoint } from '../firebase';

export function validateImportUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Enter a valid URL before importing.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs can be imported.');
  }
  return parsed.toString();
}

export async function importUrlContent(sourceUrl, { signal } = {}) {
  const url = validateImportUrl(sourceUrl);
  if (!urlImportEndpoint) {
    throw new Error('URL import endpoint is not configured. Deploy the Firebase Function and set VITE_URL_IMPORT_ENDPOINT.');
  }
  const currentUser = auth?.currentUser;
  if (!currentUser) {
    throw new Error('Sign in before source enrichment.');
  }
  const token = await currentUser.getIdToken();

  const response = await fetch(urlImportEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url }),
    signal,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Leave payload null and use response text fallback below.
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `URL import failed with HTTP ${response.status}.`);
  }

  return payload;
}
