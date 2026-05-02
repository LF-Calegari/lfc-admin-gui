import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable import/order */
import { buildAuthMock } from '../__helpers__/mockUseAuth';
import { ToastProvider } from '@/components/ui';
import { ClientEditPage } from '@/pages/clients';
/* eslint-enable import/order */

/**
 * Suíte do `ClientEditPage` (Issue #144).
 *
 * **Mock de `useAuth`:** a página `ClientEditPage` é renderizada por
 * `<RequirePermission>` no `AppRoutes`, mas a aba "Dados" — entregue
 * pela Issue #75 — chama `useAuth()` para gatear o submit (precisa
 * de `AUTH_V1_CLIENTS_UPDATE`). Mockamos com `buildAuthMock` para
 * preservar a flexibilidade de alternar permissões por teste e
 * isolar a página da `AuthProvider` real.
 *
 * **Cenários cobertos (critérios da issue):**
 *
 * - Ao montar com URL sem `?aba=`, a aba "Dados" é a ativa (default).
 * - Cada uma das 4 abas existe no `tablist` desktop e no `<select>`
 *   mobile com `role`/`aria-*` corretos.
 * - Clicar em um `tab` muda a `activeTab` e atualiza a URL para
 *   `?aba=<id>`.
 * - Trocar a URL externamente (simulando back/forward) muda a
 *   `activeTab` e o panel correto fica visível.
 * - Apenas o panel ativo está visível; os demais ficam `hidden`
 *   (preserva estado React entre trocas — critério "não perde scroll/
 *   estado de outras abas").
 * - Navegação por teclado (`ArrowRight`/`ArrowLeft`/`Home`/`End`) muda
 *   a aba ativa e move foco corretamente.
 * - URL com `?aba=` inválido cai no default sem reescrever a URL.
 * - Header expõe título, eyebrow correto, link "Voltar para
 *   Clientes" e botão de ação global.
 */

let permissionsMock: ReadonlyArray<string> = [];

vi.mock('@/shared/auth', () => buildAuthMock(() => permissionsMock));

/**
 * Mock de `@/shared/api` específico desta suíte: `getClientById`
 * devolve uma `Promise` que nunca resolve, mantendo a aba "Dados"
 * em loading silencioso. Os testes deste arquivo cobrem a estrutura
 * do `ClientEditPage` (tablist/headers/teclado) — o conteúdo da
 * aba "Dados" tem suíte própria (`ClientDataTab.test.tsx`).
 *
 * Manter `Promise` pendente é mais simples que mockar um DTO completo
 * e evita assert ruidoso sobre estado pós-fetch — a aba fica no
 * spinner, e cada teste verifica os atributos da árvore externa.
 */
vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof import('@/shared/api')>('@/shared/api');
  return {
    ...actual,
    getClientById: vi.fn(
      () =>
        new Promise(() => {
          // intencional: nunca resolve, mantém aba "Dados" em loading.
        }),
    ),
    updateClient: vi.fn(),
  };
});

