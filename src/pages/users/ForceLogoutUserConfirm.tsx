import React, { useMemo } from 'react';

import { forceLogoutUser } from '../../shared/api';
import {
  MutationConfirmModal,
  type MutationConfirmCopy,
} from '../systems/MutationConfirmModal';

import { toUserTarget, type UserTarget } from './userMutationTarget';

import type { ApiClient, UserDto } from '../../shared/api';

/**
 * Copy do diálogo "Forçar logout?" (Issue #82).
 *
 * O backend `lfc-authenticator#168` expõe `POST /users/{id}/force-logout`
 * que incrementa o `TokenVersion` do usuário-alvo, derrubando todos os
 * JWTs ativos no próximo `verify-token`/`/auth/permissions`. Aplica-se
 * a cenários de comprometimento de credencial, troca de cargo ou
 * encerramento de vínculo onde a operadoria precisa invalidar a sessão
 * imediatamente sem aguardar a expiração natural do token.
 *
 * A copy reforça o caráter destrutivo (variant `danger` no botão) e a
 * consequência prática: o usuário-alvo precisará fazer login novamente.
 *
 * **Importante:** "forçar logout" não soft-deleta o usuário nem mexe em
 * `active` — apenas invalida sessões. Distinção explícita da copy de
 * "Desativar usuário" (`ToggleUserActiveConfirm`) onde o usuário não
 * consegue mais autenticar até ser reativado. Aqui, ele consegue logar
 * de novo imediatamente; só perde as sessões em curso.
 */
const FORCE_LOGOUT_COPY: MutationConfirmCopy = {
  title: 'Forçar logout?',
  descriptionPrefix: 'Todas as sessões ativas do usuário ',
  descriptionSuffix:
    ' serão invalidadas. O usuário precisará fazer login novamente para acessar o sistema.',
  confirmLabel: 'Forçar logout',
  successMessage:
    'Sessões invalidadas. Usuário precisará fazer login novamente.',
  errorCopy: {
    forbiddenTitle: 'Falha ao forçar logout',
    genericFallback:
      'Não foi possível forçar logout do usuário. Tente novamente.',
    notFoundMessage:
      'Usuário não encontrado ou foi removido. Atualize a lista.',
  },
};

interface ForceLogoutUserConfirmProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Usuário selecionado para a invalidação de sessões. Quando `null`, o
   * modal não renderiza — caller controla `open` em conjunto com `user`.
   * Mantemos o objeto completo (não só `id`) porque a copy do diálogo
   * cita `name` + `email` para contexto visual.
   */
  user: UserDto | null;
  /** Fecha o modal sem persistir. Chamado também após sucesso/404. */
  onClose: () => void;
  /**
   * Callback disparado após o force-logout bem-sucedido ou após
   * detecção de 404 (usuário já removido entre abertura e submit) — em
   * ambos os casos a UI quer refetch para sincronizar a tabela com o
   * backend (paridade com `ToggleUserActiveConfirm`/`EditUserModal`).
   */
  onLoggedOut: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `forceLogoutUser` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/**
 * Modal de confirmação de logout remoto de usuário (Issue #82).
 *
 * Wrapper fino sobre `MutationConfirmModal` (extraído na #61 e
 * generalizado na #65 para servir múltiplos recursos) — toda a
 * estrutura visual + lógica de submissão/erro vive no shell
 * compartilhado. Aqui injetamos:
 *
 * - **Copy** (`FORCE_LOGOUT_COPY`): título, descrição reforçando a
 *   ação destrutiva e o impacto (perda de sessão) em pt-BR.
 * - **Mutate** (`performForceLogout`): adapta `forceLogoutUser(id)` para
 *   a assinatura `(target, client?) => Promise<unknown>` esperada pelo
 *   shell. O backend não exige body — `forceLogoutUser` envia POST
 *   sem payload. Resposta `ForceLogoutResponse` é descartada (a UI só
 *   reage ao sucesso/erro, não ao `newTokenVersion`).
 * - **Variant** `danger`: ação destrutiva (paridade visual com
 *   "Desativar sistema/rota/usuário"). O design system local mapeia
 *   `--clr-orange/danger` na variant — sem hardcode de cor.
 * - **`testIdPrefix`** (`force-logout-user`): seletor estável para
 *   abrir/confirmar/cancelar; espelha o padrão de
 *   `toggle-user-active`.
 *
 * **Visibilidade:** o caller (`UsersListShellPage`) só renderiza este
 * modal quando o operador tem `Users.Update` (mesma policy de
 * edit/toggle/reset, alinhada com o backend
 * `[Authorize(Policy = PermissionPolicies.UsersUpdate)]`). Adicionalmente,
 * o caller esconde a ação na linha do **próprio** usuário corrente —
 * o backend rejeita self-target com `400` (ver controller, mensagem
 * "Não é possível forçar logout de si mesmo por este endpoint. Utilize
 * GET /auth/logout."). Manter o gating no UI evita cliques que sempre
 * falhariam e preserva UX coerente.
 *
 * **Por que reusar `MutationConfirmModal` em vez de criar um modal
 * próprio?** Sonar tokeniza ≥10 linhas idênticas como `New Code
 * Duplication` (lições PR #119/#123/#127/#128/#134/#135 — 6
 * recorrências). Recriar o shell aqui duplicaria ~80 linhas de
 * estrutura visual + try/catch/classify. Reusar mantém a fonte
 * deduplicada por construção (mesma estratégia do
 * `ToggleUserActiveConfirm` — Issue #80).
 */
export const ForceLogoutUserConfirm: React.FC<ForceLogoutUserConfirmProps> = ({
  open,
  user,
  onClose,
  onLoggedOut,
  client,
}) => {
  const target = toUserTarget(user);

  /**
   * Função adapter `(target, client?) => Promise<unknown>` que delega
   * para `forceLogoutUser(user.id)`.
   *
   * Memoizada com `useMemo` (não `useCallback` pra preservar o tipo de
   * retorno) — o `MutationConfirmModal` consome `mutate` em
   * `useCallback`, então uma referência estável evita invalidação
   * desnecessária quando o `target`/copy mudam.
   *
   * **Por que ignorar `_target` e usar `user.id` diretamente?**
   * O `target` aqui é o `UserTarget` adaptado (sem `id`). O id real
   * vive no `UserDto` capturado pela closure. Espelha a estratégia de
   * `ToggleUserActiveConfirm.performToggle`: o shell trabalha com o
   * shape mínimo (`name`/`code`), mas o adapter conhece o objeto
   * completo do recurso.
   */
  const performForceLogout = useMemo(
    () =>
      function (
        _target: UserTarget,
        targetClient?: ApiClient,
      ): Promise<unknown> {
        if (!user) {
          return Promise.reject(new Error('User unavailable.'));
        }
        return forceLogoutUser(user.id, undefined, targetClient);
      },
    [user],
  );

  return (
    <MutationConfirmModal<UserTarget>
      open={open}
      target={target}
      onClose={onClose}
      onSuccess={onLoggedOut}
      client={client}
      mutate={performForceLogout}
      copy={FORCE_LOGOUT_COPY}
      confirmVariant="danger"
      testIdPrefix="force-logout-user"
    />
  );
};
