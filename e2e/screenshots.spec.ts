/**
 * README screenshot capture.
 *
 * Not part of the regular suite: it writes PNGs into `docs/screenshots/` rather
 * than asserting anything, so it only runs when explicitly asked for.
 *
 *   CAPTURE_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts --project=chromium
 *
 * Kept in the repo so the README images can be regenerated after a UI change
 * instead of being re-shot by hand.
 */
import { test, expect, type Page } from '@playwright/test';
import { e2eUrl, FIXTURE_MINIMAL, FIXTURE_SOLAR, waitForSimulationReady } from './helpers';

const OUT = 'docs/screenshots';
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

test.skip(
  !process.env.CAPTURE_SCREENSHOTS,
  'Set CAPTURE_SCREENSHOTS=1 to regenerate the README images.',
);

// The README is in English. `locale` alone is not enough: Chromium formats
// `<input type="number">` from its own UI language, so a machine set to a
// comma-decimal locale renders Saturn's mass as "95,16". `--lang` fixes that,
// but overriding launchOptions drops the WebGL args from playwright.config.ts,
// so they are repeated here.
test.use({
  locale: 'en-US',
  launchOptions: {
    args: ['--lang=en-US', '--use-gl=angle', '--ignore-gpu-blocklist', '--enable-webgl'],
  },
});

// Screenshots are documentation, not assertions: run them one at a time so the
// WebGL contexts do not compete for the GPU and produce a half-drawn frame.
test.describe.configure({ mode: 'serial' });

/** Let the renderer settle: physics running, bloom converged, panels animated in. */
async function settle(page: Page, ms = 2500): Promise<void> {
  await page.evaluate(() => {
    window.__AETHER_TEST__!.setPaused(false);
    window.__AETHER_TEST__!.setSpeed(1);
  });
  await page.waitForTimeout(ms);
}

async function bodyIdByName(page: Page, name: string): Promise<string> {
  const id = await page.evaluate((wanted) => {
    const bodies = window.__AETHER_TEST__!.getPhysicsSnapshot();
    return bodies.find((b) => b.name === wanted)?.id ?? null;
  }, name);
  if (!id) throw new Error(`No body named "${name}" in the current scene`);
  return id;
}

test('main menu', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/?e2e=1&onboarding=seen');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  // The 3D backdrop fades in; without this the hero sits on a flat void.
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/main-menu.png` });
});

test('universe creator with the real-system presets', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/?e2e=1&onboarding=seen');
  await page.getByTestId('menu-new-universe').click();
  await expect(page.getByTestId('menu-composer')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/universe-creator.png` });
});

test('solar system with both desktop rails', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto(e2eUrl(FIXTURE_SOLAR));
  await waitForSimulationReady(page);
  await settle(page, 4000);
  await page.screenshot({ path: `${OUT}/solar-system.png` });

  // Same scene, inspector docked on a ringed gas giant.
  await page.evaluate((id) => window.__AETHER_TEST__!.openInspector(id), await bodyIdByName(page, 'Saturn'));
  await expect(page.getByTestId('inspector-panel')).toBeVisible();
  // Otherwise the subject drifts out of the framed canvas while the shot waits.
  await page.getByRole('button', { name: 'Lock camera to selection' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/inspector.png` });
});

test('beginner and advanced creation docks', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto(e2eUrl(FIXTURE_MINIMAL));
  await waitForSimulationReady(page);
  await settle(page, 2000);

  await page.getByTestId('open-settings').click();
  await page.getByTestId('ui-mode-beginner').click();
  await page.getByTestId('settings-close').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/beginner-mode.png` });

  await page.getByTestId('open-settings').click();
  await page.getByTestId('ui-mode-advanced').click();
  await page.getByTestId('settings-close').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/advanced-mode.png` });
});

test('black hole created with the slingshot gesture', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto(e2eUrl(FIXTURE_MINIMAL));
  await waitForSimulationReady(page);
  await settle(page, 1500);

  // On the desktop tier the creation dock sits behind the docked outliner rail,
  // so a real click lands on the outliner. Dispatch straight at the button.
  await page.getByRole('button', { name: 'Hole' }).dispatchEvent('click');

  // Press to place, drag to aim, release to launch.
  const canvas = page.locator('.canvas-viewport');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width * 0.42;
  const cy = box.y + box.height * 0.5;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 90, cy + 40, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(() => page.evaluate(() => window.__AETHER_TEST__!.getStore().bodyCount))
    .toBeGreaterThan(3);

  await settle(page, 2500);
  await page.screenshot({ path: `${OUT}/black-hole.png` });
});

test('phone inspector sheet', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(e2eUrl(FIXTURE_SOLAR));
  await waitForSimulationReady(page);
  await settle(page, 3000);

  await page.evaluate((id) => window.__AETHER_TEST__!.openInspector(id), await bodyIdByName(page, 'Earth'));
  await expect(page.getByTestId('inspector-panel')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/mobile-inspector.png` });
});
