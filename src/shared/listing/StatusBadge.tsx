import React from "react";

import { Badge } from "../../components/ui";

/**
 * Badge dual que representa o status ativo/inativo (soft-deleted) de
 * uma entidade. Lê `deletedAt` (string ISO 8601 quando soft-deletada,
 * `null`/`undefined` quando ativa) e devolve o `Badge` correto com a
 * copy padronizada do projeto.
 *
 * **Por que existe (lição PR #134/#135 — duplicação Sonar):**
 *
 * O ternário JSX:
 *
 * ```jsx
 * row.deletedAt ? (
 *   <Badge variant="danger" dot>Inativa</Badge>
 * ) : (
 *   <Badge variant="success" dot>Ativa</Badge>
 * )
 * ```
 *
 * aparecia em ~5 lugares: tabela e cards de cada uma das 3 páginas
 * (`SystemsPage`, `RoutesPage`, `RolesPage`), cada vez ocupando ~7
 * linhas. Sonar/jscpd tokenizam isso como bloco repetido. Centralizar
 * em componente reduz a 1 linha por uso e garante consistência da
 * copy ("Inativa"/"Ativa") em todas as listagens.
 *
 * **Sobre `gender`:** todas as listagens atuais usam o feminino
 * ("Inativa"/"Ativa") porque os recursos são femininos em pt-BR
 * (rota, role, permissão, sessão). Quando aparecer um recurso
 * masculino (sistema, usuário, cliente, token), passar `gender="m"`
 * para devolver "Inativo"/"Ativo". Manter como prop em vez de
 * variante extra preserva a flexibilidade sem tornar o componente
 * mais verboso.
 */
interface StatusBadgeProps {
  /** Quando truthy, exibe "Inativa(o)"; caso contrário, "Ativa(o)". */
  deletedAt: string | null | undefined;
  /** Gênero da copy. Default: `'f'` (Inativa/Ativa). */
  gender?: "f" | "m";
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  deletedAt,
  gender = "f",
}) => {
  if (deletedAt) {
    return (
      <Badge variant="danger" dot>
        {gender === "m" ? "Inativo" : "Inativa"}
      </Badge>
    );
  }
  return (
    <Badge variant="success" dot>
      {gender === "m" ? "Ativo" : "Ativa"}
    </Badge>
  );
};
