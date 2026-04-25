import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Chip } from '@/components/ui/Chip';

describe('Chip', () => {
  it('renderiza label', () => {
    render(<Chip label="admin" />);
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('vira interativo quando recebe onClick e dispara o handler', () => {
    const handleClick = vi.fn();
    render(<Chip label="filtro" onClick={handleClick} />);
    const chip = screen.getByRole('button', { name: 'filtro' });
    fireEvent.click(chip);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('aceita Enter/Space quando interativo', () => {
    const handleClick = vi.fn();
    render(<Chip label="filtro" onClick={handleClick} />);
    const chip = screen.getByRole('button', { name: 'filtro' });
    fireEvent.keyDown(chip, { key: 'Enter' });
    fireEvent.keyDown(chip, { key: ' ' });
    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it('renderiza botão de remover quando onRemove é passado', () => {
    const handleRemove = vi.fn();
    render(<Chip label="tag" onRemove={handleRemove} />);
    const removeBtn = screen.getByRole('button', { name: /remover tag/i });
    fireEvent.click(removeBtn);
    expect(handleRemove).toHaveBeenCalledTimes(1);
  });

  it('aplica aria-pressed quando selected e interativo', () => {
    render(
      <Chip label="ativo" selected onClick={() => undefined} />,
    );
    expect(screen.getByRole('button', { name: 'ativo' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('respeita disabled — não dispara onClick', () => {
    const handleClick = vi.fn();
    render(<Chip label="off" onClick={handleClick} disabled />);
    const chip = screen.getByRole('button', { name: 'off' });
    expect(chip).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(chip);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it.each(['default', 'success', 'danger', 'warning', 'info'] as const)(
    'renderiza variant %s sem quebrar',
    variant => {
      render(<Chip label={variant} variant={variant} />);
      expect(screen.getByText(variant)).toBeInTheDocument();
    },
  );
});
