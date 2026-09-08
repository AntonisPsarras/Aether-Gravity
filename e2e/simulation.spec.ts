import { test, expect } from '@playwright/test';
import {
  e2eUrl,
  FIXTURE_MINIMAL,
  readStore,
  waitForSimulationReady,
} from './helpers';

/** Headless CI runners advance physics much slower than local dev machines. */
const motionSettleMs = process.env.CI ? 5000 : 1500;

test.describe('Simulation controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(e2eUrl(FIXTURE_MINIMAL));
    await waitForSimulationReady(page);
  });

  test('pause stops physics evolution', async ({ page }) => {
    await page.getByTestId('control-pause').click();
    expect(await readStore(page)).toMatchObject({ paused: true });

    const atPause = await page.evaluate(() => window.__AETHER_TEST__!.getPhysicsSnapshot());
    await page.waitForTimeout(motionSettleMs);
    const afterPause = await page.evaluate(() => window.__AETHER_TEST__!.getPhysicsSnapshot());

    const planetIdx = 1;
    const driftWhilePaused =
      Math.abs(afterPause[planetIdx].position.x - atPause[planetIdx].position.x)
      + Math.abs(afterPause[planetIdx].position.z - atPause[planetIdx].position.z);
    expect(driftWhilePaused).toBeLessThan(0.05);

    await page.getByTestId('control-pause').click();
    expect(await readStore(page)).toMatchObject({ paused: false });

    await page.waitForTimeout(motionSettleMs);

    const afterResume = await page.evaluate(() => window.__AETHER_TEST__!.getPhysicsSnapshot());
    const driftAfterResume =
      Math.abs(afterResume[planetIdx].position.x - afterPause[planetIdx].position.x)
      + Math.abs(afterResume[planetIdx].position.z - afterPause[planetIdx].position.z);
    expect(driftAfterResume).toBeGreaterThan(0.5);
  });

  test('overlay toggles update store', async ({ page }) => {
    // The display toggles moved off the control bar into the settings sheet to
    // free up phone HUD space; the testids and store keys are unchanged.
    await page.getByTestId('open-settings').click();
    await expect(page.getByTestId('settings-panel')).toBeVisible();

    let store = await readStore(page);
    const initialGrid = store.showGrid;
    const initialDust = store.showDust;
    const initialHabitable = store.showHabitable;
    const initialOrbitPaths = store.showOrbitPaths;

    await page.getByTestId('toggle-grid').click();
    store = await readStore(page);
    expect(store.showGrid).toBe(!initialGrid);

    await page.getByTestId('toggle-dust').click();
    store = await readStore(page);
    expect(store.showDust).toBe(!initialDust);

    await page.getByTestId('toggle-habitable').click();
    store = await readStore(page);
    expect(store.showHabitable).toBe(!initialHabitable);

    await page.getByTestId('toggle-orbit-paths').click();
    store = await readStore(page);
    expect(store.showOrbitPaths).toBe(!initialOrbitPaths);

    await page.getByTestId('settings-close').click();
    await expect(page.getByTestId('settings-panel')).toHaveCount(0);
  });

  test('mode switch is live and non-destructive', async ({ page }) => {
    const before = await page.evaluate(() => window.__AETHER_TEST__!.getPhysicsSnapshot());

    await page.getByTestId('open-settings').click();
    await page.getByTestId('ui-mode-beginner').click();
    expect(await readStore(page)).toMatchObject({ uiMode: 'beginner' });

    await page.getByTestId('ui-mode-advanced').click();
    expect(await readStore(page)).toMatchObject({ uiMode: 'advanced' });
    await page.getByTestId('settings-close').click();

    // Switching modes is presentation-only: the body set is untouched.
    const after = await page.evaluate(() => window.__AETHER_TEST__!.getPhysicsSnapshot());
    expect(after.length).toBe(before.length);
  });

  test('physics energy drift stays bounded over 5 seconds', async ({ page }) => {
    await page.evaluate(() => {
      window.__AETHER_TEST__!.setPaused(false);
      window.__AETHER_TEST__!.setSpeed(1);
    });

    await page.waitForTimeout(5000);

    const energy = await page.evaluate(() => window.__AETHER_TEST__!.getEnergy());
    expect(energy.n).toBe(3);
    expect(energy.driftPercent).not.toBeNull();
    expect(energy.driftPercent!).toBeLessThan(15);
  });
});
