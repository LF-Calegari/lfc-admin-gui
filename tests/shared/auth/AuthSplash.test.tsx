import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { AuthSplash } from '@/shared/auth';

describe('AuthSplash', () => {
  test('renderiza logo com alt acessível', () => {
    render(<AuthSplash />);
    const logo = screen.getByAltText('LF Calegari Admin');
    expect(logo).toBeInTheDocument();
    expect(logo.tagName).toBe('IMG');
  });

  test('expõe role="status" e aria-live="polite" no container raiz', () => {
    render(<AuthSplash />);
    const root = screen.getByTestId('auth-splash');
    expect(root).toHaveAttribute('role', 'status');
    expect(root).toHaveAttribute('aria-live', 'polite');
  });

  test('exibe mensagem padrão quando nenhuma é informada', () => {
    render(<AuthSplash />);
    expect(screen.getByText('Validando sua sessão...')).toBeInTheDocument();
  });

  test('aceita mensagem customizada via prop', () => {
    render(<AuthSplash message="Reconectando ao servidor..." />);
    expect(screen.getByText('Reconectando ao servidor...')).toBeInTheDocument();
  });
});
