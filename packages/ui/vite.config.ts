import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

function getPagesBasePath(command: 'build' | 'serve'): string {
  if (command === 'serve') {
    return '/';
  }

  const explicitBasePath = process.env.VITE_BASE_PATH;
  if (explicitBasePath && explicitBasePath.trim().length > 0) {
    return explicitBasePath;
  }

  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (repoName && repoName.length > 0) {
    return `/${repoName}/`;
  }

  // Fallback for local production builds targeting the current repository.
  return '/H2/';
}

export default defineConfig(({ command }) => ({
  base: getPagesBasePath(command),
  plugins: [react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      '@hh/types': path.resolve(__dirname, '../types/src'),
      '@hh/engine': path.resolve(__dirname, '../engine/src'),
      '@hh/geometry': path.resolve(__dirname, '../geometry/src'),
      '@hh/data': path.resolve(__dirname, '../data/src'),
      '@hh/army-builder': path.resolve(__dirname, '../army-builder/src'),
      '@hh/ai': path.resolve(__dirname, '../ai/src'),
    },
  },
}));
