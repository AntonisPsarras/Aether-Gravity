import { test, expect, type Page } from '@playwright/test';
import { e2eUrl, FIXTURE_MINIMAL, waitForSimulationReady } from './helpers';

/** Headless CI runners advance physics much slower than local dev machines. */
const motionSettleMs = process.env.CI ? 3000 : 1000;

const physics = (page: Page) => page.evaluate(() => window.__AETHER_TEST__!.getPhysicsSnapshot());

/** The creation rail can scroll at short viewports; click the tool by DOM, as the onboarding spec does. */
const openMoonTool = async (page: Page) => {
  const tool = page.locator('.creation-toolbar-anchor button').filter({ hasText: /^Moon$/ });
  await tool.evaluate((element: HTMLButtonElement) => element.click());
  await expect(page.getByTestId('moon-creator')).toBeVisible();
};

/** Step 1 via the list: returns the id of the planet picked. */
const pickFirstEligibleParent = async (page: Page): Promise<string> => {
  const row = page.locator('[data-testid^="moon-parent-"]:not([disabled])').first();
  await expect(row).toBeVisible();
  const id = (await row.getAttribute('data-testid'))!.replace('moon-parent-', '');
  await row.click();
  await expect(page.getByTestId('moon-create')).toBeVisible();
  return id;
};

const createMoon = async (page: Page) => {
  const before = await physics(page);
  await openMoonTool(page);
  const parentId = await pickFirstEligibleParent(page);
  await page.getByTestId('moon-create').click();
  await expect(page.getByTestId('moon-creator')).toHaveCount(0);
  const after = await physics(page);
  const moon = after.find((b) => !before.some((o) => o.id === b.id));
  return { before, after, moon, parentId };
};

