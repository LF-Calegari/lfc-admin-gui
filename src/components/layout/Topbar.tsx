import { Search, Bell, LogOut } from 'lucide-react';
import React from 'react';
import styled from 'styled-components';

interface TopbarUser {
  name: string;
  role?: string;
  permCount?: number;
}

interface TopbarProps {
  title: string;
  user?: TopbarUser;
  onLogout?: () => void;
}

const TopbarWrapper = styled.header`
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 18px 36px;
  border-bottom: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--bg-base) 88%, transparent);
  backdrop-filter: saturate(140%) blur(10px);
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
`;

const TopbarTitle = styled.h1`
  margin: 0;
  font-size: 15px;
  font-weight: var(--weight-medium);
  color: var(--fg2);
  letter-spacing: -0.01em;
`;

const TopbarRight = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const SearchBox = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 6px 10px;
  width: 320px;
  color: var(--fg3);
  transition:
    border-color 150ms var(--ease-default),
    box-shadow 150ms var(--ease-default);

  &:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(174, 202, 89, 0.22);
  }
`;

const SearchInput = styled.input`
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--fg1);
  flex: 1;
  min-width: 0;

  &::placeholder {
    color: var(--fg3);
  }
`;

const SearchKbd = styled.kbd`
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg3);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
`;

const IconButton = styled.button`
  appearance: none;
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  width: 34px;
  height: 34px;
  cursor: pointer;
  color: var(--fg2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 150ms var(--ease-default);

  &:hover:not(:disabled) {
    background: var(--bg-elevated);
    color: var(--fg1);
    border-color: var(--border-base);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
`;

const UserSection = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 10px;
  border-left: 1px solid var(--border-subtle);
  margin-left: 4px;
`;

const Avatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--clr-lime), var(--clr-green));
  color: var(--clr-forest);
  font-weight: var(--weight-bold);
  font-size: 13px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
`;

const UserMeta = styled.div``;

const UserName = styled.div`
  font-size: 13px;
  font-weight: var(--weight-medium);
  color: var(--fg1);
`;

const UserRole = styled.div`
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--fg3);
`;

export const Topbar: React.FC<TopbarProps> = ({ title, user, onLogout }) => {
  const initials = user?.name?.[0]?.toUpperCase() ?? 'A';
  const roleLabel = user ? `${user.role ?? 'root'} · ${user.permCount ?? 12} perms` : 'root · 12 perms';

  return (
    <TopbarWrapper>
      <TopbarTitle>{title}</TopbarTitle>
      <TopbarRight>
        <SearchBox>
          <Search size={14} strokeWidth={1.5} />
          <SearchInput
            placeholder="Buscar sistemas, usuários, permissões…"
            aria-label="Buscar no painel"
          />
          <SearchKbd>⌘K</SearchKbd>
        </SearchBox>
        <IconButton
          type="button"
          aria-label="Notificações (em breve)"
          title="Notificações (em breve)"
          disabled
          aria-disabled="true"
        >
          <Bell size={16} strokeWidth={1.5} />
        </IconButton>
        <UserSection>
          <Avatar>{initials}</Avatar>
          <UserMeta>
            <UserName>{user?.name ?? 'admin@lfc'}</UserName>
            <UserRole>{roleLabel}</UserRole>
          </UserMeta>
          <IconButton type="button" onClick={onLogout} title="Sair" aria-label="Sair">
            <LogOut size={16} strokeWidth={1.5} />
          </IconButton>
        </UserSection>
      </TopbarRight>
    </TopbarWrapper>
  );
};
