import { useCallback, useState } from 'react';

import { useApplyBadRequest, useFieldChangeHandlers } from '../../shared/forms';

import {
  decidePermissionCreateBadRequestHandling,
  validatePermissionCreateForm,
  type PermissionCreateFieldErrors,
  type PermissionCreateFormState,
} from './permissionFormShared';

import type { CreatePermissionPayload } from '../../shared/api';

const DESCRIPTION_ONLY = ['description'] as const;

export interface UsePermissionCreateFormReturn {
  formState: PermissionCreateFormState;
  fieldErrors: PermissionCreateFieldErrors;
  submitError: string | null;
  isSubmitting: boolean;
  setFormState: React.Dispatch<React.SetStateAction<PermissionCreateFormState>>;
  setFieldErrors: React.Dispatch<React.SetStateAction<PermissionCreateFieldErrors>>;
  setSubmitError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  handleDescriptionChange: (value: string) => void;
  handleSystemIdChange: (value: string) => void;
  handleRouteIdChange: (value: string) => void;
  handlePermissionTypeIdChange: (value: string) => void;
  prepareSubmit: () => CreatePermissionPayload | null;
  applyBadRequest: (details: unknown, fallbackMessage: string) => void;
}

export function usePermissionCreateForm(
  initialState: PermissionCreateFormState,
): UsePermissionCreateFormReturn {
  const [formState, setFormState] = useState<PermissionCreateFormState>(initialState);
  const [fieldErrors, setFieldErrors] = useState<PermissionCreateFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const { description: handleDescriptionChange } = useFieldChangeHandlers<
    PermissionCreateFormState,
    PermissionCreateFieldErrors
  >(DESCRIPTION_ONLY, setFormState, setFieldErrors);

  const handleSystemIdChange = useCallback((value: string) => {
    setFormState((prev) => ({ ...prev, systemId: value, routeId: '' }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.systemId;
      delete next.routeId;
      return next;
    });
  }, []);

  const handleRouteIdChange = useCallback((value: string) => {
    setFormState((prev) => ({ ...prev, routeId: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.routeId;
      return next;
    });
  }, []);

  const handlePermissionTypeIdChange = useCallback((value: string) => {
    setFormState((prev) => ({ ...prev, permissionTypeId: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.permissionTypeId;
      return next;
    });
  }, []);

  const prepareSubmit = useCallback((): CreatePermissionPayload | null => {
    const clientErrors = validatePermissionCreateForm(formState);
    if (clientErrors) {
      setFieldErrors(clientErrors);
      setSubmitError(null);
      return null;
    }
    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(true);
    const payload: CreatePermissionPayload = {
      routeId: formState.routeId.trim(),
      permissionTypeId: formState.permissionTypeId.trim(),
    };
    const d = formState.description.trim();
    if (d.length > 0) {
      payload.description = d;
    }
    return payload;
  }, [formState]);

  const applyBadRequest = useApplyBadRequest<PermissionCreateFieldErrors>(
    decidePermissionCreateBadRequestHandling,
    { setFieldErrors, setSubmitError },
  );

  return {
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
  };
}
