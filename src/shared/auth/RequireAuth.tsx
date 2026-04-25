import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from './useAuth';

interface RequireAuthProps {
  children: React.ReactNode;
}

/**
 * Guard de rota que protege subárvores que exigem sessão ativa.
 *
 * Decisões importantes:
 *
 * 1. **Sessão otimista pode renderizar** — o `AuthProvider` (Issue #54)
 *    hidrata com `isAuthenticated: true` e `isLoading: true` quando há
 *    sessão local persistida; o `verify-token` em curso pode confirmar
 *    ou descartar essa sessão depois. Em produção a splash do Provider
 *    cobre todo esse intervalo, mas em testes com `disableSplash` o
 *    guard precisa permitir o render para não bloquear a árvore. Logo,
 *    se `isAuthenticated` já é `true`, sempre rende `children` —
 *    mesmo que `isLoading` ainda esteja `true`.
 *
 * 2. **`isLoading && !isAuthenticated` retorna `null`** — estado raro
 *    (transição entre sessões); defensivamente evitamos disparar
 *    redirect prematuro para `/login` antes do estado se acomodar.
 *
 * 3. **`Navigate` com `state.from`** — preserva a rota de origem em
 *    `location.state.from` para que `LoginPage` redirecione de volta
 *    após autenticação bem-sucedida (já implementado em #52). Usar
 *    `replace` impede que o histórico acumule entradas redundantes
 *    (`/systems` → `/login` → back retornaria a `/systems` desautenticado).
 *
 * 4. **Sem layout próprio** — o guard apenas decide entre `Navigate` e
 *    `children`; a UI de splash e o shell autenticado são camadas
 *    separadas, mantendo o componente focado e fácil de testar.
 */
export const RequireAuth: React.FC<RequireAuthProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isAuthenticated) {
    return <>{children}</>;
  }

  // Sessão ainda hidratando sem flag de "autenticado": evita decidir
  // cedo demais. Em produção a splash do Provider cobre esse tempo.
  if (isLoading) {
    return null;
  }

  return <Navigate to="/login" state={{ from: location }} replace />;
};
