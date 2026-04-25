import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Select } from '@/components/ui/Select';

describe('Select', () => {
  it('renderiza label associado ao select', () => {
    render(
      <Select label="Sistema" defaultValue="">
        <option value="">Selecione</option>
        <option value="auth">lfc-authenticator</option>
      </Select>,
    );
    expect(screen.getByLabelText('Sistema')).toBeInTheDocument();
  });

  it('dispara onChange com valor selecionado', () => {
    const handleChange = vi.fn();
    render(
      <Select label="Tipo" onChange={handleChange} defaultValue="">
        <option value="">--</option>
        <option value="admin">Admin</option>
        <option value="user">Usuário</option>
      </Select>,
    );
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'admin' } });
    expect(handleChange).toHaveBeenCalledWith('admin');
  });

  it('exibe error e aplica aria-invalid', () => {
    render(
      <Select label="Tipo" error="Campo obrigatório">
        <option value="">--</option>
      </Select>,
    );
    expect(screen.getByLabelText('Tipo')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
  });

  it('aplica disabled', () => {
    render(
      <Select label="Disabled" disabled>
        <option value="">--</option>
      </Select>,
    );
    expect(screen.getByLabelText('Disabled')).toBeDisabled();
  });

  it.each(['sm', 'md', 'lg'] as const)('renderiza size %s sem quebrar', size => {
    render(
      <Select label={`s-${size}`} size={size}>
        <option value="x">x</option>
      </Select>,
    );
    expect(screen.getByLabelText(`s-${size}`)).toBeInTheDocument();
  });
});
