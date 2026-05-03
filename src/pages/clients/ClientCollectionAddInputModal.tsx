import React from 'react';

import { Button, Input, Modal } from '../../components/ui';

import { ModalActions, ModalForm } from './clientCollectionTabStyles';

/**
 * Tipo HTML para o `<Input>` (usado para discriminar entre `email`,
 * `tel`, etc.). Mantemos só o subset que os consumidores conhecidos
 * (#146, #147) precisam — qualquer caso novo amplia aqui.
 */
type InputType = 'email' | 'tel' | 'text';

interface ClientCollectionAddInputModalProps {
  /** Flag de abertura do modal — caller controla via state interno. */
  open: boolean;
  /** Callback de fechar (cancelar/ESC/backdrop). */
  onClose: () => void;
  /** Título do modal (ex.: "Adicionar email extra", "Adicionar celular"). */
  title: string;
  /** Descrição abaixo do título. */
  description: string;
  /**
   * Label do `<Input>` (ex.: "Email", "Celular", "Telefone fixo"). Usado
   * pelo `<label>` associado e por leitor de tela.
   */
  inputLabel: string;
  /** Placeholder do input. */
  placeholder: string;
  /** Tipo HTML do input (`email`/`tel`/`text`). */
  inputType: InputType;
  /** `inputMode` HTML — controla teclado virtual mobile (ex.: `tel`). */
  inputMode?: 'email' | 'tel' | 'text' | 'url' | 'numeric';
  /** Atributo `autoComplete` (`email`/`tel`/etc.). */
  autoComplete?: string;
  /** `maxLength` herdado do limite do backend. */
  maxLength: number;
  /** Valor controlado do input. */
  value: string;
  /** Mensagem de erro inline, ou `null` quando válido. */
  inputError: string | null;
  /** Flag de submit em andamento — desabilita interações. */
  isSubmitting: boolean;
  /** Callback chamado a cada keystroke do input. */
  onChange: (value: string) => void;
  /** Callback chamado ao submeter o `<form>` (Enter ou clique em "Adicionar"). */
  onSubmit: (event?: React.SyntheticEvent<HTMLFormElement>) => void;
  /**
   * Prefixo de `data-testid` (ex.: `client-extra-emails`,
   * `client-mobile-phones`). Estável para asserts.
   */
  testIdPrefix: string;
}

/**
 * Modal de adicionar item compartilhado entre as abas que listam
 * coleções de subentidades de cliente
 * (`ClientExtraEmailsTab` — Issue #146; `ClientPhonesTab` — Issue
 * #147).
 *
 * **Por que extraído (lição PR #128/#134/#135):** o JSX do modal de
 * adicionar (Modal + ModalForm + Input + ModalActions + 2 Buttons)
 * é virtualmente idêntico entre as duas abas — apenas literais de
 * label/placeholder/testId/etc. variam. Sonar/JSCPD tokenizam ~25
 * linhas como bloco duplicado entre os dois arquivos. Promover para
 * componente compartilhado deduplica e abre caminho para o terceiro
 * consumidor sem refator destrutivo.
 *
 * **Acessibilidade preservada:**
 *
 * - `closeOnEsc`/`closeOnBackdrop` desabilitados durante submit.
 * - `<form>` para que `Enter` no input dispare o submit
 *   (`Modal` do design system não impede; o `onSubmit` recebe o
 *   evento e chama `event.preventDefault()` no caller).
 * - `loading={isSubmitting}` no botão "Adicionar" para spinner
 *   inline.
 * - `aria-label` herdado do `Modal` via `title`.
 */
export const ClientCollectionAddInputModal: React.FC<
  ClientCollectionAddInputModalProps
> = ({
  open,
  onClose,
  title,
  description,
  inputLabel,
  placeholder,
  inputType,
  inputMode,
  autoComplete,
  maxLength,
  value,
  inputError,
  isSubmitting,
  onChange,
  onSubmit,
  testIdPrefix,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    description={description}
    closeOnEsc={!isSubmitting}
    closeOnBackdrop={!isSubmitting}
  >
    <ModalForm onSubmit={onSubmit} data-testid={`${testIdPrefix}-add-form`}>
      <Input
        id={`${testIdPrefix}-add-input`}
        label={inputLabel}
        type={inputType}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        error={inputError ?? undefined}
        disabled={isSubmitting}
        maxLength={maxLength}
        autoComplete={autoComplete}
        data-testid={
          inputType === 'email'
            ? `${testIdPrefix}-add-email`
            : `${testIdPrefix}-add-number`
        }
      />
      <ModalActions>
        <Button
          variant="ghost"
          size="md"
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          data-testid={`${testIdPrefix}-add-cancel`}
        >
          Cancelar
        </Button>
        <Button
          variant="primary"
          size="md"
          type="submit"
          loading={isSubmitting}
          data-testid={`${testIdPrefix}-add-submit`}
        >
          Adicionar
        </Button>
      </ModalActions>
    </ModalForm>
  </Modal>
);
