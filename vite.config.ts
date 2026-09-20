import path from 'path';
import { existsSync, createReadStream, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const e2eFixturesDir = path.resolve(repoRoot, 'e2e', 'fixtures');

/** Ship upstream notices for packages actually retained by Rollup. */
function thirdPartyNotices(): Plugin {
  return {
    name: 'third-party-notices', apply: 'build',
    generateBundle(_options, bundle) {
      const roots = new Set<string>();
      for (const item of Object.values(bundle)) if (item.type === 'chunk') {
        for (const id of Object.keys(item.modules)) {
          if (item.modules[id].renderedLength === 0) continue;
          const normalized = id.replace(/^\0/, '').replaceAll('\\', '/');
          const marker = normalized.lastIndexOf('/node_modules/');
          if (marker < 0) continue;
          const tail = normalized.slice(marker + 14).split('/');
          roots.add(normalized.slice(0, marker + 14) + tail.slice(0, tail[0].startsWith('@') ? 2 : 1).join('/'));
        }
      }
      const names: string[] = [];
      const notices = [...roots].sort().map(root => {
        const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
        names.push(pkg.name);
        const licenses = readdirSync(root).filter(f => /^(license|copying|notice)(\.|$)/i.test(f));
        return `${pkg.name} ${pkg.version} (${pkg.license ?? 'see upstream license'})\n${licenses.map(f => readFileSync(path.join(root, f), 'utf8')).join('\n')}`;
      });
      mkdirSync(path.join(repoRoot, '.cache/audit'), { recursive: true });
      writeFileSync(path.join(repoRoot, '.cache/audit/bundled-packages.json'), JSON.stringify(names.sort(), null, 2));
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.txt', source: notices.join('\n\n----------\n\n') });
    },
  };
}

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

/** Contain the Vite editor-launch endpoint on this loopback dev server. */
function blockEditorEndpoint(): Plugin {
  return {
    name: 'block-open-in-editor',
    apply: 'serve',
    configureServer(server) {
      // configureServer middleware runs before Vite's installed editor handler.
      server.middlewares.use((req, res, next) => {
        let pathname: string;
        try {
          pathname = decodeURIComponent((req.url ?? '').split('?')[0]);
        } catch {
          res.statusCode = 400;
          res.end();
          return;
        }
        if (pathname !== '/__open-in-editor') {
          next();
          return;
        }
        res.statusCode = 404;
        res.end();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  return {
    // Keep tooling caches out of the installed dependency tree.
    cacheDir: '.cache/vite',
    base: './',
    server: {
      port: 3000,
      host: '127.0.0.1',
      cors: false,
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      target: 'es2022',
      sourcemap: false,
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
    plugins: [react(), thirdPartyNotices(), blockEditorEndpoint(), e2eFixturesPlugin(), {
      name: 'development-csp',
      apply: 'serve',
      transformIndexHtml(html) {
        return html.replace("connect-src 'self';", "connect-src 'self' ws://127.0.0.1:* ws://localhost:*;");
      },
    }],
    resolve: {
      alias: {
        '@': repoRoot,
      },
    },
  };
});
