import { test, expect, type Page } from '@playwright/test';
import { e2eUrl, waitForSimulationReady, FIXTURE_MINIMAL } from './helpers';

const PHONE_MAX = 767;
const DESKTOP_MIN = 1280;

async function viewportWidth(page: Page): Promise<number> {
  return page.viewportSize()?.width ?? 0;
}

/**
 * Long-press an outliner row, which selects the body and opens the inspector.
 * Defaults to the first row (the primary star in every fixture); pass `last`
 * when the test needs a body that actually orbits something.
 */
async function openInspectorFromOutliner(page: Page, which: 'first' | 'last' = 'first'): Promise<void> {
  const rows = page.locator('[data-testid^="outliner-row-"]');
  const row = which === 'last' ? rows.last() : rows.first();
  await row.waitFor();
  // The phone outliner is a short scroller; a row below the fold would
  // otherwise be long-pressed at an off-screen coordinate.
  await row.scrollIntoViewIfNeeded();
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700); // > BODY_LONG_PRESS_MS
  await page.mouse.up();
  const panel = page.locator('[data-testid="inspector-panel"]');
  await panel.waitFor();
  // Let the entrance animation finish, otherwise geometry and transform
  // assertions sample a frame mid-flight.
  await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
}

test.beforeEach(async ({ page }) => {
  await page.goto(e2eUrl(FIXTURE_MINIMAL));
  await waitForSimulationReady(page);
});

test.describe('layout tiers', () => {
  test('reports a breakpoint that matches the viewport width', async ({ page }) => {
    const width = await viewportWidth(page);
    const expected = width <= PHONE_MAX ? 'phone' : width < DESKTOP_MIN ? 'tablet' : 'desktop';
    await expect(page.locator('[data-testid="simulation-root"]'))
      .toHaveAttribute('data-breakpoint', expected);
  });
});

test.describe('desktop rails', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < DESKTOP_MIN, 'desktop only');

  test('opening the inspector insets the canvas and closing restores it', async ({ page }) => {
    const canvas = page.locator('.canvas-viewport');
    const before = (await canvas.boundingBox())!;

    await openInspectorFromOutliner(page);
    await expect(page.locator('[data-testid="inspector-panel"]'))
      .toHaveAttribute('data-detent', 'docked');

    const during = (await canvas.boundingBox())!;
    // 22rem rail at the default 16px root = 352px.
    expect(before.width - during.width).toBeGreaterThan(300);
    expect(before.width - during.width).toBeLessThan(400);

    await page.locator('[data-testid="inspector-close"]').click();
    await expect(page.locator('[data-testid="inspector-panel"]')).toHaveCount(0);
    const after = (await canvas.boundingBox())!;
    expect(after.width).toBeCloseTo(before.width, 0);
  });

  test('drops the HUD scale transform on the docked rail', async ({ page }) => {
    // The --hud-scale transform pairs with a .touch-target compensation rule
    // that only exists below 768px. If one is ever moved without the other,
    // hit areas silently break; this is the standing guard.
    await openInspectorFromOutliner(page);
    const transform = await page.locator('[data-testid="inspector-panel"]')
      .evaluate((el) => getComputedStyle(el).transform);
    expect(transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
  });

  test('shows every section at once instead of tabs', async ({ page }) => {
    await openInspectorFromOutliner(page);
    await expect(page.locator('[data-testid="inspector-tab-props"]')).toHaveCount(0);
    const sections = page.locator('[data-testid^="inspector-section-"]');
    expect(await sections.count()).toBeGreaterThan(2);
  });
});

test.describe('phone bottom sheet', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > PHONE_MAX, 'phone only');

  test('opens at the half detent and leaves the canvas full-bleed', async ({ page }) => {
    const canvas = page.locator('.canvas-viewport');
    const before = (await canvas.boundingBox())!;
    await openInspectorFromOutliner(page);
    await expect(page.locator('[data-testid="inspector-panel"]'))
      .toHaveAttribute('data-detent', 'half');
    // Rails are a desktop-only affordance; the phone sheet overlays instead.
    expect((await canvas.boundingBox())!.width).toBeCloseTo(before.width, 0);
  });

  test('dragging the handle up expands to full and down collapses to peek', async ({ page }) => {
    await openInspectorFromOutliner(page);
    const panel = page.locator('[data-testid="inspector-panel"]');
    const handle = page.locator('[data-testid="inspector-sheet-handle"]');

    /**
     * Slow enough that the release velocity stays under the fling threshold,
     * so the sheet snaps to the nearest detent by position rather than
     * stepping one detent in the direction of travel.
     */
    const dragSlowly = async (dy: number) => {
      const box = (await handle.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(x, y + (dy * i) / steps);
        await page.waitForTimeout(90);
      }
      await page.mouse.up();
    };

    await dragSlowly(-260);
    await expect(panel).toHaveAttribute('data-detent', 'full');

    await dragSlowly(400);
    await expect(panel).toHaveAttribute('data-detent', 'peek');
  });

  test('a fast flick steps one detent in the direction of travel', async ({ page }) => {
    await openInspectorFromOutliner(page);
    const panel = page.locator('[data-testid="inspector-panel"]');
    const handle = page.locator('[data-testid="inspector-sheet-handle"]');
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 4; i++) await page.mouse.move(x, y - i * 20);
    await page.mouse.up();
    // half -> full, regardless of how far the flick actually travelled.
    await expect(panel).toHaveAttribute('data-detent', 'full');
  });

  test('hides the tab bar at the peek detent but keeps the key stats', async ({ page }) => {
    await openInspectorFromOutliner(page);
    const panel = page.locator('[data-testid="inspector-panel"]');
    await expect(page.locator('[data-testid="inspector-tab-props"]')).toBeVisible();

    // A downward flick from `half` steps to `peek`.
    const box = (await page.locator('[data-testid="inspector-sheet-handle"]').boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 4; i++) await page.mouse.move(x, y + i * 20);
    await page.mouse.up();

    await expect(panel).toHaveAttribute('data-detent', 'peek');
    await expect(page.locator('[data-testid="inspector-tab-props"]')).toHaveCount(0);
    // The peek detent is only worth having if it still says something.
    await expect(panel.getByText('Mass', { exact: true })).toBeVisible();
  });

  test('keeps every touch target at least 44px after the HUD scale transform', async ({ page }) => {
    // getBoundingClientRect reflects the CSS scale, so this directly tests the
    // .touch-target compensation rule rather than the authored min-width.
    const undersized = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of Array.from(document.querySelectorAll('.touch-target'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue; // not rendered
        if (r.width < 43.5 || r.height < 43.5) {
          bad.push(`${el.tagName}.${el.className.toString().slice(0, 40)} ${r.width}x${r.height}`);
        }
      }
      return bad;
    });
    expect(undersized).toEqual([]);
  });
});

