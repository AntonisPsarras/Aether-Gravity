import { test, expect, type Page } from '@playwright/test';
import { e2eUrl, FIXTURE_SOLAR, waitForSimulationReady } from './helpers';

const PHONE = { width: 390, height: 844 };

async function settleGrid(page: Page, graphics: 'quality' | 'performance') {
  await page.goto(e2eUrl(FIXTURE_SOLAR, {
    graphics,
    touch: '1',
    dpr: '1',
  }));
  await waitForSimulationReady(page);
  await page.evaluate(() => {
    window.__AETHER_TEST__!.setPaused(true);
    // Match the unobscured canvas in the reported Android screenshots so the
    // baseline exercises the entire curvature surface, not a sheet behind UI.
    (window as any).__AETHER_VISUAL_TEST__.getStore().setOutlinerOpen(false);
    (window as any).__AETHER_GRID_SETTLE__ = '';
  });
  // Poll until two consecutive well snapshots match. A fixed timeout raced
  // the lattice LOD under parallel workers.
  await page.waitForFunction(() => {
    const grid = window.__AETHER_TEST__?.getGridSnapshot();
    if (!grid) return false;
    const signature = JSON.stringify(grid.wells.map((well) => [well.bodyId, well.core, well.peak]));
    const previous = (window as any).__AETHER_GRID_SETTLE__;
    (window as any).__AETHER_GRID_SETTLE__ = signature;
    return previous === signature && signature.length > 2;
  }, undefined, { timeout: 8_000 });
  return page.evaluate(() => {
    const m = window.__AETHER_TEST__!.getMetrics();
    return {
      profile: m.renderProfile,
      physicsTier: m.physicsTier,
      grid: window.__AETHER_TEST__!.getGridSnapshot(),
    };
  });
}

test.describe('mobile spacetime-grid visual regression', () => {
  test('both profiles draw a continuous curvature surface at phone size', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const quality = await settleGrid(page, 'quality');
    expect(quality.profile).toBe('quality');
    expect(quality.grid).not.toBeNull();
    // Linux CI has no *-chromium-linux.png baselines yet. Keep grid/profile
    // assertions everywhere; add Linux screenshots later with
    // --update-snapshots on a Linux runner (do not generate them on Windows).
    if (process.platform === 'win32') {
      await expect(page).toHaveScreenshot('grid-quality-phone.png', { animations: 'disabled' });
    }

    const performance = await settleGrid(page, 'performance');
    expect(performance.profile).toBe('performance');
    expect(performance.grid).not.toBeNull();

    // The two profiles must describe the SAME surface: same wells, same
    // detail discs on the same bodies. Performance draws it with fewer
    // vertices, not with a different shape — the old low tier resolved one
    // fewer well and snapped its grid-line spacing, which is what produced
    // the reported blocky tiling.
    expect(performance.grid!.wells.map((w) => w.bodyId))
      .toEqual(quality.grid!.wells.map((w) => w.bodyId));
    expect(performance.grid!.discs.map((d) => d.bodyId).sort())
      .toEqual(quality.grid!.discs.map((d) => d.bodyId).sort());

    // A coarser lattice MUST widen the wells it cannot resolve — an unresolved
    // well drawn at its true width aliases into a spike — so some difference is
    // correct behaviour, not a defect. Planets track the ring-count ratio
    // (270/200 = 1.35). Satellites move further and in BOTH directions, because
    // a moon's effective core is set by the cell size around its parent and by
    // which neighbours it merges with, not by its own radius.
    //
    // What matters is that nothing is drastically mis-sized. At the old
    // 104-ring budget planets alone reached 2.6x, which is what made mobile
    // funnels read as wrong rather than merely softer.
    const MAX_CORE_RATIO = 1.75;
    for (const well of performance.grid!.wells) {
      const match = quality.grid!.wells.find((w) => w.bodyId === well.bodyId)!;
      const ratio = well.core / match.core;
      expect(ratio).toBeLessThanOrEqual(MAX_CORE_RATIO);
      expect(ratio).toBeGreaterThanOrEqual(1 / MAX_CORE_RATIO);
      // The invariant that must hold exactly: widening SPREADS a well, it never
      // changes the well's total depth. peak x core is the body's strength.
      expect(well.peak * well.core).toBeCloseTo(match.peak * match.core, 5);
    }

    if (process.platform === 'win32') {
      await expect(page).toHaveScreenshot('grid-performance-phone.png', { animations: 'disabled' });
    }
  });

  test('the graphics mode never changes the physics timestep', async ({ page }) => {
    await page.setViewportSize(PHONE);
    const forQuality = await settleGrid(page, 'quality');
    const forPerformance = await settleGrid(page, 'performance');
    // The hardware tier drives `physicsStepPolicy`; the user's picture choice
    // must not move it, or the same scene would integrate differently.
    expect(forPerformance.physicsTier).toBe(forQuality.physicsTier);
  });
});
