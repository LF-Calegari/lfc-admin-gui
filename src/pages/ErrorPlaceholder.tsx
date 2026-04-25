import React from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';

import { PageHeader } from '../components/layout/PageHeader';

interface ErrorPlaceholderProps {
  /**
   * Código fixo do erro. Quando omitido, o componente lê `:code` da URL
   * (ex.: rota `/error/:code`). Útil para casos em que a rota wildcard
   * monta diretamente o 404.
   */
  code?: string;
}

const KNOWN_CODES = ['401', '403', '404', '500'] as const;
type KnownCode = (typeof KNOWN_CODES)[number];

const TITLES: Record<KnownCode, string> = {
  '401': 'Não autenticado',
  '403': 'Acesso negado',
  '404': 'Página não encontrada',
  '500': 'Erro interno',
};

const Notice = styled.div`
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 32px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg3);
  letter-spacing: 0.04em;
  line-height: var(--leading-base);
`;

const NoticeMark = styled.div`
  font-size: 10.5px;
  color: var(--accent-ink);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 6px;
`;

function isKnownCode(value: string): value is KnownCode {
  return (KNOWN_CODES as readonly string[]).includes(value);
}

/**
 * Placeholder temporário para as rotas /error/:code.
 *
 * Será substituído pela página de erro definitiva na issue #7. O componente
 * existe apenas para validar a estrutura de rotas e o critério de aceite
 * "rota inexistente exibe 404".
 */
export const ErrorPlaceholder: React.FC<ErrorPlaceholderProps> = ({ code: codeProp }) => {
  const params = useParams<{ code: string }>();
  const rawCode = codeProp ?? params.code ?? '404';
  const code = isKnownCode(rawCode) ? rawCode : '404';
  const title = TITLES[code];

  return (
    <>
      <PageHeader
        eyebrow={`Erro ${code}`}
        title={title}
        desc={`Placeholder temporário — a página definitiva de erro será implementada na issue #7.`}
      />
      <Notice>
        <NoticeMark>placeholder</NoticeMark>
        Erro {code} — placeholder, será substituído em #7.
      </Notice>
    </>
  );
};
