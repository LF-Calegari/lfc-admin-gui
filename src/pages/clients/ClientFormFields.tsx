import React from 'react';
import styled from 'styled-components';

import { Alert, Input, Select } from '../../components/ui';
import { FormFooter } from '../../shared/forms';

import {
  CORPORATE_NAME_MAX,
  FULL_NAME_MAX,
  type ClientFieldErrors,
  type ClientFormState,
} from './clientsFormShared';

import type { ClientType } from '../../shared/api';

/**
 * Campos e form body do cliente (Issue #74 — criação; reusado pela
 * Issue #75 — edição).
 *
 * **Por que existe (lição PR #128):** projetar `ClientFormFields`
 * desde o primeiro PR do recurso evita duplicação Sonar quando o
 * `EditClientModal` (#75) chegar — ambos modals consomem o mesmo
 * `ClientFormBody` com prefixos de testId distintos.
 *
 * **Por que não usar `NameCodeDescriptionFormBody`:** o shape
 * diverge totalmente (cliente tem `type`/`cpf`/`fullName`/`cnpj`/
 * `corporateName`; sistemas/roles têm `name`/`code`/`description`).
 * Forçar abstração conjunta exigiria parametrização excessiva,
 * crescendo a superfície sem reduzir LOC efetivos. Mantemos
 * `ClientFormFields` separado e o helper genérico focado no shape
 * Name/Code/Description.
 *
 * **Form condicional PF/PJ:** o `<Select>` de tipo é o controlador
 * — quando `type === 'PF'`, exibimos `cpf`/`fullName`; quando
 * `'PJ'`, exibimos `cnpj`/`corporateName`. Os campos do tipo oposto
 * são removidos do DOM (não apenas escondidos) para que o foco do
 * teclado e o ARIA não navegue para campos invisíveis. O estado
 * dos 4 campos persiste no `useClientForm` para que o usuário não
 * perca o que digitou ao alternar (UX).
 *
 * **Edição (Issue #75 — antecipado):** quando o modal for de
 * edição, o `<Select>` de tipo deve ficar `disabled` (o backend
 * rejeita mudança de tipo após criação com 400 "Tipo do cliente
 * não pode ser alterado após a criação."). Por isso aceitamos a
 * prop `typeDisabled` desde já — `NewClientModal` passa `false`
 * (default), `EditClientModal` passará `true`. Espelha o desenho
 * `EditRoleModal` que tem `systemId` injetado e imutável no form.
 */

/* ─── Styled primitives ──────────────────────────────────── */

