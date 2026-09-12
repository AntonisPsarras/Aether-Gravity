import { test, expect, type Page } from '@playwright/test';
import { e2eUrl, FIXTURE_SOLAR, waitForSimulationReady } from './helpers';

/**
 * Switching graphics mode changes WebGL context-creation attributes, so the
 * canvas is torn down and rebuilt. Everything the simulation depends on lives
 * outside the canvas and must survive that: the body-object registry each
 * `BodyMesh` re-registers into, the physics bodies ref, and the floating
 * origin. This is the position-sync regression class, re-tested across the new
 * remount path.
 */
async function assertRenderTracksPhysics(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    const renderPath = '/utils/renderPosition.ts';
    const { bodyRenderPosition } = await import(/* @vite-ignore */ renderPath);
    const fixture = (window as any).__AETHER_VISUAL_TEST__;
    const bodies = fixture.getLiveBodies();
    const render = window.__AETHER_TEST__!.getRenderSnapshot();
    let worst = 0;
    for (const b of bodies) {
      const actual = render.bodies.find((r: { id: string }) => r.id === b.id);
      if (!actual) return Infinity;
      const expected = bodyRenderPosition(
        b.position.clone(),
        b,
        bodies.find((p: { id: string }) => p.id === b.parentId),
        b.position.clone().set(render.floatingOffset.x, render.floatingOffset.y, render.floatingOffset.z),
        fixture.getStore().uiMode,
      );
      worst = Math.max(worst, Math.hypot(
        actual.position.x - expected.x,
        actual.position.y - expected.y,
        actual.position.z - expected.z,
      ));
    }
    return worst;
  })).toBeLessThan(0.001);
}

const openSettings = async (page: Page) => {
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
};

test.describe('graphics mode', () => {
  test('offers three modes and remembers the choice across a reload', async ({ page }) => {
    await page.goto(e2eUrl(FIXTURE_SOLAR));
    await waitForSimulationReady(page);
    await openSettings(page);

    await expect(page.getByTestId('graphics-mode-group')).toBeVisible();
    for (const mode of ['quality', 'performance', 'auto']) {
      await expect(page.getByTestId(`graphics-mode-${mode}`)).toBeVisible();
    }
    // Auto is the default and is the only mode that reports a live verdict.
    await expect(page.getByTestId('graphics-mode-auto')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('graphics-mode-status')).toBeVisible();

    await page.getByTestId('graphics-mode-performance').click();
    await expect(page.getByTestId('graphics-mode-performance')).toHaveAttribute('aria-checked', 'true');
    // The live status line belongs to Auto only.
    await expect(page.getByTestId('graphics-mode-status')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__AETHER_TEST__!.getMetrics().renderProfile))
      .toBe('performance');

    await page.reload();
    await waitForSimulationReady(page);
    await openSettings(page);
    await expect(page.getByTestId('graphics-mode-performance')).toHaveAttribute('aria-checked', 'true');
  });

  test('the choice follows the user into a different world', async ({ page }) => {
    await page.goto(e2eUrl(FIXTURE_SOLAR));
    await waitForSimulationReady(page);
    await openSettings(page);
    await page.getByTestId('graphics-mode-quality').click();
    await page.getByTestId('settings-close').click();

    // Loading another world rewrites the per-world display settings; the
    // graphics mode is global and must not be among them.
    await page.evaluate(() => {
      window.__AETHER_TEST__!.loadFixture({
        id: 'other-world',
        version: 2,
        bodies: [],
        settings: {
          speed: 2, showGrid: false, showDust: false,
          showHabitable: true, showStability: false, showOrbitPaths: false,
        },
      });
    });
    await page.waitForTimeout(300);
    await openSettings(page);
    await expect(page.getByTestId('graphics-mode-quality')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => page.evaluate(() => window.__AETHER_TEST__!.getMetrics().renderProfile))
      .toBe('quality');
  });

  test('bodies keep tracking physics across the canvas rebuild a mode switch causes', async ({ page }) => {
    await page.goto(e2eUrl(FIXTURE_SOLAR, { graphics: 'performance', touch: '1' }));
    await waitForSimulationReady(page);
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__AETHER_TEST__!.setPaused(true));
    await assertRenderTracksPhysics(page);

    await openSettings(page);
    await page.getByTestId('graphics-mode-quality').click();
    await page.getByTestId('settings-close').click();
    // Let the context be torn down and the scene remount.
    await page.waitForTimeout(1500);

    await expect.poll(() => page.evaluate(() => window.__AETHER_TEST__!.getMetrics().canvasReady)).toBe(true);
    await assertRenderTracksPhysics(page);

    // And the simulation is still live afterwards, not a frozen scene.
    await page.evaluate(() => window.__AETHER_TEST__!.setPaused(false));
    const before = await page.evaluate(() =>
      window.__AETHER_TEST__!.getRenderSnapshot().bodies.map((b) => b.position.x));
    await page.waitForTimeout(900);
    const after = await page.evaluate(() =>
      window.__AETHER_TEST__!.getRenderSnapshot().bodies.map((b) => b.position.x));
    expect(after.some((x, i) => Math.abs(x - before[i]) > 1e-6)).toBe(true);
    await page.evaluate(() => window.__AETHER_TEST__!.setPaused(true));
    await assertRenderTracksPhysics(page);
  });
});
