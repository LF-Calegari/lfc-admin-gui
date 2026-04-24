/* global React */
const { useState } = React;

/* ── Data ───────────────────────────────────────────────── */
const SYSTEMS = [
  { id: 'sys_a1b2c3', name: 'lfc-authenticator', stack: 'ASP.NET Core · PostgreSQL', status: 'active',    routes: 42, tokens: 128 },
  { id: 'sys_d4e5f6', name: 'lfc-kurtto',        stack: 'Node.js · TypeScript',      status: 'verifying', routes: 14, tokens: 22  },
  { id: 'sys_g7h8i9', name: 'lfc-reportd',       stack: 'Go · ClickHouse',           status: 'active',    routes: 8,  tokens: 41  },
  { id: 'sys_j0k1l2', name: 'lfc-legacy-bridge', stack: 'Python · MySQL',            status: 'inactive',  routes: 3,  tokens: 0   },
];

const USERS = [
  { email: 'admin@lfc.com.br', role: 'root',    perms: 12, status: 'active',    last: 'há 2 min'   },
  { email: 'ops@lfc.com.br',   role: 'admin',   perms: 8,  status: 'active',    last: 'há 47 min'  },
  { email: 'dev@lfc.com.br',   role: 'editor',  perms: 5,  status: 'active',    last: 'há 3 h'     },
  { email: 'audit@lfc.com.br', role: 'viewer',  perms: 2,  status: 'verifying', last: 'há 1 d'     },
  { email: 'legacy@lfc.com.br',role: 'default', perms: 3,  status: 'inactive',  last: 'há 14 dias' },
];

const NAV = [
  { id: 'systems', num: '01', label: 'Sistemas',    icon: 'monitor' },
  { id: 'users',   num: '02', label: 'Usuários',    icon: 'user' },
  { id: 'roles',   num: '03', label: 'Roles',       icon: 'users' },
  { id: 'perms',   num: '04', label: 'Permissões',  icon: 'lock' },
  { id: 'tokens',  num: '05', label: 'Tokens',      icon: 'activity' },
  { id: 'settings',num: '06', label: 'Configurações',icon: 'settings' },
];

const statusBadge = (s) => {
  const map = { active: ['success', 'Ativo'], inactive: ['danger', 'Inativo'], verifying: ['info', 'Verificando'] };
  const [v, l] = map[s] || map.active;
  return <span className={`m-badge m-badge--${v} m-badge--dot`}>{l}</span>;
};

const i = (name) => <i data-lucide={name} />;

