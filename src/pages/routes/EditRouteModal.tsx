import React, { useCallback, useEffect, useMemo } from 'react';
import styled from 'styled-components';

import { Alert, Modal, useToast } from '../../components/ui';
import { updateRoute } from '../../shared/api';
import { applyEditSubmitAction, type EditSubmitActionCopy } from '../../shared/forms';

import { RouteFormBody } from './RouteFormFields';
import {
  classifyRouteSubmitError,
  type RouteFieldErrors,
  type RouteFormState,
  type RouteSubmitErrorCopy,
} from './routeFormShared';
import { useRouteForm } from './useRouteForm';
import { useRouteTokenTypes } from './useRouteTokenTypes';

import type { ApiClient, RouteDto, TokenTypeDto } from '../../shared/api';

/**
 * Copy injetada em `classifyRouteSubmitError` para o caminho de
 * edição. Os literais aqui são os únicos pontos onde "atualizar"/
 * "outra rota" diferem do "criar"/"uma rota" no `NewRouteModal` —
 * o resto da lógica de classificação é compartilhado (lição PR #128).
 */
const SUBMIT_ERROR_COPY: RouteSubmitErrorCopy = {
  conflictDefault: 'Já existe outra rota com este código.',
  forbiddenTitle: 'Falha ao atualizar rota',
  genericFallback: 'Não foi possível atualizar a rota. Tente novamente.',
};

/** Texto exibido inline no campo `code` quando o backend devolve 409. */
const CONFLICT_INLINE_MESSAGE = 'Já existe outra rota com este código neste sistema.';

/** Texto exibido em toast quando a rota some entre abertura e submit (404). */
const NOT_FOUND_MESSAGE = 'Rota não encontrada ou foi removida. Atualize a lista.';

/**
 * Cópia textual injetada em `applyEditSubmitAction`. Concentra os
 * literais que diferem entre `EditRouteModal` e `EditSystemModal`
 * (recurso "rota" vs "sistema") sem duplicar o switch de
 * dispatch — lição PR #128/#134 reforçada.
 */
const EDIT_SUBMIT_ACTION_COPY: EditSubmitActionCopy = {
  conflictInlineMessage: CONFLICT_INLINE_MESSAGE,
  notFoundMessage: NOT_FOUND_MESSAGE,
  forbiddenTitle: 'Falha ao atualizar rota',
};

/**
 * Aviso exibido como Alert warning no topo do modal quando a rota
 * está vinculada a um token type que foi soft-deletado posteriormente.
 * Decisão de UX: em vez de esconder o token type inativo (o que
 * deixaria o `<Select>` num estado inicial inválido — sem nenhuma
 * opção selecionada), incluímos a opção atual como "(inativo)" e
 * orientamos o usuário a trocar para uma política ativa antes de
 * salvar. O submit fica desabilitado enquanto a opção ativa não for
 * escolhida — coerente com a validação do backend que rejeita
 * `SystemTokenTypeId inválido ou inativo.` com 400.
 */
const INACTIVE_TOKEN_TYPE_NOTICE =
  'A política JWT atual está inativa. Selecione uma política ativa para salvar a rota.';

interface EditRouteModalProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Rota sendo editada. Pré-popula o form e fornece o `id` usado no
   * `PUT /systems/routes/{id}`. Quando `null`, o modal não renderiza
   * — caller é responsável por só passar `route` quando `open=true`.
   */
  route: RouteDto | null;
  /** Fecha o modal sem persistir. Chamada também após sucesso ou 404. */
  onClose: () => void;
  /**
   * Callback disparado após atualização bem-sucedida ou após detecção
   * de 404 (rota já removida) — em ambos casos a UI quer refetch para
   * sincronizar a tabela com o estado real do backend.
   */
  onUpdated: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `updateRoute`/`listTokenTypes` caem no singleton `apiClient`.
   */
  client?: ApiClient;
}

/* ─── Helpers ─────────────────────────────────────────────── */

/**
 * Wrapper para o Alert warning de token type inativo. Usa margin-bottom
 * próprio para não brigar com o gap do `RouteFormShell` (que já tem
 * `gap: var(--space-4)` entre filhos do `<form>`). Como o aviso fica
 * **acima** do form (fora do shell), precisamos espaçar manualmente.
 */
const InactiveTokenNoticeShell = styled.div`
  margin-bottom: var(--space-4);
`;

/**
 * Constrói o estado inicial do form a partir de uma `RouteDto`.
 * `description: null` (do backend quando vazio) vira string vazia para
 * que o input controlado nunca receba `null`/`undefined` — preserva
 * paridade com o `INITIAL_ROUTE_FORM_STATE` do create.
 */
function stateFromRoute(route: RouteDto): RouteFormState {
  return {
    name: route.name,
    code: route.code,
    description: route.description ?? '',
    systemTokenTypeId: route.systemTokenTypeId,
  };
}

const EMPTY_INITIAL_STATE: RouteFormState = {
  name: '',
  code: '',
  description: '',
  systemTokenTypeId: '',
};

