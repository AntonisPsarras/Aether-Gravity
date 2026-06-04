import { test, expect } from '@playwright/test';
import {
  e2eUrl,
  FIXTURE_MINIMAL,
  readStore,
  waitForSimulationReady,
} from './helpers';

test.describe('Simulation controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(e2eUrl(FIXTURE_MINIMAL));
    await waitForSimulationReady(page);
  });

  test('pause stops physics evolution', async ({ page }) => {
    await page.getByTestId('control-pause').click();
    expect(await readStore(page)).toMatchObject({ paused: true });

    const atPause = await page.evaluate(() => window.__AETHER_TEST__!.getPhysicsSnapshot());
    await page.waitForTimeout(1500);
    const afterPause = await page.evaluate(() => window.__AETHER_TEST__!.getPhysicsSnapshot());

    const planetIdx = 1;
    const driftWhilePaused =
      Math.abs(afterPause[planetIdx].position.x - atPause[planetIdx].position.x)
      + Math.abs(afterPause[planetIdx].position.z - atPause[planetIdx].position.z);
    expect(driftWhilePaused).toBeLessThan(0.05);

    await page.getByTestId('control-pause').click();
    expect(await readStore(page)).toMatchObject({ paused: false });

    await page.waitForTimeout(1500);

    const afterResume = await page.evaluate(() => window.__AETHER_TEST__!.getPhysicsSnapshot());
    const driftAfterResume =
      Math.abs(afterResume[planetIdx].position.x - afterPause[planetIdx].position.x)
      + Math.abs(afterResume[planetIdx].position.z - afterPause[planetIdx].position.z);
    expect(driftAfterResume).toBeGreaterThan(0.5);
  });

  test('overlay toggles update store', async ({ page }) => {
    let store = await readStore(page);
    const initialGrid = store.showGrid;
    const initialDust = store.showDust;
    const initialHabitable = store.showHabitable;

    await page.getByTestId('toggle-grid').click();
    store = await readStore(page);
    expect(store.showGrid).toBe(!initialGrid);

    await page.getByTestId('toggle-dust').click();
    store = await readStore(page);
    expect(store.showDust).toBe(!initialDust);

    await page.getByTestId('toggle-habitable').click();
    store = await readStore(page);
    expect(store.showHabitable).toBe(!initialHabitable);
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
