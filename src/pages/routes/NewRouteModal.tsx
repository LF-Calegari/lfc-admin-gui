import React, { useCallback, useMemo, useState } from 'react';

import { Modal, Select, useToast } from '../../components/ui';
import { useSingleFetchWithAbort } from '../../hooks/useSingleFetchWithAbort';
import { createRoute, listSystems } from '../../shared/api';
import { useCreateEntitySubmit } from '../../shared/forms';

import { RouteFormBody } from './RouteFormFields';
import {
  INITIAL_ROUTE_FORM_STATE,
  type RouteFieldErrors,
  type RouteSubmitErrorCopy,
} from './routeFormShared';
import { useRouteForm } from './useRouteForm';
import { useRouteTokenTypes } from './useRouteTokenTypes';

import type {
  ApiClient,
  CreateRoutePayload,
  PagedResponse,
  SafeRequestOptions,
  SystemDto,
} from '../../shared/api';

/**
 * Copy injetada em `classifyApiSubmitError` para o caminho de
 * criação. Os literais aqui são os únicos pontos onde "criar"/"uma
 * rota" diferem do "atualizar"/"outra rota" no `EditRouteModal` —
 * o resto da lógica de classificação é compartilhado (lição PR #128).
 */
const SUBMIT_ERROR_COPY: RouteSubmitErrorCopy = {
  conflictDefault: 'Já existe uma rota com este código.',
  forbiddenTitle: 'Falha ao criar rota',
  genericFallback: 'Não foi possível criar a rota. Tente novamente.',
};

/** Texto exibido inline no campo `code` quando o backend devolve 409. */
const CONFLICT_INLINE_MESSAGE = 'Já existe uma rota com este código neste sistema.';

/**
 * Mensagem inline exibida abaixo do `<Select>` de sistema quando o
 * usuário tenta submeter sem ter escolhido nenhum. Espelha a copy de
 * "Selecione a política JWT alvo." que `validateRouteForm` injeta em
 * `systemTokenTypeId`. Issue #187 critério de aceite explícito.
 */
const SYSTEM_REQUIRED_MESSAGE = 'Selecione um sistema.';

/**
 * Limite de sistemas carregados para popular o `<Select>` no modo
 * global. Espelha o `MAX_*_PAGE_SIZE` aceito por `GET /systems` no
 * backend; o ecossistema de sistemas cadastrados é pequeno (≤ 10 em
 * produção projetada), então 100 cobre todos os cenários sem
 * paginação adicional. Não incluímos soft-deletados — não faz sentido
 * criar rota em um sistema inativo.
 */
const SYSTEMS_LOOKUP_PAGE_SIZE = 100;

/**
 * Modal de criação de rota — Issues #63 e #187.
 *
 * Decisões:
 *
 * - Componente "controlado por aberto" pelo pai (`open`/`onClose`).
 *   Mantém o ciclo de vida do estado do form sob controle desta camada:
 *   ao fechar, resetamos `formState`/`fieldErrors`/`submitError` para
 *   garantir que o usuário não veja resíduo de tentativa anterior.
 * - Validação client-side **antes** de submeter — replica as regras
 *   do backend (`Required`/`MaxLength`/`SystemTokenTypeId`) para dar
 *   feedback imediato e evitar round-trip por erro trivial. As regras
 *   vivem em `routeFormShared.ts` para serem reusadas pelo
 *   `EditRouteModal` (#64) sem duplicação (lição PR #127/#128).
 * - Mapeamento de erro do backend (delegado a `useCreateEntitySubmit`):
 *   - 409 → mensagem inline no campo `code` ("Já existe uma rota com
 *     este código neste sistema.").
 *   - 400 → `details.errors[Field]` mapeado para `fieldErrors[field]`,
 *     normalizando capitalização (backend manda `Name`/`Code`/
 *     `Description`/`SystemTokenTypeId`).
 *   - 401/403 → toast vermelho com mensagem do backend.
 *   - Demais → toast vermelho com mensagem genérica.
 * - Sucesso: chama `onCreated` (refetch responsabilidade do pai),
 *   fecha o modal e dispara toast verde "Rota criada.".
 *
 * **Modo per-system vs global** (Issue #187):
 *
 * O modal aceita `systemId` opcional na prop:
 *
 * - **Per-system** (caller `RoutesPage`, fluxo `/systems/:systemId/routes`
 *   da #63): `systemId` chega como prop fixa e o form **não** renderiza
 *   o `<Select>` de sistema — comportamento original preservado.
 * - **Global** (caller `RoutesGlobalListShellPage`, fluxo `/routes` da
 *   #187): `systemId` é `undefined`; carregamos `listSystems` e
 *   renderizamos um `<Select>` obrigatório no topo do form para o
 *   operador escolher antes de submeter.
 *
 * Tornamos a prop opcional (em vez de criar dois modals separados)
 * para evitar duplicação ≥ 50 linhas com `EditRouteModal`/state do
 * form/handler de erros (lição PR #128/#134/#135 reforçada). O custo
 * de uma branch interna no JSX é menor que o custo do clone.
 *
 * **Token types** (política JWT alvo):
 *
 * O ciclo de carregamento da lista vive em `useRouteTokenTypes`
 * (compartilhado com o `EditRouteModal` da #64). Esse hook lida com
 * `AbortController`, filtragem de soft-deletados e derivação de
 * `submitDisabled`/`tokenTypesHelperText` — extraído desde a #64 para
 * evitar a 6ª recorrência de duplicação Sonar (lição PR #134 — bloco
 * idêntico entre modals paralelos é gatilho garantido).
 */

