import path from 'path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.dirname(fileURLToPath(import.meta.url)),
      },
    },
  };
});