/**
 * Constrói uma `TokenTypeDto` sintética que representa o token type
 * inativo atualmente referenciado pela rota — exibido no `<Select>`
 * com sufixo "(inativo)" para que o usuário entenda o estado sem
 * perder o valor atual. O backend devolve `systemTokenTypeName` e
 * `systemTokenTypeCode` denormalizados, com strings vazias quando o
 * token type foi soft-deletado (LEFT JOIN no controller). Cobrimos os
 * dois casos com fallbacks.
 */
function buildInactiveTokenTypePlaceholder(route: RouteDto): TokenTypeDto {
  const baseName = route.systemTokenTypeName.trim();
  const baseCode = route.systemTokenTypeCode.trim();
  const displayName =
    baseName.length > 0 ? baseName : baseCode.length > 0 ? baseCode : 'Política inativa';
  return {
    id: route.systemTokenTypeId,
    name: `${displayName} (inativo)`,
    code: baseCode.length > 0 ? baseCode : 'inactive',
    description: null,
    // Datas sintéticas — não exibidas, mas o tipo exige `string`.
    createdAt: route.createdAt,
    updatedAt: route.updatedAt,
    // Marca como soft-deletado para coerência semântica — caso algum
    // consumidor futuro filtre por `deletedAt` antes de usar.
    deletedAt: route.updatedAt,
  };
}

/* ─── Component ──────────────────────────────────────────── */

/**
 * Modal de edição de rota (Issue #64).
 *
 * Espelha a forma do `NewRouteModal` (mesma estrutura visual,
 * validação, mapeamento de erros) com quatro diferenças funcionais:
 *
 * 1. Pré-popula `formState` com os campos da `route` recebida por
 *    prop — atende o critério de aceite "pré-popula com dados atuais".
 * 2. Submit chama `updateRoute(id, payload)` em vez de `createRoute`.
 * 3. Trata 404 fechando o modal + toast vermelho + refetch (rota foi
 *    removida por outra sessão entre a abertura e o submit). Os outros
 *    códigos (409/400/401/403/network) seguem o mesmo mapeamento da
 *    criação, com copy adaptado para "atualizada" e mensagem de
 *    conflito citando "outra rota".
 * 4. Quando a rota referencia um token type soft-deletado, injeta
 *    a opção atual marcada como "(inativo)" no `<Select>` e exibe
 *    Alert warning orientando a troca — submit fica desabilitado até
 *    o usuário escolher uma política ativa, evitando que o backend
 *    rejeite com 400 (`SystemTokenTypeId inválido ou inativo.`).
 *
 * Toda a lógica de validação client-side e parsing de
 * `ValidationProblemDetails` vem de `routeFormShared.ts`, os campos
 * vivem em `RouteFormFields`, o estado/handlers do form vêm de
 * `useRouteForm` e o ciclo de carregamento de token types vem de
 * `useRouteTokenTypes` — evita duplicação ≥10 linhas com o
 * `NewRouteModal` (BLOCKER de duplicação Sonar, lição PR #134).
 */
