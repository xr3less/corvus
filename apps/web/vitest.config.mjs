import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'next/font/google': path.resolve(import.meta.dirname, 'test/mocks/next-font-google.js'),
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: [path.resolve(import.meta.dirname, 'vitest.setup.mjs')],
  },
});
