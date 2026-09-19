import { expect, test } from '@playwright/test';

test('development server rejects the editor endpoint and does not grant wildcard CORS', async ({ request }) => {
  const response = await request.get('/__open-in-editor?file=nonexistent-aether-probe.txt', {
    headers: { Origin: 'https://untrusted.example' },
  });
  expect(response.status()).toBe(404);
  expect(response.headers()['access-control-allow-origin']).not.toBe('*');
});