interface NewRouteModalProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * UUID do sistema dono da rota.
   *
   * - **Definido**: caller per-system (`RoutesPage`) injeta o
   *   `:systemId` lido da URL — o modal usa direto, sem renderizar
   *   dropdown.
   * - **Omitido / `undefined`**: caller global
   *   (`RoutesGlobalListShellPage`) deixa o modal carregar
   *   `listSystems` e renderizar `<Select>` obrigatório (Issue #187).
   */
  systemId?: string;
  /** Fecha o modal sem persistir. Chamada também após sucesso. */
  onClose: () => void;
  /** Callback disparado após criação bem-sucedida (para refetch da lista). */
  onCreated: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `createRoute`/`listTokenTypes`/`listSystems` caem no singleton
   * `apiClient`.
   */
  client?: ApiClient;
}

/* ─── Component ──────────────────────────────────────────── */

export const NewRouteModal: React.FC<NewRouteModalProps> = ({
  open,
  systemId,
  onClose,
  onCreated,
  client,
}) => {
  const { show } = useToast();
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
  } = useRouteForm(INITIAL_ROUTE_FORM_STATE);

  const {
    tokenTypes,
    tokenTypesHelperText,
    submitDisabled: tokenTypesSubmitDisabled,
    resolveEffectiveSubmitError,
  } = useRouteTokenTypes(open, client);

  /**
   * Modo "global": quando o caller não fornece `systemId`, exibimos um
   * `<Select>` de sistema. O estado do dropdown vive aqui (em vez de
   * expandir `RouteFormState`) para preservar o shape compartilhado com
   * `EditRouteModal` e os testes da #64. `selectedSystemId` começa
   * vazio e o usuário escolhe.
   */
  const showSystemSelect = systemId === undefined;
  const [selectedSystemId, setSelectedSystemId] = useState<string>('');
  const [systemIdError, setSystemIdError] = useState<string | null>(null);

  /**
   * Carrega o catálogo de sistemas apenas quando o modal está aberto e
   * em modo global. `useSingleFetchWithAbort` cuida do AbortController
   * e do retry bumper. A request reage à abertura do modal — fechar +
   * reabrir cancela a request anterior.
   *
   * Skipamos a request quando: (a) o modal está fechado, ou (b) o
   * caller passou `systemId` (modo per-system, dropdown não é
   * renderizado e ninguém precisa do catálogo).
   */
  const systemsFetcher = useCallback(
    (options: SafeRequestOptions): Promise<PagedResponse<SystemDto>> =>
      listSystems({ pageSize: SYSTEMS_LOOKUP_PAGE_SIZE }, options, client),
    [client],
  );

  const {
    data: systemsResponse,
    isInitialLoading: loadingSystems,
    errorMessage: systemsErrorMessage,
  } = useSingleFetchWithAbort<PagedResponse<SystemDto>>({
    fetcher: systemsFetcher,
    fallbackErrorMessage:
      'Não foi possível carregar a lista de sistemas. Feche o modal e tente novamente.',
    skip: !open || !showSystemSelect,
  });

  const systemOptions = useMemo<ReadonlyArray<SystemDto>>(() => {
    if (!systemsResponse) return [];
    return [...systemsResponse.data].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    );
  }, [systemsResponse]);

  /**
   * `<Select>` em estado vazio (carregado mas sem nenhum sistema).
   * Cenário extremo (instalação nova sem nenhum sistema cadastrado),
   * mas o operador precisa de feedback claro de que não dá pra criar
   * rota agora.
   */
  const systemsEmpty =
    showSystemSelect &&
    !loadingSystems &&
    systemsErrorMessage === null &&
    systemOptions.length === 0;

  const handleSelectedSystemIdChange = useCallback((value: string) => {
    setSelectedSystemId(value);
    setSystemIdError(null);
  }, []);

  /**
   * `submitDisabled` agregando todos os bloqueios do form:
   *
   * - Bloqueios oriundos de token types (carregando, erro ou vazio) —
   *   delegados a `useRouteTokenTypes`.
   * - No modo global: catálogo de sistemas carregando, erro de carga
   *   ou vazio.
   *
   * Não bloqueamos por `selectedSystemId` vazio — deixamos o usuário
   * tentar submeter para receber a mensagem inline "Selecione um
   * sistema.". Espelha a UX dos demais campos obrigatórios do form
   * (que validam só no submit).
   */
  const submitDisabled =
    tokenTypesSubmitDisabled ||
    (showSystemSelect && (loadingSystems || systemsErrorMessage !== null || systemsEmpty));

  /**
   * Reseta tudo ao fechar — handler único para Esc, backdrop, X e
   * botão Cancelar; previne resíduo entre aberturas. Cancelar durante
   * submissão é bloqueado para evitar request órfã.
   */
  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setFormState(INITIAL_ROUTE_FORM_STATE);
    setFieldErrors({});
    setSubmitError(null);
    setSelectedSystemId('');
    setSystemIdError(null);
    onClose();
  }, [isSubmitting, onClose, setFormState, setFieldErrors, setSubmitError]);

  /**
   * Reset disparado pelo helper `useCreateEntitySubmit` no caminho
   * feliz (antes de `onCreated`/`onClose`). Mantemos uma referência
   * dedicada (em vez de reusar `handleClose`) porque `handleClose` é
   * gateado por `isSubmitting` — o submit feliz roda exatamente
   * quando `isSubmitting === true`, então o gate inverteria o
   * comportamento esperado. Espelha o padrão de `NewRoleModal`/
   * `NewUserModal`.
   */
  const resetForm = useCallback(() => {
    setFormState(INITIAL_ROUTE_FORM_STATE);
    setFieldErrors({});
    setSubmitError(null);
    setSelectedSystemId('');
    setSystemIdError(null);
  }, [setFormState, setFieldErrors, setSubmitError]);

  /**
   * Wrapper de `prepareSubmit` que injeta o `systemId` correto
   * dependendo do modo. No modo global, valida o dropdown antes —
   * se estiver vazio, popula o erro inline e devolve `null` para
   * abortar o submit (mesmo padrão de `prepareSubmit` quando os
   * outros campos falham na validação).
   *
   * Devolve `CreateRoutePayload | null` — preserva a tipagem
   * exigida por `useCreateEntitySubmit.callbacks.prepareSubmit`.
   */
  const prepareSubmitForRoute = useCallback((): CreateRoutePayload | null => {
    const effectiveSystemId = showSystemSelect ? selectedSystemId.trim() : systemId;
    if (showSystemSelect && (effectiveSystemId === undefined || effectiveSystemId.length === 0)) {
      setSystemIdError(SYSTEM_REQUIRED_MESSAGE);
      // Não chamamos `prepareSubmit` — assim os outros erros inline
      // só aparecem na próxima tentativa, depois que o operador
      // resolver o sistema. Espelha o early-return do
      // `validateRouteForm` quando há erros.
      return null;
    }
    if (effectiveSystemId === undefined) {
      // Defensivo: caller per-system não pode passar undefined
      // (TypeScript já garante), mas o branch existe pra que o tipo
      // do retorno seja correto sem `!`.
      return null;
    }
    setSystemIdError(null);
    return prepareSubmit(effectiveSystemId);
  }, [prepareSubmit, selectedSystemId, showSystemSelect, systemId]);

  /**
   * `mutationFn` injetada no helper genérico. Tipa o payload via
   * cast porque o helper aceita `unknown` — `prepareSubmit` só
   * devolve `CreateRoutePayload | null` e o helper já filtrou
   * `null` antes de chamar `mutationFn`.
   */
  const mutationFn = useCallback(
    (payload: unknown) =>
      createRoute(payload as CreateRoutePayload, undefined, client),
    [client],
  );

  const handleSubmit = useCreateEntitySubmit<keyof RouteFieldErrors>({
    dispatchers: {
      setFieldErrors,
      setSubmitError,
      setIsSubmitting,
      applyBadRequest,
      showToast: show,
      resetForm,
    },
    copy: {
      successMessage: 'Rota criada.',
      conflictInlineMessage: CONFLICT_INLINE_MESSAGE,
      submitErrorCopy: SUBMIT_ERROR_COPY,
    },
    callbacks: {
      prepareSubmit: prepareSubmitForRoute,
      mutationFn,
      onCreated,
      onClose,
    },
    conflictField: 'code',
  });

  /**
   * `submitError` exibido no Alert do topo: prioriza o erro do submit
   * (vem do backend), depois o erro de carga de token types, depois o
   * de carga de sistemas (modo global). `useRouteTokenTypes` já cobre
   * a parte de token types via `resolveEffectiveSubmitError`; aqui
   * acrescentamos a layer de sistemas.
   */
  const effectiveSubmitError = (() => {
    const tokenLayer = resolveEffectiveSubmitError(submitError);
    if (tokenLayer !== null) return tokenLayer;
    if (showSystemSelect) {
      if (systemsErrorMessage !== null) return systemsErrorMessage;
      if (systemsEmpty) {
        return 'Nenhum sistema cadastrado. Cadastre um sistema antes de criar rotas.';
      }
    }
    return null;
  })();

  /**
   * Helper text do `<Select>` enquanto a request inicial de sistemas
   * está em curso. Mostra "Carregando sistemas..." em vez de deixar o
   * controle vazio — espelha o padrão usado por `useRouteTokenTypes`
   * para o `<Select>` de política JWT.
   */
  const systemsHelperText = loadingSystems ? 'Carregando sistemas…' : undefined;

  /**
   * Slot opcional renderizado dentro do `<form>`, **acima** dos
   * campos padrão. Quando o modal está em modo global, contém o
   * `<Select>` de sistema; em modo per-system, é `null` e o body
   * renderiza igual ao original.
   */
  const headerSlot = showSystemSelect ? (
    <Select
      label="Sistema"
      value={selectedSystemId}
      onChange={handleSelectedSystemIdChange}
      error={systemIdError ?? undefined}
      helperText={
        systemIdError
          ? undefined
          : systemsHelperText ?? 'Selecione o sistema dono da nova rota.'
      }
      disabled={isSubmitting || loadingSystems || systemsErrorMessage !== null || systemsEmpty}
      required
      data-testid="new-route-system-id"
      aria-label="Sistema dono da nova rota"
    >
      <option value="" disabled={systemOptions.length > 0}>
        {systemOptions.length > 0
          ? 'Selecione um sistema'
          : 'Nenhum sistema disponível'}
      </option>
      {systemOptions.map((system) => (
        <option key={system.id} value={system.id}>
          {system.name}
        </option>
      ))}
    </Select>
  ) : null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova rota"
      description={
        showSystemSelect
          ? 'Cadastre uma rota escolhendo o sistema dono.'
          : 'Cadastre uma rota vinculada ao sistema selecionado.'
      }
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      <RouteFormBody
        idPrefix="new-route"
        submitError={effectiveSubmitError}
        values={formState}
        errors={fieldErrors}
        tokenTypes={tokenTypes}
        onChangeName={handleNameChange}
        onChangeCode={handleCodeChange}
        onChangeDescription={handleDescriptionChange}
        onChangeSystemTokenTypeId={handleSystemTokenTypeIdChange}
        onSubmit={handleSubmit}
        onCancel={handleClose}
        isSubmitting={isSubmitting}
        submitLabel="Criar rota"
        submitDisabled={submitDisabled}
        tokenTypesHelperText={tokenTypesHelperText}
        headerSlot={headerSlot}
      />
    </Modal>
  );
};