/* ── MobileApp shell ───────────────────────────────────── */
function MobileApp({ initial = 'systems' }) {
  const [screen, setScreen] = useState(initial === 'detail' ? 'systems' : initial);
  const [drawer, setDrawer] = useState(false);
  const [selectedSys, setSelectedSys] = useState(initial === 'detail' ? SYSTEMS[0] : null);
  const [sheet, setSheet] = useState(null); // user object for actions sheet
  const [toast, setToast] = useState(null);

  React.useEffect(() => { if (window.lucide) lucide.createIcons(); });
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const go = (id) => { setScreen(id); setSelectedSys(null); setDrawer(false); };

  const currentLabel = NAV.find(n => n.id === screen)?.label || 'Admin';

  let body;
  if (selectedSys) body = <SystemDetail sys={selectedSys} onBack={() => setSelectedSys(null)} onToast={setToast} />;
  else if (screen === 'systems') body = <SystemsScreen onOpen={setSelectedSys} onToast={setToast} />;
  else if (screen === 'users')   body = <UsersScreen onAction={setSheet} />;
  else if (screen === 'roles')   body = <SimpleListScreen title="Roles" sub="Grupos de permissões" items={[
    { n: 'root', m: '12 permissões · 2 usuários' },
    { n: 'admin', m: '8 permissões · 6 usuários' },
    { n: 'editor', m: '5 permissões · 14 usuários' },
    { n: 'viewer', m: '2 permissões · 32 usuários' },
  ]} />;
  else if (screen === 'perms')   body = <PermsScreen />;
  else if (screen === 'tokens')  body = <TokensScreen />;
  else                           body = <SettingsScreen />;

  return (
    <div className="m">
      {/* topbar */}
      <div className="m-top">
        <button className="m-iconbtn" onClick={() => setDrawer(true)} aria-label="Menu">{i('menu')}</button>
        <div style={{ textAlign: 'center' }}>
          <div className="m-top__sub">Admin · v1</div>
          <div className="m-top__title">{selectedSys ? selectedSys.name : currentLabel}</div>
        </div>
        <button className="m-iconbtn m-iconbtn--ghost" aria-label="Buscar">{i('search')}</button>
      </div>

      {/* body */}
      <div className="m-body">{body}</div>

      {/* FAB on list screens */}
      {!selectedSys && (screen === 'systems' || screen === 'users') && (
        <button className="m-fab" onClick={() => setToast({ v: 'success', t: screen === 'systems' ? 'Novo sistema' : 'Convidar usuário', m: 'Fluxo de criação aberto.' })} aria-label="Novo">
          {i('plus')}
        </button>
      )}

      {/* bottom tabs */}
      <div className="m-tabs">
        {[
          { id: 'systems', label: 'Sistemas', icon: 'monitor' },
          { id: 'users',   label: 'Usuários', icon: 'user'    },
          { id: 'perms',   label: 'Perms',    icon: 'lock'    },
          { id: 'tokens',  label: 'Tokens',   icon: 'activity'},
          { id: 'settings',label: 'Mais',     icon: 'more-horizontal' },
        ].map(t => (
          <button key={t.id}
            className={`m-tab ${screen === t.id && !selectedSys ? 'm-tab--active' : ''}`}
            onClick={() => go(t.id)}>
            {i(t.icon)}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* drawer */}
      {drawer && (
        <>
          <div className="m-drawer__backdrop" onClick={() => setDrawer(false)} />
          <div className="m-drawer">
            <div className="m-drawer__head">
              <div className="m-drawer__user">
                <div className="m-drawer__avatar">A</div>
                <div>
                  <div className="m-drawer__name">admin@lfc.com.br</div>
                  <div className="m-drawer__role">root · 12 perms</div>
                </div>
              </div>
            </div>
            <nav className="m-drawer__nav">
              {NAV.map(n => (
                <a key={n.id}
                   className={`m-drawer__link ${screen === n.id ? 'active' : ''}`}
                   onClick={() => go(n.id)}>
                  <span className="m-drawer__num">{n.num}</span>
                  {i(n.icon)}
                  <span>{n.label}</span>
                </a>
              ))}
            </nav>
            <div className="m-drawer__foot">tokenVersion: 12 · expira em 14 min</div>
          </div>
        </>
      )}

      {/* action sheet */}
      {sheet && (
        <>
          <div className="m-sheet__backdrop" onClick={() => setSheet(null)} />
          <div className="m-sheet">
            <div className="m-sheet__grab" />
            <div className="m-sheet__title">{sheet.email}</div>
            <div className="m-sheet__meta">role: {sheet.role} · {sheet.perms} permissões</div>
            <div className="m-sheet__row" onClick={() => { setSheet(null); setToast({ v: 'success', t: 'Role atualizada', m: `${sheet.email} agora é admin.` }); }}>
              {i('shield')} Alterar role
            </div>
            <div className="m-sheet__row" onClick={() => { setSheet(null); setToast({ v: 'info', t: 'Link enviado', m: 'E-mail de redefinição enviado.' }); }}>
              {i('key')} Redefinir senha
            </div>
            <div className="m-sheet__row" onClick={() => { setSheet(null); setToast({ v: 'info', t: 'Sessões revogadas', m: 'tokenVersion incrementado.' }); }}>
              {i('log-out')} Revogar sessões
            </div>
            <div className="m-sheet__divider" />
            <div className="m-sheet__row m-sheet__row--danger" onClick={() => { setSheet(null); setToast({ v: 'danger', t: 'Usuário desativado', m: `${sheet.email} sem acesso.` }); }}>
              {i('user-x')} Desativar usuário
            </div>
          </div>
        </>
      )}

      {/* toast */}
      {toast && <MobileToast toast={toast} />}
    </div>
  );
}

/* ── Screens ───────────────────────────────────────────── */

function SystemsScreen({ onOpen }) {
  return (
    <>
      <div className="m-eyebrow">01 Sistemas</div>
      <div className="m-sec-head">
        <div>
          <h2>Sistemas</h2>
          <p>Serviços registrados no ecossistema.</p>
        </div>
      </div>

      <div className="m-search">{i('search')}<input placeholder="Buscar por nome, stack…" /></div>

      <div className="m-stats">
        <div className="m-stat"><div className="m-stat__n">4</div><div className="m-stat__l">Sistemas</div></div>
        <div className="m-stat"><div className="m-stat__n">67</div><div className="m-stat__l">Rotas</div></div>
        <div className="m-stat"><div className="m-stat__n">191</div><div className="m-stat__l">Tokens</div></div>
      </div>

      <div className="m-list">
        {SYSTEMS.map(s => (
          <div key={s.id} className="m-row" onClick={() => onOpen(s)}>
            <div className={`m-row__avatar ${s.status === 'active' ? 'm-row__avatar--lime' : s.status === 'verifying' ? 'm-row__avatar--hunter' : ''}`}>
              {s.name.split('-')[1]?.[0]?.toUpperCase() || 'L'}
            </div>
            <div className="m-row__body">
              <div className="m-row__title">{s.name}</div>
              <div className="m-row__meta">
                <span>{s.routes} rotas</span><span className="dot" />
                <span>{s.tokens} tokens</span><span className="dot" />
                {statusBadge(s.status)}
              </div>
            </div>
            <span className="m-row__chev">{i('chevron-right')}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function SystemDetail({ sys, onBack, onToast }) {
  return (
    <>
      <button className="m-btn m-btn--secondary" style={{ width: 'auto', marginBottom: 14, padding: '6px 10px', minHeight: 32, fontSize: 13 }} onClick={onBack}>
        {i('arrow-left')} Voltar
      </button>

      <div className="m-hero">
        <div className="m-hero__eyebrow">Sistema · {sys.id}</div>
        <div className="m-hero__title">{sys.name}</div>
        <div className="m-hero__meta">{sys.stack}</div>
        <div className="m-hero__badges">
          <span className="m-badge m-badge--dot">{sys.status === 'active' ? 'Ativo' : sys.status === 'inactive' ? 'Inativo' : 'Verificando'}</span>
          <span className="m-badge">v1.0</span>
        </div>
      </div>

      <div className="m-alert m-alert--info">
        <span className="m-alert__icon">{i('info')}</span>
        <div>
          <div className="m-alert__title">3 rotas aguardando aprovação</div>
          <div className="m-alert__msg">Descobertas no último deploy.</div>
        </div>
      </div>

      <div className="m-sec-sub">Métricas</div>
      <div className="m-card">
        <div className="m-kv"><span className="m-kv__k">Rotas</span><span className="m-kv__v">{sys.routes}</span></div>
        <div className="m-kv"><span className="m-kv__k">Tokens ativos</span><span className="m-kv__v">{sys.tokens}</span></div>
        <div className="m-kv"><span className="m-kv__k">Último token</span><span className="m-kv__v">há 2 min</span></div>
        <div className="m-kv"><span className="m-kv__k">Criado em</span><span className="m-kv__v">2025-09-12</span></div>
      </div>

      <div className="m-sec-sub">Permissões</div>
      <div className="m-card">
        <div className="m-perm-wrap">
          <span className="m-perm"><span className="m-perm__res">perm:</span>Systems.Read</span>
          <span className="m-perm"><span className="m-perm__res">perm:</span>Systems.Update</span>
          <span className="m-perm"><span className="m-perm__res">perm:</span>Systems.Delete</span>
          <span className="m-perm"><span className="m-perm__res">perm:</span>Routes.List</span>
          <span className="m-perm"><span className="m-perm__res">perm:</span>Routes.Register</span>
          <span className="m-perm"><span className="m-perm__res">perm:</span>Tokens.Issue</span>
        </div>
      </div>

      <div className="m-cta-row">
        <button className="m-btn m-btn--secondary" onClick={() => onToast({ v: 'info', t: 'Editando', m: 'Modo edição aberto.' })}>Editar</button>
        <button className="m-btn m-btn--danger" onClick={() => onToast({ v: 'danger', t: 'Sistema desativado', m: `${sys.name} sem acesso.` })}>Desativar</button>
      </div>
    </>
  );
}

function UsersScreen({ onAction }) {
  return (
    <>
      <div className="m-eyebrow">02 Usuários</div>
      <div className="m-sec-head">
        <div>
          <h2>Usuários</h2>
          <p>Contas com acesso a ≥1 sistema.</p>
        </div>
      </div>

      <div className="m-search">{i('search')}<input placeholder="Buscar por e-mail…" /></div>

      <div className="m-alert m-alert--warn">
        <span className="m-alert__icon">{i('alert-triangle')}</span>
        <div>
          <div className="m-alert__title">1 usuário inativo</div>
          <div className="m-alert__msg">Última sessão há 14 dias.</div>
        </div>
      </div>

      <div className="m-list">
        {USERS.map(u => (
          <div key={u.email} className="m-row" onClick={() => onAction(u)}>
            <div className="m-row__avatar">{u.email[0].toUpperCase()}</div>
            <div className="m-row__body">
              <div className="m-row__title">{u.email}</div>
              <div className="m-row__meta">
                <span>{u.role}</span><span className="dot" />
                <span>{u.perms} perms</span><span className="dot" />
                {statusBadge(u.status)}
              </div>
            </div>
            <span className="m-row__chev">{i('more-vertical')}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function SimpleListScreen({ title, sub, items }) {
  return (
    <>
      <div className="m-eyebrow">{title}</div>
      <div className="m-sec-head">
        <div><h2>{title}</h2><p>{sub}</p></div>
      </div>
      <div className="m-list">
        {items.map(it => (
          <div key={it.n} className="m-row">
            <div className="m-row__avatar m-row__avatar--lime">{it.n[0].toUpperCase()}</div>
            <div className="m-row__body">
              <div className="m-row__title">{it.n}</div>
              <div className="m-row__meta">{it.m}</div>
            </div>
            <span className="m-row__chev">{i('chevron-right')}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function PermsScreen() {
  const groups = [
    { res: 'Systems', actions: ['Create','Read','Update','Delete'] },
    { res: 'Users',   actions: ['Create','Read','Update','Delete','Invite'] },
    { res: 'Roles',   actions: ['Create','Assign','Read'] },
    { res: 'Tokens',  actions: ['Issue','Revoke','Inspect'] },
  ];
  return (
    <>
      <div className="m-eyebrow">04 Permissões</div>
      <div className="m-sec-head">
        <div><h2>Permissões</h2><p>Modelo Resource.Action.</p></div>
      </div>
      {groups.map(g => (
        <div className="m-card" key={g.res}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>{g.res}</span>
            <span className="m-row__meta">{g.actions.length} ações</span>
          </div>
          <div className="m-perm-wrap">
            {g.actions.map(a => (
              <span key={a} className="m-perm"><span className="m-perm__res">perm:</span>{g.res}.{a}</span>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function TokensScreen() {
  const tokens = [
    { jti: 'jti_8Jk2Lm', user: 'admin@lfc.com.br',  sys: 'lfc-authenticator', exp: 'expira em 14 min', active: true },
    { jti: 'jti_3Np7Qr', user: 'ops@lfc.com.br',    sys: 'lfc-authenticator', exp: 'expira em 47 min', active: true },
    { jti: 'jti_0Wx9Yz', user: 'dev@lfc.com.br',    sys: 'lfc-kurtto',        exp: 'expirado',         active: false },
  ];
  return (
    <>
      <div className="m-eyebrow">05 Tokens</div>
      <div className="m-sec-head">
        <div><h2>Sessões ativas</h2><p>JWTs emitidos.</p></div>
      </div>
      <div className="m-list">
        {tokens.map(t => (
          <div key={t.jti} className="m-row">
            <div className="m-row__avatar m-row__avatar--hunter">{i('activity')}</div>
            <div className="m-row__body">
              <div className="m-row__title" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{t.jti}</div>
              <div className="m-row__meta">
                <span>{t.user}</span><span className="dot" />
                <span>{t.exp}</span>
              </div>
            </div>
            {t.active
              ? <span className="m-badge m-badge--success m-badge--dot">Ativo</span>
              : <span className="m-badge m-badge--danger m-badge--dot">Exp.</span>}
          </div>
        ))}
      </div>
    </>
  );
}

function SettingsScreen() {
  return (
    <>
      <div className="m-eyebrow">06 Configurações</div>
      <div className="m-sec-head">
        <div><h2>Configurações</h2><p>Sessão e preferências.</p></div>
      </div>
      <div className="m-card">
        <div className="m-kv"><span className="m-kv__k">tokenVersion</span><span className="m-kv__v">12</span></div>
        <div className="m-kv"><span className="m-kv__k">Expira em</span><span className="m-kv__v">14 min</span></div>
        <div className="m-kv"><span className="m-kv__k">Auto-refresh</span><span className="m-badge m-badge--success m-badge--dot">Ativo</span></div>
      </div>
      <div className="m-cta-row" style={{ flexDirection: 'column' }}>
        <button className="m-btn m-btn--secondary">Renovar token</button>
        <button className="m-btn m-btn--danger">Sair de todas as sessões</button>
      </div>
    </>
  );
}

/* ── Toast (top, mobile) ───────────────────────────────── */
function MobileToast({ toast }) {
  const color = toast.v === 'success' ? 'var(--clr-green)' : toast.v === 'danger' ? 'var(--danger)' : 'var(--info)';
  const icon = toast.v === 'success' ? 'check' : toast.v === 'danger' ? 'alert-circle' : 'info';
  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, right: 12,
      background: 'var(--bg-surface)',
      border: `1px solid ${color}`,
      borderRadius: 12,
      padding: '10px 12px',
      display: 'grid', gridTemplateColumns: '26px 1fr', gap: 10,
      boxShadow: '0 10px 24px rgba(22,36,15,0.16)',
      zIndex: 50,
      animation: 'm-toast-in 280ms cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      <span style={{
        width: 26, height: 26, borderRadius: 7, background: color,
        display: 'grid', placeItems: 'center',
      }}><i data-lucide={icon} style={{ width: 13, height: 13, color: 'white' }} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: -0.005 }}>{toast.t}</div>
        <div style={{ fontSize: 12.5, color: 'var(--fg2)', marginTop: 1 }}>{toast.m}</div>
      </div>
      <style>{`@keyframes m-toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

Object.assign(window, { MobileApp });
