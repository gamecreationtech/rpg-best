/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// BASE_PATH is set by the deploy workflow to "/<repo-name>/" for GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
