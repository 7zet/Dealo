import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  outputDir: 'test-results',
  // Each spec signs in with its own seeded accounts (see services/api/internal/seed), so specs run in parallel.
  workers: 4,
  globalSetup: './global-setup.mjs',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    // Edge ships with Windows; elsewhere (macOS, CI) use Playwright's bundled Chromium.
    channel: process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined),
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'corepack pnpm --filter @grupon/web start',
    url: 'http://127.0.0.1:3000/uz',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
