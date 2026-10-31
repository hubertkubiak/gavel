import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Not part of CI — regenerates README screenshots and the demo GIF. */
export default defineConfig({
  ...base,
  testDir: './docs',
  timeout: 120_000,
  reporter: 'list',
  use: { ...base.use, trace: 'off' },
  projects: [{ name: 'docs', use: { browserName: 'chromium' } }],
});
