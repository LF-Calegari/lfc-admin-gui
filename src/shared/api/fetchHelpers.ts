import { isApiError } from './types';

/**
 * Detecta erro de cancelamento de fetch (AbortController) — reusado por
 * páginas que carregam dados em paralelo via Promise.all com signal.
 *
 * Cobre dois caminhos: o `DOMException` nativo emitido quando o
 * `AbortController.abort()` dispara durante o `fetch`, e o `ApiError`
 * com `kind: 'network'` que o nosso cliente HTTP centralizado emite
 * ao normalizar abortos. Ambos são "não-erros" — o caller deve apenas
 * sair do effect sem tocar no estado.
 */
export function isFetchAborted(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (
    isApiError(error) &&
    error.kind === 'network' &&
    error.message === 'Requisição cancelada.'
  ) {
    return true;
  }
  return false;
}

/**
 * Extrai mensagem amigável de qualquer erro vindo da camada HTTP.
 * Quando o erro é um `ApiError`, devolvemos a `message` (o cliente já
 * resolveu fallbacks por status). Para erros arbitrários, usamos a
 * `fallback` em pt-BR específica do contexto.
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    return error.message;
  }
  return fallback;
}
