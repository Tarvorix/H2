import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@hh/types': '/packages/types/src',
      '@hh/engine': '/packages/engine/src',
      '@hh/geometry': '/packages/geometry/src',
      '@hh/data': '/packages/data/src',
      '@hh/army-builder': '/packages/army-builder/src',
      '@hh/ai': '/packages/ai/src',
    },
  },
});
