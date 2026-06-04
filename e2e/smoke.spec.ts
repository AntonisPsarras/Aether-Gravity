import { test, expect } from '@playwright/test';
import {
  e2eUrl,
  FIXTURE_MINIMAL,
  getTestApi,
  readStore,
  waitForSimulationReady,
} from './helpers';

test.describe('Smoke', () => {
  test('loads fixture world and exposes test bridge', async ({ page }) => {
    await page.goto(e2eUrl(FIXTURE_MINIMAL));
    await waitForSimulationReady(page);

    const api = await getTestApi(page);
    expect(api.isE2E).toBe(true);

    const store = await readStore(page);
    expect(store.bodyCount).toBe(3);
    expect(store.paused).toBe(false);
    expect(store.worldId).toBe('e2e-minimal-3body');

    const metrics = await page.evaluate(() => window.__AETHER_TEST__!.getMetrics());
    expect(metrics.ready).toBe(true);
    expect(metrics.canvasReady).toBe(true);
    expect(metrics.contextLostCount).toBe(0);
  });

  test('WebGL canvas is present', async ({ page }) => {
    await page.goto(e2eUrl(FIXTURE_MINIMAL));
    await waitForSimulationReady(page);

    const canvas = page.locator('[data-testid="sim-canvas"] canvas');
    await expect(canvas).toBeVisible();

    const hasWebGL = await page.evaluate(() => {
      const canvasEl = document.querySelector('[data-testid="sim-canvas"] canvas');
      if (!canvasEl) return false;
      return !!(canvasEl as HTMLCanvasElement).getContext('webgl2')
        || !!(canvasEl as HTMLCanvasElement).getContext('webgl');
    });
    expect(hasWebGL).toBe(true);
  });
});
