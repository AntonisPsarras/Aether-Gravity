import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';

// Real production assets, isolated browser storage, no development test bridge.
const server = await preview({ configFile: false, preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
let browser;
try {
  const files = await readdir('dist/assets');
  assert(!files.some(f => f.endsWith('.map')), 'Production source maps must not ship');
  const html = await readFile('dist/index.html', 'utf8');
  assert(!/ws:\/\/|localhost|127\.0\.0\.1/.test(html), 'Development endpoint in shipped HTML');
  assert(html.includes("connect-src 'self';"), 'Production CSP missing');
  browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const context = await browser.newContext();
  const page = await context.newPage();
  const origin = 'http://127.0.0.1:4173';
  let outbound = 0, failures = 0;
  const errors = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) { outbound++; return route.abort(); }
    return route.continue();
  });
  page.on('response', r => { if (r.status() >= 400) failures++; });
  page.on('pageerror', () => errors.push('uncaught'));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin);
  // Dismiss the first-run tutorial through its public controls when present.
  await page.getByRole('button', { name: 'Close tutorial', exact: true }).click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  assert.equal(await page.evaluate(() => '__AETHER_TEST__' in window), false);
  await page.getByTestId('menu-new-universe').click();
  await page.getByTestId('menu-preset-solar-system').click();
  await page.getByTestId('menu-universe-name').fill('Production smoke');
  await page.getByTestId('menu-launch-universe').click();
  await expect(page.getByTestId('simulation-root')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="sim-canvas"] canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  assert.equal(outbound, 0, 'Unexpected outbound requests');
  assert.equal(failures, 0, 'Production resource failures');
  assert.equal(errors.length, 0, 'Production runtime errors (details withheld)');
  await page.evaluate(() => { void Promise.reject(new Error('synthetic-private-diagnostic')); });
  await expect.poll(() => errors.length).toBeGreaterThan(0);
  assert(!errors.some(e => e.includes('synthetic-private-diagnostic')), 'Raw exception leaked');
  assert(errors.includes('Aether: promise-rejected'), 'Sanitized rejection was not reported');
  console.log('PASS production smoke: public launch, WebGL canvas, local-only requests, CSP, no source maps/test bridge, redacted rejection.');
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close(e => e ? reject(e) : resolve()));
}
