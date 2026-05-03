import { useCallback, useState } from 'react';

import { useFieldChangeHandlers } from '../../shared/forms';

import {
  decideRouteBadRequestHandling,
  validateRouteForm,
  type RouteFieldErrors,
  type RouteFormState,
} from './routeFormShared';

import type { CreateRoutePayload } from '../../shared/api';

/**
 * Lista fixa dos campos do form de rota, usada por
 * `useFieldChangeHandlers` para gerar os handlers em uma única linha.
 * `as const` preserva os literais para o helper genérico inferir as
 * chaves do `RouteFormState`.
 */
const ROUTE_FORM_FIELDS = [
  'name',
  'code',
  'description',
  'systemTokenTypeId',
] as const;

/**
 * Hook compartilhado pelos formulários de criação (`NewRouteModal`) e
 * edição (`EditRouteModal`, futuro PR da #64) de rotas.
 *
 * Encapsula:
 *
 * - O estado do form (`RouteFormState`) e dos erros inline por campo.
 * - O estado do `Alert` no topo (erro genérico de submissão).
 * - A flag `isSubmitting`.
 * - Os handlers `onChangeName`/`onChangeCode`/`onChangeDescription`/
 *   `onChangeSystemTokenTypeId` que atualizam o campo correspondente
 *   e limpam o erro inline associado.
 *
 * Centralizamos aqui desde o **primeiro PR do recurso** (#63) para
 * evitar a 5ª recorrência de duplicação Sonar (lição PR #128 — quando
 * a issue de edição (#64) chegar, ela vai herdar o boilerplate inteiro
 * sem copiar uma linha sequer). Os handlers seriam idênticos entre os
 * dois modals (~16 linhas × 2 arquivos = 32 linhas duplicadas).
 *
 * O caller é dono da lógica de submit (que precisa do contexto de
 * `createRoute` vs `updateRoute`), do reset entre aberturas e do
 * mapping de erros — o hook só cuida do que é genuinamente
 * compartilhado.
 *
 * Recebe `systemId` como parâmetro do `prepareSubmit` porque o
 * `:systemId` vive na URL da `RoutesPage` (não no form) — o caller
 * passa o valor já validado quando vai construir o `CreateRoutePayload`.
 */

interface UseRouteFormReturn {
  formState: RouteFormState;
  fieldErrors: RouteFieldErrors;
  submitError: string | null;
  isSubmitting: boolean;
  setFormState: React.Dispatch<React.SetStateAction<RouteFormState>>;
  setFieldErrors: React.Dispatch<React.SetStateAction<RouteFieldErrors>>;
  setSubmitError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  handleNameChange: (value: string) => void;
  handleCodeChange: (value: string) => void;
  handleDescriptionChange: (value: string) => void;
  handleSystemTokenTypeIdChange: (value: string) => void;
  /**
   * Roda a validação client-side e, se passar, prepara o payload
   * trimado + zera erros + marca `isSubmitting`. Devolve o payload
   * pronto para envio quando válido, ou `null` quando não (já tendo
   * populado `fieldErrors`).
   *
   * `systemId` é injetado pelo caller (vem da URL `/systems/:systemId/
   * routes`) — manter fora do estado do form preserva a separação
   * "form = inputs do usuário" e evita race quando o usuário troca de
   * sistema com o modal aberto (cenário improvável mas defensível).
   *
   * Centralizar essa rotina elimina ~16 linhas de boilerplate que
   * apareceriam idênticas entre `NewRouteModal` e `EditRouteModal`
   * (lição PR #127/#128).
   */
  prepareSubmit: (systemId: string) => CreateRoutePayload | null;
  /**
   * Aplica o tratamento de uma resposta 400 do backend: distribui
   * erros por campo quando `ValidationProblemDetails` é mapeável, ou
   * popula `submitError` com a mensagem do backend quando não.
   * Centraliza ~10 linhas de side-effect idênticas que apareciam nos
   * dois modals (lição PR #127).
   */
  applyBadRequest: (details: unknown, fallbackMessage: string) => void;
}

export function useRouteForm(initialState: RouteFormState): UseRouteFormReturn {
  const [formState, setFormState] = useState<RouteFormState>(initialState);
  const [fieldErrors, setFieldErrors] = useState<RouteFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Handlers `name`/`code`/`description`/`systemTokenTypeId` gerados
  // pelo helper genérico (lição PR #134 — bloco de 19 linhas
  // duplicado com `useSystemForm` foi um dos motivos do
  // SonarCloud Quality Gate FAILED). Cada handler atualiza o campo
  // correspondente e limpa o erro inline associado.
  const {
    name: handleNameChange,
    code: handleCodeChange,
    description: handleDescriptionChange,
    systemTokenTypeId: handleSystemTokenTypeIdChange,
  } = useFieldChangeHandlers<RouteFormState, RouteFieldErrors>(
    ROUTE_FORM_FIELDS,
    setFormState,
    setFieldErrors,
  );

  const prepareSubmit = useCallback(
    (systemId: string): CreateRoutePayload | null => {
      const clientErrors = validateRouteForm(formState);
      if (clientErrors) {
        setFieldErrors(clientErrors);
        setSubmitError(null);
        return null;
      }
      setFieldErrors({});
      setSubmitError(null);
      setIsSubmitting(true);
      // `description: ''` é trimado para `''` aqui; a camada HTTP
      // (`buildRouteMutationBody` em `routes.ts`) omite o campo quando
      // vazio para que o backend grave `null`. Trim duplicado é
      // defensivo — preserva o contrato mesmo se um caller futuro
      // pular a camada HTTP.
      return {
        systemId,
        name: formState.name.trim(),
        code: formState.code.trim(),
        description: formState.description.trim(),
        systemTokenTypeId: formState.systemTokenTypeId.trim(),
      };
    },
    [formState],
  );

  const applyBadRequest = useCallback((details: unknown, fallbackMessage: string): void => {
    const decision = decideRouteBadRequestHandling(details, fallbackMessage);
    if (decision.kind === 'field-errors') {
      setFieldErrors(decision.errors);
      setSubmitError(null);
    } else {
      setSubmitError(decision.message);
    }
  }, []);

  return {
    formState,
    fieldErrors,
    submitError,
    isSubmitting,
    setFormState,
    setFieldErrors,
    setSubmitError,
    setIsSubmitting,
    handleNameChange,
    handleCodeChange,
    handleDescriptionChange,
    handleSystemTokenTypeIdChange,
    prepareSubmit,
    applyBadRequest,
  };
}
