import React, { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { resolveRouteCode } from '../../routes/routeCodes';

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
 *    sessão local persistida; o catálogo é hidratado em paralelo. Em
 *    produção a splash do Provider cobre o intervalo inteiro, mas em
 *    testes com `disableSplash` o guard precisa permitir o render para
 *    não bloquear a árvore. Logo, se `isAuthenticated` já é `true`,
 *    sempre rende `children` — mesmo que `isLoading` ainda esteja
 *    `true`.
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
 * 4. **Verify-token por navegação (Issue #122 / adendo)** — a cada
 *    mudança de pathname autenticado, dispara `verifyRoute(code)` para
 *    o `routeCode` correspondente. Comportamento:
 *
 *    - **AbortController**: cancela request anterior se o usuário
 *      navegar de novo antes da resposta. Evita empilhar chamadas.
 *    - **Sem rota mapeada (`resolveRouteCode == null`)**: pula a
 *      chamada — o backend rejeitaria com 400 e nada se ganharia.
 *    - **Falha de rede / 400 / 5xx**: o `verifyRoute` no Provider já
 *      libera a navegação silenciosamente (UX > consistência estrita).
 *    - **403**: o `verifyRoute` no Provider redireciona para
 *      `/error/403` preservando `state.from`.
 *    - **401**: o cliente HTTP já chama `onUnauthorized`, que limpa
 *      sessão e redireciona para `/login`.
 *
 *    A chamada acontece em `useEffect` para não bloquear a render —
 *    o usuário vê o destino imediatamente; se a autorização falhar,
 *    o redirect acontece logo em seguida (mesmo padrão de
 *    revalidação otimista da Issue #54).
 *
 * 5. **Sem layout próprio** — o guard apenas decide entre `Navigate` e
 *    `children`; a UI de splash e o shell autenticado são camadas
 *    separadas, mantendo o componente focado e fácil de testar.
 */
export const RequireAuth: React.FC<RequireAuthProps> = ({ children }) => {
  const { isAuthenticated, isLoading, verifyRoute } = useAuth();
  const location = useLocation();

  // Guarda o controller da chamada anterior para cancelar em caso de
  // navegação rápida — evita empilhar Promises e setStates em sequência.
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      // Sem sessão: o `Navigate` abaixo cuida; não dispara verify.
      return;
    }
    const routeCode = resolveRouteCode(location.pathname);
    if (!routeCode) {
      // Rota privada não mapeada (ex.: `/`, fallback). Skip — backend
      // exigiria `X-Route-Code` e rejeitaria com 400.
      return;
    }

    // Cancela request em voo, se houver.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    // Disparo "fire-and-forget": o `verifyRoute` no Provider trata
    // 401/403/falha internamente. Passamos o pathname capturado via
    // `useLocation()` para que o redirect 403 popule `state.from`
    // corretamente em qualquer Router (BrowserRouter, MemoryRouter
    // de testes), sem depender de `window.location.pathname`.
    void verifyRoute(routeCode, controller.signal, location.pathname);

    return () => {
      controller.abort();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [isAuthenticated, location.pathname, verifyRoute]);

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
