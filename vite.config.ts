import path from 'node:path';

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
      // Default 5s do Vitest fica apertado para a primeira renderização
      // da árvore real (Routes + AppLayout + AuthProvider + styled-components)
      // sob jsdom, especialmente em CI quando a JIT ainda está fria.
      // 10s mantém latência confortável sem deixar testes presos
      // verdadeiramente quebrados rodando indefinidamente.
      testTimeout: 10000,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        reportsDirectory: 'coverage',
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/**/*.d.ts',
          'src/**/index.ts',
          'src/main.tsx',
          'src/vite-env.d.ts',
        ],
      },
    },
  };
});
