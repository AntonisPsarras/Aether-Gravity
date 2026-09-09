import { test, expect, type Page } from '@playwright/test';
import { e2eUrl, readStore, waitForSimulationReady, FIXTURE_MINIMAL } from './helpers';

/**
 * Body tap / long-press against the 3D hitboxes.
 *
 * Navigates with `touch=1` so `detectIsTouch()` takes the touch path — that is
 * what enables the screen-space hitbox floor and the touch branch of the
 * out/leave policy. Per playwright.config.ts, `mobile-chrome` deliberately does
 * not enable full mobile emulation, so specs that need the touch path opt in
 * here rather than in the project config.
 *
 * Gap worth naming: a genuine two-finger pinch is not expressible through
 * Playwright's mouse API, so "a second finger cancels the press" is covered at
 * the unit level in utils/bodyPointerGesture.test.ts, not here.
 */

/** Comfortably past BODY_LONG_PRESS_MS (400ms) without being flaky-slow. */
const HOLD_MS = 700;

type VisualTestApi = {
  getCameraPosition: () => { x: number; y: number; z: number };
  projectBodyToScreen: (id: string) => { x: number; y: number } | null;
};

declare global {
  interface Window {
    __AETHER_VISUAL_TEST__?: VisualTestApi;
  }
}

// The `chromium` project has no testMatch, so it would otherwise pick this up
// at desktop width, where the inspector docks as a rail and has no detents.
test.skip(({ hasTouch }) => !hasTouch, 'touch viewport only');

test.beforeEach(async ({ page }) => {
  await page.goto(e2eUrl(FIXTURE_MINIMAL, { touch: '1' }));
  await waitForSimulationReady(page);
  // Paused so a body cannot orbit out from under the coordinates between
  // projecting them and pressing. The gesture itself is unaffected.
  await page.evaluate(() => window.__AETHER_TEST__!.setPaused(true));
});

/** Id of the heaviest body — the largest, most reliably hittable target. */
async function primaryBodyId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const bodies = window.__AETHER_TEST__!.getPhysicsSnapshot();
    return bodies.reduce((a, b) => (b.mass > a.mass ? b : a)).id;
  });
}

async function bodyScreenPos(page: Page, bodyId: string): Promise<{ x: number; y: number }> {
  const pos = await page.evaluate(
    (id) => window.__AETHER_VISUAL_TEST__?.projectBodyToScreen(id) ?? null,
    bodyId,
  );
  if (!pos) throw new Error(`Body ${bodyId} has no screen projection`);
  return pos;
}

test.describe('body long press', () => {
  test('opens the inspector at the half detent', async ({ page }) => {
    const bodyId = await primaryBodyId(page);
    const { x, y } = await bodyScreenPos(page, bodyId);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(HOLD_MS);
    await page.mouse.up();

    const panel = page.locator('[data-testid="inspector-panel"]');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-detent', 'half');
    expect((await readStore(page)).selectedId).toBe(bodyId);
  });

  test('does not open the inspector when the press turns into a camera drag', async ({ page }) => {
    // The regression this pass exists for: the slop used to be checked only at
    // pointerup, so a drag that started on a body still fired longPress at the
    // threshold and snapped the inspector open mid-rotation.
    const bodyId = await primaryBodyId(page);
    const { x, y } = await bodyScreenPos(page, bodyId);

    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(x + i * 12, y);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(HOLD_MS);
    await page.mouse.up();
    await page.waitForTimeout(150);

    await expect(page.locator('[data-testid="inspector-panel"]')).toHaveCount(0);
  });

  test('still rotates the camera when the drag starts on a body', async ({ page }) => {
    // The reason the OrbitControls interlock is narrow rather than firing at
    // pointerdown: disabling controls there would leave the camera dead for
    // exactly this gesture, which works today.
    const bodyId = await primaryBodyId(page);
    const { x, y } = await bodyScreenPos(page, bodyId);
    const before = await page.evaluate(() => window.__AETHER_VISUAL_TEST__!.getCameraPosition());

    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(x + i * 14, y + i * 4);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await page.evaluate(() => window.__AETHER_VISUAL_TEST__!.getCameraPosition());
    const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
    expect(moved).toBeGreaterThan(0.5);
  });

  test('keeps the selection when the finger lifts off the body', async ({ page }) => {
    // Bodies move every physics frame and the camera can be rotating under the
    // finger, so a release often lands on empty space. That used to reach
    // onPointerMissed, which cleared the selection and closed the inspector the
    // press had just opened.
    const bodyId = await primaryBodyId(page);
    const { x, y } = await bodyScreenPos(page, bodyId);
    const viewport = page.viewportSize()!;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(HOLD_MS);
    // Release in a corner of the canvas, far from any body.
    await page.mouse.move(viewport.width - 8, Math.round(viewport.height * 0.45));
    await page.mouse.up();
    await page.waitForTimeout(200);

    expect((await readStore(page)).selectedId).toBe(bodyId);
    await expect(page.locator('[data-testid="inspector-panel"]')).toBeVisible();
  });
});

test.describe('body tap', () => {
  test('selects a body without opening the inspector', async ({ page }) => {
    const bodyId = await primaryBodyId(page);
    const { x, y } = await bodyScreenPos(page, bodyId);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
    await page.waitForTimeout(200);

    expect((await readStore(page)).selectedId).toBe(bodyId);
    await expect(page.locator('[data-testid="inspector-panel"]')).toHaveCount(0);
  });
});
