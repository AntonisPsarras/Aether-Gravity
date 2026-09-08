import { expect, test, type Page } from '@playwright/test';
import { e2eUrl, FIXTURE_MINIMAL, waitForSimulationReady } from './helpers';

async function longPressFirstOutlinerRow(page: Page): Promise<void> {
  const row = page.locator('[data-testid^="outliner-row-"]').first();
  await row.scrollIntoViewIfNeeded();
  const box = (await row.boundingBox())!;
  const point = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
  await row.dispatchEvent('pointerdown', { ...point, pointerId: 1, pointerType: 'touch', buttons: 1 });
  // Leave headroom for timer throttling while several WebGL projects run.
  await page.waitForTimeout(700);
  // Dispatch on the stable document: on phone, opening the Inspector
  // intentionally unmounts the outliner row before pointer-up.
  await page.evaluate(({ clientX, clientY }) => {
    document.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, pointerId: 1, pointerType: 'touch', buttons: 0, clientX, clientY,
    }));
  }, point);
}

test.describe('beginner tutorial', () => {
  test('opens once automatically and remains replayable', async ({ page }) => {
    await page.goto('/?e2e=1&onboarding=fresh');
    const tutorial = page.getByTestId('tutorial-overlay');
    await expect(tutorial).toBeVisible();
    await expect(tutorial.getByText('Beginner course · 1 of 9')).toBeVisible();

    await page.getByRole('button', { name: 'Close tutorial' }).click();
    await expect(tutorial).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(tutorial).toHaveCount(0);

    await page.getByRole('button', { name: /Tutorial/ }).click();
    await expect(tutorial).toBeVisible();
  });
});

