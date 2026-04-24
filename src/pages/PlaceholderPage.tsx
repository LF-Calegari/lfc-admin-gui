import React from 'react';
import styled from 'styled-components';

import { PageHeader } from '../components/layout/PageHeader';

interface PlaceholderPageProps {
  eyebrow: string;
  title: string;
  desc: string;
}

const Notice = styled.div`
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 32px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg3);
  letter-spacing: 0.04em;
`;

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ eyebrow, title, desc }) => (
  <>
    <PageHeader eyebrow={eyebrow} title={title} desc={desc} />
    <Notice>Em desenvolvimento.</Notice>
  </>
);
