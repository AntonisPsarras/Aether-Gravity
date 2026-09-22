import { expect, test } from '@playwright/test';

const menuUrl = (tier: 'low' | 'high' = 'high') => `/?e2e=1&tier=${tier}&onboarding=seen`;

test.describe('premium main menu', () => {
  test('keeps the My Universes cue visible, centered, and keyboard focusable', async ({ page }) => {
    await page.goto(menuUrl('low'));
    const cue = page.getByTestId('menu-universes-cue');
    await expect(cue).toBeVisible();

    const geometry = await cue.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      element.focus();
      return {
        center: rect.left + rect.width / 2,
        viewportCenter: window.innerWidth / 2,
        width: rect.width,
        height: rect.height,
        focused: document.activeElement === element,
      };
    });
    expect(Math.abs(geometry.center - geometry.viewportCenter)).toBeLessThanOrEqual(1);
    expect(geometry.width).toBeGreaterThanOrEqual(44);
    expect(geometry.height).toBeGreaterThanOrEqual(44);
    expect(geometry.focused).toBe(true);
  });

  test('shows the full brand name and leaves room above the mobile archive cue', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(menuUrl('low'));

    await expect(page.getByRole('heading', { name: 'AETHER GRAVITY' })).toBeVisible();
    const spacing = await page.evaluate(() => {
      const actions = document.querySelector<HTMLElement>('.menu-hero-actions')!;
      const cue = document.querySelector<HTMLElement>('.menu-scroll-cue')!;
      return cue.getBoundingClientRect().top - actions.getBoundingClientRect().bottom;
    });
    expect(spacing).toBeGreaterThanOrEqual(16);
  });

  test('keeps both wordmark lines fully visible across viewports', async ({ page }) => {
    const viewports = [
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 900, height: 600 },
      { width: 1024, height: 768 },
      { width: 1280, height: 720 },
      { width: 1440, height: 900 },
    ] as const;

    await page.goto(menuUrl('low'));
    const heading = page.getByRole('heading', { name: 'AETHER GRAVITY' });

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expect(heading).toBeVisible();
      const label = `${viewport.width}x${viewport.height}`;
      const geometry = await heading.evaluate((element) => {
        const spans = [...element.querySelectorAll('span')].map((span) => {
          const rect = span.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
        });
        return { spans, vw: window.innerWidth, vh: window.innerHeight };
      });
      expect(geometry.spans, label).toHaveLength(2);
      const landscape = viewport.width / viewport.height >= 0.85;
      for (const span of geometry.spans) {
        expect(span.width, label).toBeGreaterThan(8);
        expect(span.height, label).toBeGreaterThan(8);
        expect(span.left, label).toBeGreaterThanOrEqual(-1);
        expect(span.top, label).toBeGreaterThanOrEqual(-1);
        expect(span.right, label).toBeLessThanOrEqual(geometry.vw + 1);
        expect(span.bottom, label).toBeLessThanOrEqual(geometry.vh + 1);
        if (landscape) {
          expect(span.right, label).toBeLessThanOrEqual(geometry.vw * 0.52 + 1);
        }
      }
    }
  });

  test('centers archive links above the footer wordmark', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(menuUrl('low'));
    const footer = page.locator('.menu-footer');
    await footer.scrollIntoViewIfNeeded();
    const geometry = await footer.evaluate((element) => {
      const nav = element.querySelector<HTMLElement>('nav')!;
      const wordmark = element.querySelector<HTMLElement>('.menu-footer-wordmark')!;
      const footerRect = element.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      const wordmarkRect = wordmark.getBoundingClientRect();
      return {
        footerCenter: footerRect.left + footerRect.width / 2,
        navCenter: navRect.left + navRect.width / 2,
        wordmarkCenter: wordmarkRect.left + wordmarkRect.width / 2,
        linksAboveWordmark: navRect.bottom <= wordmarkRect.top,
      };
    });
    expect(Math.abs(geometry.navCenter - geometry.footerCenter)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.wordmarkCenter - geometry.footerCenter)).toBeLessThanOrEqual(1);
    expect(geometry.linksAboveWordmark).toBe(true);
  });

  test('keeps mobile information windows inset from the viewport edges', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(menuUrl('low'));
    await page.locator('.menu-footer').scrollIntoViewIfNeeded();

    const assertInset = async (selector: string) => {
      const inset = await page.locator(selector).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: window.innerWidth - rect.right };
      });
      expect(inset.left).toBeGreaterThanOrEqual(23);
      expect(inset.right).toBeGreaterThanOrEqual(23);
    };

    await page.getByRole('button', { name: 'Tutorial' }).click();
    await expect(page.getByTestId('tutorial-overlay')).toBeVisible();
    await assertInset('.tutorial-dialog');
    await page.getByRole('button', { name: 'Close tutorial' }).click();

    await page.getByRole('button', { name: 'Privacy' }).click();
    await expect(page.getByRole('dialog', { name: 'Privacy Policy' })).toBeVisible();
    await assertInset('.info-modal');
    await page.getByRole('button', { name: 'Close' }).click();

    await expect(page.getByRole('button', { name: 'Credits & Support' })).toBeVisible();
    await page.getByRole('button', { name: 'Credits & Support' }).click();
    await expect(page.getByRole('dialog', { name: 'Aether Research' })).toBeVisible();
    await assertInset('.info-modal');
  });

  test('opens a centered creator with Random system selected and exposes every origin', async ({ page }, testInfo) => {
    await page.goto(menuUrl());
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await page.getByTestId('menu-new-universe').click();

    await expect(page.getByTestId('menu-composer')).toBeVisible();
    await expect(page.getByTestId('menu-preset-procedural')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('menu-preset-procedural')).toContainText('Random system');
    await expect(page.getByTestId('menu-preset-trappist-1')).toBeVisible();
    await expect(page.getByTestId('menu-preset-procedural')).toBeVisible();
    await expect(page.getByText('Black Hole', { exact: true })).toBeVisible();
    const mainMenu = page.getByTestId('main-menu');
    const composer = page.getByTestId('menu-composer');
    await expect.poll(() => mainMenu.evaluate((element) => element.scrollTop)).toBe(0);
    await expect.poll(() => composer.evaluate((element) =>
      element.getAnimations().every((animation) => animation.playState === 'finished'),
    )).toBe(true);
    // The composer remains centered when it fits; on compact screens its
    // content can be taller than the available area, so allow its safe inset.
    await expect.poll(() => composer.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2);
    })).toBeLessThanOrEqual(40);
    await page.screenshot({ path: testInfo.outputPath('universe-creator.png'), fullPage: false });

    for (const id of ['trappist-1', 'procedural']) {
      const card = page.getByTestId(`menu-preset-${id}`);
      await card.click();
      await expect(card).toHaveAttribute('aria-checked', 'true');
    }

    await page.getByRole('button', { name: 'Close universe creator' }).click();
    await expect(page.getByTestId('menu-composer')).toHaveCount(0);
  });

  test('does not lift and clip mobile origin cards on hover', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(menuUrl('low'));
    await page.getByTestId('menu-new-universe').click();
    const randomCard = page.getByTestId('menu-preset-procedural');
    await randomCard.hover();
    await expect(randomCard).toHaveCSS('transform', 'none');
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
      // The actions sheet is portaled to document.body, so Delete is not
      // a descendant of the world card.
      await page.getByRole('dialog', { name: 'Actions for Delete Me' }).getByRole('button', { name: 'Delete', exact: true }).click();
    }
    await expect(page.getByText(/permanently delete.*Delete Me.*cannot be undone/i)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Delete Research' }).click();
    await expect(page.getByText(/collection cannot be restored.*universe.*kept/i)).toBeVisible();
    await page.getByRole('button', { name: 'Delete collection' }).click();
    // Archive writes now wait for an origin-wide lock before committing.
    await expect(page.getByTestId('folder-section-folder-1')).toHaveCount(0);

    const stored = await page.evaluate(() => ({
      folders: JSON.parse(localStorage.getItem('aether:worlds:folders') ?? '[]'),
      worlds: JSON.parse(localStorage.getItem('aether:worlds:index') ?? '[]'),
      data: localStorage.getItem('aether:worlds:data:world-1'),
    }));
    expect(stored.folders).toEqual([]);
    expect(stored.worlds.find((world: { id: string }) => world.id === 'world-1')).not.toHaveProperty('folderId');
    expect(stored.data).not.toBeNull();
  });

  test('moves universes with the collection selector and drag gestures', async ({ page }) => {
    await page.goto(menuUrl('low'));
    await page.evaluate(() => {
      localStorage.setItem('aether:worlds:folders', JSON.stringify([
        { id: 'folder-1', name: 'Research', createdAt: 1 },
        { id: 'folder-2', name: 'Archive', createdAt: 2 },
      ]));
      localStorage.setItem('aether:worlds:index', JSON.stringify([
        { id: 'world-1', name: 'Outside', createdAt: 1, lastOpenedAt: 1 },
        { id: 'world-2', name: 'Inside', createdAt: 2, lastOpenedAt: 2, folderId: 'folder-1' },
      ]));
    });
    await page.reload();

    let moveSelect = page.locator('select[aria-label="Move Outside to collection"]:visible');
    if (await moveSelect.count() === 0) {
      await page.getByTestId('world-card-world-1').getByRole('button', { name: 'World actions' }).click();
      moveSelect = page.locator('select[aria-label="Move Outside to collection"]:visible');
    }
    await moveSelect.selectOption('folder-2');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('aether:worlds:index') ?? '[]')
      .find((world: { id: string }) => world.id === 'world-1')?.folderId)).toBe('folder-2');

    await page.evaluate(() => {
      const source = document.querySelector<HTMLElement>('[data-testid="world-card-world-2"] .menu-world-drag-handle');
      const target = document.querySelector<HTMLElement>('[data-testid="independent-systems-drop-target"]');
      if (!source || !target) throw new Error('Expected drag source and destination');
      const dataTransfer = new DataTransfer();
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
    });
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('aether:worlds:index') ?? '[]')
      .find((world: { id: string }) => world.id === 'world-2')?.folderId)).toBeUndefined();
  });

  test('opens mobile world actions in a sheet above the archive', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(menuUrl('low'));
    await page.evaluate(() => {
      localStorage.setItem('aether:worlds:folders', JSON.stringify([{ id: 'folder-1', name: 'C1', createdAt: 1 }]));
      localStorage.setItem('aether:worlds:index', JSON.stringify([
        { id: 'world-1', name: 'First world', createdAt: 1, lastOpenedAt: 1, folderId: 'folder-1' },
        { id: 'world-2', name: 'Second world', createdAt: 2, lastOpenedAt: 2, folderId: 'folder-1' },
      ]));
    });
    await page.reload();

    await page.getByTestId('world-card-world-1').getByRole('button', { name: 'World actions' }).click();
    const sheet = page.getByRole('dialog', { name: 'Actions for First world' });
    await expect(sheet).toBeVisible();
    const layers = await sheet.evaluate((element) => ({
      zIndex: getComputedStyle(element.parentElement!).zIndex,
      secondCardCovered: element.getBoundingClientRect().bottom > document.querySelector('[data-testid="world-card-world-2"]')!.getBoundingClientRect().top,
    }));
    expect(layers.zIndex).toBe('100');
    expect(layers.secondCardCovered).toBe(true);
  });

  test('returns to the archive after creating a collection', async ({ page }) => {
    await page.goto(menuUrl('low'));
    await page.getByRole('button', { name: 'New collection' }).click();
    await page.getByLabel('Folder name').fill('Orbit studies');
    await page.getByRole('button', { name: 'Create collection' }).click();

    await expect(page.getByTestId('menu-composer')).toHaveCount(0);
    await expect.poll(() => page.getByTestId('menu-library').evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(20);
    await expect(page.getByText('Orbit studies', { exact: true })).toBeVisible();
  });

  test('keeps a world rename draft open when the asynchronous archive lock fails', async ({ page }) => {
    await page.goto(menuUrl('low'));
    await page.evaluate(() => {
      localStorage.setItem('aether:worlds:index', JSON.stringify([
        { id: 'world-1', name: 'Original world', createdAt: 1, lastOpenedAt: 1 },
      ]));
    });
    await page.reload();
    await page.evaluate(() => Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request: () => Promise.reject(new Error('lock unavailable')) },
    }));
    const directRename = page.getByRole('button', { name: 'Rename Original world' });
    if (await directRename.isVisible()) {
      await directRename.click();
    } else {
      await page.getByTestId('world-card-world-1').getByRole('button', { name: 'World actions' }).click();
      await page.getByRole('dialog', { name: 'Actions for Original world' }).getByRole('button', { name: 'Rename' }).click();
    }
    const input = page.getByTestId('world-card-world-1').locator('input[type="text"]');
    await input.fill('Retained draft');
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('Retained draft');
    await expect(page.getByRole('alert')).toContainText(/archive operation|storage|lock/i);
  });

  test('keeps folder rename and deletion UI open after asynchronous persistence failures', async ({ page }) => {
    await page.goto(menuUrl('low'));
    await page.evaluate(() => {
      localStorage.setItem('aether:worlds:folders', JSON.stringify([
        { id: 'folder-1', name: 'Original folder', createdAt: 1 },
      ]));
    });
    await page.reload();
    await page.evaluate(() => Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request: () => Promise.reject(new Error('lock unavailable')) },
    }));
    await page.getByRole('button', { name: 'Rename Original folder' }).click();
    const input = page.getByTestId('folder-section-folder-1').locator('input[type="text"]');
    await input.fill('Retained folder draft');
    await page.getByRole('button', { name: 'Save folder name' }).click();
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('Retained folder draft');

    await page.getByRole('button', { name: 'Cancel rename' }).click();
    await page.getByRole('button', { name: 'Rename Original folder' }).click();
    await expect(page.getByTestId('folder-section-folder-1').locator('input[type="text"]')).toHaveValue('Original folder');
    await page.getByRole('button', { name: 'Cancel rename' }).click();
    await page.getByRole('button', { name: 'Delete Original folder' }).click();
    await page.getByRole('button', { name: 'Delete collection' }).click();
    await expect(page.getByText(/Delete the .*Original folder.* collection/i)).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(/archive operation|storage|lock/i);
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
