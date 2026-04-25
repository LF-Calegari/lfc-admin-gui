import { useContext } from 'react';

import { AuthContext } from './AuthContext';

import type { AuthContextValue } from './types';

/**
 * Acesso ao contexto de autenticação.
 *
 * Lança erro descritivo quando usado fora do `<AuthProvider>` — falha
 * cedo é preferível a fallback silencioso, que esconderia bug de
 * configuração da árvore React.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de um <AuthProvider>');
  }
  return ctx;
}
