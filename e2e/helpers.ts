import type { Page } from '@playwright/test';
import type { AetherTestAPI, PerfReport, StoreSnapshot } from '../utils/testBridge';

export const FIXTURE_MINIMAL = 'minimal-3body';
export const FIXTURE_STRESS = 'stress-20b';
/**
 * The real Solar System: 11 N-body bodies plus 11 Kepler-propagated moons.
 * This is the heaviest scene the app ships with, so it is the honest target for
 * the 60 FPS mobile budget.
 */
export const FIXTURE_SOLAR = 'preset:solar-system';

export function e2eUrl(fixture: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ e2e: '1', fixture, onboarding: 'seen', ...extra });
  return `/?${params.toString()}`;
}

export async function getTestApi(page: Page): Promise<AetherTestAPI> {
  const api = await page.evaluate(() => window.__AETHER_TEST__);
  if (!api) throw new Error('window.__AETHER_TEST__ is not installed');
  return api as AetherTestAPI;
}

export async function waitForSimulationReady(page: Page, timeoutMs = 30_000): Promise<void> {
  await page.waitForSelector('[data-testid="simulation-root"]', { timeout: timeoutMs });
  const ready = await page.evaluate(async (timeout) => {
    const api = window.__AETHER_TEST__;
    if (!api) return false;
    return api.waitForReady(timeout);
  }, timeoutMs);
  if (!ready) {
    throw new Error('Simulation did not become ready within timeout');
  }
}

export async function readStore(page: Page): Promise<StoreSnapshot> {
  return page.evaluate(() => window.__AETHER_TEST__!.getStore());
}

/**
 * Long-press an outliner row, which selects the body and opens the inspector.
 * Defaults to the first row (the primary star in every fixture); pass `last`
 * when the test needs a body that actually orbits something.
 *
 * Waits for the panel *while the press is still held* so a hitching main
 * thread cannot have pointer-up cancel the 400ms timer. Releases on
 * `document` because on phone, opening the inspector unmounts the row
 * before pointer-up.
 */
export async function openInspectorFromOutliner(
  page: Page,
  which: 'first' | 'last' = 'first',
): Promise<void> {
  const rows = page.locator('[data-testid^="outliner-row-"]');
  const row = which === 'last' ? rows.last() : rows.first();
  await row.waitFor();
  // The phone outliner is a short scroller; a row below the fold would
  // otherwise be long-pressed at an off-screen coordinate.
  await row.scrollIntoViewIfNeeded();
  const box = (await row.boundingBox())!;
  const point = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
  await row.dispatchEvent('pointerdown', {
    ...point,
    pointerId: 1,
    pointerType: 'touch',
    buttons: 1,
  });
  const panel = page.locator('[data-testid="inspector-panel"]');
  await panel.waitFor();
  if (await row.count()) {
    await row.dispatchEvent('pointerup', {
      ...point,
      pointerId: 1,
      pointerType: 'touch',
      buttons: 0,
    });
  } else {
    await page.evaluate(({ clientX, clientY }) => {
      document.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, pointerId: 1, pointerType: 'touch', buttons: 0, clientX, clientY,
      }));
    }, point);
  }
  // Let the entrance animation finish, otherwise geometry and transform
  // assertions sample a frame mid-flight.
  await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
}

export async function runPerfSoak(
  page: Page,
  durationMs: number,
): Promise<PerfReport> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('HeapProfiler.enable');
    await session.send('HeapProfiler.collectGarbage');
    const start = (await session.send('Runtime.getHeapUsage')).usedSize / 1048576;
    await page.evaluate(() => {
      window.__AETHER_TEST__!.setPaused(false);
      window.__AETHER_TEST__!.setSpeed(1);
      window.__AETHER_TEST__!.startMetricsCollection();
    });
    await page.waitForTimeout(durationMs);
    const report = await page.evaluate(() => window.__AETHER_TEST__!.stopMetricsCollection());
    await session.send('HeapProfiler.collectGarbage');
    const end = (await session.send('Runtime.getHeapUsage')).usedSize / 1048576;
    return { ...report, retainedJsHeapMb: { start, end, delta: end - start } };
  } finally {
    await session.detach();
  }
}
