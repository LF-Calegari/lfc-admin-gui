import React, { useMemo } from 'react';

import { updateUser } from '../../shared/api';
import {
  MutationConfirmModal,
  type MutationConfirmCopy,
} from '../systems/MutationConfirmModal';

import type {
  ApiClient,
  UpdateUserPayload,
  UserDto,
} from '../../shared/api';

/**
 * Copy do diálogo "Desativar usuário?" (Issue #80).
 *
 * O backend não tem endpoint dedicado para "desativar/ativar" — toggle
 * é feito via `PUT /users/{id}` com payload completo invertendo o
 * `active`. A policy aplicada é `Users.Update`, alinhada com o critério
 * da issue ("Visível com `Users.Update`").
 *
 * Vocabulário "Desativar/Ativar" espelha Systems (#60/#61) e Routes
 * (#65) — a coluna "Status" da tabela já mostra "Ativa/Inativa" para
 * o flag `active` (e para o soft-delete `deletedAt`), então o operador
 * vê o mesmo termo no botão e no badge.
 *
 * **Importante:** "desativar" aqui não é soft-delete (que persiste
 * `deletedAt != null` via `DELETE /users/{id}` e exige `Users.Delete`).
 * É apenas o flag `active=false`. Soft-delete fica para uma issue
 * futura distinta dentro da EPIC #49.
 */
const DEACTIVATE_COPY: MutationConfirmCopy = {
  title: 'Desativar usuário?',
  descriptionPrefix: 'O usuário ',
  descriptionSuffix:
    ' não conseguirá mais autenticar até ser ativado novamente.',
  confirmLabel: 'Desativar',
  successMessage: 'Usuário desativado.',
  errorCopy: {
    forbiddenTitle: 'Falha ao desativar usuário',
    genericFallback:
      'Não foi possível desativar o usuário. Tente novamente.',
    notFoundMessage:
      'Usuário não encontrado ou foi removido. Atualize a lista.',
  },
};

/**
 * Copy do diálogo "Ativar usuário?" (Issue #80). Espelha
 * `DEACTIVATE_COPY` mas com vocabulário positivo. Backend devolve o
 * mesmo conjunto de status codes (404 quando o usuário some,
 * 401/403 por permissão); o slot `conflictMessage` fica ausente
 * porque `PUT /users/{id}` retorna 409 apenas em conflito de e-mail
 * — cenário irrelevante quando só estamos invertendo `active`.
 */
const ACTIVATE_COPY: MutationConfirmCopy = {
  title: 'Ativar usuário?',
  descriptionPrefix: 'O usuário ',
  descriptionSuffix: ' poderá autenticar novamente após a ativação.',
  confirmLabel: 'Ativar',
  successMessage: 'Usuário ativado.',
  errorCopy: {
    forbiddenTitle: 'Falha ao ativar usuário',
    genericFallback:
      'Não foi possível ativar o usuário. Tente novamente.',
    notFoundMessage:
      'Usuário não encontrado ou foi removido. Atualize a lista.',
  },
};

/**
 * Adapter `MutationTarget` para `UserDto`. O shell `MutationConfirmModal`
 * exibe `target.name` em destaque + `target.code` em monoespaçado entre
 * parênteses — para usuários, o "código" semântico é o e-mail (único
 * por usuário, identificador legível). Mantemos o shell intacto e
 * apenas mapeamos o `code` para `email` neste adapter — Systems/Routes
 * continuam usando `code` literal sem regressão.
 */
interface UserTarget {
  name: string;
  code: string;
}

function toTarget(user: UserDto | null): UserTarget | null {
  if (!user) return null;
  return { name: user.name, code: user.email };
}

interface ToggleUserActiveConfirmProps {
  /** Estado de visibilidade controlado pelo pai. */
  open: boolean;
  /**
   * Usuário selecionado para o toggle. Quando `null`, o modal não
   * renderiza — caller controla `open` em conjunto com `user`.
   * Mantemos o objeto completo (não só `id`) porque precisamos de
   * `name`/`email`/`identity`/`clientId` para reenviar o body
   * completo do `PUT /users/{id}`.
   */
  user: UserDto | null;
  /** Fecha o modal sem persistir. Chamado também após sucesso/404. */
  onClose: () => void;
  /**
   * Callback disparado após o toggle bem-sucedido ou após detecção de
   * 404 (usuário já removido entre abertura e submit) — em ambos casos
   * a UI quer refetch para sincronizar a tabela com o backend.
   */
  onToggled: () => void;
  /**
   * Cliente HTTP injetável para isolar testes — em produção, omitido,
   * `updateUser` cai no singleton `apiClient`.
   */
  client?: ApiClient;
}

