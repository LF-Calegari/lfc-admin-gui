import React from 'react';
import styled, { css } from 'styled-components';

export type ColumnAlign = 'left' | 'center' | 'right';

export interface TableColumn<T> {
  /** Chave única — usada como `key` da coluna e index para `getValue` default. */
  key: string;
  /** Texto do cabeçalho da coluna. */
  label: React.ReactNode;
  /** Alinhamento horizontal das células. `right` recomendado para números. */
  align?: ColumnAlign;
  /** Largura CSS opcional (`120px`, `20%`, etc.). */
  width?: string;
  /** Override de extração: por padrão usa `row[key]`. */
  render?: (row: T, index: number) => React.ReactNode;
  /**
   * Sinaliza coluna de ações — alinhada à direita por padrão e
   * com padding ajustado.
   */
  isActions?: boolean;
}

interface TableProps<T> {
  /** Definição das colunas. */
  columns: ReadonlyArray<TableColumn<T>>;
  /** Linhas de dados. Cada linha deve ter `key` único via `getRowKey`. */
  data: ReadonlyArray<T>;
  /** Extrai chave estável de cada linha (default: `index`). */
  getRowKey?: (row: T, index: number) => string | number;
  /** Caption acessível — renderizado oculto para leitores de tela. */
  caption?: string;
  /** Quando true, header fica grudado durante scroll vertical do wrapper. */
  stickyHeader?: boolean;
  /** Callback de clique em linha — quando definido, linhas viram interativas. */
  onRowClick?: (row: T, index: number) => void;
  /** Estado vazio — renderizado quando `data` está vazio. */
  emptyState?: React.ReactNode;
}

/* ─── Styled primitives ──────────────────────────────────── */

const Wrap = styled.div`
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow-x: auto;
  background: var(--bg-surface);
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--fg2);
`;

const Caption = styled.caption`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const Thead = styled.thead<{ $sticky: boolean }>`
  background: var(--bg-elevated);

  ${({ $sticky }) =>
    $sticky &&
    css`
      position: sticky;
      top: 0;
      z-index: var(--z-sticky);
    `}
`;

const alignStyle = css<{ $align: ColumnAlign }>`
  text-align: ${({ $align }) => $align};
`;

const Th = styled.th<{ $align: ColumnAlign; $width?: string }>`
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--text-muted);
  border-bottom: var(--border-thin) solid var(--border-subtle);
  white-space: nowrap;
  ${alignStyle}
  ${({ $width }) =>
    $width &&
    css`
      width: ${$width};
    `}
`;

const Tr = styled.tr<{ $clickable: boolean }>`
  border-bottom: var(--border-thin) solid var(--border-subtle);
  transition: background var(--duration-fast) var(--ease-default);

  &:last-child {
    border-bottom: none;
  }

  &:nth-child(even) {
    background: color-mix(in srgb, var(--bg-elevated) 35%, transparent);
  }

  &:hover {
    background: var(--bg-ghost-hover);
  }

  ${({ $clickable }) =>
    $clickable &&
    css`
      cursor: pointer;

      &:focus-visible {
        outline: none;
        background: var(--bg-ghost-active);
        box-shadow: inset 0 0 0 var(--border-medium) var(--accent);
      }
    `}
`;

const Td = styled.td<{ $align: ColumnAlign; $isFirst: boolean; $isActions?: boolean }>`
  padding: var(--space-3) var(--space-4);
  vertical-align: middle;
  color: ${({ $isFirst }) => ($isFirst ? 'var(--fg1)' : 'var(--fg2)')};
  font-weight: ${({ $isFirst }) => ($isFirst ? 'var(--weight-medium)' : 'var(--weight-regular)')};
  ${alignStyle}

  ${({ $isActions }) =>
    $isActions &&
    css`
      width: 1%;
      white-space: nowrap;
    `}
`;

const EmptyRow = styled.tr`
  background: transparent !important;

  &:hover {
    background: transparent !important;
  }
`;

const EmptyCell = styled.td`
  padding: var(--space-8) var(--space-4);
  text-align: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
`;

/* ─── Component ──────────────────────────────────────────── */

function getDefaultAlign(col: TableColumn<unknown>): ColumnAlign {
  if (col.align) return col.align;
  if (col.isActions) return 'right';
  return 'left';
}

function readValue<T>(row: T, key: string): React.ReactNode {
  const obj = row as unknown as Record<string, unknown>;
  const v = obj?.[key];
  if (v === null || v === undefined) return null;
  return v as React.ReactNode;
}

export function Table<T>({
  columns,
  data,
  getRowKey,
  caption,
  stickyHeader = false,
  onRowClick,
  emptyState,
}: Readonly<TableProps<T>>) {
  const isEmpty = data.length === 0;
  const isClickable = typeof onRowClick === 'function';

  return (
    <Wrap>
      <StyledTable>
        {caption && <Caption>{caption}</Caption>}
        <Thead $sticky={stickyHeader}>
          <tr>
            {columns.map(col => (
              <Th
                key={col.key}
                scope="col"
                $align={getDefaultAlign(col as TableColumn<unknown>)}
                $width={col.width}
              >
                {col.label}
              </Th>
            ))}
          </tr>
        </Thead>
        <tbody>
          {isEmpty && (
            <EmptyRow>
              <EmptyCell colSpan={columns.length}>
                {emptyState ?? 'Nenhum registro encontrado.'}
              </EmptyCell>
            </EmptyRow>
          )}
          {!isEmpty &&
            data.map((row, rowIndex) => {
              const rowKey = getRowKey ? getRowKey(row, rowIndex) : rowIndex;
              const handleKeyDown = isClickable
                ? (e: React.KeyboardEvent<HTMLTableRowElement>) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRowClick?.(row, rowIndex);
                    }
                  }
                : undefined;

              return (
                <Tr
                  key={rowKey}
                  $clickable={isClickable}
                  tabIndex={isClickable ? 0 : undefined}
                  role={isClickable ? 'button' : undefined}
                  onClick={isClickable ? () => onRowClick?.(row, rowIndex) : undefined}
                  onKeyDown={handleKeyDown}
                >
                  {columns.map((col, colIndex) => {
                    const align = getDefaultAlign(col as TableColumn<unknown>);
                    const content = col.render
                      ? col.render(row, rowIndex)
                      : readValue(row, col.key);
                    return (
                      <Td
                        key={col.key}
                        $align={align}
                        $isFirst={colIndex === 0 && !col.isActions}
                        $isActions={col.isActions}
                      >
                        {content}
                      </Td>
                    );
                  })}
                </Tr>
              );
            })}
        </tbody>
      </StyledTable>
    </Wrap>
  );
}

export type { TableProps };
