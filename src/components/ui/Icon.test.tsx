import { render, screen } from '@testing-library/react';
import { Check } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { Icon } from './Icon';

describe('Icon', () => {
  it('renderiza decorativo (aria-hidden) quando não há title', () => {
    const { container } = render(<Icon icon={Check} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('expõe role="img" quando title é fornecido', () => {
    render(<Icon icon={Check} title="Sucesso" />);
    const node = screen.getByRole('img', { name: 'Sucesso' });
    expect(node).toBeInTheDocument();
  });

  it.each(['xs', 'sm', 'md', 'lg', 'xl'] as const)('renderiza tamanho %s sem quebrar', size => {
    const { container } = render(<Icon icon={Check} size={size} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
