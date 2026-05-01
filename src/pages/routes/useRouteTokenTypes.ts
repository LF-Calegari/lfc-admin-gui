import { useEffect, useState } from 'react';

import { isApiError, listTokenTypes } from '../../shared/api';

import type { ApiClient, TokenTypeDto } from '../../shared/api';

/**
 * Texto exibido como `helperText` do `<Select>` da política JWT
 * enquanto a request inicial de token types está em curso.
 */
const TOKEN_TYPES_LOADING_HELPER = 'Carregando políticas JWT…';

/**
 * Texto exibido em `Alert` no topo do form quando a lista de token
 * types falha. Mensagem orientada à ação (instrui a fechar e tentar
 * novamente) — espelha o padrão de copy de erros do design system.
 */
const TOKEN_TYPES_FAILED_MESSAGE =
  'Não foi possível carregar a lista de políticas JWT. Feche o modal e tente novamente.';

/**
 * Texto exibido em `Alert` no topo do form quando a lista veio vazia
 * (backend sem token types ativos). Cenário extremo, mas o usuário
 * precisa de feedback claro de que não dá pra criar/editar rota agora
 * sem antes cadastrar um token type.
 */
const TOKEN_TYPES_EMPTY_MESSAGE =
  'Nenhuma política JWT ativa disponível. Cadastre um token type antes de criar rotas.';

interface UseRouteTokenTypesReturn {
  /** Lista filtrada de token types ativos (`deletedAt === null`). */
  tokenTypes: ReadonlyArray<TokenTypeDto>;
  /** `true` enquanto a request inicial está em curso. */
  loadingTokenTypes: boolean;
  /** Mensagem de erro a exibir em Alert no topo do form, ou `null`. */
  tokenTypesError: string | null;
  /** `true` quando a lista terminou de carregar e não há nenhum ativo. */
  tokenTypesEmpty: boolean;
  /** Helper text do `<Select>` durante carregamento; `undefined` quando ocioso. */
  tokenTypesHelperText: string | undefined;
  /**
   * `true` quando o submit deve ficar desabilitado por motivos
   * relacionados aos token types (carregando, erro de carregamento ou
   * lista vazia). O caller pode combinar com outros critérios próprios.
   */
  submitDisabled: boolean;
  /**
   * Combina o `submitError` do form com os erros derivados do
   * carregamento de token types em uma única string para exibir no
   * Alert do topo. Prioridade: erro do submit > erro de tokens > vazio.
   */
  resolveEffectiveSubmitError: (submitError: string | null) => string | null;
}

/**
 * Hook compartilhado pelos modals de criação (`NewRouteModal`) e
 * edição (`EditRouteModal`) de rotas — encapsula o ciclo de vida da
 * request `GET /tokens/types` que popula o `<Select>` da política JWT
 * alvo.
 *
 * Antes da extração, o `NewRouteModal` carregava ~50 linhas dessa
 * lógica (estado, efeito com `AbortController`, derivações de
 * `effectiveSubmitError`/`submitDisabled`). O `EditRouteModal` (#64)
 * espelharia o mesmo bloco — alvo certo de `New Code Duplication`
 * (lição PR #134 — 5ª recorrência de Sonar duplication veio
 * exatamente desse padrão entre recursos paralelos).
 *
 * Centralizar aqui:
 *
 * 1. Garante simetria de comportamento entre create e edit (cancela
 *    request anterior, ignora `AbortError`, filtra soft-deletados).
 * 2. Reduz a superfície de teste — o hook é testado uma vez e os
 *    modals só consomem o resultado.
 * 3. Prepara o terreno para um futuro cache compartilhado (`#46` segue
 *    com mais sub-issues — quando a latência do `GET /tokens/types`
 *    virar problema, troca-se a implementação do hook sem mexer nos
 *    consumidores).
 */
export function useRouteTokenTypes(
  open: boolean,
  client?: ApiClient,
): UseRouteTokenTypesReturn {
  const [tokenTypes, setTokenTypes] = useState<ReadonlyArray<TokenTypeDto>>([]);
  const [loadingTokenTypes, setLoadingTokenTypes] = useState<boolean>(false);
  const [tokenTypesError, setTokenTypesError] = useState<string | null>(null);

  /**
   * Carrega os token types ativos sempre que o modal abre. Cancela a
   * request anterior se o usuário fechar+reabrir rapidamente — evita
   * race em `setState`.
   *
   * Filtramos `deletedAt === null` aqui (não no wrapper
   * `listTokenTypes`) para preservar a generalidade do helper — uma
   * futura tela "Gerenciar token types" precisa dos soft-deletados
   * visíveis para restaurar.
   */
  useEffect(() => {
    if (!open) {
      // Reset hard ao fechar — limpa estado de erro/lista para que a
      // próxima abertura não mostre dados velhos.
      setTokenTypes([]);
      setLoadingTokenTypes(false);
      setTokenTypesError(null);
      return;
    }

    const controller = new AbortController();
    setLoadingTokenTypes(true);
    setTokenTypesError(null);

    listTokenTypes({ signal: controller.signal }, client)
      .then((list) => {
        if (controller.signal.aborted) return;
        setTokenTypes(list.filter((tt) => tt.deletedAt === null));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // Cancelamento explícito não vira erro de UI — espelha
        // tratamento de `usePaginatedFetch`.
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (
          isApiError(error) &&
          error.kind === 'network' &&
          error.message === 'Requisição cancelada.'
        ) {
          return;
        }
        setTokenTypesError(TOKEN_TYPES_FAILED_MESSAGE);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoadingTokenTypes(false);
      });

    return () => {
      controller.abort();
    };
  }, [client, open]);

  const tokenTypesEmpty = !loadingTokenTypes && tokenTypes.length === 0;

  const tokenTypesHelperText = loadingTokenTypes ? TOKEN_TYPES_LOADING_HELPER : undefined;

  const submitDisabled =
    loadingTokenTypes || tokenTypesError !== null || tokenTypes.length === 0;

  const resolveEffectiveSubmitError = (submitError: string | null): string | null =>
    submitError ?? tokenTypesError ?? (tokenTypesEmpty ? TOKEN_TYPES_EMPTY_MESSAGE : null);

  return {
    tokenTypes,
    loadingTokenTypes,
    tokenTypesError,
    tokenTypesEmpty,
    tokenTypesHelperText,
    submitDisabled,
    resolveEffectiveSubmitError,
  };
}
