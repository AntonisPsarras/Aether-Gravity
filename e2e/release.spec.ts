import { test, expect, type Page } from '@playwright/test';
import { e2eUrl, FIXTURE_MINIMAL, FIXTURE_SOLAR, waitForSimulationReady } from './helpers';

async function assertRenderTracksPhysics(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    const renderPath = '/utils/renderPosition.ts';
    const { bodyRenderPosition } = await import(/* @vite-ignore */ renderPath);
    const fixture = (window as any).__AETHER_VISUAL_TEST__;
    const bodies = fixture.getLiveBodies();
    const render = window.__AETHER_TEST__!.getRenderSnapshot();
    let worst = 0;
    for (const b of bodies) {
      const actual = render.bodies.find(r => r.id === b.id);
      if (!actual) return Infinity;
      const expected = bodyRenderPosition(b.position.clone(), b, bodies.find((p: {id: string}) => p.id === b.parentId),
        b.position.clone().set(render.floatingOffset.x, render.floatingOffset.y, render.floatingOffset.z), fixture.getStore().uiMode);
      worst = Math.max(worst, Math.hypot(actual.position.x - expected.x, actual.position.y - expected.y, actual.position.z - expected.z));
    }
    return worst;
  })).toBeLessThan(.001);
}

test('meshes follow edits, deletion, snapshot restoration and a floating-origin shift', async ({ page }) => {
  await page.goto(e2eUrl(FIXTURE_SOLAR, { tier: 'low', touch: '1' }));
  await waitForSimulationReady(page);
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__AETHER_TEST__!.setPaused(true));
  await assertRenderTracksPhysics(page);
  await page.evaluate(async () => {
    const fixture = (window as any).__AETHER_VISUAL_TEST__;
    (window as any).__releaseSnapshot = fixture.captureSimulation();
    const store = fixture.getStore();
    const sun = store.bodies.find((b: {name: string}) => b.name === 'Sun');
    store.updateBody(sun.id, { mass: sun.mass * 1.01 });
  });
  await assertRenderTracksPhysics(page);
  await page.evaluate(async () => {
    const useStore = {getState: (window as any).__AETHER_VISUAL_TEST__.getStore};
    const victim = useStore.getState().bodies.find((b: {name: string}) => b.name === 'Mercury');
    useStore.getState().removeBody(victim.id);
  });
  await assertRenderTracksPhysics(page);
  await page.evaluate(async () => {
    const useStore = {getState: (window as any).__AETHER_VISUAL_TEST__.getStore};
    useStore.getState().restoreSimulation((window as any).__releaseSnapshot);
  });
  await assertRenderTracksPhysics(page);
  const beforeOffset = await page.evaluate(() => window.__AETHER_TEST__!.getRenderSnapshot().floatingOffset.x);
  await page.evaluate(() => (window as any).__AETHER_VISUAL_TEST__.shiftCamera());
  await expect.poll(() => page.evaluate(() => window.__AETHER_TEST__!.getRenderSnapshot().floatingOffset.x), { timeout: 10000 }).toBeGreaterThan(beforeOffset + 50000);
  await assertRenderTracksPhysics(page);
});

test('numeric mass drafts preserve exponents and commit only on blur or Enter', async ({ page }) => {
  await page.goto(e2eUrl(FIXTURE_MINIMAL));
  await waitForSimulationReady(page);
  const id = await page.evaluate(() => {
    const api = window.__AETHER_TEST__!; api.setPaused(true);
    const b = api.getPhysicsSnapshot().find(b => b.type === 'Planet')!;
    api.openInspector(b.id); return b.id;
  });
  const input = page.getByTestId('inspector-field-mass');
  await input.fill('1e-');
  await page.waitForTimeout(650);
  await expect(input).toHaveValue('1e-');
  await input.fill('1e-8');
  await input.press('Enter');
  await expect.poll(() => page.evaluate(id => window.__AETHER_TEST__!.getPhysicsSnapshot().find(b => b.id === id)!.mass, id)).toBe(1e-8);
  await expect(input).toHaveValue('1e-8');
  await input.fill(''); await input.press('Tab');
  await expect(input).toHaveValue('1e-8');
  await input.fill('2e-8'); await input.press('Tab');
  await expect.poll(() => page.evaluate(id => window.__AETHER_TEST__!.getPhysicsSnapshot().find(b => b.id === id)!.mass, id)).toBe(2e-8);
});

test('a second finger cannot replace or release the slingshot owner', async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'touch viewport only');
  await page.goto(e2eUrl(FIXTURE_MINIMAL, { touch: '1' }));
  await waitForSimulationReady(page);
  await page.evaluate(async () => {
    window.__AETHER_TEST__!.setPaused(true);
    (window as any).__AETHER_VISUAL_TEST__.getStore().setOutlinerOpen(false);
  });
  const tool = page.locator('.creation-toolbar-anchor button').filter({ hasText: /^Planet$/ });
  await tool.evaluate((b: HTMLButtonElement) => b.click());
  const box = (await page.locator('[data-testid="sim-canvas"] canvas').boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const first = { id: 1, x: Math.round(box.x + box.width * .65), y: Math.round(box.y + box.height * .4) };
  const second = { id: 2, x: first.x - 70, y: first.y + 35 };
  const count = await page.evaluate(() => window.__AETHER_TEST__!.getStore().bodyCount);
  await page.evaluate(() => {
    (window as any).__pointerAudit = [];
    for (const type of ['pointerdown', 'pointerup', 'pointercancel']) window.addEventListener(type, (e: any) => (window as any).__pointerAudit.push({ type, id: e.pointerId, x: e.clientX, y: e.clientY }));
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [second] });
  const events = await page.evaluate(() => (window as any).__pointerAudit as {type: string; id: number}[]);
  expect(events.find(e => e.type === 'pointerup')?.id).toBe(events[1].id);
  expect(await page.evaluate(() => window.__AETHER_TEST__!.getStore().bodyCount)).toBe(count);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...first, x: first.x + 45 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.__AETHER_TEST__!.getStore().bodyCount)).toBe(count + 1);
  await assertRenderTracksPhysics(page);
  await cdp.detach();
});

test('undo and redo restore live moon phase, clock and mesh positions', async ({ page }) => {
  await page.goto(e2eUrl(FIXTURE_SOLAR, { tier: 'low' }));
  await waitForSimulationReady(page);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__AETHER_TEST__!.setPaused(true));
  const capture = () => page.evaluate(() => (window as any).__AETHER_VISUAL_TEST__.captureSimulation());
  const before = await capture();
  await page.locator('.creation-toolbar-anchor button').filter({ hasText: /^Moon$/ })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page.locator('[data-testid^="moon-parent-"]:not([disabled])').first().click();
  await page.getByTestId('moon-create').click();
  await page.evaluate(() => window.__AETHER_TEST__!.setPaused(false));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__AETHER_TEST__!.setPaused(true));
  const after = await capture();
  expect(after.simTime).toBeGreaterThan(before.simTime);
  const historyButtons = page.getByTestId('control-bar').locator('button');
  await historyButtons.nth(0).click();
  expect(await capture()).toEqual(before);
  await assertRenderTracksPhysics(page);
  await historyButtons.nth(1).click();
  expect(await capture()).toEqual(after);
  await assertRenderTracksPhysics(page);
});
