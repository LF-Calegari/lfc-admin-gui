import { Mail, Lock } from 'lucide-react';
import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';

import logoForLightTheme from '../assets/logo-dark.svg';
import logoForDarkTheme from '../assets/logo-white.svg';
import { Alert, Button, Input, ThemeToggle } from '../components/ui';
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

interface FormState {
  email: string;
  password: string;
}

interface FieldErrors {
  email?: string;
  password?: string;
}

const PageRoot = styled.div`
  min-height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--bg-base);
  padding: var(--space-6) var(--space-4);
  position: relative;
`;

/**
 * Toggle de tema posicionado no canto superior direito. Mantém o
 * controle visível antes do login para que o usuário possa ajustar
 * preferência mesmo sem sessão ativa.
 */
const ThemeSlot = styled.div`
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
`;

const Container = styled.div`
  width: 100%;
  max-width: var(--measure-cta);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
`;

const Brand = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
`;

const Logo = styled.img`
  width: var(--space-16);
  height: var(--space-16);
  display: block;
`;

const BrandTitle = styled.h1`
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--fg1);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin: 0;
  text-align: center;
`;

const BrandSubtitle = styled.p`
  font-size: var(--text-sm);
  color: var(--fg2);
  margin: 0;
  text-align: center;
  line-height: var(--leading-snug);
`;

/**
 * Card customizado em vez do `Card` compartilhado: o componente padrão
 * traz hover/transform que é desejável em listas, mas estranho em uma
 * tela de autenticação onde o foco deve estar 100% no formulário.
 */
const FormCard = styled.section`
  width: 100%;
  background: var(--bg-surface);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

const SubmitButton = styled(Button)`
  width: 100%;
`;

const Footer = styled.p`
  font-size: var(--text-xs);
  color: var(--fg3);
  margin: 0;
  text-align: center;
  line-height: var(--leading-snug);
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
 * Tela de autenticação do painel administrativo.
 *
 * Decisões importantes:
 *
 * 1. **Layout dedicado** — fora do `AppLayout` para esconder Sidebar/
 *    Topbar; o foco visual fica concentrado no Card central.
 * 2. **Redirect-if-authenticated** — quando `isAuthenticated`, evita
 *    flash do form retornando `<Navigate />` antes do JSX principal.
 * 3. **Validação client-side mínima** — o objetivo é evitar requests
 *    obviamente inválidos. A validação canônica é do backend.
 * 4. **Mensagem 401 fixa** — "e-mail ou senha inválidos" sem detalhar,
 *    para não revelar se o e-mail existe (boa prática de segurança).
 * 5. **Foco automático** — primeiro campo recebe foco no mount; melhora
 *    UX em desktop sem prejudicar mobile (foco não abre teclado virtual
 *    automaticamente nos browsers atuais sem interação prévia).
 * 6. **Token em memória** — esta página apenas dispara `useAuth().login`;
 *    a persistência (localStorage + sync entre abas) é feita na Issue
 *    #53.
 */
export const LoginPage: React.FC = () => {
  const { login, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { resolvedTheme } = useTheme();
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

  const logoSrc = resolvedTheme === 'dark' ? logoForDarkTheme : logoForLightTheme;

  return (
    <PageRoot>
      <ThemeSlot>
        <ThemeToggle />
      </ThemeSlot>
      <Container>
        <Brand>
          <Logo src={logoSrc} alt="LF Calegari Admin" />
          <div>
            <BrandTitle>Acesse sua conta</BrandTitle>
            <BrandSubtitle>Entre para gerenciar o catálogo do autenticador.</BrandSubtitle>
          </div>
        </Brand>

        <FormCard aria-labelledby="login-form-title">
          <VisuallyHidden id="login-form-title">Formulário de login</VisuallyHidden>
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

            <SubmitButton
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting}
              data-testid="login-submit"
            >
              {isSubmitting ? 'Entrando…' : 'Entrar'}
            </SubmitButton>
          </Form>
        </FormCard>

        <Footer>
          Acesso restrito a administradores autorizados.
        </Footer>
      </Container>
    </PageRoot>
  );
};

export default LoginPage;