test.describe('contextual helpers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(e2eUrl(FIXTURE_MINIMAL, { onboarding: 'fresh' }));
    await waitForSimulationReady(page);
  });

  test('does not trigger from world load, then teaches a panel and inspected type once', async ({ page }) => {
    await expect(page.locator('[data-testid^="live-helper-"]')).toHaveCount(0);

    const outlinerToggle = page.getByRole('button', { name: /Universe Outliner/ });
    await outlinerToggle.click();
    await expect(page.getByTestId('live-helper-panel:outliner')).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await outlinerToggle.click();

    await longPressFirstOutlinerRow(page);
    await expect(page.getByTestId('inspector-panel')).toBeVisible();
    await expect(page.getByTestId('live-helper-panel:inspector')).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByTestId('live-helper-body:Star')).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();

    await page.getByTestId('inspector-close').click();
    if (await page.getByTestId('outliner-panel').getAttribute('data-open') === 'false') {
      await outlinerToggle.click();
    }
    await longPressFirstOutlinerRow(page);
    await expect(page.locator('[data-testid^="live-helper-"]')).toHaveCount(0);
    await page.reload();
    await waitForSimulationReady(page);
    await expect(page.locator('[data-testid^="live-helper-"]')).toHaveCount(0);
  });

  test('triggers creation guidance before the created object lesson', async ({ page }) => {
    const starTool = page.locator('.creation-toolbar-anchor button').filter({ hasText: /^Star$/ });
    // The creation rail is deliberately scrollable at short viewport heights;
    // invoke the same DOM click without coupling this trigger test to its scroll.
    await starTool.evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId('live-helper-panel:creation')).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();

    const canvas = page.getByTestId('sim-canvas').locator('canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.48, box.y + box.height * 0.55, { steps: 5 });
    await page.mouse.up();

    await expect(page.getByTestId('live-helper-body:Star')).toBeVisible();
  });

  test('keeps the helper card within the adaptive canvas viewport', async ({ page }) => {
    const outlinerToggle = page.getByRole('button', { name: /Universe Outliner/ });
    await outlinerToggle.click();
    const host = page.getByTestId('live-helper-host');
    await expect(host).toBeVisible();

    const cardBox = (await host.locator('aside').boundingBox())!;
    const canvasBox = (await page.locator('.canvas-viewport').boundingBox())!;
    expect(cardBox.x).toBeGreaterThanOrEqual(canvasBox.x);
    expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(canvasBox.x + canvasBox.width + 1);
    expect(cardBox.y).toBeGreaterThanOrEqual(canvasBox.y);
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height + 1);
  });

  test('shows live Kerr values and bound-Moon Hill-sphere context', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) < 1000, 'covered on the desktop project');
    await page.evaluate(() => localStorage.setItem('aether:onboarding:v1', JSON.stringify({
      version: 1,
      tutorialSeen: true,
      seenHelperIds: ['panel:creation', 'panel:outliner', 'panel:inspector', 'panel:orbit', 'panel:analysis'],
    })));
    await page.reload();
    await waitForSimulationReady(page);

    const settings = { speed: 1, showGrid: true, showDust: true, showHabitable: false, showStability: false };
    await page.evaluate(({ settings }) => window.__AETHER_TEST__!.loadFixture({
      id: 'black-hole-lesson', version: 2, settings,
      bodies: [{
        id: 'hole', type: 'Black Hole', mass: 3_329_460, radius: 1, radiusKm: 1,
        position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
        color: '#000000', texture: 'solid', trailColor: '#333333', temperature: 0,
        habitability: 'SINGULARITY', population: 0, name: 'Kerr Lab',
        properties: { spinParameter: 0.9, accretionRate: 0.5 },
      }],
    } as any), { settings });
    await expect(page.getByTestId('outliner-name').filter({ hasText: /^Kerr Lab$/ })).toBeVisible();
    await longPressFirstOutlinerRow(page);
    const blackHoleTip = page.getByTestId('live-helper-body:Black Hole');
    await expect(blackHoleTip).toContainText('a* = 0.900');
    await expect(blackHoleTip).toContainText('ISCO');
    await expect(blackHoleTip).toContainText('0.998');
    await page.getByRole('button', { name: 'Got it' }).click();
    await page.getByTestId('inspector-close').click();

    await page.evaluate(({ settings }) => window.__AETHER_TEST__!.loadFixture({
      id: 'moon-lesson', version: 2, settings,
      bodies: [
        {
          id: 'star', type: 'Star', mass: 332_946, radius: 1, radiusKm: 696_340,
          position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
          color: '#fff4dc', texture: 'solid', trailColor: '#fff4dc', temperature: 5772,
          habitability: 'STELLAR', population: 0, name: 'Lesson Star', properties: {},
        },
        {
          id: 'earth', type: 'Planet', mass: 1, radius: 1, radiusKm: 6371,
          parentId: 'star', orbit: { a: 100, e: 0.0167, i: 0, lan: 0, argp: 0, m0: 0, epoch: 0 },
          position: { x: 100, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 1 },
          color: '#3b82f6', texture: 'rock', trailColor: '#3b82f6', temperature: 288,
          habitability: 'HABITABLE', population: 0, name: 'Lesson Earth', properties: {},
        },
        {
          id: 'moon', type: 'Moon', mass: 0.0123, radius: 1, radiusKm: 1737,
          parentId: 'earth', orbit: { a: 0.25, e: 0.055, i: 0.09, lan: 0, argp: 0, m0: 0, epoch: 0 },
          position: { x: 100.25, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 1.1 },
          color: '#cccccc', texture: 'rock', trailColor: '#cccccc', temperature: 250,
          habitability: 'N/A', population: 0, name: 'Moon Lab', properties: {},
        },
      ],
    } as any), { settings });
    await page.getByTestId('outliner-search').fill('Moon Lab');
    await page.evaluate(() => window.__AETHER_TEST__!.openInspector('moon'));
    const moonTip = page.getByTestId('live-helper-body:Moon');
    await expect(moonTip).toContainText('Hill sphere');
    await expect(moonTip).toContainText('Hill radius');
    await expect(moonTip).toContainText('Lesson Earth');
  });
});
