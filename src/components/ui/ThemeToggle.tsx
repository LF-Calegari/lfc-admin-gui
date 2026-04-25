import { Moon, Sun } from 'lucide-react';
import React from 'react';
import styled from 'styled-components';

import { useTheme } from '../../hooks/useTheme';

import { Icon } from './Icon';

interface ThemeToggleProps {
  className?: string;
}

/**
 * Botão de toggle de tema. Mantém paridade visual com os demais botões
 * de ícone do `Topbar` (`IconButton`): mesmo tamanho touch, mesma
 * borda/hover/focus. Em desktop encolhe para o quadrado compacto de
 * 34×34px utilizado pelo Bell e Logout.
 *
 * Decisão: ciclo binário `light` ↔ `dark`. Acessar `system` continua
 * possível via API (`useTheme().setTheme('system')`) e via ausência da
 * chave no `localStorage` no primeiro carregamento — basta o usuário
 * limpar storage para voltar a "seguir o sistema". Optamos por não
 * expor um terceiro estado na UI por agora para manter o componente
 * simples; a evolução para dropdown três-estados é compatível.
 */
const ToggleButton = styled.button`
  appearance: none;
  background: transparent;
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--touch-min);
  min-height: var(--touch-min);
  flex-shrink: 0;
  transition:
    background var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    transform var(--duration-fast) var(--ease-default);

  &:hover:not(:disabled) {
    background: var(--bg-elevated);
    color: var(--text-primary);
    border-color: var(--border-base);
  }

  &:active:not(:disabled) {
    transform: translateY(var(--press-offset));
    background: var(--bg-overlay);
  }

  &:focus-visible {
    outline: var(--border-thick) solid var(--accent);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  /* Desktop (≥ --bp-md, 48em) — densidade compacta espelhando o
     IconButton do Topbar. */
  @media (min-width: 48em) {
    width: 34px;
    height: 34px;
    min-width: 0;
    min-height: 0;
  }

  /* Acessibilidade: usuários que preferem movimento reduzido não devem
     ter transitions (background/border/color/transform) animadas. Espelha
     o tratamento já adotado em Spinner.tsx e globals.css. */
  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:active:not(:disabled) {
      transform: none;
    }
  }
`;

/**
 * `ThemeToggle` — alterna entre tema claro e escuro com persistência
 * em `localStorage`. Pronto para teclado (`:focus-visible` ring) e
 * leitores de tela (`aria-label`, `aria-pressed`).
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className }) => {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const ariaLabel = isDark ? 'Ativar tema claro' : 'Ativar tema escuro';
  const title = isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro';

  return (
    <ToggleButton
      type="button"
      className={className}
      onClick={toggleTheme}
      aria-label={ariaLabel}
      aria-pressed={isDark}
      title={title}
      data-testid="theme-toggle"
    >
      <Icon
        icon={isDark ? Sun : Moon}
        size="sm"
        tone="currentColor"
        strokeWidth={1.6}
      />
    </ToggleButton>
  );
};

export type { ThemeToggleProps };
