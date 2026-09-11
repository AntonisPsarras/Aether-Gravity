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

  test('expands the outliner in place without shifting the simulation viewport', async ({ page }) => {
    const outliner = page.getByTestId('outliner-panel');
    const dock = page.getByTestId('creation-toolbar');
    const canvas = page.locator('.canvas-viewport');
    const toggle = page.getByRole('button', { name: /Universe Outliner/ });
    const expanded = (await outliner.boundingBox())!;

    const toolbar = page.getByTestId('control-bar');
    const canvasBefore = (await canvas.boundingBox())!;
    const toolbarBox = (await toolbar.boundingBox())!;

    expect(expanded.x).toBeCloseTo(16, 0);
    expect(expanded.y).toBeCloseTo(toolbarBox.y, 0);
    expect(expanded.width).toBeGreaterThanOrEqual(19 * 16);
    // The three-body fixture must use its intrinsic content height. A desktop
    // rail used to force the viewport cap here, leaving a large empty card.
    expect(expanded.height).toBeLessThan(28 * 16);
    const title = outliner.locator('.universe-outliner-toggle .truncate');
    await expect(title).toHaveJSProperty('scrollWidth', await title.evaluate((element) => element.clientWidth));

    await toggle.click();
    await expect(outliner).toHaveAttribute('data-open', 'false');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await outliner.evaluate((element) => Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    ));
    const collapsed = (await outliner.boundingBox())!;
    expect(collapsed.x).toBeCloseTo(16, 0);
    expect(collapsed.y).toBeCloseTo(expanded.y, 0);
    expect(collapsed.width).toBeCloseTo(expanded.width, 0);
    expect(collapsed.height).toBeCloseTo(3.75 * 16, 0);
    expect(await outliner.evaluate((element) => getComputedStyle(element).borderTopLeftRadius))
      .not.toBe('0px');

    // Hovering only tints the header; it must not revive the old rail geometry.
    await toggle.hover();
    expect((await outliner.boundingBox())!).toEqual(collapsed);

    await toggle.click();
    await expect(outliner).toHaveAttribute('data-open', 'true');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect((await canvas.boundingBox())!).toEqual(canvasBefore);
    await outliner.evaluate((element) => Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    ));
    const restored = (await outliner.boundingBox())!;
    expect(restored.x).toBeCloseTo(expanded.x, 0);
    expect(restored.y).toBeCloseTo(expanded.y, 0);
    expect(restored.width).toBeCloseTo(expanded.width, 0);
    expect(restored.height).toBeCloseTo(expanded.height, 0);

    // The body remains interactive after reopening, rather than being removed
    // before its close transition completes.
    const firstRow = page.locator('[data-testid^="outliner-row-"]').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await expect(firstRow).toHaveAttribute('data-selected', 'true');

    // Verify the horizontal dock stays centred in the visible canvas area.
    const dockBox = (await dock.boundingBox())!;
    const canvasBox = (await canvas.boundingBox())!;
    expect(dockBox.x).toBeGreaterThanOrEqual(canvasBox.x);
    expect(dockBox.x + dockBox.width).toBeLessThanOrEqual(canvasBox.x + canvasBox.width + 1);
    expect(dockBox.x + dockBox.width / 2).toBeCloseTo(canvasBox.x + canvasBox.width / 2, 0);
    expect(dockBox.y + dockBox.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) - 20);

    await openInspectorFromOutliner(page);
    const betweenBothRails = (await canvas.boundingBox())!;
    const narrowedDock = (await dock.boundingBox())!;
    expect(narrowedDock.x).toBeGreaterThanOrEqual(betweenBothRails.x);
    expect(narrowedDock.x + narrowedDock.width).toBeLessThanOrEqual(betweenBothRails.x + betweenBothRails.width + 1);
    expect(narrowedDock.x + narrowedDock.width / 2)
      .toBeCloseTo(betweenBothRails.x + betweenBothRails.width / 2, 0);
  });

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

  test('animates the creation toolbar through a sized viewport', async ({ page }) => {
    const outliner = page.getByTestId('outliner-panel');
    if (await outliner.getAttribute('data-open') === 'true') {
      await page.getByRole('button', { name: /Universe Outliner/ }).click();
      await page.waitForTimeout(550); // creation toolbar re-enters after the sheet closes
    }

    const toolbar = page.getByTestId('creation-toolbar');
    const toggle = page.getByRole('button', { name: 'Collapse creation toolbar' });
    const open = (await toolbar.boundingBox())!;
    const toggleBox = (await toggle.boundingBox())!;

    await expect(toolbar).toHaveAttribute('data-expanded', 'true');
    expect(await toolbar.evaluate((element) => getComputedStyle(element).transitionProperty))
      .toContain('width');
    expect(open.height).toBeCloseTo(4.75 * 16, 0);
    expect(toggleBox.y - open.y)
      .toBeCloseTo(open.y + open.height - (toggleBox.y + toggleBox.height), 0);

    await toggle.click();
    await expect(toolbar).toHaveAttribute('data-expanded', 'false');
    await page.waitForTimeout(500);
    const collapsed = (await toolbar.boundingBox())!;
    expect(collapsed.width).toBeCloseTo(4.25 * 16, 0);
    expect(collapsed.width).toBeLessThan(open.width);

    await page.getByRole('button', { name: 'Expand creation toolbar' }).click();
    await expect(toolbar).toHaveAttribute('data-expanded', 'true');
    await page.waitForTimeout(500);
    expect((await toolbar.boundingBox())!.width).toBeCloseTo(open.width, 0);
  });

  test('reclaims the hidden creation dock space while the outliner is open', async ({ page }) => {
    const outliner = page.getByTestId('outliner-panel');
    const dock = page.getByTestId('creation-toolbar');
    const toggle = page.getByRole('button', { name: /Universe Outliner/ });

    // The outliner starts open. Close it to capture the normal stacked state.
    await toggle.click();
    await outliner.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    const collapsed = (await outliner.boundingBox())!;
    const visibleDock = (await dock.boundingBox())!;
    expect(collapsed.y + collapsed.height).toBeLessThan(visibleDock.y);

    await toggle.click();
    await outliner.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    await page.waitForTimeout(550); // creation dock exit transition
    const expanded = (await outliner.boundingBox())!;
    const hiddenDock = (await dock.boundingBox())!;
    const viewportHeight = page.viewportSize()?.height ?? 0;
    expect(expanded.height).toBeGreaterThan(collapsed.height + 100);
    expect(viewportHeight - (expanded.y + expanded.height)).toBeLessThanOrEqual(18);
    expect(hiddenDock.y).toBeGreaterThanOrEqual(viewportHeight);

    // Collapsing restores both controls to the non-overlapping stack.
    await toggle.click();
    await page.waitForTimeout(550);
    const restoredOutliner = (await outliner.boundingBox())!;
    const restoredDock = (await dock.boundingBox())!;
    expect(restoredOutliner.y + restoredOutliner.height).toBeLessThan(restoredDock.y);
    expect(restoredDock.y).toBeLessThan(viewportHeight);
  });

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

