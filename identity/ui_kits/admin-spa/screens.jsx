/* global React, Button, Badge, PermChip, Input, Card, Alert, Icon, Eyebrow, PageHeader */
const { useState } = React;

/* ── LOGIN ─────────────────────────────────────────────── */
const LoginScreen = ({ onLogin }) => {
  const [email, setEmail] = useState('admin@lfc.com.br');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const submit = e => {
    e.preventDefault();
    if (!pw) { setErr('Informe a senha.'); return; }
    if (pw.length < 4) { setErr('Senha incorreta.'); return; }
    onLogin({ name: email });
  };
  return (
    <div className="lfc-login">
      <div className="lfc-login__grid" />
      <div className="lfc-login__card">
        <img src="../../assets/logo-dark.svg" alt="authenticator" height="36" style={{ marginBottom: 28 }} />
        <Eyebrow accent>Identity · v1.0</Eyebrow>
        <h1 className="lfc-login__h">Entrar no painel</h1>
        <p className="lfc-login__sub">Acesso restrito a administradores do ecossistema LFC.</p>
        <form onSubmit={submit} className="lfc-login__form">
          <Input label="E-mail" value={email} onChange={setEmail} icon="at-sign" />
          <Input label="Senha" type="password" value={pw} onChange={v => { setPw(v); setErr(''); }} error={err} icon="lock" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Button type="submit" variant="primary" size="lg">Entrar</Button>
            <Button variant="ghost">Esqueci a senha</Button>
          </div>
        </form>
        <div className="lfc-login__meta">
          <span>JWT · tokenVersion assinado</span>
          <span className="lfc-mono">v1.0 · {new Date().toISOString().slice(0,10)}</span>
        </div>
      </div>
    </div>
  );
};

/* ── SYSTEMS ───────────────────────────────────────────── */
const initialSystems = [
  { id: 'sys_a1b2c3', name: 'lfc-authenticator', stack: 'ASP.NET Core 10 · PostgreSQL', status: 'active',   routes: 42, tokens: 128 },
  { id: 'sys_d4e5f6', name: 'lfc-kurtto',        stack: 'Node.js · TypeScript · PostgreSQL', status: 'verifying', routes: 14, tokens: 22 },
  { id: 'sys_g7h8i9', name: 'lfc-reportd',       stack: 'Go 1.22 · ClickHouse',              status: 'active',    routes: 8,  tokens: 41 },
  { id: 'sys_j0k1l2', name: 'lfc-legacy-bridge', stack: 'Python 3.12 · MySQL',               status: 'inactive',  routes: 3,  tokens: 0  },
];

const StatusBadge = ({ s }) => {
  const map = { active: ['success', 'Ativo'], inactive: ['danger', 'Inativo'], verifying: ['info', 'Verificando'], pending: ['warning', 'Pendente'] };
  const [v, l] = map[s] || map.active;
  return <Badge variant={v} dot>{l}</Badge>;
};

const SystemsScreen = ({ onCreate, onOpen, systems, toast }) => (
  <>
    {toast && <Alert variant={toast.variant}>{toast.msg}</Alert>}
    <PageHeader
      eyebrow="06 Sistemas"
      title="Sistemas cadastrados"
      desc="Serviços registrados no ecossistema de autenticação. Cada sistema possui suas próprias rotas, roles e permissões."
      actions={
        <>
          <Button variant="secondary" icon="filter">Filtrar</Button>
          <Button variant="primary" icon="plus" onClick={onCreate}>Novo sistema</Button>
        </>
      }
    />

    <div className="lfc-stat-row">
      <div className="lfc-stat"><div className="lfc-stat__n">4</div><div className="lfc-stat__l">Sistemas</div></div>
      <div className="lfc-stat"><div className="lfc-stat__n">67</div><div className="lfc-stat__l">Rotas totais</div></div>
      <div className="lfc-stat"><div className="lfc-stat__n">191</div><div className="lfc-stat__l">Tokens ativos</div></div>
      <div className="lfc-stat"><div className="lfc-stat__n">1</div><div className="lfc-stat__l">Inativo</div></div>
    </div>

    <div className="lfc-grid-2">
      {systems.map(s => (
        <Card
          key={s.id}
          title={s.name}
          right={<StatusBadge s={s.status} />}
          onClick={() => onOpen(s)}
        >
          <div className="lfc-card__meta">{s.stack}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <PermChip>perm:Systems.Read</PermChip>
            <PermChip>perm:Routes.List</PermChip>
          </div>
          <div className="lfc-card__stats">
            <span><Icon name="shuffle" size={12} /> {s.routes} rotas</span>
            <span><Icon name="activity" size={12} /> {s.tokens} tokens</span>
            <span className="lfc-mono lfc-muted">{s.id}</span>
          </div>
        </Card>
      ))}
    </div>
  </>
);

