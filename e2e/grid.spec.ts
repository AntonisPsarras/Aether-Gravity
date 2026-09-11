/**
 * The spacetime grid must be a function of the bodies, never of the camera.
 *
 * The grid used to re-centre on the camera every frame, so orbiting or zooming
 * re-sampled every well: the funnels shook and changed shape with the viewing
 * angle. These tests pin the fix at the level the shader consumes — the
 * per-frame well/anchor state from `getGridSnapshot()` — and re-check that the
 * drawn bodies still sit on their physics positions.
 */
import { test, expect, type Page } from '@playwright/test';
import { e2eUrl, FIXTURE_SOLAR, waitForSimulationReady } from './helpers';

const snapshot = (page: Page) => page.evaluate(() => JSON.stringify(window.__AETHER_TEST__!.getGridSnapshot()));

async function setMode(page: Page, mode: 'beginner' | 'advanced') {
  await page.getByTestId('open-settings').click();
  await page.getByTestId(`ui-mode-${mode}`).click();
  await page.getByTestId('settings-close').click();
}

test.describe('Spacetime grid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(e2eUrl(FIXTURE_SOLAR));
    await waitForSimulationReady(page);
    await page.evaluate(() => window.__AETHER_TEST__!.setPaused(true));
    await page.waitForTimeout(400);
  });

  test('does not change when the camera orbits or zooms', async ({ page }) => {
    const before = await snapshot(page);
    expect(before).not.toBe('null');

    const box = (await page.locator('.canvas-viewport').boundingBox())!;
    const cx = box.x + box.width * 0.6;
    const cy = box.y + box.height * 0.55;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 160, cy - 60, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(1500); // let OrbitControls' damping settle
    expect(await snapshot(page)).toBe(before);

    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(1500);
    expect(await snapshot(page)).toBe(before);
  });

  for (const mode of ['beginner', 'advanced'] as const) {
    test(`centres every well under its drawn body in ${mode} mode`, async ({ page }) => {
      await setMode(page, mode);
      // Let a frame build with the new mode even though physics is paused.
      await page.evaluate(() => { window.__AETHER_TEST__!.setPaused(false); });
      await page.waitForTimeout(300);
      await page.evaluate(() => { window.__AETHER_TEST__!.setPaused(true); });
      await page.waitForTimeout(300);

      const result = await page.evaluate(() => {
        const api = window.__AETHER_TEST__!;
        const grid = api.getGridSnapshot()!;
        const drawn = api.getRenderSnapshot();
        const physics = api.getPhysicsSnapshot();
        const o = drawn.floatingOffset;
        let wellVsMesh = 0;
        let meshVsPhysics = 0;
        for (const w of grid.wells) {
          const mesh = drawn.bodies.find((b) => b.id === w.bodyId);
          if (mesh) {
            wellVsMesh = Math.max(wellVsMesh, Math.hypot(w.x - mesh.position.x, w.y - mesh.position.y, w.z - mesh.position.z));
          }
        }
        for (const b of physics) {
          if (b.isSatellite) continue; // drawn at an exaggerated separation by design
          const mesh = drawn.bodies.find((d) => d.id === b.id)!;
          meshVsPhysics = Math.max(meshVsPhysics, Math.hypot(
            mesh.position.x + o.x - b.position.x,
            mesh.position.y + o.y - b.position.y,
            mesh.position.z + o.z - b.position.z,
          ));
        }
        return { mode: grid.mode, primary: grid.primary.bodyId, wellVsMesh, meshVsPhysics, wells: grid.wells.length };
      });
      expect(result.mode).toBe(mode);
      expect(result.primary).toBe('solar-system-sun');
      expect(result.wells).toBe(21);
      expect(result.wellVsMesh).toBeLessThan(1e-2); // Float32 uniforms
      expect(result.meshVsPhysics).toBeLessThan(1e-6);
    });
  }

  test('holds every well steady while the system runs', async ({ page }) => {
    const report = await page.evaluate(async () => {
      const api = window.__AETHER_TEST__!;
      api.setSpeed(1);
      api.setPaused(false);
      const snaps = [];
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 100));
        snaps.push(api.getGridSnapshot()!);
      }
      api.setPaused(true);
      let worstSpread = 0;
      for (const w of snaps[0].wells) {
        const peaks = snaps.map((s) => s.wells.find((x) => x.bodyId === w.bodyId)!.peak);
        const max = Math.max(...peaks);
        if (max > 0.5) worstSpread = Math.max(worstSpread, (max - Math.min(...peaks)) / max);
      }
      const anchors = new Set(snaps.map((s) => s.primary.bodyId + '|' + s.discs.map((d) => d.bodyId).join()));
      return { worstSpread, anchorLayouts: anchors.size };
    });
    expect(report.anchorLayouts).toBe(1);
    expect(report.worstSpread).toBeLessThan(0.01);
  });
});
