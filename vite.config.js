import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
  build: {
    sourcemap: false,
  },
});
