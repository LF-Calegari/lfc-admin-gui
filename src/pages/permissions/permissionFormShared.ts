import {
  extractValidationErrorsByField,
  type ApiSubmitErrorCopy,
  type ApplyBadRequestDecision,
} from '../../shared/forms';

/** Limite do backend (`CreatePermissionRequest.Description`). */
export const PERMISSION_DESCRIPTION_MAX = 500;

export interface PermissionCreateFormState {
  systemId: string;
  routeId: string;
  permissionTypeId: string;
  description: string;
}

export const INITIAL_PERMISSION_CREATE_FORM_STATE: PermissionCreateFormState = {
  systemId: '',
  routeId: '',
  permissionTypeId: '',
  description: '',
};

export type PermissionCreateFieldErrors = Partial<{
  systemId: string;
  routeId: string;
  permissionTypeId: string;
  description: string;
}>;

export type PermissionCreateSubmitErrorCopy = ApiSubmitErrorCopy;

function normalizePermissionCreateFieldName(
  serverField: string,
): keyof PermissionCreateFieldErrors | null {
  const map: Record<string, keyof PermissionCreateFieldErrors> = {
    RouteId: 'routeId',
    PermissionTypeId: 'permissionTypeId',
    Description: 'description',
  };
  return map[serverField] ?? null;
}

export function extractPermissionCreateValidationErrors(
  details: unknown,
): PermissionCreateFieldErrors | null {
  return extractValidationErrorsByField<PermissionCreateFieldErrors>(
    details,
    normalizePermissionCreateFieldName,
  );
}

export function decidePermissionCreateBadRequestHandling(
  details: unknown,
  fallbackMessage: string,
): ApplyBadRequestDecision<PermissionCreateFieldErrors> {
  const extracted = extractPermissionCreateValidationErrors(details);
  if (extracted && Object.keys(extracted).length > 0) {
    return { kind: 'field-errors', errors: extracted };
  }
  return { kind: 'submit-error', message: fallbackMessage };
}

/**
 * Validação client-side alinhada a `CreatePermissionRequest` — campos de
 * sistema/rota/tipo são obrigatórios na UI (o POST usa só `routeId` +
 * `permissionTypeId`).
 */
export function validatePermissionCreateForm(
  state: PermissionCreateFormState,
): PermissionCreateFieldErrors | null {
  const errors: PermissionCreateFieldErrors = {};
  if (state.systemId.trim().length === 0) {
    errors.systemId = 'Selecione um sistema.';
  }
  if (state.routeId.trim().length === 0) {
    errors.routeId = 'Selecione uma rota.';
  }
  if (state.permissionTypeId.trim().length === 0) {
    errors.permissionTypeId = 'Selecione um tipo de permissão.';
  }
  const desc = state.description.trim();
  if (desc.length > PERMISSION_DESCRIPTION_MAX) {
    errors.description = `Descrição deve ter no máximo ${PERMISSION_DESCRIPTION_MAX} caracteres.`;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}
