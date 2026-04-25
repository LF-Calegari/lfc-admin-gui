import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ErrorPage } from '@/components/ErrorPage/ErrorPage';

describe('ErrorPage', () => {
  it('renderiza code, title e description recebidos via props', () => {
    render(
      <ErrorPage
        code="404"
        title="Página não encontrada"
        description="A página que você procura não existe."
        actionLabel="Voltar ao início"
        onAction={() => undefined}
      />,
    );

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Página não encontrada' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('A página que você procura não existe.'),
    ).toBeInTheDocument();
  });

  it('expõe aria-label do código e região acessível', () => {
    render(
      <ErrorPage
        code="500"
        title="Erro interno"
        description="Algo deu errado."
        actionLabel="Tentar novamente"
        onAction={() => undefined}
      />,
    );

    const region = screen.getByRole('region');
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('aria-labelledby', 'error-page-code');
    expect(screen.getByLabelText('Erro 500')).toBeInTheDocument();
  });

  it('renderiza description como ReactNode (suporta elementos)', () => {
    render(
      <ErrorPage
        code="403"
        title="Sem permissão"
        description={
          <>
            Acesso negado. <strong>Contate o administrador</strong>.
          </>
        }
        actionLabel="Voltar"
        onAction={() => undefined}
      />,
    );

    expect(screen.getByText('Contate o administrador')).toBeInTheDocument();
  });

  it('chama onAction ao clicar no CTA', () => {
    const onAction = vi.fn();
    render(
      <ErrorPage
        code="401"
        title="Não autenticado"
        description="Faça login para continuar."
        actionLabel="Fazer login"
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fazer login' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('aplica actionLabel como conteúdo e aria-label do CTA', () => {
    render(
      <ErrorPage
        code="404"
        title="Página não encontrada"
        description="Conteúdo inexistente."
        actionLabel="Voltar ao início"
        onAction={() => undefined}
      />,
    );

    const button = screen.getByRole('button', { name: 'Voltar ao início' });
    expect(button).toHaveTextContent('Voltar ao início');
    expect(button).toHaveAttribute('aria-label', 'Voltar ao início');
  });
});
