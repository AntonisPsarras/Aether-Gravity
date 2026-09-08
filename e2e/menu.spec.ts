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
});
