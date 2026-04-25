import React from 'react';
import styled from 'styled-components';

import { ShowcaseSection, Stack, TokenName, TokenValue } from './_shared';

/**
 * Issue #33 — Type Mono.
 *
 * Espelha `identity/preview/type-mono.html`. A fonte mono (`--font-mono`,
 * JetBrains Mono) é usada em:
 *   - Inline: identificadores, chaves, IDs, hashes dentro de texto.
 *   - Bloco: snippets de código, payloads, comandos.
 *
 * Esta seção apresenta:
 *   1. Big sample (estilo "label de permissão" — destaque tokenizado).
 *   2. Inline showcase (tag `<code>` em parágrafo de body).
 *   3. Bloco (tag `<pre>`) com snippet plausível do domínio.
 *
 * Tokens consumidos:
 *   - `--font-mono`, `--text-xs/sm/base/lg/2xl`, `--weight-*`,
 *     `--leading-*`, `--tracking-*`.
 *   - Cores: `--text-primary`, `--text-muted`, `--accent-ink`,
 *     `--bg-elevated`, `--border-subtle`.
 */

const SamplesGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
`;

const SampleCard = styled.figure`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-5);
  border: var(--border-thin) solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
`;

const CardTag = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--accent-ink);
`;

/* ─── 1. Big sample ───────────────────────────────────────── */

const MonoBig = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  color: var(--text-primary);
`;

const MonoEyebrow = styled.span`
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-widest);
  text-transform: uppercase;
  color: var(--accent-ink);
`;

const MonoAlphabet = styled.p`
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: var(--tracking-wide);
`;

/* ─── 2. Inline ───────────────────────────────────────────── */

/**
 * Texto de body com `<code>` inline. O parágrafo usa tokens de body
 * habituais; só o `<code>` aplica `--font-mono` e fundo discreto.
 */
const InlineParagraph = styled.p`
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: var(--leading-base);
  color: var(--text-primary);

  > code {
    font-family: var(--font-mono);
    font-size: 0.92em;
    padding: 0.1em 0.4em;
    border-radius: var(--radius-sm);
    background: var(--bg-overlay);
    color: var(--accent-ink);
    border: var(--border-thin) solid var(--border-subtle);
  }
`;

/* ─── 3. Bloco ────────────────────────────────────────────── */

/**
 * Bloco `<pre>` para snippets longos. Mantém quebras de linha,
 * permite scroll horizontal em telas estreitas e aplica cor neutra
 * para não competir com o conteúdo da página.
 */
const CodeBlock = styled.pre`
  margin: 0;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  border: var(--border-thin) solid var(--border-subtle);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
  color: var(--text-primary);
  overflow-x: auto;
  white-space: pre;

  /* Realce semântico mínimo para tornar o snippet legível sem depender
     de uma lib de syntax highlighting. */
  .key {
    color: var(--accent-ink);
    font-weight: var(--weight-semibold);
  }

  .str {
    color: var(--text-secondary);
  }

  .num {
    color: var(--info);
  }

  .com {
    color: var(--text-muted);
    font-style: italic;
  }
`;

const SpecRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  padding-top: var(--space-3);
  border-top: var(--border-thin) solid var(--border-subtle);
`;

const SpecItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
`;

export const TypeMono: React.FC = () => (
  <ShowcaseSection
    eyebrow="Typography"
    title="Mono"
    description="Fonte monoespaçada (--font-mono / JetBrains Mono) para identificadores, IDs, hashes e blocos de código. Usada inline em texto corrido e em blocos preformatados."
    ariaLabel="Type Mono"
  >
    <SamplesGrid>
      {/* 1. Big sample — label de permissão / hash em destaque */}
      <SampleCard aria-label="Mono big sample">
        <CardTag>JetBrains Mono · Code / Labels</CardTag>
        <Stack>
          <MonoBig>perm:Systems.Create</MonoBig>
          <MonoEyebrow>PERMISSÕES · ROLES · TOKEN</MonoEyebrow>
          <MonoAlphabet>
            Aa Bb Cc 0 1 2 3 4 5 6 7 8 9 · {'{ } ( ) < / >'} · 400 500 600
          </MonoAlphabet>
        </Stack>
        <SpecRow>
          <SpecItem>
            <TokenName>--font-mono</TokenName>
            <TokenValue>JetBrains Mono</TokenValue>
          </SpecItem>
          <SpecItem>
            <TokenName>--text-2xl</TokenName>
            <TokenValue>2rem · 32px</TokenValue>
          </SpecItem>
          <SpecItem>
            <TokenName>--weight-semibold</TokenName>
            <TokenValue>600</TokenValue>
          </SpecItem>
        </SpecRow>
      </SampleCard>

      {/* 2. Inline — uso em parágrafo de body */}
      <SampleCard aria-label="Mono inline sample">
        <CardTag>Inline · uso em body</CardTag>
        <InlineParagraph>
          O endpoint <code>GET /api/v1/systems</code> retorna o catálogo de
          sistemas; cada item traz o identificador <code>system_id</code> (uuid
          v4) e o slug <code>perm:Systems.Read</code> usado nas permissões
          efetivas.
        </InlineParagraph>
        <InlineParagraph>
          Para autenticar use o header <code>Authorization: Bearer &lt;jwt&gt;</code> e
          observe o claim <code>sub</code> com o hash{' '}
          <code>9f3a2c1b8d4e5f60</code>.
        </InlineParagraph>
        <SpecRow>
          <SpecItem>
            <TokenName>--font-mono</TokenName>
            <TokenValue>inline em body</TokenValue>
          </SpecItem>
          <SpecItem>
            <TokenName>--bg-overlay</TokenName>
            <TokenValue>fundo do chip</TokenValue>
          </SpecItem>
          <SpecItem>
            <TokenName>--accent-ink</TokenName>
            <TokenValue>cor do código</TokenValue>
          </SpecItem>
        </SpecRow>
      </SampleCard>

      {/* 3. Bloco — snippet preformatado */}
      <SampleCard aria-label="Mono block sample">
        <CardTag>Block · snippet preformatado</CardTag>
        <CodeBlock>
          <span className="com">{'// payload de criação de role'}</span>
          {'\n'}
          {'{'}
          {'\n'}
          {'  '}
          <span className="key">&quot;name&quot;</span>:{' '}
          <span className="str">&quot;catalog_admin&quot;</span>,{'\n'}
          {'  '}
          <span className="key">&quot;system_id&quot;</span>:{' '}
          <span className="str">
            &quot;9f3a2c1b-8d4e-5f60-a1b2-c3d4e5f60718&quot;
          </span>
          ,{'\n'}
          {'  '}
          <span className="key">&quot;permissions&quot;</span>: [{'\n'}
          {'    '}
          <span className="str">&quot;perm:Systems.Read&quot;</span>,{'\n'}
          {'    '}
          <span className="str">&quot;perm:Systems.Create&quot;</span>,{'\n'}
          {'    '}
          <span className="str">&quot;perm:Routes.Manage&quot;</span>
          {'\n'}
          {'  '}],{'\n'}
          {'  '}
          <span className="key">&quot;active&quot;</span>:{' '}
          <span className="num">true</span>
          {'\n'}
          {'}'}
        </CodeBlock>
        <SpecRow>
          <SpecItem>
            <TokenName>--font-mono</TokenName>
            <TokenValue>JetBrains Mono</TokenValue>
          </SpecItem>
          <SpecItem>
            <TokenName>--text-sm</TokenName>
            <TokenValue>0.8125rem · 13px</TokenValue>
          </SpecItem>
          <SpecItem>
            <TokenName>--leading-snug</TokenName>
            <TokenValue>1.4</TokenValue>
          </SpecItem>
        </SpecRow>
      </SampleCard>
    </SamplesGrid>
  </ShowcaseSection>
);
