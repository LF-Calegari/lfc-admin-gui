import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Spinner } from '@/components/ui/Spinner';

describe('Spinner', () => {
  it('expõe role status com label padrão', () => {
    render(<Spinner />);
    const node = screen.getByRole('status', { name: 'Carregando' });
    expect(node).toBeInTheDocument();
  });

  it('aceita label customizado para acessibilidade', () => {
    render(<Spinner label="Salvando alterações" />);
    expect(screen.getByRole('status', { name: 'Salvando alterações' })).toBeInTheDocument();
  });

  it.each(['sm', 'md', 'lg'] as const)('renderiza tamanho %s sem quebrar', size => {
    render(<Spinner size={size} label={`spinner-${size}`} />);
    expect(screen.getByRole('status', { name: `spinner-${size}` })).toBeInTheDocument();
  });
});
