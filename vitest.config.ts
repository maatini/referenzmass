import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    // Default to node for fast pure logic tests.
    // Component tests that need DOM declare `/** @vitest-environment jsdom */` at the top of the file.
    environment: 'node',
    globals: true,
    setupFiles: ['src/vitest-setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts}'],
    deps: {
      optimizer: {
        web: {
          include: ['@tauri-apps/api']
        }
      }
    }
  }
});
