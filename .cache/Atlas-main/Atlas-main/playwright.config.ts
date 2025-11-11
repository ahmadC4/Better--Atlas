import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/playwright',
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5000',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:5000',
    headless: true,
  },
});
