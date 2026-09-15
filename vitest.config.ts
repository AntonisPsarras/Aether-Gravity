import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '.cache/vitest',
  test: {
    api: false,
    environment: 'node',
    include: ['utils/**/*.test.ts'],
  },
});
