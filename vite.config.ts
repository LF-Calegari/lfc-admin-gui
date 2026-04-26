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
      /**
       * Variáveis de ambiente injetadas em `import.meta.env` durante a
       * execução dos testes (Issue #118).
       *
       * O singleton `apiClient` em `src/shared/api/index.ts` faz
       * fail-fast no import quando `VITE_SYSTEM_ID` está ausente — em
       * produção isso protege contra deploys mal configurados. Mas em
       * CI (GitHub Actions) o `.env` é gitignored e o `loadEnv` não
       * encontra o valor; sem este `test.env`, qualquer teste que
       * importe `@/shared/auth` (transitivamente importa o singleton)
       * falharia no parse antes mesmo do primeiro `it()` rodar.
       *
       * O UUID aqui é um valor sintético estável — testes que precisam
       * asserir sobre o `systemId` enviado no body do `/auth/login` ou
       * no header `X-System-Id` injetam stubs de `ApiClient` próprios e
       * não dependem deste default.
       */
      env: {
        VITE_SYSTEM_ID: '00000000-0000-0000-0000-000000000000',
      },
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
