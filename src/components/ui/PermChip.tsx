import React from 'react';
import styled from 'styled-components';

interface PermChipProps {
  children: string;
}

const StyledPermChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 9px;
  background: color-mix(in srgb, var(--success) 13%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent-ink);
`;

const PermResource = styled.span`
  color: var(--fg2);
`;

export const PermChip: React.FC<PermChipProps> = ({ children }) => {
  const colonIdx = children.indexOf(':');
  if (colonIdx === -1) {
    return <StyledPermChip>{children}</StyledPermChip>;
  }
  const prefix = children.slice(0, colonIdx + 1);
  const rest = children.slice(colonIdx + 1);
  return (
    <StyledPermChip>
      <PermResource>{prefix}</PermResource>
      {rest}
    </StyledPermChip>
  );
};
