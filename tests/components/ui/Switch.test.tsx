import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Switch } from '@/components/ui/Switch';

describe('Switch', () => {
  it('renderiza label e expõe role="switch"', () => {
    render(<Switch label="Notificações" />);
    const sw = screen.getByLabelText('Notificações');
    expect(sw).toHaveAttribute('role', 'switch');
  });

  it('dispara onChange com o estado', () => {
    const handleChange = vi.fn();
    render(<Switch label="Ativo" onChange={handleChange} />);
    fireEvent.click(screen.getByLabelText('Ativo'));
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('aplica disabled', () => {
    render(<Switch label="Off" disabled />);
    expect(screen.getByLabelText('Off')).toBeDisabled();
  });

  it('renderiza helperText', () => {
    render(<Switch label="Wifi" helperText="Conecta automaticamente" />);
    expect(screen.getByText('Conecta automaticamente')).toBeInTheDocument();
  });
});
