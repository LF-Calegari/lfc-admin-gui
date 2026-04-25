import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Body, Caption, Heading, Label } from '@/components/ui/Typography';

describe('Typography.Heading', () => {
  it('renderiza h1 por padrão', () => {
    render(<Heading>Título</Heading>);
    const node = screen.getByRole('heading', { level: 1, name: 'Título' });
    expect(node.tagName).toBe('H1');
  });

  it.each([
    [2, 'H2'],
    [3, 'H3'],
    [4, 'H4'],
  ] as const)('renderiza tag h%i quando level=%i', (level, expectedTag) => {
    render(<Heading level={level}>Título {level}</Heading>);
    const node = screen.getByRole('heading', { level, name: `Título ${level}` });
    expect(node.tagName).toBe(expectedTag);
  });

  it('respeita prop `as` para sobrescrever a tag semântica', () => {
    render(
      <Heading level={2} as="div">
        Custom tag
      </Heading>,
    );
    expect(screen.getByText('Custom tag').tagName).toBe('DIV');
  });
});

describe('Typography.Body', () => {
  it('renderiza um parágrafo por padrão', () => {
    render(<Body>Texto corrido</Body>);
    expect(screen.getByText('Texto corrido').tagName).toBe('P');
  });

  it('aplica modificador muted quando solicitado', () => {
    render(<Body muted>Muted</Body>);
    expect(screen.getByText('Muted')).toBeInTheDocument();
  });
});

describe('Typography.Caption', () => {
  it('renderiza como span', () => {
    render(<Caption>Legenda</Caption>);
    expect(screen.getByText('Legenda').tagName).toBe('SPAN');
  });
});

describe('Typography.Label', () => {
  it('renderiza um label HTML acessível', () => {
    render(<Label htmlFor="campo">Nome</Label>);
    const label = screen.getByText('Nome');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', 'campo');
  });
});
