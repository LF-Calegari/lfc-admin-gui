/* global React, Icon, Badge */
const { useState } = React;

const NAV = [
  { id: 'systems',    num: '01', label: 'Sistemas',    icon: 'monitor' },
  { id: 'routes',     num: '02', label: 'Rotas',       icon: 'shuffle' },
  { id: 'roles',      num: '03', label: 'Roles',       icon: 'users' },
  { id: 'perms',      num: '04', label: 'Permissões',  icon: 'lock' },
  { id: 'users',      num: '05', label: 'Usuários',    icon: 'user' },
  { id: 'tokens',     num: '06', label: 'Tokens',      icon: 'activity' },
  { id: 'settings',   num: '07', label: 'Configurações', icon: 'settings' },
];

const Sidebar = ({ current, onNav }) => (
  <aside className="lfc-sidebar">
    <div className="lfc-sidebar__logo">
      <img src="../../assets/logo-dark.svg" alt="authenticator" height="28" />
    </div>
    <div className="lfc-sidebar__label">Admin Panel</div>
    <nav className="lfc-sidebar__nav">
      {NAV.map(item => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={current === item.id ? 'lfc-nav-link lfc-nav-link--active' : 'lfc-nav-link'}
          onClick={e => { e.preventDefault(); onNav(item.id); }}
        >
          <span className="lfc-nav-num">{item.num}</span>
          <Icon name={item.icon} size={15} />
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
    <div className="lfc-sidebar__foot">
      <div>v1.0 · LF Calegari</div>
      <div style={{ color: 'var(--accent-ink)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>tokenVersion: 12</div>
    </div>
  </aside>
);

const Topbar = ({ title, user, onLogout }) => (
  <header className="lfc-topbar">
    <div className="lfc-topbar__title">
      <h1 className="lfc-topbar__h">{title}</h1>
    </div>
    <div className="lfc-topbar__right">
      <div className="lfc-topbar__search">
        <Icon name="search" size={14} />
        <input placeholder="Buscar sistemas, usuários, permissões…" />
        <kbd>⌘K</kbd>
      </div>
      <button className="lfc-topbar__btn" title="Notificações"><Icon name="bell" size={16} /></button>
      <div className="lfc-topbar__user">
        <div className="lfc-topbar__avatar">{user?.name?.[0] || 'A'}</div>
        <div className="lfc-topbar__user-meta">
          <div className="lfc-topbar__user-name">{user?.name || 'admin@lfc'}</div>
          <div className="lfc-topbar__user-role">root · 12 perms</div>
        </div>
        <button className="lfc-topbar__btn" onClick={onLogout} title="Sair"><Icon name="log-out" size={16} /></button>
      </div>
    </div>
  </header>
);

const PageHeader = ({ eyebrow, title, desc, actions }) => (
  <div className="lfc-page-head">
    <div>
      {eyebrow && <div className="lfc-eyebrow lfc-eyebrow--accent">{eyebrow}</div>}
      <h2 className="lfc-page-head__title">{title}</h2>
      {desc && <p className="lfc-page-head__desc">{desc}</p>}
    </div>
    {actions && <div className="lfc-page-head__actions">{actions}</div>}
  </div>
);

Object.assign(window, { Sidebar, Topbar, PageHeader, NAV });
