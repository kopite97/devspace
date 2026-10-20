import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/github',
  use: { baseURL: 'http://127.0.0.1:4190', browserName: 'chromium' },
  webServer: {
    command: 'npm run dev -- --port 4190 --strictPort',
    url: 'http://127.0.0.1:4190',
    env: { BACKEND_UPSTREAM: 'http://127.0.0.1:1' },
  },
});
