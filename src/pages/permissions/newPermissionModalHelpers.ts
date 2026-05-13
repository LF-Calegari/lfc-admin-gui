/**
 * Helpers puros do `NewPermissionModal` — extraídos para manter o
 * componente abaixo do limite de Cognitive Complexity do Sonar (Issue #201).
 */

export function resolveCatalogAlertMessage(params: {
  systemsErrorMessage: string | null;
  typesErrorMessage: string | null;
  routesErrorMessage: string | null;
  systemIdTrimmedLength: number;
}): string | null {
  if (params.systemsErrorMessage !== null) {
    return params.systemsErrorMessage;
  }
  if (params.typesErrorMessage !== null) {
    return params.typesErrorMessage;
  }
  if (params.systemIdTrimmedLength > 0 && params.routesErrorMessage !== null) {
    return params.routesErrorMessage;
  }
  return null;
}

export function computeNewPermissionSubmitDisabled(params: {
  isSubmitting: boolean;
  loadingSystems: boolean;
  loadingTypes: boolean;
  systemsErrorMessage: string | null;
  typesErrorMessage: string | null;
  systemsEmpty: boolean;
  typesEmpty: boolean;
  systemIdTrimmedLength: number;
  loadingRoutes: boolean;
  routesErrorMessage: string | null;
  routesEmpty: boolean;
}): boolean {
  if (
    params.isSubmitting ||
    params.loadingSystems ||
    params.loadingTypes ||
    params.systemsErrorMessage !== null ||
    params.typesErrorMessage !== null ||
    params.systemsEmpty ||
    params.typesEmpty
  ) {
    return true;
  }
  if (params.systemIdTrimmedLength === 0) {
    return false;
  }
  return params.loadingRoutes || params.routesErrorMessage !== null || params.routesEmpty;
}

export function buildSystemsHelperText(loading: boolean, empty: boolean): string {
  if (loading) return 'Carregando sistemas…';
  if (empty) return 'Nenhum sistema disponível.';
  return 'Sistema ao qual a rota pertence.';
}

export function buildRoutesHelperText(
  systemIdEmpty: boolean,
  loading: boolean,
  empty: boolean,
): string {
  if (systemIdEmpty) return 'Selecione um sistema para listar rotas.';
  if (loading) return 'Carregando rotas…';
  if (empty) return 'Nenhuma rota ativa neste sistema.';
  return 'Rota que receberá o tipo de permissão.';
}

export function buildTypesHelperText(loading: boolean, empty: boolean): string {
  if (loading) return 'Carregando tipos…';
  if (empty) return 'Nenhum tipo de permissão disponível.';
  return 'Ação (criar, ler, atualizar, etc.) aplicada à rota.';
}

export function buildRoutePlaceholder(
  systemIdEmpty: boolean,
  hasRoutes: boolean,
): string {
  if (systemIdEmpty) return 'Selecione um sistema';
  if (hasRoutes) return 'Selecione uma rota';
  return 'Nenhuma rota disponível';
}
