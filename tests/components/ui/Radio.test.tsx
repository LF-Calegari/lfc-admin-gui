import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Radio, RadioGroup } from '@/components/ui/Radio';

describe('Radio', () => {
  it('renderiza label e seleciona', () => {
    const handleChange = vi.fn();
    render(<Radio name="opt" value="a" label="Opção A" onChange={handleChange} />);
    fireEvent.click(screen.getByLabelText('Opção A'));
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('exibe error e aplica aria-invalid', () => {
    render(<Radio name="opt" value="x" label="X" error="Erro" />);
    expect(screen.getByRole('radio')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('RadioGroup', () => {
  const options = [
    { value: 'a', label: 'Opção A' },
    { value: 'b', label: 'Opção B' },
    { value: 'c', label: 'Opção C', disabled: true },
  ] as const;

  it('renderiza legend e três opções', () => {
    render(<RadioGroup name="g1" options={options} legend="Escolha" />);
    expect(screen.getByText('Escolha')).toBeInTheDocument();
    expect(screen.getByLabelText('Opção A')).toBeInTheDocument();
    expect(screen.getByLabelText('Opção B')).toBeInTheDocument();
    expect(screen.getByLabelText('Opção C')).toBeInTheDocument();
  });

  it('chama onChange com valor selecionado', () => {
    const handleChange = vi.fn();
    render(<RadioGroup name="g2" options={options} onChange={handleChange} />);
    fireEvent.click(screen.getByLabelText('Opção B'));
    expect(handleChange).toHaveBeenCalledWith('b');
  });

  it('respeita disabled em opção individual', () => {
    render(<RadioGroup name="g3" options={options} />);
    expect(screen.getByLabelText('Opção C')).toBeDisabled();
  });

  it('é controlado quando value é fornecido', () => {
    const { rerender } = render(<RadioGroup name="g4" options={options} value="a" />);
    expect(screen.getByLabelText('Opção A')).toBeChecked();
    rerender(<RadioGroup name="g4" options={options} value="b" />);
    expect(screen.getByLabelText('Opção B')).toBeChecked();
  });
});
