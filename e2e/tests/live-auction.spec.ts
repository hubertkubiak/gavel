import { type Browser, expect, type Page, test } from '@playwright/test';
import { ApiServer } from './api-server';

const ITEM = '/items/rangefinder-1957'; // seeded: 100 zł, +10 zł increment
const api = new ApiServer();

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => api.start());
test.afterAll(() => api.stop());

async function openAs(browser: Browser, nick: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript((n) => localStorage.setItem('gavel.nickname', n), nick);
  const page = await context.newPage();
  await page.goto(ITEM);
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  return page;
}

const price = (page: Page) => page.locator('gv-animated-price');
const amount = (page: Page) => page.getByLabel('Twoja oferta');
const bidButton = (page: Page) => page.getByRole('button', { name: /licytuj/i });

test('a bid in one browser shows up live in another', async ({ browser }) => {
  const a = await openAs(browser, 'alice');
  const b = await openAs(browser, 'bob');

  // Both tabs count each other as viewers.
  await expect(a.getByTestId('viewers')).toContainText(/2\s*oglądają/);

  await amount(a).fill('150');
  await bidButton(a).click();

  // Tab B updates via WatchItem — no reload. The spec asks for < 1 s locally.
  await expect(price(b)).toHaveText(/150\s?zł/, { timeout: 1500 });
  await expect(b.getByRole('list', { name: 'Ostatnie oferty' })).toContainText('alice');

  // A bid below current + increment is rejected with the typed minimum.
  await amount(b).fill('140');
  await bidButton(b).click();
  await expect(b.getByRole('alert').filter({ hasText: 'Oferta za niska' })).toContainText(
    /160\s?zł/,
  );
});

test('unknown auctions show a friendly screen', async ({ page }) => {
  await page.goto('/items/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Ta aukcja nie istnieje' })).toBeVisible();
});

test('the stream reconnects after a server restart', async ({ page }) => {
  await page.goto(ITEM);
  await expect(page.getByText('Live', { exact: true })).toBeVisible();

  await api.stop();
  await expect(page.getByRole('status').filter({ hasText: 'Łączę ponownie' })).toBeVisible();

  await api.start();
  // Backoff is 1 s, 2 s, 4 s… — allow a few rounds.
  await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Łączę ponownie' })).toBeHidden();
  // A fresh in-memory seed: the snapshot replaced local state.
  await expect(price(page)).toHaveText(/100\s?zł/);
});
