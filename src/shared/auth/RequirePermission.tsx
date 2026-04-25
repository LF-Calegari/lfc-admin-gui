import React from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from './useAuth';

interface RequirePermissionProps {
  /**
   * Código da permissão exigida (ex.: `Systems.Read`). Comparação é
   * delegada a `useAuth().hasPermission`, mantendo a lógica de
   * verificação centralizada no contexto (suporta evolução para
   * `code: string[]` no futuro sem reescrever cada callsite).
   */
  code: string;
  children: React.ReactNode;
}

/**
 * Guard de rota que exige a presença de um código de permissão.
 *
 * Decisões importantes:
 *
 * 1. **Pressuposto de autenticação** — este guard NÃO valida sessão. Use
 *    sempre dentro de uma subárvore já envolvida por `<RequireAuth>` (em
 *    `src/routes/index.tsx` o layout autenticado garante essa ordem).
 *    Manter as responsabilidades separadas evita duplicar a checagem de
 *    `isAuthenticated` em duas camadas e simplifica os testes.
 *
 * 2. **Redirect para `/error/403`** — em vez de criar uma rota `/403`
 *    nova, reaproveitamos a página de erro já existente exposta via
 *    `ErrorRouteResolver` (`/error/:code`). Mantém um único ponto de
 *    UX para qualquer caminho que termine em "Acesso negado" e respeita
 *    o critério da issue ("Sem permissão → redireciona para `/403`")
 *    via redirect funcional, sem duplicar página.
 *
 * 3. **`replace`** — a tentativa de acesso a uma rota proibida não deve
 *    poluir o histórico; ao voltar do `/error/403`, o usuário retorna à
 *    rota anterior em vez de cair de novo na rota negada.
 */
export const RequirePermission: React.FC<RequirePermissionProps> = ({
  code,
  children,
}) => {
  const { hasPermission } = useAuth();

  if (!hasPermission(code)) {
    return <Navigate to="/error/403" replace />;
  }

  return <>{children}</>;
};
