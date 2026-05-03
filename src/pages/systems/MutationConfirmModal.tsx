import React, { useCallback, useState } from "react";
import styled from "styled-components";

import { Button, Modal, useToast } from "../../components/ui";

import {
  classifyMutationError,
  type MutationErrorCopy,
} from "./systemFormShared";

import type { ButtonVariant } from "../../components/ui";
import type { ApiClient } from "../../shared/api";

/**
 * Shape mínimo exigido para um item alvo de mutação simples — qualquer
 * DTO com `name` (label legível) e `code` (identificador estável)
 * encaixa. Generaliza o componente para servir `SystemDto` (Issues
 * #60/#61) e `RouteDto` (Issue #65) sem duplicar o shell visual entre
 * `pages/systems/` e `pages/routes/` (lição PR #128 — qualquer trecho
 * de 10+ linhas em 2+ arquivos vira `New Code Duplication` no Sonar).
 *
 * O renderer só consome `name`/`code` para a frase do diálogo; o
 * caller injeta a função `mutate(target, client?)` sabendo qual `id`
 * extrair internamente.
 */
export interface MutationTarget {
  /** Texto visível em destaque na descrição do diálogo. */
  name: string;
  /**
   * Identificador curto, exibido em monoespaçado entre parênteses.
   * Ex.: `'AUTH'` (sistema), `'AUTH_V1_SYSTEMS_ROUTES_LIST'` (rota).
   */
  code: string;
}

/**
 * Componente compartilhado para diálogos de confirmação de mutações
 * simples (sem corpo de form) sobre uma entidade `MutationTarget` —
 * extraído na Issue #61 a partir do `DeleteSystemConfirm` (#60) para
 * evitar duplicação de blocos ≥10 linhas com o `RestoreSystemConfirm`,
 * e generalizado na Issue #65 para servir `RouteDto` em
 * `DeleteRouteConfirm` (mesma 5ª recorrência da lição PR #128 evitada
 * de novo).
 *
 * Sonar marcaria a duplicação direta como `New Code Duplication > 3%`
 * (5ª recorrência das lições PR #119/#123/#127/#128). Compartilhar o
 * shell completo (Modal + descrição + ações + try/catch + classificação
 * de erro) elimina a duplicação na raiz: cada caller só injeta copy +
 * variant + ação assíncrona.
 *
 * **Por que extrair só agora (#61) e não em #60?**
 * O programmer de #60 deixou `MutationErrorCopy.conflictMessage` como
 * slot opcional — pré-projetando o helper `classifyMutationError` para
 * servir delete e restore (lição PR #128 — projetar o módulo
 * compartilhado já no primeiro PR do recurso). O componente shell ficou
 * de fora porque a 2ª instância (`RestoreSystemConfirm`) só nasce em #61
 * — extrair antes seria especulação, mas extrair agora é obrigatório
 * para manter o pacto de não duplicar.
 *
 * Decisões de design:
 *
 * - **`copy: MutationConfirmCopy`** entrega títulos/mensagens em pt-BR
 *   inertes (sem nome do sistema interpolado). O renderer constrói a
 *   sentença final em JSX juntando `descriptionPrefix` + `<strong>name</strong>`
 *   + `(<Mono>code</Mono>)` + `descriptionSuffix`. Manter como duas
 *   strings (`prefix`/`suffix`) garante que a interpolação fique no
 *   componente de apresentação — sem `dangerouslySetInnerHTML` ou
 *   parsing de markdown.
 * - **`confirmVariant: ButtonVariant`** controla a paleta do botão de
 *   ação (delete usa `danger`, restore usa `primary`). Não engessamos:
 *   futuras mutações podem usar `secondary`/`ghost` se for o caso.
 * - **`testIdPrefix`** preserva os `data-testid` legados das suítes de
 *   teste (`delete-system-*` / `restore-system-*`) sem reescrever todas
 *   as assertions — o caller passa o prefixo e o componente concatena.
 * - **`mutate: (system, client?) => Promise<unknown>`** entrega só a
 *   chamada HTTP (caller injeta `deleteSystem`/`restoreSystem`). O shell
 *   cuida de loading, success toast, classificação de erro e refetch.
 * - **Sem `useSystemForm`** porque não há campos. Mantemos só
 *   `isSubmitting` local — mesmo padrão do `DeleteSystemConfirm`
 *   original (que vira fininho consumindo este shell).
 */

