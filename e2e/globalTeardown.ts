import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export default async function globalTeardown(): Promise<void> {
  const cacheDir = path.resolve('.cache');
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path.join(cacheDir, 'playwright-server.stop'), '', 'utf8');
  // Give the Vite API server time to close its sockets before Playwright tries
  // Windows taskkill, which can otherwise hang in this environment.
  await new Promise((resolve) => setTimeout(resolve, 350));
}

