import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TableColumn } from '@/components/ui/Table';

import { Table } from '@/components/ui/Table';

interface Row {
  id: string;
  name: string;
  count: number;
}

const columns: ReadonlyArray<TableColumn<Row>> = [
  { key: 'name', label: 'Nome' },
  { key: 'count', label: 'Total', align: 'right' },
  {
    key: 'actions',
    label: 'Ações',
    isActions: true,
    render: row => <button type="button">Editar {row.name}</button>,
  },
];

describe('Table', () => {
  const rows: ReadonlyArray<Row> = [
    { id: '1', name: 'admin', count: 12 },
    { id: '2', name: 'ops', count: 5 },
  ];

  it('renderiza headers de colunas com scope=col', () => {
    render(<Table columns={columns} data={rows} getRowKey={r => r.id} />);
    expect(screen.getByRole('columnheader', { name: 'Nome' })).toHaveAttribute('scope', 'col');
    expect(screen.getByRole('columnheader', { name: 'Total' })).toBeInTheDocument();
  });

  it('renderiza linhas com valores extraídos por key', () => {
    render(<Table columns={columns} data={rows} getRowKey={r => r.id} />);
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('ops')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('chama onRowClick e expõe role="button" + tabIndex em linhas clicáveis', () => {
    const handleClick = vi.fn();
    render(
      <Table columns={columns} data={rows} getRowKey={r => r.id} onRowClick={handleClick} />,
    );
    const allRows = screen.getAllByRole('button');
    // primeiras linhas (não os botões "Editar")
    const dataRow = allRows.find(r => r.tagName === 'TR');
    expect(dataRow).toBeDefined();
    expect(dataRow).toHaveAttribute('tabindex', '0');
    fireEvent.click(dataRow as HTMLElement);
    expect(handleClick).toHaveBeenCalled();
  });

  it('renderiza emptyState quando data está vazio', () => {
    render(<Table columns={columns} data={[]} emptyState="Sem dados" />);
    expect(screen.getByText('Sem dados')).toBeInTheDocument();
  });

  it('aceita render customizado por coluna', () => {
    render(<Table columns={columns} data={rows} getRowKey={r => r.id} />);
    expect(screen.getByText('Editar admin')).toBeInTheDocument();
    expect(screen.getByText('Editar ops')).toBeInTheDocument();
  });
});
