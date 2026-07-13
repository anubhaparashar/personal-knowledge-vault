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
  throw new Error('Instant scraping is disabled to keep the project free. Requests are processed by GitHub Actions.');
}
