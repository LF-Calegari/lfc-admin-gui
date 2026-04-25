import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
  it('renderiza children e dispara onClick', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Salvar</Button>);
    const node = screen.getByRole('button', { name: 'Salvar' });
    fireEvent.click(node);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('é desabilitado quando disabled=true', () => {
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick}>
        Indisponível
      </Button>,
    );
    const node = screen.getByRole('button', { name: 'Indisponível' });
    expect(node).toBeDisabled();
    fireEvent.click(node);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('aplica aria-busy e bloqueia clique quando loading=true', () => {
    const handleClick = vi.fn();
    render(
      <Button loading onClick={handleClick}>
        Carregando
      </Button>,
    );
    const node = screen.getByRole('button');
    expect(node).toHaveAttribute('aria-busy', 'true');
    expect(node).toBeDisabled();
    fireEvent.click(node);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renderiza Spinner quando loading=true', () => {
    render(<Button loading>Aguarde</Button>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    'renderiza variant %s sem quebrar',
    variant => {
      render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByRole('button', { name: variant })).toBeInTheDocument();
    },
  );

  it.each(['sm', 'md', 'lg'] as const)('renderiza size %s sem quebrar', size => {
    render(<Button size={size}>btn-{size}</Button>);
    expect(screen.getByRole('button', { name: `btn-${size}` })).toBeInTheDocument();
  });

  it('é do tipo button por padrão (não submit)', () => {
    render(<Button>Default</Button>);
    expect(screen.getByRole('button', { name: 'Default' })).toHaveAttribute('type', 'button');
  });
});
