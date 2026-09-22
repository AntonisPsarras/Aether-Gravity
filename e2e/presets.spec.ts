import { test, expect } from '@playwright/test';
import { activateControl, e2eUrl, waitForSimulationReady } from './helpers';

for (const width of [1280, 390]) {
  for (const [id, count, views] of [
    ['solar-system', 21, ['Inner planets', 'Full system']],
    ['trappist-1', 8, ['Overview']],
  ] as const) {
    test(`${id} guided views and both modes at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(e2eUrl(`preset:${id}`, { tier: width === 390 ? 'low' : 'high' }));
      await waitForSimulationReady(page);
      await page.evaluate(() => window.__AETHER_TEST__!.setPaused(true));
      await page.waitForTimeout(200);
      const initial = await page.evaluate(() => window.__AETHER_TEST__!.getPhysicsSnapshot());
      expect(initial).toHaveLength(count);
      for (const mode of ['beginner', 'advanced']) {
        await activateControl(page.getByTestId('open-settings'));
        await expect(page.getByTestId('settings-panel')).toBeVisible();
        const modeControl = page.getByTestId(`ui-mode-${mode}`);
        await activateControl(modeControl);
        await expect(modeControl).toHaveAttribute('aria-checked', 'true');
        await expect(page.getByTestId('preset-science')).toContainText('Physical distances');
        await activateControl(page.getByTestId('settings-close'));
        await expect(page.getByTestId('settings-panel')).toHaveCount(0);
        for (const view of views) {
          await activateControl(page.getByTestId('open-settings'));
          await expect(page.getByTestId('settings-panel')).toBeVisible();
          await activateControl(page.getByRole('button', { name: view, exact: true }));
          await expect(page.getByTestId('settings-panel')).toHaveCount(0);
          await expect.poll(() => page.evaluate(() => window.__AETHER_TEST__!.getStore().guidedView)).toBe(view);
          const drawn = await page.evaluate(() => window.__AETHER_TEST__!.getRenderSnapshot());
          expect(drawn.bodies).toHaveLength(count);
          expect(drawn.bodies.every(b => Object.values(b.position).every(Number.isFinite))).toBe(true);
          await page.screenshot({ path: info.outputPath(`${mode}-${view.replaceAll(' ', '-')}.png`) });
        }
        expect(await page.evaluate(() => window.__AETHER_TEST__!.getPhysicsSnapshot())).toEqual(initial);
      }
      // Both forward and reverse playback must retain the preset body set.
      for (const speed of [4, -2]) {
        await page.evaluate(s => { window.__AETHER_TEST__!.setSpeed(s); window.__AETHER_TEST__!.setPaused(false); }, speed);
        await page.waitForTimeout(800);
        expect(await page.evaluate(() => window.__AETHER_TEST__!.getPhysicsSnapshot().length)).toBe(count);
      }
      await page.evaluate(() => window.__AETHER_TEST__!.setPaused(true));
      const saved = await page.evaluate(() => window.__AETHER_TEST__!.getWorldSnapshot());
      await page.evaluate(world => window.__AETHER_TEST__!.loadFixture(world), saved);
      await page.waitForTimeout(250);
      const reloaded = await page.evaluate(() => window.__AETHER_TEST__!.getWorldSnapshot());
      expect(reloaded.settings.simTime).toBe(saved.settings.simTime);
      expect(reloaded.bodies).toHaveLength(count);
      for (let i = 0; i < count; i++) {
        expect(reloaded.bodies[i].properties?.physicalCollisions).toBe(true);
        expect(Math.hypot(...(['x', 'y', 'z'] as const).map(k => reloaded.bodies[i].position[k] - saved.bodies[i].position[k]))).toBeLessThan(1e-7);
      }
      await page.evaluate(bodyId => window.__AETHER_TEST__!.openInspector(bodyId), initial[1].id);
      await expect(page.getByTestId('inspector-panel')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}
