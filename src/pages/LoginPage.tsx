import { Mail, Lock } from 'lucide-react';
import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';

import logoForLightTheme from '../assets/logo-dark.svg';
import logoForDarkTheme from '../assets/logo-white.svg';
import { Alert, Button, Input, ThemeToggle, useToast } from '../components/ui';
import { useTheme } from '../hooks/useTheme';
import { isApiError } from '../shared/api';
import { useAuth } from '../shared/auth';

import type { ApiError } from '../shared/api';

/**
 * Destino padrão pós-login quando a `location.state.from` não está
 * preenchida (acesso direto à rota `/login`).
 */
const DEFAULT_REDIRECT = '/systems';

/**
 * Mensagem genérica exibida quando o erro retornado pelo backend não
 * carrega texto legível. Em pt-BR para alinhar com o restante da UI.
 */
const FALLBACK_ERROR = 'Falha ao entrar. Verifique suas credenciais e tente novamente.';

/**
 * Mensagem amigável para credenciais inválidas. Mantemos texto
 * deliberadamente vago ("e-mail ou senha inválidos") para não vazar
 * existência da conta — boa prática de segurança em telas de login.
 */
const INVALID_CREDENTIALS_MESSAGE = 'E-mail ou senha inválidos.';

/**
 * Validação simples e suficiente para client-side. A validação real
 * (formato canônico) acontece no backend; aqui só evitamos submits
 * obviamente inválidos. Regex pragmático: caracteres não-espaço, "@",
 * caracteres não-espaço, ".", caracteres não-espaço.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Eyebrow exibido acima do título principal — espelha o padrão do
 * identity kit (`identity/ui_kits/admin-spa/screens.jsx:20`). Mantemos
 * a string como constante para facilitar evolução futura (ex.: trocar
 * versão ao subir release).
 */
const EYEBROW_TEXT = 'Authenticator · v1.0';

/**
 * Mensagem do toast disparado pelo botão "Esqueci a senha". Por agora
 * o fluxo real não está implementado (fora do escopo da #105); o toast
 * informa o usuário e direciona para o canal humano.
 */
const FORGOT_PASSWORD_TOAST = 'Funcionalidade em breve. Contate o administrador.';

interface FormState {
  email: string;
  password: string;
}

interface FieldErrors {
  email?: string;
  password?: string;
}

/**
 * Container raiz — `position: relative` para servir de âncora para a
 * camada de glow absoluta. `overflow: hidden` corta os gradientes que
 * vazam fora do viewport.
 *
 * Background transparente: o `<body>` global (em `globals.css`) já
 * pinta `--bg-base` + grid overlay "engineering tool"
 * (`identity/README.md:75`); manter o `PageRoot` opaco esconderia o
 * grid também na tela de login. A `GlowLayer` continua por cima como
 * camada decorativa absoluta.
 */
const PageRoot = styled.div`
  min-height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: transparent;
  padding: var(--space-8) var(--space-4);
  position: relative;
  overflow: hidden;
`;

/**
 * Camada decorativa com os dois gradientes radiais. Fica em `inset:
 * -10%` para que os gradientes "sangrem" para fora do viewport visível
 * (espelha a referência `.lfc-login__grid` do identity kit).
 *
 * `pointer-events: none` é crítico — esta camada é puramente
 * decorativa e não pode interceptar cliques no card central.
 */
const GlowLayer = styled.div`
  position: absolute;
  inset: -10%;
  pointer-events: none;
  background: var(--login-glow-1), var(--login-glow-2);
  z-index: var(--z-base);
`;

/**
 * Toggle de tema posicionado no canto superior direito. Mantém o
 * controle visível antes do login para que o usuário possa ajustar
 * preferência mesmo sem sessão ativa.
 *
 * `z-index: var(--z-raised)` garante que fica acima da `GlowLayer`.
 */
const ThemeSlot = styled.div`
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  z-index: var(--z-raised);
`;

/**
 * Wrapper do conteúdo principal. `z-index: var(--z-raised)` mantém o
 * card e a marca acima da `GlowLayer`. `width: 440px` espelha o kit;
 * `max-width: 100%` mantém responsividade em telas estreitas.
 */
const Container = styled.div`
  position: relative;
  z-index: var(--z-raised);
  width: 100%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
`;

/**
 * Logo da marca exibida no topo do `FormCard`. Dimensão definida por
 * `height` literal (`36px`) com `width: auto` para preservar o
 * aspect-ratio original do SVG (viewBox 200×48 ≈ 4.16:1) e manter o
 * texto "authenticator" legível. Espelha o padrão do identity kit
 * (`identity/ui_kits/admin-spa/screens.jsx:19` — `<img height="36">`).
 *
 * Decisão sobre o literal `36px`: é dimensão visual de imagem, não
 * spacing/font/color — tokens semânticos `--space-*` representam outra
 * coisa. Aceitável literal aqui (consistente com o atributo HTML
 * `<img height="36">` da referência).
 */
const Logo = styled.img`
  height: 36px;
  width: auto;
  display: block;
  margin-bottom: var(--space-4);
`;