/**
 * Modal de confirmação de toggle ativo/desativado de usuário (Issue #80).
 *
 * Wrapper fino sobre `MutationConfirmModal` (extraído na #61 e
 * generalizado na #65 para servir múltiplos recursos) — toda a
 * estrutura visual + lógica de submissão/erro vive no shell
 * compartilhado. Aqui injetamos:
 *
 * - **Copy** (`DEACTIVATE_COPY` / `ACTIVATE_COPY`): título, descrição,
 *   label do botão e mensagens de toast escolhidos pelo `user.active`
 *   atual. Quando `active === true`, o operador está prestes a
 *   desativar; quando `active === false`, prestes a ativar.
 * - **Mutate** (`performToggle`): adapta `updateUser(id, payload)`
 *   para a assinatura `(target, client?) => Promise<unknown>` esperada
 *   pelo shell. Reenvia o body completo do `PUT /users/{id}` (que
 *   exige `Name`/`Email`/`Identity`/`Active` como `[Required]`) com
 *   `active` invertido — o backend não tem endpoint dedicado de
 *   "toggle". O `clientId` atual é preservado: omitido quando vazio
 *   (preserva o caminho que o backend já usa para "manter o
 *   ClientId atual" — `UsersController.UpdateById` linha 507).
 * - **Variant**: `danger` quando vai desativar (paridade visual com
 *   "Desativar sistema"), `primary` quando vai ativar (ação positiva,
 *   espelha `RestoreSystemConfirm`).
 * - **`testIdPrefix`** (`toggle-user-active`): mesmo prefixo nas duas
 *   ações — diferenciamos visualmente pela copy e pela variant, mas o
 *   teste só precisa de UM seletor para abrir/confirmar.
 *
 * **Por que reusar `MutationConfirmModal` em vez de criar um modal
 * próprio?** Sonar tokeniza ≥10 linhas idênticas como `New Code
 * Duplication` (lições PR #119/#123/#127/#128/#134/#135 — 6
 * recorrências). Recriar o shell aqui duplicaria ~80 linhas de
 * estrutura visual + try/catch/classify. Reusar mantém a fonte
 * deduplicada por construção.
 */
export const ToggleUserActiveConfirm: React.FC<
  ToggleUserActiveConfirmProps
> = ({ open, user, onClose, onToggled, client }) => {
  const target = toTarget(user);

  /**
   * Decide a copy ("Desativar?" vs "Ativar?") com base no estado atual
   * do usuário: ativos viram inativos (desativar) e vice-versa. Quando
   * `user` é `null` (modal fechado), o memo cai no `DEACTIVATE_COPY`
   * por default — irrelevante porque o shell não renderiza nada com
   * `target=null`.
   */
  const copy = useMemo<MutationConfirmCopy>(
    () => (user?.active === false ? ACTIVATE_COPY : DEACTIVATE_COPY),
    [user?.active],
  );

  /**
   * Variante visual do botão de confirmação. `danger` para desativar
   * (paridade com "Desativar sistema/rota"), `primary` para ativar
   * (ação positiva, paridade com "Restaurar sistema"). A semântica
   * fica clara sem hardcode de cor — o design system local já mapeia
   * `--clr-orange/danger` e `--clr-lime/primary` nessas variants.
   */
  const confirmVariant = user?.active === false ? 'primary' : 'danger';

  /**
   * Função adapter `(target, client?) => Promise<unknown>` que delega
   * para `updateUser(user.id, {...payload completo, active: !active})`.
   *
   * Memoizada com `useMemo` (não `useCallback` pra preservar o tipo
   * de retorno) — o `MutationConfirmModal` consome `mutate` em
   * `useCallback`, então uma referência estável evita invalidação
   * desnecessária quando o `target`/copy mudam.
   *
   * **Decisões do payload:**
   *
   * - `name`/`email`/`identity` vêm do `UserDto` carregado: como
   *   `PUT /users/{id}` valida `[Required]` em todos eles, precisamos
   *   reenviar. Usar os valores atuais preserva o estado original e
   *   evita 400 por validação cruzada.
   * - `active` é invertido — único campo cuja mudança importa neste
   *   diálogo.
   * - `clientId` é omitido quando o usuário tem `clientId === null`
   *   (caso raro mas possível em payloads legados): o backend trata
   *   `request.ClientId == null` como "manter o ClientId atual"
   *   (`UsersController.UpdateById` linha 507) — sem isso a UI
   *   forçaria `null` literal, que o controller validaria como
   *   `Guid?` válido mas geraria payload incoerente. Quando
   *   `clientId` está preenchido, repassamos para preservar o vínculo.
   * - `password` não pertence ao `UpdateUserPayload` (reset é
   *   endpoint separado) — `buildUserUpdateBody` no `users.ts` já
   *   garante que o payload não vaze a senha mesmo se o caller
   *   passasse por engano.
   */
  const performToggle = useMemo(
    () =>
      function (
        _target: UserTarget,
        targetClient?: ApiClient,
      ): Promise<unknown> {
        if (!user) {
          return Promise.reject(new Error('User unavailable.'));
        }
        const payload: UpdateUserPayload = {
          name: user.name,
          email: user.email,
          identity: user.identity,
          active: !user.active,
        };
        if (user.clientId !== null && user.clientId.length > 0) {
          payload.clientId = user.clientId;
        }
        return updateUser(user.id, payload, undefined, targetClient);
      },
    [user],
  );

  return (
    <MutationConfirmModal<UserTarget>
      open={open}
      target={target}
      onClose={onClose}
      onSuccess={onToggled}
      client={client}
      mutate={performToggle}
      copy={copy}
      confirmVariant={confirmVariant}
      testIdPrefix="toggle-user-active"
    />
  );
};
