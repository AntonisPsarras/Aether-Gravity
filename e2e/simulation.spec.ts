import { test, expect } from '@playwright/test';
import {
  e2eUrl,
  FIXTURE_MINIMAL,
  FIXTURE_SOLAR,
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

  test('control bar grid toggle updates store', async ({ page }) => {
    // The grid toggle lives on the control bar as well as in the settings
    // sheet; both drive the same store action.
    const initial = (await readStore(page)).showGrid;
    await page.getByTestId('control-toggle-grid').click();
    expect((await readStore(page)).showGrid).toBe(!initial);
    await page.getByTestId('control-toggle-grid').click();
    expect((await readStore(page)).showGrid).toBe(initial);
  });

  test('overlay toggles update store', async ({ page }) => {
    // The display toggles moved off the control bar into the settings sheet to
    // free up phone HUD space; the testids and store keys are unchanged. The
    // grid is the exception — it is mirrored back onto the bar.
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

/**
 * Physics correctness is not evidence that the screen is correct: the integrator
 * and the render transform are updated by different code. A regression once left
 * every mesh frozen at its mount position while physics kept advancing, so bodies
 * merged that visually never touched. These assertions compare the two directly.
 */
test.describe('Rendered bodies track the physics state', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(e2eUrl(FIXTURE_SOLAR));
    await waitForSimulationReady(page);
    await page.evaluate(() => {
      window.__AETHER_TEST__!.setPaused(false);
      window.__AETHER_TEST__!.setSpeed(1);
    });
  });

  test('every body mesh is registered, moves, and matches its physics position', async ({ page }) => {
    const sample = () =>
      page.evaluate(() => ({
        physics: window.__AETHER_TEST__!.getPhysicsSnapshot(),
        render: window.__AETHER_TEST__!.getRenderSnapshot(),
      }));

    const before = await sample();
    await page.waitForTimeout(motionSettleMs);
    const after = await sample();

    const renderById = new Map(after.render.bodies.map((b) => [b.id, b.position]));
    const renderBefore = new Map(before.render.bodies.map((b) => [b.id, b.position]));

    // 1. Nothing may drop out of the render registry. The regression emptied it
    //    on the camera's first recenter, and every mesh silently stopped moving.
    expect(after.physics.length).toBeGreaterThan(1);
    for (const body of after.physics) {
      expect(renderById.has(body.id), `${body.name} has no render transform`).toBe(true);
    }

    const offset = after.render.floatingOffset;
    let movedCount = 0;

    for (const body of after.physics) {
      const now = renderById.get(body.id)!;
      const then = renderBefore.get(body.id);
      const physThen = before.physics.find((b) => b.id === body.id);
      if (!then || !physThen) continue;

      const physicsMoved = Math.hypot(
        body.position.x - physThen.position.x,
        body.position.z - physThen.position.z,
      );
      const renderMoved = Math.hypot(now.x - then.x, now.z - then.z);

      // 2. A body the engine moved must have moved on screen too.
      if (physicsMoved > 0.5) {
        movedCount++;
        expect(renderMoved, `${body.name} is frozen on screen`).toBeGreaterThan(0.1);
      }

      // 3. Free bodies are drawn at exactly world - floatingOffset. (Satellites
      //    are deliberately drawn at an exaggerated separation from their parent,
      //    so only the motion assertion above applies to them.)
      if (!body.isSatellite) {
        const err = Math.hypot(
          now.x + offset.x - body.position.x,
          now.y + offset.y - body.position.y,
          now.z + offset.z - body.position.z,
        );
        expect(err, `${body.name} render position drifted from physics`).toBeLessThan(0.5);
      }
    }

    // Guard the guard: if nothing moved, the assertions above proved nothing.
    expect(movedCount).toBeGreaterThan(0);
  });
});
