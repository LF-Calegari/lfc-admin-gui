import React from 'react';
import styled from 'styled-components';

import logoForLightTheme from '../../assets/logo-dark.svg';
import logoForDarkTheme from '../../assets/logo-white.svg';
import { Spinner } from '../../components/ui';
import { useTheme } from '../../hooks/useTheme';

/**
 * Mensagem padrão exibida ao usuário enquanto a sessão é validada com o
 * backend. Mantida em pt-BR para coerência com o restante da UI.
 */
const DEFAULT_MESSAGE = 'Validando sua sessão...';

interface AuthSplashProps {
  /**
   * Mensagem exibida abaixo do spinner. Permite que cenários distintos
   * (revalidação periódica, retorno de offline) reaproveitem o
   * componente com texto contextual.
   */
  message?: string;
}

/**
 * Background transparente: o `<body>` global já pinta `--bg-base` e o
 * grid overlay "engineering tool" (`identity/README.md:75`); manter o
 * `SplashRoot` opaco esconderia o grid também durante a validação
 * inicial da sessão.
 */
const SplashRoot = styled.div`
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  padding: var(--space-6) var(--space-4);
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
  text-align: center;
`;

/**
 * Logo da marca exibida no splash. Dimensão definida por `height`
 * literal (`36px`) com `width: auto` para preservar o aspect-ratio
 * original do SVG (viewBox 200×48 ≈ 4.16:1) — mesma decisão da
 * `LoginPage`. Sem o `width: auto` o container quadrado de
 * `--space-16` causava letterboxing e tornava o texto "authenticator"
 * ilegível (Issue #111).
 */
const Logo = styled.img`
  height: 36px;
  width: auto;
  display: block;
`;

const Message = styled.p`
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--fg2);
  line-height: var(--leading-snug);
  margin: 0;
`;

/**
 * Tela de carregamento exibida enquanto o `AuthProvider` valida a
 * sessão remota via `verify-token` no mount.
 *
 * Decisões importantes:
 *
 * 1. **Sem hardcode de cor** — todas as superfícies consomem tokens do
 *    design system (`--bg-base`, `--fg2`), o que garante coerência
 *    automática entre `light` e `dark`.
 * 2. **Logo trocado por tema** — usa o mesmo critério da `LoginPage`:
 *    `useTheme().resolvedTheme` decide entre `logo-dark.svg` (light) e
 *    `logo-white.svg` (dark) para preservar contraste WCAG AA contra
 *    `--bg-base` em ambos os temas.
 * 3. **Acessibilidade** — `role="status"` + `aria-live="polite"` no
 *    container raiz. O `Spinner` já expõe `role="status"` próprio; ao
 *    envolvê-lo neste live region, garantimos que leitores de tela
 *    anunciem "Validando sua sessão..." sem repetir o nome do spinner.
 * 4. **Sem interativos** — não há foco a tratar. Caso futuras versões
 *    incluam botão "tentar novamente", revisar `:focus-visible`.
 */
export const AuthSplash: React.FC<AuthSplashProps> = ({
  message = DEFAULT_MESSAGE,
}) => {
  const { resolvedTheme } = useTheme();
  const logoSrc = resolvedTheme === 'dark' ? logoForDarkTheme : logoForLightTheme;

  return (
    <SplashRoot role="status" aria-live="polite" data-testid="auth-splash">
      <Container>
        <Logo src={logoSrc} alt="LF Calegari Admin" />
        <Spinner size="lg" tone="accent" label={message} />
        <Message>{message}</Message>
      </Container>
    </SplashRoot>
  );
};

export default AuthSplash;
