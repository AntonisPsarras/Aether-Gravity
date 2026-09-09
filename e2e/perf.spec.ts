import { test, expect } from '@playwright/test';
import {
  e2eUrl,
  FIXTURE_MINIMAL,
  FIXTURE_SOLAR,
  FIXTURE_STRESS,
  runPerfSoak,
  waitForSimulationReady,
} from './helpers';
import {
  bufferPerfRun,
  flushPerfMetricsReport,
  logPerfSummary,
  resetPerfRunBuffer,
} from './perfReport';

const SOAK_MS = Number(process.env.PERF_SOAK_MS ?? 5_000);
const MIN_FPS = Number(process.env.PERF_MIN_FPS ?? 30);

test.describe('Performance soak', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    resetPerfRunBuffer();
  });

  test.afterAll(async () => {
    await flushPerfMetricsReport(SOAK_MS);
  });

  test('minimal fixture maintains FPS floor', async ({ page }) => {
    const meta = {
      testName: 'minimal fixture maintains FPS floor',
      fixture: FIXTURE_MINIMAL,
      soakMs: SOAK_MS,
    };

    await page.goto(e2eUrl(FIXTURE_MINIMAL));
    await waitForSimulationReady(page);

    const report = await runPerfSoak(page, SOAK_MS);

    logPerfSummary(meta, report);
    bufferPerfRun(meta, report);

    expect(report.sampleCount).toBeGreaterThan(10);
    expect(report.contextLostCount).toBe(0);
    // CI VMs use software WebGL; MIN_FPS is lowered via workflow env (see playwright.yml).
    expect(report.fps.avg).toBeGreaterThan(MIN_FPS);

    test.info().attach('perf-minimal.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
  });

  test('stress-20b fixture maintains FPS floor', async ({ page }) => {
    test.skip(SOAK_MS < 10_000, 'Stress perf runs need PERF_SOAK_MS >= 10000');

    const meta = {
      testName: 'stress-20b fixture maintains FPS floor',
      fixture: FIXTURE_STRESS,
      soakMs: SOAK_MS,
    };

    await page.goto(e2eUrl(FIXTURE_STRESS));
    await waitForSimulationReady(page);

    const bodyCount = await page.evaluate(() => window.__AETHER_TEST__!.getStore().bodyCount);
    expect(bodyCount).toBe(20);

    const stressMinFps = Number(process.env.PERF_STRESS_MIN_FPS ?? 20);
    const report = await runPerfSoak(page, SOAK_MS);

    logPerfSummary(meta, report);
    bufferPerfRun(meta, report);

    expect(report.contextLostCount).toBe(0);
    expect(report.fps.avg).toBeGreaterThan(stressMinFps);

    test.info().attach('perf-stress-20b.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
  });

  test('solar system preset maintains FPS floor', async ({ page }) => {
    const meta = {
      testName: 'solar system preset maintains FPS floor',
      fixture: FIXTURE_SOLAR,
      soakMs: SOAK_MS,
    };

    await page.goto(e2eUrl(FIXTURE_SOLAR));
    await waitForSimulationReady(page);

    // 21 bodies total, but only the 10 free ones go through the O(N^2) pair
    // loop — the 11 moons are propagated analytically at O(1) each.
    const bodyCount = await page.evaluate(() => window.__AETHER_TEST__!.getStore().bodyCount);
    expect(bodyCount).toBe(21);

    const report = await runPerfSoak(page, SOAK_MS);

    logPerfSummary(meta, report);
    bufferPerfRun(meta, report);

    expect(report.contextLostCount).toBe(0);
    expect(report.fps.avg).toBeGreaterThan(MIN_FPS);

    test.info().attach('perf-solar-system.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
  });

  test('low-tier mobile profile completes soak', async ({ page }) => {
    const meta = {
      testName: 'low-tier mobile profile completes soak',
      fixture: FIXTURE_MINIMAL,
      soakMs: SOAK_MS,
      profile: 'tier=low, touch=1, dpr=1',
    };

    await page.goto(
      e2eUrl(FIXTURE_MINIMAL, { tier: 'low', touch: '1', dpr: '1' }),
    );
    await waitForSimulationReady(page);

    const tier = await page.evaluate(() => window.__AETHER_TEST__!.getMetrics().deviceTier);
    expect(tier).toBe('low');

    const report = await runPerfSoak(page, SOAK_MS);

    logPerfSummary(meta, report);
    bufferPerfRun(meta, report);

    expect(report.contextLostCount).toBe(0);
    expect(report.fps.avg).toBeGreaterThan(Number(process.env.PERF_LOW_TIER_MIN_FPS ?? 25));

    test.info().attach('perf-low-tier.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
  });

  test('steady-state physics stays off the allocation and Zustand hot paths', async ({ page }) => {
    await page.goto(e2eUrl(FIXTURE_STRESS, { tier: 'low', touch: '1', dpr: '1' }));
    await waitForSimulationReady(page);

    const storeIdentityStable = await page.evaluate(async () => {
      const store = (window as any).__AETHER_VISUAL_TEST__.getStore();
      const bodies = store.bodies;
      store.setPaused(false);
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      return (window as any).__AETHER_VISUAL_TEST__.getStore().bodies === bodies;
    });
    expect(storeIdentityStable).toBe(true);

    const session = await page.context().newCDPSession(page);
    await session.send('HeapProfiler.enable');
    await session.send('HeapProfiler.startSampling', { samplingInterval: 64 });
    await page.waitForTimeout(3_000);
    const { profile } = await session.send('HeapProfiler.stopSampling');
    await session.detach();

    const hotFunctions = new Set([
      'verletStepInPlace', 'computeAccelerationsInArray', 'clampBodiesInPlace',
      'clampPositionVector', 'scanCollisionsInPlace', 'runFixedSteps',
    ]);
    const sampledBytes: Record<string, number> = {};
    const visit = (node: any) => {
      const name = node.callFrame?.functionName;
      if (hotFunctions.has(name)) sampledBytes[name] = (sampledBytes[name] ?? 0) + (node.selfSize ?? 0);
      for (const child of node.children ?? []) visit(child);
    };
    visit(profile.head);
    test.info().attach('physics-allocation-sampling.json', {
      body: JSON.stringify(sampledBytes, null, 2),
      contentType: 'application/json',
    });
    expect(sampledBytes).toEqual({});
  });
});
