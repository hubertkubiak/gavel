import { defineConfig, devices } from '@playwright/test';

export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4310);
export const API_PORT = 8080;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  // The API is started by the tests themselves (tests/api-server.ts) so they can kill
  // and restart it; the Angular dev server is managed by Playwright.
  webServer: {
    command: `pnpm -F @gavel/web exec ng serve --port ${WEB_PORT}`,
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