export const EditRouteModal: React.FC<EditRouteModalProps> = ({
  open,
  route,
  onClose,
  onUpdated,
  client,
}) => {
  const { show } = useToast();

  // Inicialização defensiva: quando `route` é `null` na primeira
  // render, usamos um estado vazio até o pai entregar a rota. O
  // `useEffect` abaixo sincroniza sempre que `route` muda.
  const {
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
  } = useRouteForm(route ? stateFromRoute(route) : EMPTY_INITIAL_STATE);

  const {
    tokenTypes: activeTokenTypes,
    loadingTokenTypes,
    tokenTypesError,
    tokenTypesHelperText,
    submitDisabled: tokenTypesSubmitDisabled,
    resolveEffectiveSubmitError,
  } = useRouteTokenTypes(open, client);

  /**
   * Sincroniza o form sempre que: (a) o modal abre, ou (b) a `route`
   * selecionada muda. Limpa erros pendentes para evitar resíduo entre
   * aberturas (mesmo padrão do `EditSystemModal`, baseado em
   * `route.id`).
   */
  useEffect(() => {
    if (!open || !route) return;
    setFormState(stateFromRoute(route));
    setFieldErrors({});
    setSubmitError(null);
  }, [open, route, setFormState, setFieldErrors, setSubmitError]);

  /**
   * Detecta se a rota está vinculada a um token type que foi
   * soft-deletado posteriormente. Só consideramos a checagem **após**
   * a lista de ativos terminar de carregar — antes disso, o array
   * `activeTokenTypes` vem vazio por construção e marcariam falsos
   * positivos.
   */
  const isInactiveTokenTypeReferenced = useMemo<boolean>(() => {
    if (!route || loadingTokenTypes || tokenTypesError !== null) return false;
    if (activeTokenTypes.length === 0) return false;
    return !activeTokenTypes.some((tt) => tt.id === route.systemTokenTypeId);
  }, [activeTokenTypes, loadingTokenTypes, route, tokenTypesError]);

  /**
   * Lista efetiva passada ao `<Select>`: quando o token type
   * referenciado é inativo, prependemos a opção sintética para
   * preservar o valor atual visível com o sufixo "(inativo)".
   */
  const tokenTypesForSelect = useMemo<ReadonlyArray<TokenTypeDto>>(() => {
    if (!isInactiveTokenTypeReferenced || !route) return activeTokenTypes;
    return [buildInactiveTokenTypePlaceholder(route), ...activeTokenTypes];
  }, [activeTokenTypes, isInactiveTokenTypeReferenced, route]);

  /**
   * Submit fica desabilitado:
   *
   * - Pelos motivos do `useRouteTokenTypes` (carregando, erro de
   *   carregamento ou lista vazia de ativos), **ou**
   * - Quando a opção selecionada é a sintética inativa (usuário
   *   precisa escolher uma ativa antes de salvar — backend
   *   rejeitaria com 400 de qualquer jeito).
   */
  const submitDisabled =
    tokenTypesSubmitDisabled ||
    (isInactiveTokenTypeReferenced &&
      route !== null &&
      formState.systemTokenTypeId === route.systemTokenTypeId);

  /**
   * Reseta erros ao fechar — handler único para Esc, backdrop, X e
   * botão Cancelar; previne resíduo entre aberturas. Cancelar durante
   * submissão é bloqueado para evitar request órfã. Não resetamos o
   * `formState` aqui (diferente do `NewRouteModal`) porque o efeito
   * de sincronização re-popula a partir da `route` quando o modal
   * reabre.
   */
  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setFieldErrors({});
    setSubmitError(null);
    onClose();
  }, [isSubmitting, onClose, setFieldErrors, setSubmitError]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting || !route) return;

      // `prepareSubmit` valida + zera erros + marca submitting +
      // devolve payload trimado, ou `null` quando há erros client-
      // side. Mesma rotina usada pelo `NewRouteModal` — extrair
      // eliminou ~16 linhas de boilerplate (lição PR #128).
      const payload = prepareSubmit(route.systemId);
      if (!payload) return;

      try {
        await updateRoute(route.id, payload, undefined, client);
        // Mensagem de sucesso fixa (não citamos o nome porque o
        // usuário acabou de editá-lo — a lista será atualizada).
        show('Rota atualizada.', { variant: 'success' });
        // Ordem importa: refetch antes de fechar para o pai não ter
        // que coordenar dois ticks separados.
        setFieldErrors({});
        setSubmitError(null);
        onUpdated();
        onClose();
      } catch (error: unknown) {
        // `classifyRouteSubmitError` decide o `kind` do erro;
        // `applyEditSubmitAction` despacha os efeitos colaterais
        // (setState/toast/onClose). Helper compartilhado com o
        // `EditSystemModal` — eliminou ~33 linhas de switch duplicado
        // que o Sonar tokenizou como New Code Duplication na 1ª
        // tentativa de PR (lição PR #134, 6ª recorrência evitada).
        const action = classifyRouteSubmitError(error, SUBMIT_ERROR_COPY);
        applyEditSubmitAction<keyof RouteFieldErrors>(
          action,
          {
            setFieldErrors,
            setSubmitError,
            applyBadRequest,
            showToast: show,
            onAfterNotFound: () => {
              onUpdated();
              onClose();
            },
          },
          EDIT_SUBMIT_ACTION_COPY,
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      applyBadRequest,
      client,
      isSubmitting,
      onClose,
      onUpdated,
      prepareSubmit,
      route,
      setFieldErrors,
      setIsSubmitting,
      setSubmitError,
      show,
    ],
  );

  // Não renderiza nada quando não houver `route` selecionada — o pai
  // controla `open` em conjunto com a `route`, mas cobrimos o caso
  // defensivo de `open=true && route=null` para não quebrar o submit.
  if (!route) {
    return null;
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Editar rota"
      description="Atualize os dados da rota selecionada."
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      {isInactiveTokenTypeReferenced && (
        <InactiveTokenNoticeShell>
          <Alert variant="warning" data-testid="edit-route-inactive-token-notice">
            {INACTIVE_TOKEN_TYPE_NOTICE}
          </Alert>
        </InactiveTokenNoticeShell>
      )}
      <RouteFormBody
        idPrefix="edit-route"
        submitError={resolveEffectiveSubmitError(submitError)}
        values={formState}
        errors={fieldErrors}
        tokenTypes={tokenTypesForSelect}
        onChangeName={handleNameChange}
        onChangeCode={handleCodeChange}
        onChangeDescription={handleDescriptionChange}
        onChangeSystemTokenTypeId={handleSystemTokenTypeIdChange}
        onSubmit={handleSubmit}
        onCancel={handleClose}
        isSubmitting={isSubmitting}
        submitLabel="Salvar alterações"
        submitDisabled={submitDisabled}
        tokenTypesHelperText={tokenTypesHelperText}
      />
    </Modal>
  );
};
