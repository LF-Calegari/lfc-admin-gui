import React from 'react';

import { ClientEditTabPlaceholder } from './ClientEditTabPlaceholder';

/**
 * Aba "Dados" do `ClientEditPage` (Issue #144).
 *
 * Atualmente renderiza placeholder porque o conteúdo real (CPF/CNPJ,
 * nome/razão social, tipo imutável) é corpo da Issue #75 — companion
 * desta. Quando #75 for entregue, o conteúdo deste arquivo será
 * substituído pelo formulário real, mantendo a interface
 * (`React.FC` sem props) — o `ClientEditPage` já passa contexto via
 * URL (`useParams<{ id }>`) e hooks próprios da aba.
 *
 * Manter cada aba como componente próprio (em vez de inline no
 * `ClientEditPage`) preserva a fronteira clara entre o **container de
 * abas** (escopo de #144) e o **conteúdo de cada aba** (escopo das
 * sub-issues). Cada aba é "pluggável" — quando #75 ficar pronta,
 * substitui-se este arquivo sem tocar no container.
 */
export const ClientDataTab: React.FC = () => (
  <ClientEditTabPlaceholder
    title="Dados do cliente"
    description="CPF/CNPJ, nome/razão social e tipo (PF/PJ). Será habilitado pela Issue #75."
  />
);
