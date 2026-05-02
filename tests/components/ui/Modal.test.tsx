import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Modal } from '@/components/ui/Modal';

/**
 * Harness com `open` controlado por estado interno + sincronizado com a
 * prop `initialOpen` em cada render. Permite que `rerender` do RTL
 * mude a visibilidade declarativamente sem precisar disparar evento.
 *
 * Sem o `useEffect` de sincronização, `useState` ignoraria mudanças no
 * `initialOpen` em rerenders subsequentes (estado de React só usa o
 * valor inicial uma vez). Dispara também quando o usuário clica em
 * "Abrir"/Esc/backdrop normalmente.
 */
const Harness: React.FC<{
  initialOpen: boolean;
  closeOnEsc?: boolean;
  closeOnBackdrop?: boolean;
  description?: React.ReactNode;
  bodyContent?: React.ReactNode;
}> = ({ initialOpen, closeOnEsc, closeOnBackdrop, description, bodyContent }) => {
  const [open, setOpen] = React.useState(initialOpen);
  React.useEffect(() => {
    setOpen(initialOpen);
  }, [initialOpen]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Título do diálogo"
        description={description}
        closeOnEsc={closeOnEsc}
        closeOnBackdrop={closeOnBackdrop}
      >
        {bodyContent ?? (
          <>
            <input data-testid="first-input" placeholder="Primeiro" />
            <button type="button" data-testid="action">
              Ação
            </button>
          </>
        )}
      </Modal>
    </>
  );
};

afterEach(() => {
  // Garante que body lock sempre seja restaurado entre testes — em
  // cenários de erro, o efeito de cleanup pode não ter rodado.
  document.documentElement.style.overflow = '';
});

describe('Modal', () => {
  it('não renderiza nada quando open=false', () => {
    render(<Harness initialOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renderiza o diálogo com role=dialog e aria-modal quando aberto', () => {
    render(<Harness initialOpen />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(screen.getByText('Título do diálogo')).toBeInTheDocument();
  });

  it('expõe aria-describedby quando description é fornecida', () => {
    render(<Harness initialOpen description="Texto descritivo do diálogo." />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-describedby');
    expect(screen.getByText('Texto descritivo do diálogo.')).toBeInTheDocument();
  });

  it('foca o primeiro input ao abrir', () => {
    render(<Harness initialOpen />);
    expect(screen.getByTestId('first-input')).toHaveFocus();
  });

  it('aplica overflow:hidden no <html> enquanto aberto e restaura ao fechar', () => {
    document.documentElement.style.overflow = '';
    const { rerender } = render(<Harness initialOpen />);
    expect(document.documentElement.style.overflow).toBe('hidden');

    rerender(<Harness initialOpen={false} />);
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('fecha quando o usuário pressiona Escape', () => {
    render(<Harness initialOpen />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('não fecha por Escape quando closeOnEsc=false', () => {
    render(<Harness initialOpen closeOnEsc={false} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('fecha quando o usuário clica no backdrop', () => {
    render(<Harness initialOpen />);
    const backdrop = screen.getByTestId('modal-backdrop');
    // mouseDown direto no backdrop simula clique fora do diálogo.
    fireEvent.mouseDown(backdrop);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('não fecha quando o clique acontece dentro do diálogo', () => {
    render(<Harness initialOpen />);
    const dialog = screen.getByRole('dialog');
    fireEvent.mouseDown(dialog);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('não fecha por backdrop quando closeOnBackdrop=false', () => {
    render(<Harness initialOpen closeOnBackdrop={false} />);
    fireEvent.mouseDown(screen.getByTestId('modal-backdrop'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('chama onClose ao clicar no botão Fechar (X)', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="t">
        <input />
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('respeita data-modal-initial-focus para escolher o foco inicial', () => {
    render(
      <Modal open onClose={() => undefined} title="t">
        <input data-testid="primeiro" placeholder="primeiro" />
        <input data-testid="segundo" placeholder="segundo" data-modal-initial-focus />
      </Modal>,
    );
    expect(screen.getByTestId('segundo')).toHaveFocus();
  });
});