test.describe('outliner', () => {
  test('filters rows by search query', async ({ page }) => {
    const rows = page.locator('[data-testid^="outliner-row-"]');
    const total = await rows.count();
    expect(total).toBeGreaterThan(1);

    const name = await rows.first().locator('[data-testid="outliner-name"]').innerText();
    await page.locator('[data-testid="outliner-search"]').fill(name.trim());
    await expect(rows).toHaveCount(1, { timeout: 5_000 });

    await page.locator('[data-testid="outliner-search"]').fill('');
    await expect(rows).toHaveCount(total, { timeout: 5_000 });
  });

  test('switches to flat mode when a filter is active', async ({ page }) => {
    const outliner = page.locator('[data-testid="outliner-panel"]');
    await expect(outliner).toHaveAttribute('data-mode', 'tree');
    await page.locator('[data-testid="outliner-search"]').fill('a');
    await expect(outliner).toHaveAttribute('data-mode', 'flat');
  });

  test('narrows the list to one category chip', async ({ page }) => {
    const chip = page.locator('[data-testid^="outliner-chip-"]').first();
    await chip.click();
    await expect(chip).toHaveAttribute('data-active', 'true');
    const rows = page.locator('[data-testid^="outliner-row-"]');
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('stays mounted while the inspector is open', async ({ page }) => {
    // It used to be unmounted entirely, which is why it could never be used
    // to move between bodies without closing the panel first.
    await openInspectorFromOutliner(page);
    await expect(page.locator('[data-testid="outliner-panel"]')).toHaveCount(1);
  });
});

test.describe('inspector information architecture', () => {
  test('collapses and expands a section', async ({ page }) => {
    await openInspectorFromOutliner(page);
    const section = page.locator('[data-testid="inspector-section-physical"]');
    await expect(section).toHaveAttribute('data-open', 'true');
    await section.locator('button').first().click();
    await expect(section).toHaveAttribute('data-open', 'false');
    await section.locator('button').first().click();
    await expect(section).toHaveAttribute('data-open', 'true');
  });

  test('marks derived groups read-only', async ({ page }) => {
    await openInspectorFromOutliner(page);
    const derived = page.locator('[data-testid="inspector-derived-physical"]');
    await expect(derived).toHaveAttribute('aria-readonly', 'true');
  });

  test('does not apply staged orbital edits until Apply is pressed', async ({ page }) => {
    // The last row is a planet; the first is the primary star, which has no
    // parent and therefore no orbit to edit.
    await openInspectorFromOutliner(page, 'last');

    // Narrow layouts page by tab, so the orbital section is not in the DOM
    // until its tab is selected; the desktop rail renders it unconditionally.
    const tab = page.locator('[data-testid="inspector-tab-orbit"]');
    if (await tab.count()) await tab.click();

    const orbit = page.locator('[data-testid="inspector-section-orbital"]');
    await orbit.waitFor();
    if (await orbit.getAttribute('data-open') === 'false') {
      await orbit.locator('button').first().click();
    }

    const slider = page.locator('[data-testid="inspector-field-semi-major"]');
    if (!(await slider.count())) test.skip(true, 'body has no parent to orbit');

    // Pause first, so any position change can only come from an Apply.
    await page.evaluate(() => window.__AETHER_TEST__!.setPaused(true));
    const readPositions = () =>
      page.evaluate(() =>
        window.__AETHER_TEST__!.getPhysicsSnapshot()
          .map((b) => `${b.id}:${b.position.x},${b.position.y},${b.position.z}`).join('|'));
    const before = await readPositions();

    await slider.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');

    // Staged, not committed: the Apply button reports itself dirty and nothing
    // in the simulation has moved.
    await expect(page.locator('[data-testid="inspector-apply-orbit"]'))
      .toHaveAttribute('data-dirty', 'true');
    expect(await readPositions()).toBe(before);

    await page.locator('[data-testid="inspector-apply-orbit"]').click();
    expect(await readPositions()).not.toBe(before);
  });
});
