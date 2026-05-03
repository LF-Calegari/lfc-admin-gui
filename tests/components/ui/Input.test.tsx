import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Input } from '@/components/ui/Input';

describe('Input', () => {
  it('renderiza label associado ao input', () => {
    render(<Input label="E-mail" />);
    const input = screen.getByLabelText('E-mail');
    expect(input.tagName).toBe('INPUT');
  });

  it('dispara onChange com o valor digitado', () => {
    const handleChange = vi.fn();
    render(<Input label="Nome" onChange={handleChange} />);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Alice' } });
    expect(handleChange).toHaveBeenCalledWith('Alice');
  });

  it('exibe error quando informado', () => {
    render(<Input label="Obrigatório" error="Campo obrigatório" />);
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
  });

  it('aplica disabled', () => {
    render(<Input label="Read only" disabled />);
    expect(screen.getByLabelText('Read only')).toBeDisabled();
  });

  describe('quando type="password"', () => {
    it('renderiza botão de toggle por default com aria-label "Mostrar senha"', () => {
      render(<Input label="Senha" type="password" />);
      const toggle = screen.getByRole('button', { name: 'Mostrar senha' });
      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveAttribute('type', 'button');
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });

    it('renderiza input como type="password" antes do click', () => {
      render(<Input label="Senha" type="password" />);
      const input = screen.getByLabelText('Senha') as HTMLInputElement;
      expect(input.type).toBe('password');
    });

    it('alterna type para "text" e atualiza aria-label/aria-pressed ao clicar no toggle', () => {
      render(<Input label="Senha" type="password" />);
      const input = screen.getByLabelText('Senha') as HTMLInputElement;
      const toggle = screen.getByRole('button', { name: 'Mostrar senha' });

      fireEvent.click(toggle);

      expect(input.type).toBe('text');
      const reverseToggle = screen.getByRole('button', { name: 'Ocultar senha' });
      expect(reverseToggle).toHaveAttribute('aria-pressed', 'true');
    });

    it('volta para type="password" ao clicar duas vezes', () => {
      render(<Input label="Senha" type="password" />);
      const input = screen.getByLabelText('Senha') as HTMLInputElement;
      const toggle = screen.getByRole('button', { name: 'Mostrar senha' });

      fireEvent.click(toggle);
      fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));

      expect(input.type).toBe('password');
      expect(screen.getByRole('button', { name: 'Mostrar senha' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('é focável via Tab (não usa tabIndex=-1)', () => {
      render(<Input label="Senha" type="password" />);
      const toggle = screen.getByRole('button', { name: 'Mostrar senha' });
      expect(toggle).not.toHaveAttribute('tabIndex', '-1');
    });

    it('toggle herda disabled do input pai', () => {
      render(<Input label="Senha" type="password" disabled />);
      const toggle = screen.getByRole('button', { name: 'Mostrar senha' });
      expect(toggle).toBeDisabled();
    });

    it('omite o toggle quando revealable={false}', () => {
      render(<Input label="Senha" type="password" revealable={false} />);
      expect(
        screen.queryByRole('button', { name: /Mostrar senha|Ocultar senha/ }),
      ).not.toBeInTheDocument();
    });

    it('mantém autoComplete fornecido pelo caller', () => {
      render(
        <Input
          label="Senha"
          type="password"
          autoComplete="new-password"
        />,
      );
      const input = screen.getByLabelText('Senha') as HTMLInputElement;
      expect(input.autocomplete).toBe('new-password');
    });
  });

  it('não renderiza toggle para type="text" mesmo com revealable={true}', () => {
    render(<Input label="Texto" type="text" revealable />);
    expect(
      screen.queryByRole('button', { name: /Mostrar senha|Ocultar senha/ }),
    ).not.toBeInTheDocument();
  });

  it('não renderiza toggle quando type não é informado', () => {
    render(<Input label="Texto livre" />);
    expect(
      screen.queryByRole('button', { name: /Mostrar senha|Ocultar senha/ }),
    ).not.toBeInTheDocument();
  });
});
