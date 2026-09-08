import { test, expect, Page } from '@playwright/test';
import { e2eUrl, waitForSimulationReady } from './helpers';

async function visuals(page: Page) {
  return page.evaluate(() => (window as any).__AETHER_VISUALS__());
}

test('orbit estimates respond while paused, toggle, and survive scene replacement', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(e2eUrl('minimal-3body', { tier: 'high' }));
  await waitForSimulationReady(page);
  await page.evaluate(() => window.__AETHER_TEST__!.setPaused(true));
  await expect.poll(async () => (await visuals(page)).paths.length).toBeGreaterThan(0);
  const before = await visuals(page);
  const path = before.paths[0];
  await page.evaluate(async id => {

    const state = (window as any).__AETHER_VISUAL_TEST__.getStore();
    const body = state.bodies.find((b: any) => b.id === id);
    state.updateBody(id, { velocity: body.velocity.clone().multiplyScalar(0.9) });
  }, path.name.replace('orbit-estimate:', ''));
  await expect.poll(async () => (await visuals(page)).paths.find((p: any) => p.name === path.name)?.radius).not.toBe(path.radius);
  const toggle = page.getByRole('checkbox', { name: /Orbit estimates/ });
  await toggle.uncheck();
  await expect.poll(async () => (await visuals(page)).paths.length).toBe(0);
  await toggle.check();
  await expect.poll(async () => (await visuals(page)).paths.length).toBeGreaterThan(0);
  await page.evaluate(async () => {

    const state = (window as any).__AETHER_VISUAL_TEST__.getStore();
    for (const b of [...state.bodies]) state.removeBody(b.id);
  });
  await expect.poll(async () => (await visuals(page)).paths.length).toBe(0);
  expect(errors).toEqual([]);
});

for (const tier of ['high', 'low'] as const) {
  test(`environment renders on ${tier} tier and restores context`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setViewportSize(tier === 'low' ? { width: 480, height: 850 } : { width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(e2eUrl('preset:solar-system', { tier, touch: tier === 'low' ? '1' : '0', dpr: '1' }));
    await waitForSimulationReady(page);
    await expect.poll(async () => (await visuals(page)).paths.length).toBeGreaterThan(5);
    await page.evaluate(() => window.__AETHER_TEST__!.startMetricsCollection());
    await page.waitForTimeout(2000);
    const perf = await page.evaluate(() => window.__AETHER_TEST__!.stopMetricsCollection());
    const snapshot = await visuals(page);
    console.log(JSON.stringify({ tier, perf, effects: snapshot.effects, rendererCalls: snapshot.rendererCalls, geometries: snapshot.geometries, textures: snapshot.textures }));
    expect(snapshot.effects.dust).toBe(1);
    expect(snapshot.effects.gas).toBe(tier === 'low' ? 2 : 4);
    expect(snapshot.effects.radiation).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath(`environment-${tier}.png`) });
    await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="sim-canvas"] canvas') as HTMLCanvasElement;
      const gl = canvas.getContext('webgl2')!;
      const ext = gl.getExtension('WEBGL_lose_context')!;
      ext.loseContext(); setTimeout(() => ext.restoreContext(), 250);
    });
    await expect.poll(async () => (await visuals(page)).paths.length, { timeout: 20000 }).toBeGreaterThan(5);
    expect(errors).toEqual([]);
  });
}

test('menu gas and shared bloom compile without shader errors', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.locator('canvas').first().waitFor();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: info.outputPath('menu-environment.png') });
  expect(errors).toEqual([]);
});