const FormShell = styled.form`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

const FieldStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

/* ─── Componente: campos PF ─────────────────────────────── */

interface PfFieldsProps {
  idPrefix: string;
  values: ClientFormState;
  errors: ClientFieldErrors;
  disabled: boolean;
  onChangeCpf: (value: string) => void;
  onChangeFullName: (value: string) => void;
  /**
   * Quando `true`, o campo `cpf` recebe `data-modal-initial-focus`
   * para o `Modal` focar nele ao abrir. O `<Select>` de tipo já
   * tem o foco inicial natural (primeiro campo focável), então o
   * default é `false` aqui — só ativa se o caller decidir reposicionar.
   */
  autoFocusFirst?: boolean;
}

const PfFields: React.FC<PfFieldsProps> = ({
  idPrefix,
  values,
  errors,
  disabled,
  onChangeCpf,
  onChangeFullName,
  autoFocusFirst = false,
}) => (
  <>
    <Input
      label="CPF"
      placeholder="000.000.000-00"
      value={values.cpf}
      onChange={onChangeCpf}
      error={errors.cpf}
      autoComplete="off"
      inputMode="numeric"
      required
      disabled={disabled}
      data-testid={`${idPrefix}-cpf`}
      {...(autoFocusFirst ? { 'data-modal-initial-focus': true } : {})}
    />
    <Input
      label="Nome completo"
      placeholder="ex.: Ana Cliente"
      value={values.fullName}
      onChange={onChangeFullName}
      error={errors.fullName}
      maxLength={FULL_NAME_MAX}
      autoComplete="off"
      required
      disabled={disabled}
      data-testid={`${idPrefix}-fullName`}
    />
  </>
);

/* ─── Componente: campos PJ ─────────────────────────────── */

interface PjFieldsProps {
  idPrefix: string;
  values: ClientFormState;
  errors: ClientFieldErrors;
  disabled: boolean;
  onChangeCnpj: (value: string) => void;
  onChangeCorporateName: (value: string) => void;
  autoFocusFirst?: boolean;
}

const PjFields: React.FC<PjFieldsProps> = ({
  idPrefix,
  values,
  errors,
  disabled,
  onChangeCnpj,
  onChangeCorporateName,
  autoFocusFirst = false,
}) => (
  <>
    <Input
      label="CNPJ"
      placeholder="00.000.000/0000-00"
      value={values.cnpj}
      onChange={onChangeCnpj}
      error={errors.cnpj}
      autoComplete="off"
      inputMode="numeric"
      required
      disabled={disabled}
      data-testid={`${idPrefix}-cnpj`}
      {...(autoFocusFirst ? { 'data-modal-initial-focus': true } : {})}
    />
    <Input
      label="Razão social"
      placeholder="ex.: Acme Indústria S/A"
      value={values.corporateName}
      onChange={onChangeCorporateName}
      error={errors.corporateName}
      maxLength={CORPORATE_NAME_MAX}
      autoComplete="off"
      required
      disabled={disabled}
      data-testid={`${idPrefix}-corporateName`}
    />
  </>
);

/* ─── Componente: form body completo ────────────────────── */

interface ClientFormBodyProps {
  /** Prefixo dos `data-testid` do form e dos campos. */
  idPrefix: string;
  /** Erro genérico de submissão exibido em `Alert` no topo do form. */
  submitError: string | null;
  /** Estado controlado dos campos. */
  values: ClientFormState;
  /** Erros inline por campo. */
  errors: ClientFieldErrors;
  onChangeType: (value: ClientType) => void;
  onChangeCpf: (value: string) => void;
  onChangeFullName: (value: string) => void;
  onChangeCnpj: (value: string) => void;
  onChangeCorporateName: (value: string) => void;
  /** Handler do submit do form. */
  onSubmit: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  /** Handler do botão Cancelar (bloqueado durante submit). */
  onCancel: () => void;
  /** Flag de submissão em andamento. */
  isSubmitting: boolean;
  /** Texto do botão de envio (ex.: "Criar cliente", "Salvar alterações"). */
  submitLabel: string;
  /**
   * Quando `true`, o `<Select>` de tipo fica desabilitado. Default
   * `false` (criação). `ClientDataTab` (#75) passa `true` — tipo é
   * imutável após criação.
   */
  typeDisabled?: boolean;
  /**
   * Quando `true`, todos os campos do form ficam desabilitados e o
   * footer (Cancelar/Submit) é ocultado. Usado pelo `ClientDataTab`
   * (#75) quando o usuário não tem `AUTH_V1_CLIENTS_UPDATE` — o
   * conteúdo do cliente continua visível (a página `/clientes/:id`
   * é gateada por `GET_BY_ID`, não por `UPDATE`), mas nenhuma
   * mutação é possível. Default `false`.
   */
  readonly?: boolean;
}

/**
 * Form body completo (shell `<form>` + Alert do erro genérico +
 * `<Select>` de tipo + campos condicionais PF/PJ + linha de hint
 * obrigatórios + footer Cancelar/Submit).
 */
export const ClientFormBody: React.FC<ClientFormBodyProps> = ({
  idPrefix,
  submitError,
  values,
  errors,
  onChangeType,
  onChangeCpf,
  onChangeFullName,
  onChangeCnpj,
  onChangeCorporateName,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
  typeDisabled = false,
  readonly = false,
}) => {
  // `fieldsDisabled` cobre tanto o caminho `isSubmitting` (request em
  // andamento) quanto `readonly` (sem permissão de update). Centralizar
  // num único cálculo evita repetir `isSubmitting || readonly` em três
  // pontos abaixo (`<Select>`, `<PfFields disabled>`, `<PjFields disabled>`).
  const fieldsDisabled = isSubmitting || readonly;
  return (
    <FormShell onSubmit={onSubmit} noValidate data-testid={`${idPrefix}-form`}>
      {submitError && (
        <Alert variant="danger" data-testid={`${idPrefix}-submit-error`}>
          {submitError}
        </Alert>
      )}
      <FieldStack>
        <Select
          label="Tipo"
          size="md"
          value={values.type}
          onChange={(value) => {
            // O `<Select>` só emite os literais que listamos como
            // `<option>`, mas validamos defensivamente para preservar o
            // tipo estreito `ClientType` no caller.
            if (value === 'PF' || value === 'PJ') {
              onChangeType(value);
            }
          }}
          error={errors.type}
          disabled={fieldsDisabled || typeDisabled}
          helperText={typeDisabled ? 'Tipo é imutável após a criação.' : undefined}
          data-testid={`${idPrefix}-type`}
          aria-label="Tipo do cliente (PF ou PJ)"
        >
          <option value="PF">Pessoa física</option>
          <option value="PJ">Pessoa jurídica</option>
        </Select>
        {values.type === 'PF' ? (
          <PfFields
            idPrefix={idPrefix}
            values={values}
            errors={errors}
            disabled={fieldsDisabled}
            onChangeCpf={onChangeCpf}
            onChangeFullName={onChangeFullName}
          />
        ) : (
          <PjFields
            idPrefix={idPrefix}
            values={values}
            errors={errors}
            disabled={fieldsDisabled}
            onChangeCnpj={onChangeCnpj}
            onChangeCorporateName={onChangeCorporateName}
          />
        )}
      </FieldStack>
      {!readonly && (
        <FormFooter
          idPrefix={idPrefix}
          onCancel={onCancel}
          isSubmitting={isSubmitting}
          submitLabel={submitLabel}
        />
      )}
    </FormShell>
  );
};
