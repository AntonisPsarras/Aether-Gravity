import { test, expect, type Page } from '@playwright/test';
import { e2eUrl, waitForSimulationReady, FIXTURE_SOLAR, openInspectorFromOutliner } from './helpers';

/**
 * The edit-lock protocol: while a control is being dragged, the fields it owns
 * are protected from the physics->store sync. Without it a slider snaps back
 * mid-drag, intermittently and invisibly. These drive real pointer drags
 * against a running simulation, which is the only way that shows up.
 */
async function openBody(page: Page, name: string) {
  await page.locator('[data-testid="outliner-search"]').fill(name);
  // Let the 120ms search debounce settle so the list has stopped re-laying out
  // before the long-press coordinates are measured.
  await page.waitForTimeout(500);
  await openInspectorFromOutliner(page);
  await page.waitForTimeout(500);
}

async function dragSlider(page: Page, testId: string, dx: number) {
  const el = page.locator(`[data-testid="${testId}"]`);
  await el.scrollIntoViewIfNeeded();
  const b = (await el.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(b.x + b.width / 2 + (dx * i) / 6, b.y + b.height / 2);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
}

const massOf = (page: Page, name: string) =>
  page.evaluate((n) =>
    window.__AETHER_TEST__!.getPhysicsSnapshot().find((b) => b.name === n)?.mass ?? -1, name);

test.beforeEach(async ({ page }) => {
  await page.goto(e2eUrl(FIXTURE_SOLAR));
  await waitForSimulationReady(page);
  // Run unpaused: the whole point is that the sync loop is live.
  await page.evaluate(() => window.__AETHER_TEST__!.setPaused(false));
});

test('mass slider commits and is not reverted by the physics sync', async ({ page }) => {
  await openBody(page, 'Earth');
  const before = await massOf(page, 'Earth');
  await dragSlider(page, 'inspector-field-mass-scale', 60);
  const after = await massOf(page, 'Earth');
  expect(after).toBeGreaterThan(before);
  // Still there several sync ticks later.
  await page.waitForTimeout(1200);
  expect(await massOf(page, 'Earth')).toBeCloseTo(after, 5);
});

test('star temperature slider commits on a live star', async ({ page }) => {
  await openBody(page, 'Sun');
  const temp = () => page.locator('[data-testid="inspector-field-star-temp"]')
    .evaluate((el: HTMLInputElement) => Number(el.value));
  const before = await temp();
  await dragSlider(page, 'inspector-field-star-temp', -50);
  const after = await temp();
  expect(after).not.toBe(before);
  await page.waitForTimeout(1200);
  expect(await temp()).toBe(after);
});
