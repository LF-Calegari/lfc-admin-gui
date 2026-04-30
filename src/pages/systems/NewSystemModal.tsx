import React, { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';

import { Alert, Button, Input, Modal, Textarea, useToast } from '../../components/ui';
import { createSystem, isApiError } from '../../shared/api';

import type { ApiClient, ApiError, CreateSystemPayload } from '../../shared/api';

/**
 * Modal de criação de sistema (Issue #58 — primeiro fluxo de mutação da
 * `SystemsPage`).
 *
 * Decisões:
 *
 * - Componente "controlado por aberto" pelo pai (`open`/`onClose`).
 *   Mantém o ciclo de vida do estado do form sob nosso controle: ao
 *   fechar, resetamos `formState`/`fieldErrors`/`submitError` na próxima
 *   reabertura para garantir que o usuário não veja resíduo de
 *   tentativa anterior.
 * - Validação client-side **antes** de submeter — replica as regras do
 *   backend (`Required` + `MaxLength`) para dar feedback imediato e
 *   evitar round-trip por erro trivial. Para evitar duplicação de
 *   constantes, usamos os mesmos limites declarados aqui (refletindo
 *   `CreateSystemRequest` no `SystemsController.cs`).
 * - Mapeamento de erro do backend:
 *   - 409 → mensagem inline no campo `code` ("Já existe um sistema com
 *     este Code." — texto exato do backend).
 *   - 400 → mapeamos `details.errors[Field]` para `fieldErrors[field]`,
 *     normalizando capitalização (backend manda `Name`/`Code`/`Description`,
 *     UI usa `name`/`code`/`description`).
 *   - Demais → toast vermelho com mensagem genérica.
 * - Sucesso: chama `onCreated` (refetch responsabilidade do pai), fecha
 *   o modal e dispara toast verde.
 *
 * Sem dependência nova: tudo reusa Input/Textarea/Button/Modal/Alert/
 * useToast já presentes no design system local.
 */

const NAME_MAX = 80;
const CODE_MAX = 50;
const DESCRIPTION_MAX = 500;

interface FormState {
  name: string;
  code: string;
  description: string;
}

interface FieldErrors {
  name?: string;
  code?: string;
  description?: string;
}

const INITIAL_STATE: FormState = {
  name: '',
  code: '',
  description: '',
};

interface NewSystemModalProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /** Fecha o modal sem persistir. Chamada também após sucesso. */
  onClose: () => void;
  /** Callback disparado após criação bem-sucedida (para refetch da lista). */
  onCreated: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `createSystem` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/* ─── Styled primitives ──────────────────────────────────── */

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-2);
`;

const HelperRow = styled.div`
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: var(--tracking-tight);
`;

/* ─── Helpers ─────────────────────────────────────────────── */

/**
 * Valida o estado do form contra as mesmas regras do backend
 * (`CreateSystemRequest`). Retorna `null` quando válido, ou um objeto
 * com mensagens por campo. Usamos pt-BR e textos próximos aos do
 * backend para que a UX seja coerente entre validação client e server.
 */
function validateForm(state: FormState): FieldErrors | null {
  const errors: FieldErrors = {};
  const name = state.name.trim();
  const code = state.code.trim();
  const description = state.description.trim();

  if (name.length === 0) {
    errors.name = 'Nome é obrigatório.';
  } else if (name.length > NAME_MAX) {
    errors.name = `Nome deve ter no máximo ${NAME_MAX} caracteres.`;
  }

  if (code.length === 0) {
    errors.code = 'Código é obrigatório.';
  } else if (code.length > CODE_MAX) {
    errors.code = `Código deve ter no máximo ${CODE_MAX} caracteres.`;
  }

  if (description.length > DESCRIPTION_MAX) {
    errors.description = `Descrição deve ter no máximo ${DESCRIPTION_MAX} caracteres.`;
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Normaliza o nome de campo do backend (PascalCase) para o nome usado
 * no estado do form (camelCase). Mantém a função interna estática
 * porque a lista é fechada (3 campos do CreateSystemRequest).
 */
function normalizeFieldName(serverField: string): keyof FieldErrors | null {
  const lower = serverField.toLowerCase();
  if (lower === 'name') return 'name';
  if (lower === 'code') return 'code';
  if (lower === 'description') return 'description';
  return null;
}

/**
 * Extrai erros por campo do payload de `ValidationProblemDetails` do
 * ASP.NET (`{ errors: { Name: ['msg'], ... } }`). Tolerante: se o
 * payload não bate com o shape esperado, devolve `null` para que o
 * caller caia no fallback genérico.
 */
function extractValidationErrors(details: unknown): FieldErrors | null {
  if (!details || typeof details !== 'object') {
    return null;
  }
  const errors = (details as Record<string, unknown>).errors;
  if (!errors || typeof errors !== 'object') {
    return null;
  }
  const result: FieldErrors = {};
  for (const [serverField, raw] of Object.entries(errors)) {
    const field = normalizeFieldName(serverField);
    if (!field) continue;
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
      result[field] = raw[0];
    } else if (typeof raw === 'string') {
      result[field] = raw;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

/* ─── Component ──────────────────────────────────────────── */

export const NewSystemModal: React.FC<NewSystemModalProps> = ({
  open,
  onClose,
  onCreated,
  client,
}) => {
  const { show } = useToast();
  const [formState, setFormState] = useState<FormState>(INITIAL_STATE);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  /**
   * Reseta tudo ao fechar — handler único para Esc, backdrop, X e botão
   * Cancelar; previne resíduo entre aberturas. Cancelar durante
   * submissão é bloqueado para evitar request órfã (sem `AbortController`
   * nessa primeira iteração — o backend é rápido e o usuário não consegue
   * disparar duas vezes graças ao `disabled` no botão).
   */
  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setFormState(INITIAL_STATE);
    setFieldErrors({});
    setSubmitError(null);
    onClose();
  }, [isSubmitting, onClose]);

  const handleNameChange = useCallback((value: string) => {
    setFormState((prev) => ({ ...prev, name: value }));
    setFieldErrors((prev) => (prev.name === undefined ? prev : { ...prev, name: undefined }));
  }, []);

  const handleCodeChange = useCallback((value: string) => {
    setFormState((prev) => ({ ...prev, code: value }));
    setFieldErrors((prev) => (prev.code === undefined ? prev : { ...prev, code: undefined }));
  }, []);

  const handleDescriptionChange = useCallback((value: string) => {
    setFormState((prev) => ({ ...prev, description: value }));
    setFieldErrors((prev) =>
      prev.description === undefined ? prev : { ...prev, description: undefined },
    );
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) return;

      const clientErrors = validateForm(formState);
      if (clientErrors) {
        setFieldErrors(clientErrors);
        setSubmitError(null);
        return;
      }

      setFieldErrors({});
      setSubmitError(null);
      setIsSubmitting(true);

      const payload: CreateSystemPayload = {
        name: formState.name.trim(),
        code: formState.code.trim(),
        description: formState.description.trim(),
      };

      try {
        await createSystem(payload, undefined, client);
        // Mensagem de sucesso fixa (não precisa do nome — o usuário
        // acabou de digitar e a lista será atualizada).
        show('Sistema criado.', { variant: 'success' });
        // Reset local antes de delegar para o pai. Ordem importa:
        // chamamos `onCreated` (refetch) antes de `onClose` para que o
        // pai não tenha que coordenar dois ticks separados.
        setFormState(INITIAL_STATE);
        setFieldErrors({});
        setSubmitError(null);
        onCreated();
        onClose();
      } catch (error: unknown) {
        if (isApiError(error)) {
          const apiError = error as ApiError;
          if (apiError.status === 409) {
            // Conflito de Code único — feedback inline no campo.
            setFieldErrors({
              code: apiError.message ?? 'Já existe um sistema com este Code.',
            });
            setSubmitError(null);
            return;
          }
          if (apiError.status === 400) {
            const validation = extractValidationErrors(apiError.details);
            if (validation) {
              setFieldErrors(validation);
              setSubmitError(null);
              return;
            }
            // 400 sem `errors` mapeáveis — exibe a mensagem do backend
            // como erro de submissão (Alert no topo do form), evitando
            // toast porque é informação que o usuário precisa ler junto
            // com o form.
            setSubmitError(apiError.message);
            return;
          }
          if (apiError.status === 401 || apiError.status === 403) {
            // 401 já foi tratado pelo cliente HTTP (limpeza de sessão);
            // 403 indica que o usuário perdeu permissão entre a abertura
            // do modal e o submit (raro). Em ambos, fechamos via toast
            // e deixamos o fluxo padrão da app cuidar do redirect.
            show(apiError.message ?? 'Você não tem permissão para esta ação.', {
              variant: 'danger',
              title: 'Falha ao criar sistema',
            });
            return;
          }
        }
        // Fallback genérico — rede/parse/5xx/erro arbitrário. Toast
        // vermelho conforme issue.
        show('Não foi possível criar o sistema. Tente novamente.', {
          variant: 'danger',
          title: 'Falha ao criar sistema',
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [client, formState, isSubmitting, onClose, onCreated, show],
  );

  // `data-modal-initial-focus` no campo Name garante que o foco vá para
  // o primeiro input independente da ordem dos `querySelector`. Útil em
  // jsdom (testes) e em qualquer mudança futura de layout.
  const nameInitialFocusAttr = useMemo(() => ({ 'data-modal-initial-focus': true }) as const, []);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo sistema"
      description="Cadastre um novo sistema no catálogo do auth-service."
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      <Form onSubmit={handleSubmit} noValidate data-testid="new-system-form">
        {submitError && (
          <Alert variant="danger" data-testid="new-system-submit-error">
            {submitError}
          </Alert>
        )}
        <Input
          label="Nome"
          placeholder="ex.: lfc-authenticator"
          value={formState.name}
          onChange={handleNameChange}
          error={fieldErrors.name}
          maxLength={NAME_MAX}
          autoComplete="off"
          required
          data-testid="new-system-name"
          {...nameInitialFocusAttr}
        />
        <Input
          label="Código"
          placeholder="ex.: AUTH"
          value={formState.code}
          onChange={handleCodeChange}
          error={fieldErrors.code}
          maxLength={CODE_MAX}
          autoComplete="off"
          required
          data-testid="new-system-code"
        />
        <Textarea
          label="Descrição"
          placeholder="Descrição opcional do sistema."
          value={formState.description}
          onChange={handleDescriptionChange}
          error={fieldErrors.description}
          helperText={
            fieldErrors.description
              ? undefined
              : `${formState.description.length}/${DESCRIPTION_MAX} caracteres`
          }
          maxLength={DESCRIPTION_MAX}
          rows={3}
          data-testid="new-system-description"
        />
        <HelperRow>Campos com * são obrigatórios.</HelperRow>
        <Footer>
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={handleClose}
            disabled={isSubmitting}
            data-testid="new-system-cancel"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={isSubmitting}
            data-testid="new-system-submit"
          >
            Criar sistema
          </Button>
        </Footer>
      </Form>
    </Modal>
  );
};
