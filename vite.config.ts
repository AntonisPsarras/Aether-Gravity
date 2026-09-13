import path from 'path';
import { existsSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const e2eFixturesDir = path.resolve(repoRoot, 'e2e', 'fixtures');

/** Serve JSON fixtures in `vite` / Playwright only — they must not ship in `dist/`. */
function e2eFixturesPlugin(): Plugin {
  return {
    name: 'e2e-fixtures',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = req.url?.split('?')[0] ?? '';
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next();
          return;
        }
        if (!urlPath.startsWith('/e2e/fixtures/')) {
          next();
          return;
        }
        const name = path.basename(urlPath);
        if (!name.endsWith('.json')) {
          next();
          return;
        }
        const file = path.join(e2eFixturesDir, name);
        if (!existsSync(file)) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  loadEnv(mode, '.', '');
  return {
    // Keep tooling caches out of the installed dependency tree.
    cacheDir: '.cache/vite',
    base: './',
    server: {
      port: 3000,
      host: '127.0.0.1',
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      target: 'es2022',
      // three.js core is a single ~670 kB vendor chunk (≈175 kB gzip) that can't
      // be split further; everything else stays well under this.
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('@visx')) return 'charts';
            if (id.includes('three') && !id.includes('@react-three')) return 'three';
            if (id.includes('@react-three') || id.includes('three-stdlib')) return 'three-fiber';
            if (id.includes('react-dom') || id.includes('/react/')) return 'react-vendor';
          },
        },
      },
    },
    esbuild: {
      drop: mode === 'production' ? ['debugger'] : [],
    },
    plugins: [react(), e2eFixturesPlugin()],
    resolve: {
      alias: {
        '@': repoRoot,
      },
    },
  };
});
