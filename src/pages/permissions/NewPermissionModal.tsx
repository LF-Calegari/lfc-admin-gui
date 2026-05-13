import React, { useCallback, useEffect, useMemo } from 'react';
import styled from 'styled-components';

import { Alert, Modal, Select, Textarea, useToast } from '../../components/ui';
import { useModalListSystemsFetch } from '../../hooks/useModalListSystemsFetch';
import { useSingleFetchWithAbort } from '../../hooks/useSingleFetchWithAbort';
import {
  createPermission,
  listPermissionTypes,
  listRoutes,
} from '../../shared/api';
import {
  FormFooter,
  useCreateEntitySubmit,
  type CreateEntitySubmitCopy,
} from '../../shared/forms';

import {
  buildRoutePlaceholder,
  buildRoutesHelperText,
  buildSystemsHelperText,
  buildTypesHelperText,
  computeNewPermissionSubmitDisabled,
  resolveCatalogAlertMessage,
} from './newPermissionModalHelpers';
import {
  INITIAL_PERMISSION_CREATE_FORM_STATE,
  PERMISSION_DESCRIPTION_MAX,
  type PermissionCreateFieldErrors,
  type PermissionCreateSubmitErrorCopy,
} from './permissionFormShared';
import { usePermissionCreateForm } from './usePermissionCreateForm';

import type {
  ApiClient,
  CreatePermissionPayload,
  PagedResponse,
  RouteDto,
  SafeRequestOptions,
} from '../../shared/api';

const SYSTEMS_LOOKUP_PAGE_SIZE = 100;
const ROUTES_LOOKUP_PAGE_SIZE = 100;

const SUBMIT_ERROR_COPY: PermissionCreateSubmitErrorCopy = {
  conflictDefault: 'Esta combinação de rota e tipo de permissão já existe.',
  forbiddenTitle: 'Falha ao criar permissão',
  genericFallback: 'Não foi possível criar a permissão. Tente novamente.',
};

const FormStack = styled.form`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-2);
`;

interface NewPermissionModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  client?: ApiClient;
}

/**
 * Modal de criação de permissão — Issue #201. POST `/permissions`
 * com `routeId`, `permissionTypeId` e `description` opcional,
 * espelhando `PermissionsController.CreatePermissionRequest`.
 */
