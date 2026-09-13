import { test, expect } from '@playwright/test';

test.describe('WebGL2 unavailable screen', () => {
  test('shows a dedicated message instead of the generic ErrorBoundary', async ({ page }) => {
    await page.addInitScript(`
      const origCreate = Document.prototype.createElement;
      Document.prototype.createElement = function (tagName, options) {
        const el = origCreate.call(this, tagName, options);
        if (String(tagName).toLowerCase() === 'canvas') {
          const origGetContext = el.getContext.bind(el);
          el.getContext = function (type, attrs) {
            if (String(type).toLowerCase() === 'webgl2') return null;
            return origGetContext(type, attrs);
          };
        }
        return el;
      };
    `);
    await page.goto('/');
    await expect(page.getByTestId('webgl2-required')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'WebGL2 is required' })).toBeVisible();
    await expect(page.getByText('encountered an error')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  });
});
