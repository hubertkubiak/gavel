/**
 * Regenerates README media: `pnpm -F @gavel/e2e docs`.
 * Screenshots go to docs/screenshots, the two-tab demo to docs/demo.gif.
 */
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import gifenc from 'gifenc';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { ApiServer, placeBid } from '../tests/api-server';

const { GIFEncoder, applyPalette, quantize } = gifenc;
const out = fileURLToPath(new URL('../../docs/', import.meta.url));
mkdirSync(`${out}screenshots`, { recursive: true });

const api = new ApiServer();
test.describe.configure({ mode: 'serial' });
test.beforeAll(() => api.start());
test.afterAll(() => api.stop());

async function context(
  browser: import('@playwright/test').Browser,
  opts: { nick?: string; theme?: 'dark' | 'light'; mobile?: boolean } = {},
): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: opts.mobile ? 2 : 1,
    isMobile: opts.mobile,
    hasTouch: opts.mobile,
    colorScheme: opts.theme ?? 'dark',
  });
  await ctx.addInitScript(
    ({ nick, theme }) => {
      if (nick) localStorage.setItem('gavel.nickname', nick);
      localStorage.setItem('gavel.theme', theme);
    },
    { nick: opts.nick, theme: opts.theme ?? 'dark' },
  );
  return ctx;
}

const settle = (page: Page, ms = 700) => page.waitForTimeout(ms);

test('screenshots', async ({ browser }) => {
  await placeBid('rangefinder-1957', 'koneser', 120);
  await placeBid('keyboard-custom-65', 'klawisz', 850);

  const dark = await (await context(browser, { nick: 'alice' })).newPage();
  await dark.goto('/');
  await expect(dark.locator('gv-item-card').first()).toBeVisible();
  await settle(dark, 1200);
  await dark.screenshot({ path: `${out}screenshots/list-dark.png` });

  await dark.goto('/items/vinyl-first-press');
  await expect(dark.getByText('Live', { exact: true })).toBeVisible();
  await settle(dark);
  await dark.screenshot({ path: `${out}screenshots/detail-dark.png` });

  await dark.keyboard.press('Control+.');
  await placeBid('vinyl-first-press', 'bluenote', 350);
  await settle(dark, 1200);
  await dark.screenshot({ path: `${out}screenshots/dev-panel.png` });

  const light = await (await context(browser, { nick: 'alice', theme: 'light' })).newPage();
  await light.goto('/items/chrono-moonwatch');
  await expect(light.getByText('Live', { exact: true })).toBeVisible();
  await settle(light);
  await light.screenshot({ path: `${out}screenshots/detail-light.png` });

  const mobile = await (await context(browser, { nick: 'alice', mobile: true })).newPage();
  await mobile.goto('/items/bauhaus-lamp');
  await expect(mobile.getByText('Live', { exact: true })).toBeVisible();
  await settle(mobile);
  await mobile.screenshot({ path: `${out}screenshots/mobile.png` });
});

/** Two tabs side by side; each frame is a screenshot of both, stitched and encoded as a GIF. */
test('demo gif', async ({ browser }) => {
  test.setTimeout(120_000);
  const size = { width: 1100, height: 760 };
  const mk = async (nick: string) => {
    const ctx = await context(browser, { nick });
    await ctx.setExtraHTTPHeaders({});
    const page = await ctx.newPage();
    await page.setViewportSize(size);
    await page.goto('/items/poster-school-1962');
    await expect(page.getByText('Live', { exact: true })).toBeVisible();
    return page;
  };
  const a = await mk('alice');
  const b = await mk('bob');

  const scale = 0.5;
  const w = Math.round(size.width * scale);
  const h = Math.round(size.height * scale);
  const gap = 8;
  const W = w * 2 + gap;
  const gif = GIFEncoder();

  const shrink = (png: PNG) => {
    const outPx = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Box filter 2×2 for a clean half-size frame.
        let r = 0,
          g = 0,
          bl = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const i = ((y * 2 + dy) * png.width + (x * 2 + dx)) * 4;
            r += png.data[i]!;
            g += png.data[i + 1]!;
            bl += png.data[i + 2]!;
          }
        }
        const o = (y * w + x) * 4;
        outPx[o] = r / 4;
        outPx[o + 1] = g / 4;
        outPx[o + 2] = bl / 4;
        outPx[o + 3] = 255;
      }
    }
    return outPx;
  };

  const frame = async (delay = 120) => {
    const [pa, pb] = await Promise.all([a.screenshot(), b.screenshot()]);
    const fa = shrink(PNG.sync.read(pa));
    const fb = shrink(PNG.sync.read(pb));
    const rgba = new Uint8Array(W * h * 4).fill(11);
    for (let y = 0; y < h; y++) {
      rgba.set(fa.subarray(y * w * 4, (y + 1) * w * 4), y * W * 4);
      rgba.set(fb.subarray(y * w * 4, (y + 1) * w * 4), (y * W + w + gap) * 4);
    }
    const palette = quantize(rgba, 256);
    gif.writeFrame(applyPalette(rgba, palette), W, h, { palette, delay });
  };
  const hold = async (n: number, delay = 120) => {
    for (let i = 0; i < n; i++) await frame(delay);
  };

  await hold(4, 250);
  // 1. Tab A bids 700 zł → tab B updates instantly.
  await a.getByLabel('Twoja oferta').fill('700');
  await hold(2, 200);
  await a.getByRole('button', { name: /licytuj/i }).click();
  await hold(10, 120);
  // 2. Tab B tries 690 zł → FAILED_PRECONDITION with the typed minimum.
  await b.getByLabel('Twoja oferta').fill('690');
  await hold(2, 200);
  await b.getByRole('button', { name: /licytuj/i }).click();
  await hold(8, 150);
  // 3. Tab B outbids with a quick button → A gets "Ktoś Cię przebił".
  await b.getByRole('button', { name: '+100 zł' }).click();
  await b.getByRole('button', { name: /licytuj/i }).click();
  await hold(12, 120);
  // 4. Server restart → reconnect banner → live again.
  await api.stop();
  await hold(8, 200);
  await api.start();
  await expect(a.getByText('Live', { exact: true })).toBeVisible({ timeout: 15_000 });
  await hold(6, 250);

  gif.finish();
  writeFileSync(`${out}demo.gif`, gif.bytes());
});
