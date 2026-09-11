import { test, expect, type Page } from '@playwright/test';
import { e2eUrl, FIXTURE_SOLAR, waitForSimulationReady } from './helpers';

const PHONE = { width: 390, height: 844 };

async function settleGrid(page: Page, tier: 'high' | 'low') {
  await page.goto(e2eUrl(FIXTURE_SOLAR, {
    tier,
    touch: '1',
    dpr: '1',
  }));
  await waitForSimulationReady(page);
  await page.evaluate(() => {
    window.__AETHER_TEST__!.setPaused(true);
    // Match the unobscured canvas in the reported Android screenshots so the
    // baseline exercises the entire curvature surface, not a sheet behind UI.
    (window as any).__AETHER_VISUAL_TEST__.getStore().setOutlinerOpen(false);
  });
  // Let the canvas, grid uniforms, and post-processing settle on the frozen
  // Solar System frame before taking a visual baseline.
  await page.waitForTimeout(700);
  return page.evaluate(() => ({
    tier: window.__AETHER_TEST__!.getMetrics().deviceTier,
    grid: window.__AETHER_TEST__!.getGridSnapshot(),
  }));
}

test.describe('mobile spacetime-grid visual regression', () => {
  test('low tier retains continuous curvature coverage at phone size', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const high = await settleGrid(page, 'high');
    expect(high.tier).toBe('high');
    expect(high.grid).not.toBeNull();
    await expect(page).toHaveScreenshot('grid-high-tier-phone.png', { animations: 'disabled' });

    const low = await settleGrid(page, 'low');
    expect(low.tier).toBe('low');
    expect(low.grid).not.toBeNull();
    expect(low.grid!.wells.map((well) => well.bodyId)).toEqual(high.grid!.wells.map((well) => well.bodyId));
    // The low tier is allowed fewer (including zero) local-detail discs; the
    // primary lattice is still complete and the visual baseline guards it.
    expect(low.grid!.discs.length).toBeLessThanOrEqual(high.grid!.discs.length);
    await expect(page).toHaveScreenshot('grid-low-tier-phone.png', { animations: 'disabled' });
  });
});