/**
 * Card customizado em vez do `Card` compartilhado: o componente padrão
 * traz hover/transform que é desejável em listas, mas estranho em uma
 * tela de autenticação onde o foco deve estar 100% no formulário.
 *
 * `box-shadow: var(--shadow-modal)` confere a profundidade pedida pela
 * issue — espelha exatamente o `.lfc-login__card` do identity kit.
 */
const FormCard = styled.section`
  width: 100%;
  background: var(--bg-surface);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-8);
  box-shadow: var(--shadow-modal);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  /* Em mobile estreito reduz padding interno para não comprimir o
     conteudo. Threshold espelha --bp-sm (30em, ~480px). */
  @media (max-width: 30em) {
    padding: var(--space-6);
  }
`;

/**
 * Eyebrow mono-uppercase tracking-wide acima do `<h1>`. Replica o
 * `.lfc-eyebrow--accent` do kit (`identity/ui_kits/admin-spa/kit.css:115`).
 */
const Eyebrow = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--accent-ink);
`;

/**
 * Título principal — semântica `<h1>` (preserva o critério "h1 único").
 * Tipografia segue o kit: `--text-3xl`, peso 700, tracking-tight.
 */
const BrandTitle = styled.h1`
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--weight-bold);
  color: var(--fg1);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin: 0;

  /* Em telas pequenas reduz para --text-2xl para evitar quebra
     desconfortavel de linha. */
  @media (max-width: 30em) {
    font-size: var(--text-2xl);
  }
`;

const BrandSubtitle = styled.p`
  font-size: var(--text-sm);
  color: var(--fg2);
  margin: 0;
  line-height: var(--leading-snug);
`;

/**
 * Bloco de cabeçalho dentro do card — agrupa eyebrow, título e
 * subtítulo com hierarquia visual coerente.
 */
const CardHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

/**
 * Linha de ações com os dois botões lado a lado. Em mobile estreito
 * (< `--bp-sm`) os botões empilham para preservar touch target ≥ 44px.
 */
const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;

  @media (max-width: 30em) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const PrimaryButton = styled(Button)`
  flex: 1;
  min-width: 0;
`;

const SecondaryButton = styled(Button)`
  flex-shrink: 0;
`;

/**
 * Footer mono que espelha `.lfc-login__meta`. Linha divisória sutil no
 * topo, fonte mono uppercase tracking-wide, dois itens em
 * `space-between`. Em mobile empilha para evitar truncamento.
 */
const MetaFooter = styled.div`
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: var(--border-thin) solid var(--border-subtle);
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg3);
  letter-spacing: var(--tracking-wide);

  @media (max-width: 30em) {
    flex-direction: column;
    gap: var(--space-1);
  }
`;

/**
 * Título acessível (apenas leitor de tela). Mantém a `<section>`
 * rotulada por um heading sem poluir o layout visual.
 */
const VisuallyHidden = styled.h2`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

/**
 * Tipa o `state` de `location` para extrair o caminho original que o
 * usuário tentou acessar antes de ser redirecionado para `/login`.
 *
 * O guard de rota (Issue #56) preencherá `location.state.from` com a
 * rota original; aqui apenas tentamos extrair de forma defensiva — se
 * o shape não bate, caímos no `DEFAULT_REDIRECT`.
 */
function resolveRedirectTarget(state: unknown): string {
  if (!state || typeof state !== 'object') {
    return DEFAULT_REDIRECT;
  }
  const candidate = (state as { from?: { pathname?: string } }).from;
  const pathname = candidate?.pathname;
  return typeof pathname === 'string' && pathname.length > 0 ? pathname : DEFAULT_REDIRECT;
}

/**
 * Normaliza um erro arbitrário em mensagem exibível.
 *
 * - 401 (credenciais inválidas) → mensagem fixa não-vazante.
 * - Demais `ApiError` com `message` → reutiliza a mensagem do backend.
 * - Qualquer outro erro → mensagem genérica.
 */
function buildErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    const httpError = error as ApiError;
    if (httpError.status === 401) {
      return INVALID_CREDENTIALS_MESSAGE;
    }
    if (httpError.message) {
      return httpError.message;
    }
  }
  return FALLBACK_ERROR;
}

/**
 * Retorna a data corrente em ISO `YYYY-MM-DD`. Mantida como função
 * separada para ser substituível em testes (vi.spyOn) sem precisar
 * forçar `vi.useFakeTimers` no caller.
 */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Tela de autenticação do painel administrativo.
 *
 * Decisões importantes:
 *
 * 1. **Layout dedicado** — fora do `AppLayout` para esconder Sidebar/
 *    Topbar; o foco visual fica concentrado no Card central.
 * 2. **Atmosfera por gradientes radiais** — `GlowLayer` cobre o
 *    viewport com os tokens `--login-glow-*` (definidos por tema);
 *    o card flutua sobre essa cena com `--shadow-modal`.
 * 3. **Redirect-if-authenticated** — quando `isAuthenticated`, evita
 *    flash do form retornando `<Navigate />` antes do JSX principal.
 * 4. **Validação client-side mínima** — o objetivo é evitar requests
 *    obviamente inválidos. A validação canônica é do backend.
 * 5. **Mensagem 401 fixa** — "e-mail ou senha inválidos" sem detalhar,
 *    para não revelar se o e-mail existe (boa prática de segurança).
 * 6. **Foco automático** — primeiro campo recebe foco no mount; melhora
 *    UX em desktop sem prejudicar mobile (foco não abre teclado virtual
 *    automaticamente nos browsers atuais sem interação prévia).
 * 7. **"Esqueci a senha"** — placeholder com toast informativo. O
 *    fluxo real está fora do escopo da #105; o toast direciona para
 *    contato humano até a feature ser implementada.
 */
