import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Textarea } from '@/components/ui/Textarea';

describe('Textarea', () => {
  it('renderiza label associado ao textarea', () => {
    render(<Textarea label="Bio" />);
    const textarea = screen.getByLabelText('Bio');
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('dispara onChange com o valor', () => {
    const handleChange = vi.fn();
    render(<Textarea label="Notes" onChange={handleChange} />);
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'olá' } });
    expect(handleChange).toHaveBeenCalledWith('olá');
  });

  it('exibe error e aplica aria-invalid', () => {
    render(<Textarea label="Obrigatório" error="Campo obrigatório" />);
    const textarea = screen.getByLabelText('Obrigatório');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
  });

  it('exibe helperText quando não há error', () => {
    render(<Textarea label="Bio" helperText="Máximo 200 caracteres" />);
    expect(screen.getByText('Máximo 200 caracteres')).toBeInTheDocument();
  });

  it('aplica disabled', () => {
    render(<Textarea label="Read only" disabled />);
    expect(screen.getByLabelText('Read only')).toBeDisabled();
  });

  it.each(['sm', 'md', 'lg'] as const)('renderiza size %s sem quebrar', size => {
    render(<Textarea label={`size-${size}`} size={size} />);
    expect(screen.getByLabelText(`size-${size}`)).toBeInTheDocument();
  });
});