test('satellite edits update both the paused moon and its path', async ({ page }) => {
  await page.goto(e2eUrl('preset:solar-system', { tier: 'low' }));
  await waitForSimulationReady(page);
  await page.evaluate(() => window.__AETHER_TEST__!.setPaused(true));
  const name = 'orbit-estimate:solar-system-moon';
  await expect.poll(async () => (await visuals(page)).paths.find((p: any) => p.name === name)?.count).toBe(65);
  const before = (await visuals(page)).paths.find((p: any) => p.name === name);
  const moonBefore = await page.evaluate(() => window.__AETHER_TEST__!.getPhysicsSnapshot().find(b => b.id === 'solar-system-moon')!.position);
  await page.evaluate(async () => {

    const state = (window as any).__AETHER_VISUAL_TEST__.getStore(); const moon = state.bodies.find((b: any) => b.id === 'solar-system-moon');
    state.updateBody(moon.id, { orbit: { ...moon.orbit, a: moon.orbit.a * 1.1 } });
  });
  await expect.poll(async () => (await visuals(page)).paths.find((p: any) => p.name === name)?.radius).toBeGreaterThan(before.radius * 1.09);
  const moonAfter = await page.evaluate(() => window.__AETHER_TEST__!.getPhysicsSnapshot().find(b => b.id === 'solar-system-moon')!.position);
  expect(moonAfter).not.toEqual(moonBefore);
  const beforeRebase = (await visuals(page)).paths.find((p: any) => p.name === name);
  await page.evaluate(() => (window as any).__AETHER_VISUAL_TEST__.shiftCamera());
  await expect.poll(async () => (await visuals(page)).paths.find((p: any) => p.name === name)?.center[0]).toBeLessThan(-50000);
  const rebased = (await visuals(page)).paths.find((p: any) => p.name === name);
  expect(rebased.first).toEqual(beforeRebase.first);
  expect(await page.evaluate(() => window.__AETHER_TEST__!.getPhysicsSnapshot().find(b => b.id === 'solar-system-moon')!.position)).toEqual(moonAfter);
});

test('hot gas, pulsar beams and active black-hole disks render without shader errors', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(e2eUrl('minimal-3body', { tier: 'high', dpr: '1' }));
  await waitForSimulationReady(page);
  await page.evaluate(async () => {

    const state = (window as any).__AETHER_VISUAL_TEST__.getStore(); const template = state.bodies[0];
    const data = [
      { id: 'hot', type: 'Star', x: -45, mass: 333000, radius: 5, temperature: 25000, properties: { luminositySolar: 100, userTempOverride: true } },
      { id: 'pulsar', type: 'Pulsar', x: 0, mass: 460000, radius: 0.3, temperature: 100000, properties: { magneticFieldTG: 2, pulsarPeriodS: 0.1, obliquity: 35 } },
      { id: 'black-hole', type: 'Black Hole', x: 45, mass: 3000000, radius: 3, temperature: 0, properties: { accretionRate: 0.7, spinParameter: 0.7, obliquity: 15 } },
    ];
    state.setPaused(true); state.setCameraLock(null);
    state.setBodies(data.map(b => ({ ...template, ...b, name: b.id,
      position: template.position.clone().set(b.x, 0, 0), velocity: template.velocity.clone().set(0, 0, 0) })));
  });
  await expect.poll(async () => (await visuals(page)).effects.radiation).toBe(5);
  await expect.poll(async () => (await visuals(page)).effects.gas).toBe(6);
  await page.waitForTimeout(500);
  await page.screenshot({ path: info.outputPath('compact-environment.png') });
  const snapshot = await visuals(page);
  console.log(JSON.stringify({ compactEffects: snapshot.effects, rendererCalls: snapshot.rendererCalls }));
  expect(snapshot.radiation.every((r: any) => r.time === 0)).toBe(true);
  await page.evaluate(async () => {

    (window as any).__AETHER_VISUAL_TEST__.getStore().updateBody('black-hole', { properties: { accretionRate: 0 } });
  });
  await expect.poll(async () => (await visuals(page)).effects.radiation).toBe(3);
  expect(errors).toEqual([]);
});

test('supernova remnants expand, fade, and clear on a new system', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(e2eUrl('minimal-3body', { tier: 'high', dpr: '1' }));
  await waitForSimulationReady(page);
  await page.evaluate(() => {
    const state = (window as any).__AETHER_VISUAL_TEST__.getStore();
    const b = state.bodies[0];
    state.installBodies([{ ...b, id: 'supernova-test', type: 'Star', mass: 3000000, radius: 5, temperature: 25000 }]);
    state.setPaused(false);
  });
  await expect.poll(async () => (await visuals(page)).gas.filter((g: any) => g.shell === 1).length).toBe(2);
  const first = (await visuals(page)).gas.find((g: any) => g.shell === 1);
  await page.waitForTimeout(1000);
  const later = (await visuals(page)).gas.find((g: any) => g.shell === 1);
  expect(later.size).toBeGreaterThan(first.size);
  expect(later.opacity).toBeLessThan(first.opacity);
  await page.screenshot({ path: info.outputPath('supernova-remnant.png') });
  await page.evaluate(() => (window as any).__AETHER_VISUAL_TEST__.getStore().loadRealSystem('solar-system'));
  await expect.poll(async () => (await visuals(page)).gas.filter((g: any) => g.shell === 1).length).toBe(0);
  expect(errors).toEqual([]);
});