export const LoginPage: React.FC = () => {
  const { login, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { resolvedTheme } = useTheme();
  const { show: showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Curto-circuito: se já autenticado (acesso direto a /login com sessão
  // viva), redireciona imediatamente para o destino preservado ou home.
  if (isAuthenticated && !isAuthLoading) {
    return <Navigate to={resolveRedirectTarget(location.state)} replace />;
  }

  const handleEmailChange = (value: string): void => {
    setForm(prev => ({ ...prev, email: value }));
    if (fieldErrors.email) {
      setFieldErrors(prev => ({ ...prev, email: undefined }));
    }
    if (submitError) {
      setSubmitError(null);
    }
  };

  const handlePasswordChange = (value: string): void => {
    setForm(prev => ({ ...prev, password: value }));
    if (fieldErrors.password) {
      setFieldErrors(prev => ({ ...prev, password: undefined }));
    }
    if (submitError) {
      setSubmitError(null);
    }
  };

  /**
   * Valida o formulário e devolve o mapa de erros por campo. Mantida
   * como função pura para facilitar teste e leitura.
   */
  const validate = (values: FormState): FieldErrors => {
    const errors: FieldErrors = {};
    const trimmedEmail = values.email.trim();
    if (!trimmedEmail) {
      errors.email = 'Informe seu e-mail.';
    } else if (!EMAIL_REGEX.test(trimmedEmail)) {
      errors.email = 'E-mail inválido.';
    }
    if (!values.password) {
      errors.password = 'Informe sua senha.';
    }
    return errors;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (isSubmitting) return;

    const errors = validate(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSubmitError(null);
      return;
    }

    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      await login(form.email.trim(), form.password);
      const target = resolveRedirectTarget(location.state);
      navigate(target, { replace: true });
    } catch (error) {
      setSubmitError(buildErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = (): void => {
    showToast(FORGOT_PASSWORD_TOAST, { variant: 'info' });
  };

  const logoSrc = resolvedTheme === 'dark' ? logoForDarkTheme : logoForLightTheme;

  return (
    <PageRoot>
      <GlowLayer aria-hidden="true" />
      <ThemeSlot>
        <ThemeToggle />
      </ThemeSlot>
      <Container>
        <FormCard aria-labelledby="login-form-title">
          <VisuallyHidden id="login-form-title">Formulário de login</VisuallyHidden>
          <Logo src={logoSrc} alt="LF Calegari Admin" />
          <CardHeader>
            <Eyebrow data-testid="login-eyebrow">{EYEBROW_TEXT}</Eyebrow>
            <BrandTitle>Entrar no painel</BrandTitle>
            <BrandSubtitle>
              Acesso restrito a administradores do ecossistema LFC.
            </BrandSubtitle>
          </CardHeader>

          <Form onSubmit={handleSubmit} noValidate>
            <Input
              label="E-mail"
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              placeholder="voce@empresa.com.br"
              value={form.email}
              onChange={handleEmailChange}
              error={fieldErrors.email}
              icon={<Mail size={16} strokeWidth={1.5} />}
              disabled={isSubmitting}
              required
              autoFocus
              aria-required="true"
              aria-invalid={fieldErrors.email ? 'true' : undefined}
            />
            <Input
              label="Senha"
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Sua senha"
              value={form.password}
              onChange={handlePasswordChange}
              error={fieldErrors.password}
              icon={<Lock size={16} strokeWidth={1.5} />}
              disabled={isSubmitting}
              required
              aria-required="true"
              aria-invalid={fieldErrors.password ? 'true' : undefined}
            />

            {submitError && (
              <div role="alert" aria-live="assertive">
                <Alert variant="danger">{submitError}</Alert>
              </div>
            )}

            <Actions>
              <PrimaryButton
                type="submit"
                loading={isSubmitting}
                disabled={isSubmitting}
                data-testid="login-submit"
              >
                {isSubmitting ? 'Entrando…' : 'Entrar'}
              </PrimaryButton>
              <SecondaryButton
                type="button"
                variant="ghost"
                onClick={handleForgotPassword}
                disabled={isSubmitting}
                data-testid="login-forgot"
              >
                Esqueci a senha
              </SecondaryButton>
            </Actions>
          </Form>

          <MetaFooter data-testid="login-meta">
            <span>JWT · tokenVersion assinado</span>
            <span>v1.0 · {todayIso()}</span>
          </MetaFooter>
        </FormCard>
      </Container>
    </PageRoot>
  );
};

export default LoginPage;