test.describe('phone HUD clearances', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > PHONE_MAX, 'phone only');

  /** Resolved pixel value of a :root custom property. */
  async function cssVarPx(page: Page, name: string): Promise<number> {
    return page.evaluate((prop) => {
      const probe = document.createElement('div');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.height = `var(${prop})`;
      document.body.appendChild(probe);
      const value = probe.getBoundingClientRect().height;
      probe.remove();
      return value;
    }, name);
  }

  test('reserves at least as much space as the control bar actually occupies', async ({ page }) => {
    // The constant is a clearance other panels are positioned against, so the
    // invariant — not the exact number — is what must hold. Catches drift in
    // either direction if the bar's padding or icon sizes change.
    const reserved = await cssVarPx(page, '--control-bar-mobile-height');
    const actual = (await page.getByTestId('control-bar').boundingBox())!.height;
    expect(actual).toBeGreaterThan(0);
    expect(actual).toBeLessThanOrEqual(reserved);
  });

  test('reserves at least as much space as the creation toolbar occupies', async ({ page }) => {
    const reserved = await cssVarPx(page, '--creation-toolbar-height');
    const actual = (await page.getByTestId('creation-toolbar').boundingBox())!.height;
    expect(actual).toBeGreaterThan(0);
    // The anchor adds pt-2 (8px) above the surface; the constant covers both.
    expect(actual + 8).toBeLessThanOrEqual(reserved);
  });

  test('keeps the control bar clear of a status bar when env() reports no inset', async ({ page }) => {
    // The notchless-Android case. Chromium derives safe-area insets from the
    // display cutout, so a phone with no cutout reports --safe-top: 0 even
    // though the WebView draws under a ~24dp status bar. The floor in the
    // phone :root override is the only thing holding the bar off it.
    await page.addStyleTag({ content: ':root { --safe-top: 0px; }' });
    const box = (await page.getByTestId('control-bar').boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(36);
  });

  test('gives the dense outliner chrome a 44px hit area', async ({ page }) => {
    // .touch-expand grows a ::before, not the box, so boundingBox() is blind to
    // it — probe the corners of the intended 44px square with elementFromPoint.
    const misses = await page.evaluate(() => {
      const bad: string[] = [];
      const REQUIRED = 43.5;
      for (const el of Array.from(document.querySelectorAll('.touch-expand'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        const half = REQUIRED / 2;
        for (const [dx, dy] of [[-half, 0], [half, 0], [0, -half], [0, half]]) {
          const hit = document.elementFromPoint(cx + dx, cy + dy);
          if (!hit || (hit !== el && !el.contains(hit))) {
            bad.push(`${el.tagName}.${el.className.toString().slice(0, 30)} @${dx},${dy}`);
          }
        }
      }
      return bad;
    });
    expect(misses).toEqual([]);
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
