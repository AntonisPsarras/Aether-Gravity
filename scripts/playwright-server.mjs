import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const cacheDir = path.resolve('.cache');
const stopFile = path.join(cacheDir, 'playwright-server.stop');
mkdirSync(cacheDir, { recursive: true });
if (existsSync(stopFile)) unlinkSync(stopFile);

const server = await createServer({ configLoader: 'runner' });
await server.listen();
server.printUrls();

const poll = setInterval(async () => {
  if (!existsSync(stopFile)) return;
  clearInterval(poll);
  await server.close();
  unlinkSync(stopFile);
  process.exit(0);
}, 200);