/* ── CREATE SYSTEM MODAL ───────────────────────────────── */
const CreateSystemModal = ({ onClose, onSave }) => {
  const [name, setName] = useState('');
  const [stack, setStack] = useState('Node.js · TypeScript');
  return (
    <div className="lfc-modal__backdrop" onClick={onClose}>
      <div className="lfc-modal" onClick={e => e.stopPropagation()}>
        <div className="lfc-modal__head">
          <h3>Novo sistema</h3>
          <button className="lfc-icon-btn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="lfc-modal__body">
          <Input label="Nome do sistema" value={name} onChange={setName} placeholder="lfc-novo-servico" />
          <Input label="Stack técnica" value={stack} onChange={setStack} />
          <div className="lfc-eyebrow" style={{ marginTop: 4 }}>Permissões iniciais</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <PermChip>perm:Systems.Read</PermChip>
            <PermChip>perm:Systems.Update</PermChip>
            <PermChip>perm:Routes.List</PermChip>
          </div>
        </div>
        <div className="lfc-modal__foot">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => onSave({ name: name || 'lfc-novo-servico', stack })}>Criar sistema</Button>
        </div>
      </div>
    </div>
  );
};

/* ── ROLES ─────────────────────────────────────────────── */
const ROLES = [
  { name: 'root',    users: 2,  perms: 12, desc: 'Acesso irrestrito a todos os sistemas', system: '—' },
  { name: 'admin',   users: 6,  perms: 8,  desc: 'Gerenciamento de usuários e permissões', system: 'lfc-authenticator' },
  { name: 'editor',  users: 14, perms: 5,  desc: 'Criar e editar recursos, sem deletar',   system: 'lfc-authenticator' },
  { name: 'viewer',  users: 32, perms: 2,  desc: 'Leitura apenas',                         system: 'lfc-authenticator' },
  { name: 'default', users: 1,  perms: 3,  desc: 'Role de fallback para usuários legados', system: '—' },
];

