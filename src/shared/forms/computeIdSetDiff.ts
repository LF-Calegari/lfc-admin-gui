/**
 * Calcula o diff entre dois sets de identificadores (`original` x
 * `selected`) — devolve quais ids precisam ser adicionados (`toAdd`) e
 * quais precisam ser removidos (`toRemove`) para o backend ficar
 * sincronizado com a seleção pendente.
 *
 * **Por que vive em `src/shared/forms/`:** a Issue #70 (atribuição
 * direta de permissões) e a Issue #71 (atribuição via role) compartilham
 * exatamente o mesmo cálculo client-side: comparar set salvo vs set
 * selecionado, decidir add/remove, ordenar resultado para estabilidade
 * de testes. Sonar tokeniza o corpo dessas funções como bloco duplicado
 * de ~17 linhas (lição PR #134/#135 — quando o **corpo** é idêntico
 * entre recursos, extrair em helper genérico em vez de manter cópias
 * paralelas).
 *
 * Função pura — entrada imutável, saída nova, sem efeito colateral.
 * Testes ficam de baixo custo (sem React/DOM) e o resultado é
 * determinístico (ordenação por `localeCompare`).
 */

/**
 * Diff entre dois sets de identificadores. Cada array é mutuamente
 * exclusivo: um id ou foi adicionado (estava ausente, virou presente)
 * ou foi removido (estava presente, virou ausente). Ids cujo estado
 * permaneceu igual ficam fora do diff — minimizamos requisições.
 *
 * Os arrays são ordenados pela ordem natural (`localeCompare` em
 * pt-BR, sensitivity `base`) para tornar o resultado determinístico —
 * a UI não depende da ordem, mas testes que comparam arrays se
 * beneficiam, e Sonar tokeniza o `sort` como parte do bloco.
 */
export interface IdSetDiff {
  /** Ids que estavam fora de `original` e entraram em `selected`. */
  toAdd: ReadonlyArray<string>;
  /** Ids que estavam em `original` e saíram em `selected`. */
  toRemove: ReadonlyArray<string>;
}

/**
 * Compara strings com `localeCompare` em pt-BR e ordem natural — o
 * mesmo critério usado em listagens (`compareStrings` espelhado de
 * `userPermissionsHelpers.ts`) para estabilidade entre browsers
 * (Safari/Firefox/Chromium). Mantido privado ao módulo: a ordenação
 * é detalhe da implementação do diff.
 */
function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
}

/**
 * Calcula o diff entre `original` (estado salvo no backend) e
 * `selected` (estado pendente de salvar):
 *
 * - `toAdd` = `selected \ original` (presentes em selected, ausentes em original).
 * - `toRemove` = `original \ selected` (presentes em original, ausentes em selected).
 *
 * Tipagem: aceita `ReadonlySet<string>` para que callers possam usar
 * `Set<PermissionId>` ou `Set<RoleId>` (aliases) sem coerção. O retorno
 * é `ReadonlyArray<string>` para preservar imutabilidade da resposta.
 *
 * Casos de borda:
 *
 * - Sets vazios → diff vazio (`toAdd: [], toRemove: []`).
 * - Sets idênticos → diff vazio.
 * - Sets totalmente disjuntos → toAdd = todos os selected, toRemove =
 *   todos os original.
 *
 * Função pura — pode ser chamada em qualquer lugar (testes, UI, hooks
 * de memo).
 */
export function computeIdSetDiff(
  original: ReadonlySet<string>,
  selected: ReadonlySet<string>,
): IdSetDiff {
  const toAdd: string[] = [];
  const toRemove: string[] = [];

  for (const id of selected) {
    if (!original.has(id)) {
      toAdd.push(id);
    }
  }
  for (const id of original) {
    if (!selected.has(id)) {
      toRemove.push(id);
    }
  }

  toAdd.sort(compareStrings);
  toRemove.sort(compareStrings);

  return { toAdd, toRemove };
}

/**
 * Devolve `true` quando o diff contém ao menos uma operação. Usado
 * pela UI para habilitar/desabilitar o botão "Salvar". Mantido aqui
 * (em vez de inline em cada caller) para casar com a estrutura do
 * `IdSetDiff` — qualquer evolução futura do shape (ex.: discriminar
 * "alterações pendentes" de "conflitos") fica em um único módulo.
 */
export function idSetDiffHasChanges(diff: IdSetDiff): boolean {
  return diff.toAdd.length > 0 || diff.toRemove.length > 0;
}
