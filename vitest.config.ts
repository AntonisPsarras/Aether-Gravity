import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '.cache/vitest',
  test: {
    environment: 'node',
    include: ['utils/**/*.test.ts'],
  },
});
