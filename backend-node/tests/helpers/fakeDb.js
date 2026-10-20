// Banco simulado para os testes da F1 (sem Postgres): interpreta as consultas
// usadas pelo billing/middleware/convites a partir de um "cenário" em memória.
const path = require('path');

const ATIVOS = ['trialing', 'active', 'past_due', 'paused'];

const PLANOS = {
  free: { name: 'Free', features: { free: true, max_clubs: 1, max_categories: 1, max_athletes: 30, quadro_tatico: false } },
  pro: { name: 'Pro Mensal', features: { max_clubs: 1, quadro_tatico: true, pdf_export: true, equipe: true, max_convidados: 1 } },
  pro_annual: { name: 'Pro Anual', features: { max_clubs: 1, quadro_tatico: true, pdf_export: true, equipe: true, max_convidados: 1 } },
  clube: { name: 'Clube Mensal', features: { max_clubs: 1, multi_user: true, max_coaches: 5, max_categories: 5, quadro_tatico: true, equipe: true, max_convidados: 5 } },
  lifetime: { name: 'Vitalício', features: { max_clubs: -1, multi_user: true, lifetime: true } },
};

function criarCenario() {
  return { users: {}, workspaces: {}, members: [], subs: [], clubs: {}, invites: {}, log: [] };
}

let cenario = criarCenario();

function subsComPlano(filtro) {
  const agora = Date.now();
  return cenario.subs
    .filter(filtro)
    .filter((s) => ATIVOS.includes(s.status) || (s.cancel_at_period_end && new Date(s.current_period_end).getTime() > agora))
    .sort((a, b) =>
      (b.plan_id === 'lifetime') - (a.plan_id === 'lifetime')
      || (a.plan_id === 'free') - (b.plan_id === 'free')
      || (b.created_at || 0) - (a.created_at || 0))
    .slice(0, 1)
    .map((s) => ({ ...s, plan_name: PLANOS[s.plan_id]?.name, features: PLANOS[s.plan_id]?.features || {} }));
}

async function query(sql, params = []) {
  cenario.log.push({ sql, params });
  const u = (id) => cenario.users[id];
  const rows = (r) => ({ rows: r });

  if (/SELECT email, role, cortesia_permanente/.test(sql)) return rows(u(params[0]) ? [u(params[0])] : []);
  if (/SELECT deleted_at, role FROM users/.test(sql)) return rows(u(params[0]) ? [{ deleted_at: null, role: u(params[0]).role }] : []);
  if (/SELECT role FROM users WHERE id/.test(sql)) return rows(u(params[0]) ? [{ role: u(params[0]).role }] : []);
  if (/SELECT email FROM users WHERE id/.test(sql)) return rows(u(params[0]) ? [{ email: u(params[0]).email }] : []);
  if (/SELECT owner_id FROM workspaces WHERE id/.test(sql)) {
    const w = cenario.workspaces[params[0]];
    return rows(w ? [{ owner_id: w.owner_id }] : []);
  }
  if (/SELECT w\.owner_id, u\.role FROM workspaces w JOIN users u/.test(sql)) {
    const w = cenario.workspaces[params[0]];
    return rows(w ? [{ owner_id: w.owner_id, role: u(w.owner_id)?.role }] : []);
  }
  if (/FROM subscriptions s\s+JOIN plans p ON p\.id = s\.plan_id\s+WHERE s\.workspace_id = \$1/.test(sql)) {
    return rows(subsComPlano((s) => s.workspace_id === params[0]));
  }
  if (/FROM subscriptions s\s+JOIN plans p ON p\.id = s\.plan_id\s+WHERE s\.user_id = \$1/.test(sql)) {
    return rows(subsComPlano((s) => s.user_id === params[0]));
  }
  if (/SELECT 1 FROM workspaces w\s+WHERE w\.id = \$1/.test(sql)) {
    const w = cenario.workspaces[params[0]];
    const ok = w && (w.owner_id === params[1] || cenario.members.some((m) => m.workspace_id === params[0] && m.user_id === params[1] && m.accepted));
    return rows(ok ? [{ '?column?': 1 }] : []);
  }
  if (/ORDER BY ord, created_at LIMIT 1/.test(sql)) {
    const proprio = Object.entries(cenario.workspaces).find(([, w]) => w.owner_id === params[0]);
    if (proprio) return rows([{ id: proprio[0] }]);
    const m = cenario.members.find((x) => x.user_id === params[0] && x.accepted);
    return rows(m ? [{ id: m.workspace_id }] : []);
  }
  if (/'owner' AS role,\s+NULL::uuid\[\]/.test(sql)) {
    const out = [];
    for (const [id, w] of Object.entries(cenario.workspaces)) {
      if (w.owner_id === params[0]) out.push({ workspace_id: id, name: w.name, owner_id: w.owner_id, role: 'owner', category_ids: null, permissions: null, is_owner: true });
    }
    for (const m of cenario.members.filter((x) => x.user_id === params[0] && x.accepted)) {
      const w = cenario.workspaces[m.workspace_id];
      out.push({ workspace_id: m.workspace_id, name: w.name, owner_id: w.owner_id, role: m.role || 'head_coach', category_ids: m.category_ids || null, permissions: m.permissions || null, is_owner: false });
    }
    return rows(out);
  }
  if (/c\.id AS club_id/.test(sql)) return rows([]);
  if (/SELECT workspace_id FROM clubs WHERE id/.test(sql)) {
    const ws = cenario.clubs[params[0]];
    return rows(ws ? [{ workspace_id: ws }] : []);
  }
  if (/SELECT name FROM workspaces WHERE id/.test(sql)) return rows([{ name: cenario.workspaces[params[0]]?.name }]);
  if (/COUNT\(\*\)::int AS n FROM workspace_members\s+WHERE workspace_id = \$1 AND accepted_at IS NOT NULL/.test(sql)) {
    return rows([{ n: cenario.members.filter((m) => m.workspace_id === params[0] && m.accepted).length }]);
  }
  if (/COUNT\(\*\)::int AS n FROM workspace_members\s+WHERE workspace_id = \$1 AND accepted_at IS NULL/.test(sql)) {
    return rows([{ n: cenario.members.filter((m) => m.workspace_id === params[0] && !m.accepted).length }]);
  }
  if (/SELECT id, name FROM users WHERE LOWER\(email\)/.test(sql)) return rows([]);
  if (/INSERT INTO workspace_members/.test(sql)) {
    cenario.members.push({ workspace_id: params[0], user_id: params[1], accepted: false, invited_email: params[2] });
    return rows([{ id: 'membro-novo', workspace_id: params[0], invited_email: params[2] }]);
  }
  if (/WHERE m\.invite_token = \$1/.test(sql)) {
    const inv = cenario.invites[params[0]];
    return rows(inv ? [{ id: 'conv-1', accepted_at: null, workspace_name: cenario.workspaces[inv.workspace_id]?.name, ...inv }] : []);
  }
  if (/UPDATE workspace_members/.test(sql)) return rows([{ id: 'conv-1', user_id: params[0] }]);
  return rows([]);
}

function instalar() {
  const dbPath = path.join(__dirname, '../../src/config/database.js');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query } };
  const mailerPath = path.join(__dirname, '../../src/services/mailer.js');
  const noop = async () => ({ ok: true });
  require.cache[mailerPath] = {
    id: mailerPath, filename: mailerPath, loaded: true,
    exports: new Proxy({}, { get: () => noop }),
  };
}

module.exports = {
  instalar,
  query,
  reset() { cenario = criarCenario(); return cenario; },
  get cenario() { return cenario; },
};
