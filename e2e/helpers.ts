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

export async function runPerfSoak(
  page: Page,
  durationMs: number,
): Promise<PerfReport> {
  await page.evaluate((ms) => {
    window.__AETHER_TEST__!.setPaused(false);
    window.__AETHER_TEST__!.setSpeed(1);
    window.__AETHER_TEST__!.startMetricsCollection();
    return ms;
  }, durationMs);
  await page.waitForTimeout(durationMs);
  return page.evaluate(() => window.__AETHER_TEST__!.stopMetricsCollection());
}
