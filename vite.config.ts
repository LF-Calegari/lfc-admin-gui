import path from 'path';

import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.PORT) || 3002;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      host: true,
      port,
    },
    preview: {
      host: true,
      port,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['tests/setupTests.ts'],
      include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    },
  };
});
