/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { pwaPlugin } from './tools/pwa';

// BASE_PATH is set by the deploy workflow to "/<repo-name>/" for GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [pwaPlugin()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
