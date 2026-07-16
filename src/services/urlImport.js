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

export async function importUrlContent(sourceUrl) {
  validateImportUrl(sourceUrl);
  throw new Error('Automatic discovery requests are queued and processed by GitHub Actions so the app can stay free. Use Add from URL to queue this link.');
}
