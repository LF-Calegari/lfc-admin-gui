import React, { useCallback, useState } from 'react';
import styled from 'styled-components';

import { Button, Modal, useToast } from '../../components/ui';
import { deleteSystem } from '../../shared/api';

import {
  classifyMutationError,
  type MutationErrorCopy,
} from './systemFormShared';

import type { ApiClient, SystemDto } from '../../shared/api';

/**
 * Copy injetado em `classifyMutationError` para o caminho de soft-delete
 * (Issue #60). O slot opcional `conflictMessage` fica intencionalmente
 * ausente — o backend nunca devolve 409 em `DELETE /systems/{id}`, e o
 * helper trata 409 como `unhandled` neste cenário (vide
 * `classifyMutationError`). Esse slot existe na assinatura para que o
 * `RestoreSystemConfirm` (#61) reuse a mesma máquina de classificação
 * sem refator do shared (lição PR #128 sobre projetar o módulo
 * compartilhado já no primeiro PR do recurso).
 */
const MUTATION_ERROR_COPY: MutationErrorCopy = {
  forbiddenTitle: 'Falha ao desativar sistema',
  genericFallback: 'Não foi possível desativar o sistema. Tente novamente.',
  notFoundMessage: 'Sistema não encontrado ou foi removido. Atualize a lista.',
};

/**
 * Mensagem de sucesso fixa exibida no toast verde após `204 No Content`
 * — não cita o nome porque o usuário acabou de selecionar a linha e a
 * tabela será atualizada na sequência.
 */
const SUCCESS_MESSAGE = 'Sistema desativado.';

/**
 * Modal de confirmação para soft-delete de sistema (Issue #60).
 *
 * Espelha o layout dos modals de criação/edição (`Modal` shell +
 * conteúdo customizado por feature), mas sem campos de form — só
 * descrição contextual e dois botões. Decisões:
 *
 * - **Confirmação obrigatória** (critério de aceite #60): o botão
 *   "Desativar" só dispara `DELETE` após clique explícito. O modal não
 *   tem foco automático no botão de ação para evitar `Enter` acidental
 *   fechar a tela com o sistema desativado por engano (o `Modal` joga o
 *   foco no primeiro elemento focável — vai cair no botão Cancelar
 *   porque ele aparece antes do "Desativar" no DOM).
 * - **Variant `danger`** no botão de ação destaca visualmente o caráter
 *   destrutivo. Já existe no design system local (`Button.tsx`); não
 *   precisamos hardcodar cor.
 * - **Copy mostra `name` + `code`** entre crases (`<Mono>` para `code`)
 *   como pista de identificação — `code` é o que o backend usa em
 *   `X-System-Id`/JWT, então o usuário precisa diferenciar mesmo entre
 *   sistemas com o mesmo `name`.
 * - **Cancelar/Esc/backdrop fecham sem persistir** (gerenciado pelo
 *   `Modal`). Cancelar durante request em curso é bloqueado pela flag
 *   `isSubmitting` — evita request órfã.
 * - **Mapeamento de erros** via `classifyMutationError` (helper puro em
 *   `systemFormShared.ts`). Switch curto evita cascata `if/else` que o
 *   Sonar marca como Cognitive Complexity > 10 (lição PR #128).
 *
 * Não usa `useSystemForm` porque não há campos de form — só estado
 * `isSubmitting` simples. Qualquer outra confirmação simples futura
 * (`RestoreSystemConfirm` em #61) reusará o mesmo pattern + helper.
 */

interface DeleteSystemConfirmProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Sistema selecionado para soft-delete. Quando `null`, o modal não
   * renderiza — caller controla `open` em conjunto com `system`. Mantemos
   * o objeto completo (não só `id`) para que a copy exiba `name`/`code`
   * sem precisar de re-fetch.
   */
  system: SystemDto | null;
  /** Fecha o modal sem persistir. Chamado também após sucesso/404. */
  onClose: () => void;
  /**
   * Callback disparado após desativação bem-sucedida ou após detecção
   * de 404 (item já removido por outra sessão) — em ambos casos a UI
   * quer refetch para sincronizar a tabela com o estado real do backend.
   */
  onDeleted: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `deleteSystem` cai no singleton `apiClient`.
   */
  client?: ApiClient;
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
 * `SystemFormBody`. Mantém ordem "Cancelar (ghost) → Desativar (danger)"
 * para que o botão destrutivo fique após a saída segura, padrão de UX
 * em diálogos de confirmação (Material/Bootstrap/Polaris alinhados).
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

export const DeleteSystemConfirm: React.FC<DeleteSystemConfirmProps> = ({
  open,
  system,
  onClose,
  onDeleted,
  client,
}) => {
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
    if (isSubmitting || !system) return;
    setIsSubmitting(true);
    try {
      await deleteSystem(system.id, undefined, client);
      // Mensagem fixa — o usuário acabou de selecionar e a lista será
      // atualizada. Toast verde sinaliza sucesso visual além do close.
      show(SUCCESS_MESSAGE, { variant: 'success' });
      // Ordem importa: refetch antes de fechar para o pai não ter que
      // coordenar dois ticks separados (mesmo padrão dos demais modals).
      onDeleted();
      onClose();
    } catch (error: unknown) {
      // `classifyMutationError` colapsa a cascata `if (status === 404)
      // { ... } if (... === 401 || === 403) { ... }`. Switch curto evita
      // Cognitive Complexity > 10 e duplicação ≥10 linhas com o futuro
      // `RestoreSystemConfirm` (lição PR #128 — pré-projetar o shared
      // desde o 1º PR do recurso).
      const action = classifyMutationError(error, MUTATION_ERROR_COPY);
      switch (action.kind) {
        case 'not-found':
          // Sistema removido entre abertura e confirm. Fecha modal +
          // toast + refetch (paridade com o tratamento de 404 no edit).
          show(action.message, { variant: 'danger', title: action.title });
          onDeleted();
          onClose();
          break;
        case 'toast':
          show(action.message, { variant: 'danger', title: action.title });
          break;
        case 'conflict':
          // Só relevante no `RestoreSystemConfirm` (#61). No delete,
          // mantemos o branch para satisfazer exhaustiveness do switch
          // sem cair no `default`/`unhandled`. Comportamento equivalente
          // a `unhandled` para o usuário final.
          show(action.message, { variant: 'danger', title: action.title });
          break;
        case 'unhandled':
          show(action.fallback, { variant: 'danger', title: action.title });
          break;
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [client, isSubmitting, onClose, onDeleted, show, system]);

  // Defensive guard: pai controla `open` em conjunto com `system`, mas
  // cobrimos o caso `open=true && system=null` para não tentar
  // `deleteSystem(null.id)`.
  if (!system) {
    return null;
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Desativar sistema?"
      closeOnEsc={!isSubmitting}
      closeOnBackdrop={!isSubmitting}
    >
      <ConfirmBody>
        <ConfirmText data-testid="delete-system-description">
          O sistema <strong>{system.name}</strong> (<Mono>{system.code}</Mono>) será
          desativado e sumirá da listagem padrão. Você poderá restaurá-lo depois ativando
          &quot;Mostrar inativos&quot;.
        </ConfirmText>
        <ActionsBar>
          <Button
            variant="ghost"
            size="md"
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            data-testid="delete-system-cancel"
          >
            Cancelar
          </Button>
          <Button
            variant="danger"
            size="md"
            type="button"
            onClick={handleConfirm}
            loading={isSubmitting}
            data-testid="delete-system-confirm"
          >
            Desativar
          </Button>
        </ActionsBar>
      </ConfirmBody>
    </Modal>
  );
};
