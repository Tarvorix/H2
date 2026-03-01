import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: '/HH/',
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
});
