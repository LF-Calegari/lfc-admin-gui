import React from 'react';
import styled from 'styled-components';

import { Body, Button, Label, useToast } from '../../components/ui';

import { ShowcaseSection, Stack } from './_shared';

import type { ToastVariant } from '../../components/ui';

/**
 * Issue #39 — Toasts.
 *
 * Demonstra a API `useToast()` exposta pelo `ToastProvider` instalado
 * no root de `App.tsx`. Cada botão dispara uma variante diferente.
 */

interface ToastSpec {
  variant: ToastVariant;
  label: string;
  title: string;
  message: string;
}

const SPECS: ReadonlyArray<ToastSpec> = [
  {
    variant: 'success',
    label: 'Disparar success',
    title: 'Permissão atribuída',
    message: 'perm:Users.Invite adicionada a ops@lfc.com.br',
  },
  {
    variant: 'info',
    label: 'Disparar info',
    title: 'Sessão renovada',
    message: 'tokenVersion: 13. Expira em 15 min.',
  },
  {
    variant: 'warning',
    label: 'Disparar warning',
    title: 'Token expira em breve',
    message: 'Renovação automática ativa.',
  },
  {
    variant: 'danger',
    label: 'Disparar danger',
    title: 'Falha ao revogar token',
    message: 'Erro 502 ao contatar lfc-kurtto. Tente novamente.',
  },
];

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
`;

export const Toasts: React.FC = () => {
  const { show, dismissAll } = useToast();

  return (
    <ShowcaseSection
      eyebrow="Components"
      title="Toasts"
      description="Mensagens flutuantes (auto-dismiss configurável) servidas via portal. O ToastProvider vive no root da aplicação; cada componente consome a API com useToast()."
      ariaLabel="Components Toasts"
    >
      <Stack>
        <Label>Disparar variantes</Label>
        <Row>
          {SPECS.map(spec => (
            <Button
              key={spec.variant}
              variant="secondary"
              size="sm"
              onClick={() =>
                show(spec.message, {
                  variant: spec.variant,
                  title: spec.title,
                })
              }
            >
              {spec.label}
            </Button>
          ))}
        </Row>
      </Stack>

      <Stack>
        <Label>Persistente (sem auto-dismiss)</Label>
        <Row>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              show('Permanece em tela até ser fechado manualmente.', {
                variant: 'info',
                title: 'Persistente',
                duration: 0,
              })
            }
          >
            Disparar persistente
          </Button>
          <Button variant="ghost" size="sm" onClick={() => dismissAll()}>
            Limpar todos
          </Button>
        </Row>
        <Body muted>
          Use <code>duration: 0</code> em mensagens críticas (ex.: erro de
          autenticação) que precisam de acknowledge explícito do usuário.
        </Body>
      </Stack>
    </ShowcaseSection>
  );
};
