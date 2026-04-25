import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox } from '@/components/ui/Checkbox';

describe('Checkbox', () => {
  it('renderiza label associado ao checkbox', () => {
    render(<Checkbox label="Aceito termos" />);
    const cb = screen.getByLabelText('Aceito termos');
    expect(cb).toBeInTheDocument();
    expect((cb as HTMLInputElement).type).toBe('checkbox');
  });

  it('dispara onChange com o estado checked', () => {
    const handleChange = vi.fn();
    render(<Checkbox label="Lembrar-me" onChange={handleChange} />);
    fireEvent.click(screen.getByLabelText('Lembrar-me'));
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('exibe error e aplica aria-invalid', () => {
    render(<Checkbox label="Obrigatório" error="Necessário aceitar" />);
    const cb = screen.getByRole('checkbox');
    expect(cb).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Necessário aceitar')).toBeInTheDocument();
  });

  it('aplica disabled', () => {
    render(<Checkbox label="Inativo" disabled />);
    expect(screen.getByLabelText('Inativo')).toBeDisabled();
  });

  it('renderiza helperText quando não há error', () => {
    render(<Checkbox label="Notif" helperText="receberá emails" />);
    expect(screen.getByText('receberá emails')).toBeInTheDocument();
  });
});
