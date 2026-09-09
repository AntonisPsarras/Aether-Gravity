import { expect, test } from '@playwright/test';

const menuUrl = (tier: 'low' | 'high' = 'high') => `/?e2e=1&tier=${tier}&onboarding=seen`;

test.describe('premium main menu', () => {
  test('opens the creator with the Solar System selected and exposes every origin', async ({ page }, testInfo) => {
    await page.goto(menuUrl());
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await page.getByTestId('menu-new-universe').click();

    await expect(page.getByTestId('menu-composer')).toBeVisible();
    await expect(page.getByTestId('menu-preset-solar-system')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('menu-preset-trappist-1')).toBeVisible();
    await expect(page.getByTestId('menu-preset-alpha-centauri')).toBeVisible();
    await expect(page.getByTestId('menu-preset-procedural')).toBeVisible();
    await expect(page.getByText('Black Hole', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('universe-creator.png'), fullPage: false });

    for (const id of ['trappist-1', 'alpha-centauri', 'procedural']) {
      const card = page.getByTestId(`menu-preset-${id}`);
      await card.click();
      await expect(card).toHaveAttribute('aria-checked', 'true');
    }

    await page.getByRole('button', { name: 'Close universe creator' }).click();
    await expect(page.getByTestId('menu-composer')).toHaveCount(0);
  });

  test('creates a named preset universe and enters the simulation', async ({ page }) => {
    await page.goto(menuUrl('low'));
    await page.getByTestId('menu-new-universe').click();
    await page.getByTestId('menu-preset-trappist-1').click();
    await page.getByTestId('menu-universe-name').fill('Red Dwarf Lab');
    await page.getByTestId('menu-launch-universe').click();

    await expect(page.getByTestId('simulation-root')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => page.evaluate(() => window.__AETHER_TEST__?.getStore().bodyCount ?? 0)).toBe(8);
    const metadata = await page.evaluate(() => JSON.parse(localStorage.getItem('aether:worlds:index') ?? '[]'));
    expect(metadata[0]).toMatchObject({ name: 'Red Dwarf Lab', presetId: 'trappist-1' });
  });

  test('keeps the hero, creator, and library within the viewport', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(menuUrl('low'));
    await page.getByTestId('menu-new-universe').click();

    const overflow = await page.getByTestId('main-menu').evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    const undersized = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.touch-target'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.width < 43.5 || rect.height < 43.5);
      })
      .map((element) => element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 30)));
    expect(undersized).toEqual([]);
  });

  test('retains a visible CSS scene when WebGL effects are lost', async ({ page }) => {
    await page.goto(menuUrl());
    const background = page.locator('.menu-space-background');
    await expect(background).toHaveAttribute('data-gpu-effects', 'on');
    await page.locator('.menu-space-background canvas').evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const extension = gl?.getExtension('WEBGL_lose_context');
      if (!extension) throw new Error('WEBGL_lose_context is unavailable');
      extension.loseContext();
    });
    await expect(background).toHaveAttribute('data-gpu-effects', 'fallback');
    await expect(page.locator('.menu-space-fallback')).toBeVisible();
  });

  test('states irreversible deletion clearly and preserves worlds from deleted folders', async ({ page }) => {
    await page.goto(menuUrl('low'));
    await page.evaluate(() => {
      localStorage.setItem('aether:worlds:folders', JSON.stringify([
        { id: 'folder-1', name: 'Research', createdAt: 1 },
      ]));
      localStorage.setItem('aether:worlds:index', JSON.stringify([
        { id: 'world-1', name: 'Kept World', createdAt: 1, lastOpenedAt: 1, folderId: 'folder-1' },
        { id: 'world-2', name: 'Delete Me', createdAt: 2, lastOpenedAt: 2 },
      ]));
      const settings = { speed: 1, showGrid: true, showDust: true, showHabitable: false, showStability: false, showOrbitPaths: true };
      localStorage.setItem('aether:worlds:data:world-1', JSON.stringify({ id: 'world-1', version: 2, bodies: [], settings }));
      localStorage.setItem('aether:worlds:data:world-2', JSON.stringify({ id: 'world-2', version: 2, bodies: [], settings }));
    });
    await page.reload();

    const deleteWorldButton = page.getByRole('button', { name: 'Delete Delete Me' });
    if (await deleteWorldButton.isVisible()) {
      await deleteWorldButton.click();
    } else {
      const worldCard = page.locator('article').filter({ hasText: 'Delete Me' });
      await worldCard.getByRole('button', { name: 'World actions' }).click();
      await worldCard.getByRole('button', { name: 'Delete', exact: true }).click();
    }
    await expect(page.getByText(/permanently delete.*Delete Me.*cannot be undone/i)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Delete Research' }).click();
    await expect(page.getByText(/collection cannot be restored.*universe.*kept/i)).toBeVisible();
    await page.getByRole('button', { name: 'Delete collection' }).click();

    const stored = await page.evaluate(() => ({
      folders: JSON.parse(localStorage.getItem('aether:worlds:folders') ?? '[]'),
      worlds: JSON.parse(localStorage.getItem('aether:worlds:index') ?? '[]'),
      data: localStorage.getItem('aether:worlds:data:world-1'),
    }));
    expect(stored.folders).toEqual([]);
    expect(stored.worlds.find((world: { id: string }) => world.id === 'world-1')).not.toHaveProperty('folderId');
    expect(stored.data).not.toBeNull();
  });

  test('shows uninstall loss guidance and blocks leaving after a failed save', async ({ page }) => {
    await page.goto(menuUrl('low'));
    await page.getByTestId('menu-new-universe').click();
    await page.getByTestId('menu-launch-universe').click();
    await expect(page.getByTestId('simulation-root')).toBeVisible({ timeout: 30_000 });

    await page.getByTitle('Settings').click();
    await expect(page.getByTestId('data-storage-note')).toContainText('uninstalling Aether Gravity permanently deletes every universe');
    await expect(page.getByTestId('data-storage-note')).toContainText('Android backup and device transfer are disabled');
    await page.getByTestId('settings-close').click();

    await page.evaluate(() => {
      Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    });
    await page.getByTitle('Return to Menu').click();
    await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('storage is full');
    await expect(page.getByTestId('simulation-root')).toBeVisible();
  });

  test('writes a pessimistic 50-body save within one frame at p95', async ({ page }) => {
    await page.goto(menuUrl('low'));
    const timing = await page.evaluate(() => {
      const properties = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`property${index}`, index + 0.123456]));
      const body = (index: number) => ({
        id: `body-${index}-${'x'.repeat(32)}`, type: 'Neutron Star', mass: 123456789.123456,
        radius: 123.456789, radiusKm: 123456.789,
        parentId: `body-0-${'x'.repeat(32)}`,
        orbit: { a: 123456.789, e: 0.999, i: Math.PI, lan: Math.PI, argp: Math.PI, m0: Math.PI, epoch: 123456.789 },
        position: { x: 123456.789, y: -123456.789, z: 123456.789 },
        velocity: { x: 123456.789, y: -123456.789, z: 123456.789 },
        color: '#ffffffff', texture: 'rock', trailColor: '#ffffffff', temperature: 60000,
        habitability: 'STERILIZED', population: 999999999, name: 'N'.repeat(64), properties,
      });
      const raw = JSON.stringify({
        id: 'perf-world', version: 2, bodies: Array.from({ length: 50 }, (_, index) => body(index)),
        settings: { speed: 4, showGrid: true, showDust: true, showHabitable: true, showStability: true, showOrbitPaths: true },
      });
      const samples: number[] = [];
      for (let index = 0; index < 30; index += 1) {
        const start = performance.now();
        localStorage.setItem('aether:worlds:data:perf-world', raw);
        localStorage.getItem('aether:worlds:data:perf-world');
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      localStorage.removeItem('aether:worlds:data:perf-world');
      return { median: samples[Math.floor(samples.length / 2)], p95: samples[Math.floor(samples.length * 0.95)], chars: raw.length };
    });
    test.info().annotations.push({ type: 'storage-performance', description: JSON.stringify(timing) });
    expect(timing.chars).toBeGreaterThan(50_000);
    expect(timing.p95).toBeLessThan(16.7);
  });
});
