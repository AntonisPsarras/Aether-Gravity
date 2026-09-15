import { test, expect } from '@playwright/test';

test('archive refreshes across tabs and keeps worlds with missing collections visible', async ({ context, page }) => {
  await page.goto('/?e2e=1&onboarding=seen');
  const writer = await context.newPage();
  await writer.goto('/?e2e=1&onboarding=seen');
  await writer.evaluate(() => localStorage.setItem('aether:worlds:index', JSON.stringify([
    { id: 'orphan', name: 'Recovered universe', folderId: 'missing', createdAt: 1, lastOpenedAt: 1 },
  ])));
  await expect(page.getByTestId('world-card-orphan')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('world-card-orphan')).toBeVisible();
});

test('a second tab cannot overwrite the editor and can acquire ownership after closure', async ({ context, page }) => {
  await page.goto('/?e2e=1&onboarding=seen');
  await page.getByTestId('menu-new-universe').click();
  await page.getByTestId('menu-preset-solar-system').click();
  await page.getByTestId('menu-universe-name').fill('Shared world');
  await page.getByTestId('menu-launch-universe').click();
  await expect(page.getByTestId('simulation-root')).toBeVisible();
  const second = await context.newPage();
  await second.goto('/?e2e=1&onboarding=seen');
  await second.getByTestId('menu-open-recent').click();
  await expect(second.getByRole('status').filter({ hasText: 'Read-only universe' })).toBeVisible();
  expect(await second.evaluate(() => {
    const store = window.__AETHER_TEST__!.getStore();
    return store;
  })).toBeDefined();
  const before = await second.evaluate(() => localStorage.getItem('aether:worlds:index'));
  await second.reload();
  expect(await second.evaluate(() => localStorage.getItem('aether:worlds:index'))).toBe(before);
  await page.close();
  await second.getByTestId('menu-open-recent').click();
  await expect(second.getByTestId('simulation-root')).toBeVisible();
  await expect(second.getByRole('status').filter({ hasText: 'Read-only universe' })).toHaveCount(0);
});

test('corrupt worlds remain intact and cannot enter the simulation', async ({ page }) => {
  await page.goto('/?e2e=1&onboarding=seen');
  await page.evaluate(() => {
    localStorage.setItem('aether:worlds:index', JSON.stringify([{id:'broken',name:'Broken',createdAt:1,lastOpenedAt:1}]));
    localStorage.setItem('aether:worlds:data:broken','{"id":"broken","version":2,"bodies":[null]}');
  });
  await page.reload();
  await page.getByTestId('menu-open-recent').click();
  await expect(page.getByRole('alert')).toContainText('original record was preserved');
  await expect(page.getByTestId('simulation-root')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('aether:worlds:data:broken'))).toBe('{"id":"broken","version":2,"bodies":[null]}');
});