const RolesScreen = () => (
  <>
    <PageHeader
      eyebrow="03 Roles"
      title="Gerenciamento de Roles"
      desc="Roles agrupam permissões e podem ser atribuídas a usuários. Permissões diretas sobrescrevem as da role."
      actions={<Button variant="primary" icon="plus">Nova role</Button>}
    />
    <div className="lfc-table-wrap">
      <table className="lfc-table">
        <thead><tr><th>Role</th><th>Sistema</th><th>Permissões</th><th>Usuários</th><th>Descrição</th><th></th></tr></thead>
        <tbody>
          {ROLES.map(r => (
            <tr key={r.name}>
              <td><Badge variant="neutral">{r.name}</Badge></td>
              <td><span className="lfc-mono lfc-muted">{r.system}</span></td>
              <td><span className="lfc-mono">{r.perms} permissões</span></td>
              <td><span className="lfc-mono">{r.users}</span></td>
              <td>{r.desc}</td>
              <td><button className="lfc-icon-btn"><Icon name="more-horizontal" size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

/* ── USERS ─────────────────────────────────────────────── */
const USERS = [
  { email: 'admin@lfc.com.br',   role: 'root',    perms: 12, status: 'active',   last: 'há 2 min' },
  { email: 'ops@lfc.com.br',     role: 'admin',   perms: 8,  status: 'active',   last: 'há 47 min' },
  { email: 'dev@lfc.com.br',     role: 'editor',  perms: 5,  status: 'active',   last: 'há 3 h' },
  { email: 'audit@lfc.com.br',   role: 'viewer',  perms: 2,  status: 'verifying',last: 'há 1 d' },
  { email: 'legacy@lfc.com.br',  role: 'default', perms: 3,  status: 'inactive', last: 'há 14 dias' },
];

const UsersScreen = () => (
  <>
    <PageHeader
      eyebrow="05 Usuários"
      title="Usuários do sistema"
      desc="Todos os usuários com acesso a pelo menos um sistema. Desativar um usuário invalida imediatamente suas sessões."
      actions={<Button variant="primary" icon="user-plus">Convidar usuário</Button>}
    />
    <div className="lfc-filter-row">
      <Input icon="search" placeholder="Buscar por e-mail…" />
      <Button variant="secondary" icon="filter">Filtrar por role</Button>
      <div style={{ flex: 1 }} />
      <span className="lfc-mono lfc-muted">55 usuários · 1 inativo</span>
    </div>
    <div className="lfc-table-wrap">
      <table className="lfc-table">
        <thead><tr><th>Usuário</th><th>Role</th><th>Permissões</th><th>Status</th><th>Última sessão</th><th></th></tr></thead>
        <tbody>
          {USERS.map(u => (
            <tr key={u.email}>
              <td>{u.email}</td>
              <td><Badge variant="neutral">{u.role}</Badge></td>
              <td><span className="lfc-mono lfc-muted">{u.perms} permissões</span></td>
              <td><StatusBadge s={u.status} /></td>
              <td><span className="lfc-mono lfc-muted">{u.last}</span></td>
              <td><button className="lfc-icon-btn"><Icon name="more-horizontal" size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

/* ── PERMISSIONS ──────────────────────────────────────── */
const PERM_GROUPS = [
  { res: 'Systems', actions: ['Create', 'Read', 'Update', 'Delete'] },
  { res: 'Roles',   actions: ['Create', 'Read', 'Update', 'Delete', 'Assign'] },
  { res: 'Users',   actions: ['Create', 'Read', 'Update', 'Delete', 'Invite'] },
  { res: 'Routes',  actions: ['List', 'Register', 'Deregister'] },
  { res: 'Tokens',  actions: ['Issue', 'Revoke', 'Inspect'] },
];

const PermissionsScreen = () => (
  <>
    <PageHeader
      eyebrow="04 Permissões"
      title="Matriz de permissões"
      desc="Modelo Resource.Action. Permissões são atribuídas via roles ou diretamente a usuários. Qualquer alteração incrementa tokenVersion."
      actions={<Button variant="secondary" icon="download">Exportar JSON</Button>}
    />
    <div className="lfc-perm-grid">
      {PERM_GROUPS.map(g => (
        <Card key={g.res} title={g.res} right={<span className="lfc-mono lfc-muted">{g.actions.length}</span>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {g.actions.map(a => <PermChip key={a}>{`perm:${g.res}.${a}`}</PermChip>)}
          </div>
        </Card>
      ))}
    </div>
  </>
);

/* ── SETTINGS (simple placeholder) ─────────────────────── */
const SettingsScreen = () => (
  <>
    <PageHeader eyebrow="07 Configurações" title="Configurações da conta" desc="Tema, idioma e preferências de sessão." />
    <Card title="Sessão">
      <div className="lfc-kv">
        <div><span className="lfc-kv__k">tokenVersion</span><span className="lfc-kv__v lfc-mono">12</span></div>
        <div><span className="lfc-kv__k">Expira em</span><span className="lfc-kv__v lfc-mono">14 min</span></div>
        <div><span className="lfc-kv__k">Refresh automático</span><span className="lfc-kv__v"><Badge variant="success" dot>Ativo</Badge></span></div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <Button variant="secondary" icon="refresh-cw">Renovar agora</Button>
        <Button variant="danger" icon="log-out">Invalidar todas as sessões</Button>
      </div>
    </Card>
  </>
);

Object.assign(window, {
  LoginScreen, SystemsScreen, CreateSystemModal, RolesScreen,
  UsersScreen, PermissionsScreen, SettingsScreen, initialSystems,
});