/**
 * Copy textual usado pelo `MutationConfirmModal`. Concentra todos os
 * literais em pt-BR num único objeto — caller injeta a sua versão
 * (delete vs restore) sem tocar no shell.
 */
export interface MutationConfirmCopy {
  /** Título do diálogo (`<h2>` no header do Modal). */
  title: string;
  /**
   * Texto que vem **antes** do nome+code do sistema na descrição.
   * Tipicamente termina com espaço (ex.: `'O sistema '`).
   */
  descriptionPrefix: string;
  /**
   * Texto que vem **depois** do nome+code do sistema na descrição.
   * Tipicamente começa com espaço (ex.: `' será desativado e ...'`).
   */
  descriptionSuffix: string;
  /** Rótulo do botão que confirma a mutação (ex.: 'Desativar', 'Restaurar'). */
  confirmLabel: string;
  /**
   * Mensagem fixa exibida no toast verde após a mutação resolver com
   * sucesso. Não interpolamos o nome porque o usuário acabou de
   * selecionar a linha e a tabela será atualizada na sequência.
   */
  successMessage: string;
  /**
   * Copy injetada em `classifyMutationError` para o tratamento dos
   * erros (404/401/403/network/...). Ver `MutationErrorCopy` em
   * `systemFormShared.ts`.
   */
  errorCopy: MutationErrorCopy;
}

interface MutationConfirmModalProps<T extends MutationTarget> {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Item selecionado para a mutação. Quando `null`, o modal não
   * renderiza — caller controla `open` em conjunto com `target`.
   * Mantemos o objeto completo (não só `id`) para que a copy exiba
   * `name`/`code` sem precisar de re-fetch.
   *
   * Tipado por generic `T` para que o caller mantenha tipos fortes do
   * próprio recurso (`SystemDto`/`RouteDto`/...) e o `mutate` receba
   * o objeto certo sem cast.
   */
  target: T | null;
  /** Fecha o modal sem persistir. Chamado também após sucesso/404. */
  onClose: () => void;
  /**
   * Callback disparado após mutação bem-sucedida ou após detecção de
   * 404 — em ambos casos a UI quer refetch para sincronizar a tabela
   * com o estado real do backend (item já alterado por outra sessão,
   * ou sumiu).
   */
  onSuccess: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `mutate` cai no singleton `apiClient` por meio do wrapper específico
   * (`deleteSystem`/`restoreSystem`/`deleteRoute`).
   */
  client?: ApiClient;
  /**
   * Função pura que dispara a mutação HTTP (`deleteSystem`/`restoreSystem`/
   * `deleteRoute`). O shell cuida do `isSubmitting`/toast/refetch —
   * `mutate` só precisa lançar `ApiError` em falha e resolver em sucesso.
   */
  mutate: (target: T, client?: ApiClient) => Promise<unknown>;
  /** Copy textual + error copy (ver `MutationConfirmCopy`). */
  copy: MutationConfirmCopy;
  /**
   * Variante visual do botão de confirmação. `danger` para
   * delete; `primary` para restore. Mantém a apresentação alinhada com
   * a semântica da ação sem hardcode de cor.
   */
  confirmVariant: ButtonVariant;
  /**
   * Prefixo dos `data-testid` (ex.: `'delete-system'`, `'restore-system'`,
   * `'delete-route'`). Concatenado com `-description`/`-cancel`/`-confirm`
   * para preservar compatibilidade com asserções legadas das suítes de
   * teste.
   */
  testIdPrefix: string;
}

/* ─── Styled primitives ──────────────────────────────────── */

/**
 * Container da descrição. Usa `--space-3` de gap entre parágrafos para
 * preservar a hierarquia visual sem encavalar — espelha o padrão dos
 * modals de form (`SystemFormBody`).
 */
const ConfirmBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
`;

const ConfirmText = styled.p`
  font-size: var(--text-sm);
  color: var(--fg2);
  line-height: var(--leading-snug);
`;

/**
 * Barra de ações alinhada à direita — espelha o footer do
 * `SystemFormBody`. Mantém ordem "Cancelar (ghost) → Confirmar
 * (variant)" para que o botão de ação fique após a saída segura, padrão
 * de UX em diálogos de confirmação (Material/Bootstrap/Polaris alinhados).
 */
const ActionsBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
`;

const Mono = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg1);
  background: var(--bg-elevated);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
`;

/* ─── Component ──────────────────────────────────────────── */

export function MutationConfirmModal<T extends MutationTarget>({
  open,
  target,
  onClose,
  onSuccess,
  client,
  mutate,
  copy,
  confirmVariant,
  testIdPrefix,
}: Readonly<MutationConfirmModalProps<T>>): React.ReactElement | null {
  const { show } = useToast();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  /**
   * Fecha o modal sem persistir — handler único para Esc, backdrop, X e
   * botão Cancelar; previne resíduo entre aberturas. Cancelar durante
   * submissão é bloqueado para evitar request órfã (mesmo padrão dos
   * modals de form).
   */
  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    onClose();
  }, [isSubmitting, onClose]);

  const handleConfirm = useCallback(async () => {
    if (isSubmitting || !target) return;
    setIsSubmitting(true);
    try {
      await mutate(target, client);
      // Mensagem fixa — o usuário acabou de selecionar e a lista será
      // atualizada. Toast verde sinaliza sucesso visual além do close.
      show(copy.successMessage, { variant: "success" });
      // Ordem importa: refetch antes de fechar para o pai não ter que
      // coordenar dois ticks separados (mesmo padrão dos demais modals).
      onSuccess();
      onClose();
    } catch (error: unknown) {
      // `classifyMutationError` colapsa a cascata `if (status === 404)
      // { ... } if (... === 409) { ... } if (... === 401 || === 403) { ... }`.
      // Switch curto evita Cognitive Complexity > 10 e mantém o módulo
      // compartilhado entre delete (#60) e restore (#61) — lição PR #128.
      const action = classifyMutationError(error, copy.errorCopy);
      switch (action.kind) {
        case "not-found":
          // Item removido/já mutado entre abertura e confirm. Fecha
          // modal + toast + refetch (paridade com o tratamento de 404
          // no edit).
          show(action.message, { variant: "danger", title: action.title });
          onSuccess();
          onClose();
          break;
        case "toast":
          show(action.message, { variant: "danger", title: action.title });
          break;
        case "conflict":
          // Relevante para o restore quando o backend evoluir para
          // devolver 409 ("já está ativo"). Hoje o backend devolve
          // 404 nesse caminho, mas o branch fica preparado.
          show(action.message, { variant: "danger", title: action.title });
          break;
        case "unhandled":
          show(action.fallback, { variant: "danger", title: action.title });
          break;
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [client, copy, isSubmitting, mutate, onClose, onSuccess, show, target]);

  // Defensive guard: pai controla `open` em conjunto com `target`, mas
  // cobrimos o caso `open=true && target=null` para não tentar
  // `mutate(null)`.
  if (!target) {
    return null;
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={copy.title}
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      <ConfirmBody>
        <ConfirmText data-testid={`${testIdPrefix}-description`}>
          {copy.descriptionPrefix}
          <strong>{target.name}</strong> (<Mono>{target.code}</Mono>)
          {copy.descriptionSuffix}
        </ConfirmText>
        <ActionsBar>
          <Button
            variant="ghost"
            size="md"
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            data-testid={`${testIdPrefix}-cancel`}
          >
            Cancelar
          </Button>
          <Button
            variant={confirmVariant}
            size="md"
            type="button"
            onClick={handleConfirm}
            loading={isSubmitting}
            data-testid={`${testIdPrefix}-confirm`}
          >
            {copy.confirmLabel}
          </Button>
        </ActionsBar>
      </ConfirmBody>
    </Modal>
  );
}
