import React from 'react';

import { Button, Modal } from '../../components/ui';

import {
  ConfirmBody,
  ConfirmText,
  ModalActions,
  Mono,
} from './clientCollectionTabStyles';

/**
 * Props do `ClientCollectionRemoveConfirmModal`. Mantém a API
 * declarativa — caller passa `target` (string com o valor a destacar
 * em monoespaçado) ou `null` para fechar; ações são callbacks puras.
 */
interface ClientCollectionRemoveConfirmModalProps {
  /** Título do modal (ex.: "Remover email extra?", "Remover celular?"). */
  title: string;
  /**
   * Prefixo do texto de confirmação. O valor é renderizado depois,
   * em destaque monoespaçado. Ex.: `"O email"` produz `"O email
   * <Mono>x@y.com</Mono> será removido..."`.
   */
  prefix: string;
  /**
   * Sufixo após o valor monoespaçado. Default sempre o mesmo — fica
   * fora da prop para reduzir argumentos. Caller que precise
   * customizar pode passar `descriptionSuffix`.
   */
  descriptionSuffix?: string;
  /** Valor a destacar (email/telefone/etc.). `null` fecha o modal. */
  target: string | null;
  /** Flag de submit em andamento — desabilita botões/fechamento. */
  isSubmitting: boolean;
  /** Callback de fechar (cancelar ou ESC/backdrop). */
  onClose: () => void;
  /** Callback de confirmar remoção. */
  onConfirm: () => void;
  /** Prefixo de `data-testid` (ex.: `client-mobile-phones`). */
  testIdPrefix: string;
}

/**
 * Modal de confirmação de remoção compartilhado entre as abas que
 * listam coleções de subentidades de cliente
 * (`ClientExtraEmailsTab` — Issue #146; `ClientPhonesTab` — Issue
 * #147).
 *
 * Centralizar evita ~25 linhas de boilerplate duplicado entre os
 * dois consumidores (o JSCPD/Sonar tokenizava a árvore `<Modal> >
 * <ConfirmBody> > <ConfirmText> > <ModalActions> > <Button>` como
 * bloco duplicado). Lição PR #128/#134/#135 — extrair quando o
 * segundo consumidor real aparece.
 *
 * Cobre:
 *
 * - `closeOnEsc`/`closeOnBackdrop` desabilitados durante submit
 *   (espelha o padrão do `Modal` do design system).
 * - `loading={isSubmitting}` no botão "Remover" para spinner inline.
 * - `aria-label` herdado do `Modal` via `title` — leitor de tela
 *   anuncia o título corretamente.
 * - `data-testid` composto a partir de `testIdPrefix` para que cada
 *   consumidor mantenha selectors únicos sem precisar passar 3
 *   ids separados.
 */
export const ClientCollectionRemoveConfirmModal: React.FC<
  ClientCollectionRemoveConfirmModalProps
> = ({
  title,
  prefix,
  descriptionSuffix = 'será removido da lista deste cliente. Essa ação é imediata.',
  target,
  isSubmitting,
  onClose,
  onConfirm,
  testIdPrefix,
}) => (
  <Modal
    open={target !== null}
    onClose={onClose}
    title={title}
    closeOnEsc={!isSubmitting}
    closeOnBackdrop={!isSubmitting}
  >
    {target !== null && (
      <ConfirmBody>
        <ConfirmText data-testid={`${testIdPrefix}-remove-description`}>
          {prefix} <Mono>{target}</Mono> {descriptionSuffix}
        </ConfirmText>
        <ModalActions>
          <Button
            variant="ghost"
            size="md"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            data-testid={`${testIdPrefix}-remove-cancel`}
          >
            Cancelar
          </Button>
          <Button
            variant="danger"
            size="md"
            type="button"
            onClick={onConfirm}
            loading={isSubmitting}
            data-testid={`${testIdPrefix}-remove-confirm`}
          >
            Remover
          </Button>
        </ModalActions>
      </ConfirmBody>
    )}
  </Modal>
);