export const NewPermissionModal: React.FC<NewPermissionModalProps> = ({
  open,
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
    handleDescriptionChange,
    handleSystemIdChange,
    handleRouteIdChange,
    handlePermissionTypeIdChange,
    prepareSubmit,
    applyBadRequest,
  } = usePermissionCreateForm(INITIAL_PERMISSION_CREATE_FORM_STATE);

  useEffect(() => {
    if (!open) return;
    setFormState(INITIAL_PERMISSION_CREATE_FORM_STATE);
    setFieldErrors({});
    setSubmitError(null);
  }, [open, setFieldErrors, setFormState, setSubmitError]);

  const {
    data: systemsResponse,
    isInitialLoading: loadingSystems,
    errorMessage: systemsErrorMessage,
  } = useModalListSystemsFetch({
    open,
    skip: false,
    pageSize: SYSTEMS_LOOKUP_PAGE_SIZE,
    client,
    fallbackErrorMessage: 'Falha ao carregar sistemas.',
  });

  const typesFetcher = useCallback(
    (options: SafeRequestOptions) => listPermissionTypes(options, client),
    [client],
  );

  const {
    data: permissionTypes,
    isInitialLoading: loadingTypes,
    errorMessage: typesErrorMessage,
  } = useSingleFetchWithAbort({
    fetcher: typesFetcher,
    fallbackErrorMessage: 'Falha ao carregar tipos de permissão.',
    skip: !open,
  });

  const routesFetcher = useCallback(
    (options: SafeRequestOptions): Promise<PagedResponse<RouteDto>> =>
      listRoutes(
        {
          systemId: formState.systemId.trim(),
          pageSize: ROUTES_LOOKUP_PAGE_SIZE,
        },
        options,
        client,
      ),
    [client, formState.systemId],
  );

  const systemIdTrimmed = formState.systemId.trim();
  const {
    data: routesResponse,
    isInitialLoading: loadingRoutes,
    errorMessage: routesErrorMessage,
  } = useSingleFetchWithAbort({
    fetcher: routesFetcher,
    fallbackErrorMessage: 'Falha ao carregar rotas do sistema.',
    skip: !open || systemIdTrimmed.length === 0,
  });

  const systemOptions = systemsResponse?.data ?? [];
  const routeOptions = routesResponse?.data ?? [];
  const typeOptions = permissionTypes ?? [];

  const systemsEmpty = !loadingSystems && systemOptions.length === 0 && systemsErrorMessage === null;
  const typesEmpty = !loadingTypes && typeOptions.length === 0 && typesErrorMessage === null;
  const routesEmpty =
    systemIdTrimmed.length > 0 &&
    !loadingRoutes &&
    routeOptions.length === 0 &&
    routesErrorMessage === null;

  const catalogAlert = resolveCatalogAlertMessage({
    systemsErrorMessage,
    typesErrorMessage,
    routesErrorMessage,
    systemIdTrimmedLength: systemIdTrimmed.length,
  });

  const systemsHelperText = buildSystemsHelperText(loadingSystems, systemsEmpty);
  const routesHelperText = buildRoutesHelperText(
    systemIdTrimmed.length === 0,
    loadingRoutes,
    routesEmpty,
  );
  const typesHelperText = buildTypesHelperText(loadingTypes, typesEmpty);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setFormState(INITIAL_PERMISSION_CREATE_FORM_STATE);
    setFieldErrors({});
    setSubmitError(null);
    onClose();
  }, [isSubmitting, onClose, setFieldErrors, setFormState, setSubmitError]);

  const resetForm = useCallback(() => {
    setFormState(INITIAL_PERMISSION_CREATE_FORM_STATE);
    setFieldErrors({});
    setSubmitError(null);
  }, [setFieldErrors, setFormState, setSubmitError]);

  const prepareSubmitSafe = useCallback((): CreatePermissionPayload | null => {
    if (isSubmitting) return null;
    return prepareSubmit();
  }, [isSubmitting, prepareSubmit]);

  const mutationFn = useCallback(
    (payload: unknown) =>
      createPermission(payload as CreatePermissionPayload, undefined, client),
    [client],
  );

  const submitCopy = useMemo<CreateEntitySubmitCopy>(
    () => ({
      successMessage: 'Permissão criada.',
      submitErrorCopy: SUBMIT_ERROR_COPY,
    }),
    [],
  );

  const handleSubmit = useCreateEntitySubmit<keyof PermissionCreateFieldErrors>({
    dispatchers: {
      setFieldErrors,
      setSubmitError,
      setIsSubmitting,
      applyBadRequest,
      showToast: show,
      resetForm,
    },
    copy: submitCopy,
    callbacks: {
      prepareSubmit: prepareSubmitSafe,
      mutationFn,
      onCreated,
      onClose,
    },
    conflictField: 'routeId',
  });

  const submitDisabled = computeNewPermissionSubmitDisabled({
    isSubmitting,
    loadingSystems,
    loadingTypes,
    systemsErrorMessage,
    typesErrorMessage,
    systemsEmpty,
    typesEmpty,
    systemIdTrimmedLength: systemIdTrimmed.length,
    loadingRoutes,
    routesErrorMessage,
    routesEmpty,
  });

  const routePlaceholder = buildRoutePlaceholder(
    systemIdTrimmed.length === 0,
    routeOptions.length > 0,
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova permissão"
      description="Associe uma rota cadastrada a um tipo de permissão. A descrição é opcional."
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      <FormStack onSubmit={handleSubmit} noValidate data-testid="new-permission-form">
        {catalogAlert !== null && <Alert variant="danger">{catalogAlert}</Alert>}
        {submitError !== null && <Alert variant="danger">{submitError}</Alert>}

        <Select
          label="Sistema"
          value={formState.systemId}
          onChange={handleSystemIdChange}
          error={fieldErrors.systemId}
          helperText={fieldErrors.systemId ? undefined : systemsHelperText}
          disabled={isSubmitting || loadingSystems || systemsErrorMessage !== null || systemsEmpty}
          required
          data-testid="new-permission-system-id"
          aria-label="Sistema da rota"
        >
          <option value="" disabled={systemOptions.length > 0}>
            {systemOptions.length > 0 ? 'Selecione um sistema' : 'Nenhum sistema disponível'}
          </option>
          {systemOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>

        <Select
          label="Rota"
          value={formState.routeId}
          onChange={handleRouteIdChange}
          error={fieldErrors.routeId}
          helperText={fieldErrors.routeId ? undefined : routesHelperText}
          disabled={
            isSubmitting ||
            systemIdTrimmed.length === 0 ||
            loadingRoutes ||
            routesErrorMessage !== null ||
            routesEmpty
          }
          required
          data-testid="new-permission-route-id"
          aria-label="Rota da permissão"
        >
          <option value="" disabled={routeOptions.length > 0}>
            {routePlaceholder}
          </option>
          {routeOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.code} — {r.name}
            </option>
          ))}
        </Select>

        <Select
          label="Tipo de permissão"
          value={formState.permissionTypeId}
          onChange={handlePermissionTypeIdChange}
          error={fieldErrors.permissionTypeId}
          helperText={fieldErrors.permissionTypeId ? undefined : typesHelperText}
          disabled={isSubmitting || loadingTypes || typesErrorMessage !== null || typesEmpty}
          required
          data-testid="new-permission-type-id"
          aria-label="Tipo de permissão"
        >
          <option value="" disabled={typeOptions.length > 0}>
            {typeOptions.length > 0 ? 'Selecione um tipo' : 'Nenhum tipo disponível'}
          </option>
          {typeOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>

        <Textarea
          label="Descrição"
          value={formState.description}
          onChange={handleDescriptionChange}
          error={fieldErrors.description}
          helperText={
            fieldErrors.description
              ? undefined
              : `Opcional — até ${PERMISSION_DESCRIPTION_MAX} caracteres.`
          }
          disabled={isSubmitting}
          rows={3}
          maxLength={PERMISSION_DESCRIPTION_MAX}
          data-testid="new-permission-description"
          aria-label="Descrição da permissão"
        />

        <FormFooter
          idPrefix="new-permission"
          onCancel={handleClose}
          isSubmitting={isSubmitting}
          submitLabel="Criar permissão"
          submitDisabled={submitDisabled}
        />
      </FormStack>
    </Modal>
  );
};
