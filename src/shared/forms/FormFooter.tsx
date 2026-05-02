import React from 'react';
import styled from 'styled-components';

import { Button } from '../../components/ui';

/**
 * Footer compartilhado pelos forms de criação/edição (sistemas,
 * rotas, roles, clientes — Issues #58/#59/#63/#64/#67/#68/#74).
 *
 * **Por que existe (lição PR #134/#135):** o bloco
 * `<FormFooter>...Cancelar...Submit...</FormFooter>` (~22 linhas
 * com helper-row de obrigatórios) é idêntico entre
 * `NameCodeDescriptionForm.tsx` e `ClientFormFields.tsx` — jscpd
 * detectou no PR #74. Centralizar elimina a duplicação e preserva
 * a evolução em um único lugar (ex.: adicionar tooltip no submit
 * disabled, mudar o `loading` por skeleton, etc.).
 *
 * Aceita `idPrefix` distinto por recurso para preservar
 * data-testIds estáveis das suítes existentes (`new-system-cancel`,
 * `edit-route-submit`, `new-client-cancel`, etc.).
 */

const FormFooterBlock = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-2);
`;

const FormHelperRow = styled.div`
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: var(--tracking-tight);
`;

interface FormFooterProps {
  /** Prefixo dos `data-testid` dos botões (ex.: `new-client`). */
  idPrefix: string;
  /** Handler do botão Cancelar (bloqueado durante submit). */
  onCancel: () => void;
  /** Flag de submissão em andamento. */
  isSubmitting: boolean;
  /** Texto do botão de envio (ex.: "Criar cliente", "Salvar alterações"). */
  submitLabel: string;
  /**
   * Quando `true`, o botão de submit fica desabilitado mesmo fora
   * do estado de submissão. Usado, ex., pelo modal de rota quando
   * o token type referenciado está inativo (Issue #64). Default
   * `false`.
   */
  submitDisabled?: boolean;
  /**
   * Quando `false`, oculta a linha "Campos com * são obrigatórios."
   * — usado em forms onde o asterisco não tem significado (raro,
   * mas previsto). Default `true`.
   */
  showRequiredHint?: boolean;
}

/**
 * Linha de hint + footer (Cancelar/Submit). Aceita um
 * `submitDisabled` opcional e um toggle para a hint de
 * obrigatórios — preserva a flexibilidade dos forms já existentes
 * sem regressão.
 */
export const FormFooter: React.FC<FormFooterProps> = ({
  idPrefix,
  onCancel,
  isSubmitting,
  submitLabel,
  submitDisabled = false,
  showRequiredHint = true,
}) => (
  <>
    {showRequiredHint && <FormHelperRow>Campos com * são obrigatórios.</FormHelperRow>}
    <FormFooterBlock>
      <Button
        type="button"
        variant="ghost"
        size="md"
        onClick={onCancel}
        disabled={isSubmitting}
        data-testid={`${idPrefix}-cancel`}
      >
        Cancelar
      </Button>
      <Button
        type="submit"
        variant="primary"
        size="md"
        loading={isSubmitting}
        disabled={submitDisabled}
        data-testid={`${idPrefix}-submit`}
      >
        {submitLabel}
      </Button>
    </FormFooterBlock>
  </>
);
