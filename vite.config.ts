import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    // The manifest lets scripts/prerender.tsx link the hashed island bundle and CSS.
    manifest: true,
    rollupOptions: {
      input: {
        app: resolve(root, 'app/index.html'),
        island: resolve(root, 'src/site/island.tsx'),
      },
    },
  },
  server: { open: '/app/' },
  test: {
    include: ['engine/**/*.test.ts', 'src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
