import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from '@/components/ui/Toast';

const Demo: React.FC = () => {
  const { show, dismissAll } = useToast();
  return (
    <>
      <button type="button" onClick={() => show('Salvo', { variant: 'success' })}>
        success
      </button>
      <button
        type="button"
        onClick={() => show('Erro', { variant: 'danger', title: 'Falha', dismissible: true })}
      >
        danger
      </button>
      <button type="button" onClick={() => show('Info persistente', { duration: 0 })}>
        info-persist
      </button>
      <button type="button" onClick={() => dismissAll()}>
        clear
      </button>
    </>
  );
};

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra toast quando show é chamado', () => {
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('success'));
    expect(screen.getByText('Salvo')).toBeInTheDocument();
  });

  it('toast com variant danger usa role=alert', () => {
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('danger'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Falha')).toBeInTheDocument();
  });

  it('auto-dismiss após duration', () => {
    render(
      <ToastProvider defaultDuration={1000}>
        <Demo />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('success'));
    expect(screen.getByText('Salvo')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(screen.queryByText('Salvo')).not.toBeInTheDocument();
  });

  it('duration 0 mantém toast em tela', () => {
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('info-persist'));
    expect(screen.getByText('Info persistente')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByText('Info persistente')).toBeInTheDocument();
  });

  it('botão de fechar manual remove o toast', () => {
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('danger'));
    expect(screen.getByText('Erro')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar notificação' }));
    expect(screen.queryByText('Erro')).not.toBeInTheDocument();
  });

  it('dismissAll fecha todos os toasts', () => {
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('success'));
    fireEvent.click(screen.getByText('info-persist'));
    expect(screen.getByText('Salvo')).toBeInTheDocument();
    expect(screen.getByText('Info persistente')).toBeInTheDocument();
    fireEvent.click(screen.getByText('clear'));
    expect(screen.queryByText('Salvo')).not.toBeInTheDocument();
    expect(screen.queryByText('Info persistente')).not.toBeInTheDocument();
  });

  it('useToast lança erro fora do provider', () => {
    // suprimir log esperado
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Bad = () => {
      useToast();
      return null;
    };
    expect(() => render(<Bad />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