test.describe('Orbit-first moon creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(e2eUrl(FIXTURE_MINIMAL));
    await waitForSimulationReady(page);
  });

  test('the Moon tool places a bound satellite on rails around the chosen planet', async ({ page }) => {
    const { before, after, moon, parentId } = await createMoon(page);
    expect(after).toHaveLength(before.length + 1);
    expect(moon).toBeDefined();
    expect(moon!.type).toBe('Moon');
    expect(moon!.parentId).toBe(parentId);
    expect(moon!.isSatellite).toBe(true);

    // Default size: Earth's Moon, or the largest a tenth of the parent allows.
    const parent = after.find((b) => b.id === parentId)!;
    const lunar = 7.342e22 / 5.9722e24;
    expect(moon!.mass / Math.min(lunar, parent.mass / 10)).toBeCloseTo(1, 6);

    const world = await page.evaluate(() => window.__AETHER_TEST__!.getWorldSnapshot());
    const saved = world.bodies.find((b) => b.id === moon!.id)!;
    expect(saved.orbit).toBeDefined();
    expect(saved.orbit!.e).toBeLessThan(1e-6); // default is circular
  });

  test('the drawn moon tracks its physics orbit about the parent', async ({ page }) => {
    await page.evaluate(() => {
      window.__AETHER_TEST__!.setPaused(false);
      window.__AETHER_TEST__!.setSpeed(1);
    });
    const { moon, parentId } = await createMoon(page);

    const sample = () => page.evaluate(() => ({
      physics: window.__AETHER_TEST__!.getPhysicsSnapshot(),
      render: window.__AETHER_TEST__!.getRenderSnapshot(),
    }));
    const offsets = async () => {
      const s = await sample();
      const p = s.physics.find((b) => b.id === parentId)!;
      const m = s.physics.find((b) => b.id === moon!.id)!;
      const rp = s.render.bodies.find((b) => b.id === parentId)!.position;
      const rm = s.render.bodies.find((b) => b.id === moon!.id)?.position;
      expect(rm, 'moon has no render transform').toBeDefined();
      const phys = [m.position.x - p.position.x, m.position.y - p.position.y, m.position.z - p.position.z];
      const drawn = [rm!.x - rp.x, rm!.y - rp.y, rm!.z - rp.z];
      return { phys, drawn, moonRender: rm! };
    };
    const len = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

    const first = await offsets();
    await page.waitForTimeout(motionSettleMs);
    const second = await offsets();

    for (const s of [first, second]) {
      // Drawn offset points exactly along the physical offset (only its length is exaggerated).
      expect(dot(s.phys, s.drawn) / (len(s.phys) * len(s.drawn))).toBeGreaterThan(0.9999);
    }
    // Circular orbit: constant physical and drawn radius, and the same exaggeration both times.
    expect(len(second.phys) / len(first.phys)).toBeCloseTo(1, 3);
    expect((len(second.drawn) / len(second.phys)) / (len(first.drawn) / len(first.phys))).toBeCloseTo(1, 3);
    // And it is actually moving on screen.
    const moved = Math.hypot(
      second.moonRender.x - first.moonRender.x,
      second.moonRender.y - first.moonRender.y,
      second.moonRender.z - first.moonRender.z,
    );
    expect(moved).toBeGreaterThan(0.01);
  });

  test('a faster start speed gives an eccentric but bound orbit', async ({ page }) => {
    const before = await physics(page);
    await openMoonTool(page);
    await pickFirstEligibleParent(page);
    const speed = page.getByTestId('moon-speed');
    await expect(speed).toBeVisible();
    // The admissible maximum is not step-aligned, which `fill` rejects; End is
    // how a keyboard user reaches it anyway.
    await speed.focus();
    await page.keyboard.press('End');
    await expect(page.getByTestId('moon-create')).toBeVisible();
    await page.getByTestId('moon-create').click();

    const world = await page.evaluate(() => window.__AETHER_TEST__!.getWorldSnapshot());
    const moon = world.bodies.find((b) => !before.some((o) => o.id === b.id))!;
    expect(moon.orbit!.e).toBeGreaterThan(0.02);
    expect(moon.orbit!.e).toBeLessThan(1);
  });

  for (const [key, label] of [['Home', 'smallest'], ['End', 'largest']] as const) {
    test(`the size control reaches the ${label} moon the parent allows`, async ({ page }) => {
      const before = await physics(page);
      await openMoonTool(page);
      const parentId = await pickFirstEligibleParent(page);
      const size = page.getByTestId('moon-size');
      await size.focus();
      await page.keyboard.press(key);
      await expect(page.getByTestId('moon-size-caption')).toBeVisible();
      await page.getByTestId('moon-create').click();

      const after = await physics(page);
      const moon = after.find((b) => !before.some((o) => o.id === b.id))!;
      const parent = after.find((b) => b.id === parentId)!;
      const expected = key === 'Home' ? 1e-10 : Math.min(0.05, parent.mass / 10);
      expect(moon.type).toBe('Moon');
      expect(moon.mass / expected).toBeCloseTo(1, 3);
    });
  }

  test('undo removes the created moon', async ({ page }) => {
    const { before } = await createMoon(page);
    await page.getByTestId('control-bar').locator('button').first().click();
    await expect.poll(async () => (await physics(page)).length).toBe(before.length);
  });

  test('a selected planet skips straight to shaping the orbit', async ({ page }) => {
    const planetId = await page.evaluate(() =>
      window.__AETHER_TEST__!.getPhysicsSnapshot().find((b) => b.type === 'Planet')!.id);
    await page.evaluate((id) => window.__AETHER_TEST__!.openInspector(id), planetId);
    await openMoonTool(page);
    await expect(page.getByTestId('moon-create')).toBeVisible();
    await expect(page.getByTestId('moon-parent-name')).toBeVisible();
  });

  test('cancel and Escape leave moon mode without creating anything', async ({ page }) => {
    const before = await physics(page);
    await openMoonTool(page);
    await page.getByTestId('moon-cancel').click();
    await expect(page.getByTestId('moon-creator')).toHaveCount(0);

    await openMoonTool(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('moon-creator')).toHaveCount(0);
    expect(await physics(page)).toHaveLength(before.length);
  });
});