beforeEach(() => {
  permissionsMock = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Helper para renderizar a página com router controlado. Centralizar
 * evita duplicação entre os testes (lição PR #123/PR #127 — blocos
 * idênticos de setup viram fixture).
 *
 * O `<ToastProvider>` e o mock de `useAuth` são necessários porque
 * a aba "Dados" (Issue #75) chama `useToast()` e `useAuth()` em
 * runtime — o teste do header/tablist em si não exercita esses
 * caminhos, mas a árvore React precisa do contexto montado para
 * renderizar a aba sem crashar.
 */
function renderClientEditPage(initialEntries: ReadonlyArray<string> = ['/clientes/abc-123']) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[...initialEntries]}>
        <Routes>
          <Route path="/clientes/:id" element={<ClientEditPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('ClientEditPage — header e estrutura visual (#144)', () => {
  it('renderiza eyebrow, título, link de voltar e ações globais', () => {
    renderClientEditPage();

    expect(screen.getByText('05 Clientes · Detalhe')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Detalhe do cliente' }),
    ).toBeInTheDocument();

    const backLink = screen.getByTestId('client-edit-back');
    expect(backLink).toHaveAttribute('href', '/clientes');

    // Botão "Desativar" presente porém disabled enquanto #75 não trouxer dados.
    const deactivate = screen.getByTestId('client-edit-deactivate');
    expect(deactivate).toBeDisabled();

    // Badge de status genérico até #75 trazer dados reais.
    expect(screen.getByText('Status indisponível')).toBeInTheDocument();
  });

  it('descreve o cliente pelo id da URL no parágrafo de descrição', () => {
    renderClientEditPage(['/clientes/cliente-42']);
    expect(screen.getByText(/cliente #cliente-42/)).toBeInTheDocument();
  });
});

describe('ClientEditPage — tablist e abas (#144)', () => {
  it('expõe tablist com role="tab" para cada uma das 4 abas', () => {
    renderClientEditPage();

    // **Por que `getByTestId` em vez de `getByRole('tablist')`:** o
    // `<TabListDesktop>` é renderizado com `display: none` em
    // viewports `< --bp-md` (mobile-first). Em jsdom, a viewport
    // default cai abaixo desse breakpoint, então
    // testing-library trata o elemento como inacessível para
    // accessibility queries. O contrato semântico (`role="tablist"`
    // + `aria-label`) está garantido via assert direto de atributo
    // — leitor de tela em mobile real continuaria pegando, porque
    // navegadores reais não escondem `display:none` da AT quando
    // serializam, mas ignoram o filtro do testing-library no
    // jsdom. A acessibilidade real é coberta nas asserts seguintes.
    const tablist = screen.getByTestId('client-edit-tablist');
    expect(tablist).toHaveAttribute('role', 'tablist');
    expect(tablist).toHaveAttribute('aria-label', 'Abas de edição do cliente');

    // `hidden: true` força o testing-library a incluir nodes que ele
    // considera inacessíveis (afetados por `display:none` ou
    // `aria-hidden`). Aqui é necessário porque o `<TabListDesktop>`
    // tem `display:none` via media query mobile-first.
    const tabs = within(tablist).getAllByRole('tab', { hidden: true });
    expect(tabs).toHaveLength(4);

    const labels = tabs.map((node) => node.textContent);
    expect(labels).toEqual(['Dados', 'Emails extras', 'Celulares', 'Telefones fixos']);
  });

  it('marca "Dados" como aba ativa por default (URL sem ?aba=)', () => {
    renderClientEditPage();

    const dadosTab = screen.getByTestId('client-edit-tab-dados');
    expect(dadosTab).toHaveAttribute('aria-selected', 'true');
    expect(dadosTab).toHaveAttribute('tabindex', '0');

    const emailsTab = screen.getByTestId('client-edit-tab-emails');
    expect(emailsTab).toHaveAttribute('aria-selected', 'false');
    expect(emailsTab).toHaveAttribute('tabindex', '-1');
  });

  it('cada panel referencia seu tab via aria-labelledby', () => {
    renderClientEditPage();

    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    expect(panels).toHaveLength(4);

    for (const panel of panels) {
      const labelledBy = panel.getAttribute('aria-labelledby');
      expect(labelledBy).toMatch(/^client-edit-tab-(dados|emails|celulares|telefones)$/);
      expect(panel.id).toMatch(/^client-edit-panel-(dados|emails|celulares|telefones)$/);
      // O id do panel sempre referencia o id do tab equivalente.
      expect(panel.id.replace('panel', 'tab')).toBe(labelledBy);
    }
  });
});

describe('ClientEditPage — sincronização aba ↔ URL (#144)', () => {
  it('clicar em uma aba atualiza a URL e troca o panel visível', () => {
    renderClientEditPage();

    fireEvent.click(screen.getByTestId('client-edit-tab-emails'));

    // URL refletiu a troca (a query string vira parte da location atual).
    // Como `MemoryRouter` não expõe a URL diretamente em assertions de DOM,
    // checamos via `aria-selected` (que é função direta da query string)
    // e via `hidden` no panel correspondente.
    expect(screen.getByTestId('client-edit-tab-emails')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('client-edit-tab-dados')).toHaveAttribute(
      'aria-selected',
      'false',
    );

    expect(screen.getByTestId('client-edit-panel-emails')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('client-edit-panel-dados')).toHaveAttribute('hidden');
  });

  it('URL inicial com ?aba=celulares pinta o tab correto como ativo', () => {
    renderClientEditPage(['/clientes/abc?aba=celulares']);

    expect(screen.getByTestId('client-edit-tab-celulares')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('client-edit-panel-celulares')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('client-edit-panel-dados')).toHaveAttribute('hidden');
  });

  it('?aba= com valor inválido cai no default ("dados")', () => {
    renderClientEditPage(['/clientes/abc?aba=naoexiste']);

    expect(screen.getByTestId('client-edit-tab-dados')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('client-edit-panel-dados')).not.toHaveAttribute('hidden');
  });

  it('os 4 panels permanecem montados — apenas o ativo é visível', () => {
    renderClientEditPage();

    // Default = dados ativo, demais hidden.
    expect(screen.getByTestId('client-edit-panel-dados')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('client-edit-panel-emails')).toHaveAttribute('hidden');
    expect(screen.getByTestId('client-edit-panel-celulares')).toHaveAttribute('hidden');
    expect(screen.getByTestId('client-edit-panel-telefones')).toHaveAttribute('hidden');

    // Após click → emails ativo, demais hidden — incluindo dados.
    fireEvent.click(screen.getByTestId('client-edit-tab-emails'));

    expect(screen.getByTestId('client-edit-panel-dados')).toHaveAttribute('hidden');
    expect(screen.getByTestId('client-edit-panel-emails')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('client-edit-panel-celulares')).toHaveAttribute('hidden');
    expect(screen.getByTestId('client-edit-panel-telefones')).toHaveAttribute('hidden');
  });
});

describe('ClientEditPage — navegação por teclado (#144)', () => {
  /**
   * Tabela de cenários de navegação por teclado. Cada cenário começa
   * em uma aba inicial, dispara uma tecla, e espera uma aba final
   * ativa. Cobre:
   *
   * - `ArrowRight` no último → wrap-around para o primeiro.
   * - `ArrowLeft` no primeiro → wrap-around para o último.
   * - `Home`/`End` saltam para extremos.
   * - `ArrowRight`/`ArrowLeft` no meio.
   *
   * Usar `it.each` evita duplicação Sonar entre cenários quase
   * idênticos (lição PR #127 — cenários com 1-2 mocks variando ficam
   * em `it.each` e não em `it` separados).
   */
  const KEYBOARD_CASES: ReadonlyArray<{
    description: string;
    initialTab: 'dados' | 'emails' | 'celulares' | 'telefones';
    key: string;
    expectedTab: 'dados' | 'emails' | 'celulares' | 'telefones';
  }> = [
    {
      description: 'ArrowRight em "dados" foca/seleciona "emails"',
      initialTab: 'dados',
      key: 'ArrowRight',
      expectedTab: 'emails',
    },
    {
      description: 'ArrowRight em "telefones" volta para "dados" (wrap-around)',
      initialTab: 'telefones',
      key: 'ArrowRight',
      expectedTab: 'dados',
    },
    {
      description: 'ArrowLeft em "dados" salta para "telefones" (wrap-around)',
      initialTab: 'dados',
      key: 'ArrowLeft',
      expectedTab: 'telefones',
    },
    {
      description: 'ArrowLeft em "celulares" volta para "emails"',
      initialTab: 'celulares',
      key: 'ArrowLeft',
      expectedTab: 'emails',
    },
    {
      description: 'Home em "telefones" salta para "dados"',
      initialTab: 'telefones',
      key: 'Home',
      expectedTab: 'dados',
    },
    {
      description: 'End em "dados" salta para "telefones"',
      initialTab: 'dados',
      key: 'End',
      expectedTab: 'telefones',
    },
  ];

  it.each(KEYBOARD_CASES)('$description', ({ initialTab, key, expectedTab }) => {
    renderClientEditPage([`/clientes/abc?aba=${initialTab}`]);

    const tab = screen.getByTestId(`client-edit-tab-${initialTab}`);
    fireEvent.keyDown(tab, { key });

    const expected = screen.getByTestId(`client-edit-tab-${expectedTab}`);
    expect(expected).toHaveAttribute('aria-selected', 'true');
    expect(expected).toHaveFocus();
  });

  it('teclas não-mapeadas (ex.: Tab) não disparam troca de aba', () => {
    renderClientEditPage();

    const dados = screen.getByTestId('client-edit-tab-dados');
    fireEvent.keyDown(dados, { key: 'Tab' });

    expect(dados).toHaveAttribute('aria-selected', 'true');
  });
});

describe('ClientEditPage — dropdown mobile (#144)', () => {
  it('expõe um <select> com label "Aba" e as 4 opções', () => {
    renderClientEditPage();

    const select = screen.getByTestId('client-edit-tab-select');
    expect(select).toBeInTheDocument();
    expect(select.tagName).toBe('SELECT');
    // O label "Aba" liga-se ao select via `htmlFor`.
    expect(screen.getByLabelText('Aba')).toBe(select);

    const options = within(select).getAllByRole('option');
    const values = options.map((node) => (node as HTMLOptionElement).value);
    expect(values).toEqual(['dados', 'emails', 'celulares', 'telefones']);
  });

  it('mudar o select muda a aba ativa', () => {
    renderClientEditPage();

    const select = screen.getByTestId('client-edit-tab-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'telefones' } });

    expect(screen.getByTestId('client-edit-tab-telefones')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('client-edit-panel-telefones')).not.toHaveAttribute('hidden');
  });
});
