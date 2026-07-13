import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const appVersion = `${packageJson.version || '0.0.0'}-${process.env.GITHUB_SHA?.slice(0, 7) || 'local'}`;

const driveWarningPlugin = {
  name: 'warn-missing-google-drive-config',
  configResolved() {
    if (!process.env.VITE_GOOGLE_OAUTH_CLIENT_ID) {
      console.warn('[build] VITE_GOOGLE_OAUTH_CLIENT_ID is missing. Google Drive attachment upload will require configuration at runtime.');
    }
  },
};

export default defineConfig({
  plugins: [react(), driveWarningPlugin],
  base: '/personal-knowledge-vault/',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    sourcemap: false,
  },
});
