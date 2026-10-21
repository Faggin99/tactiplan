// BFF do app nativo (/api/app/*): token próprio revogável, /me, convites, push e config.
// Uso: node --test tests/app-bff.test.js  (banco, billing e auth do web simulados — sem Postgres)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

delete process.env.CONTA_LOGIN; // senha conferida localmente (bcrypt), como com o Conta fora do ar
process.env.APP_BASE_URL = 'https://app.exemplo.com';

// ---------- banco simulado ----------
let db;
function novoBanco() {
  db = { users: {}, workspaces: {}, members: [], clubs: [], categories: [], sessions: [], push: [], subs: {}, log: [] };
  return db;
}
novoBanco();

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const agora = () => Date.now();

async function query(sql, params = []) {
  db.log.push({ sql, params });
  const rows = (r) => ({ rows: r });
  const s = sql.replace(/\s+/g, ' ');

  if (/INSERT INTO app_sessions/.test(s)) {
    const [user_id, token_hash, metodo, plataforma, aparelho, versao_app, ip, dias] = params;
    const row = {
      id: 'sess-' + (db.sessions.length + 1), user_id, token_hash, metodo, plataforma, aparelho, versao_app, ip,
      created_at: agora(), last_used_at: new Date().toISOString(),
      expires_at: new Date(agora() + Number(dias) * 864e5).toISOString(), revoked_at: null,
    };
    db.sessions.push(row);
    return rows([{ id: row.id, expires_at: row.expires_at }]);
  }
  if (/FROM app_sessions s JOIN users u/.test(s)) {
    const sess = db.sessions.find((x) => x.token_hash === params[0]);
    if (!sess || sess.revoked_at || new Date(sess.expires_at).getTime() <= agora()) return rows([]);
    const u = db.users[sess.user_id];
    if (!u || u.deleted_at) return rows([]);
    return rows([{ ...sess, email: u.email, role: u.role }]);
  }
  if (/UPDATE app_sessions SET last_used_at/.test(s)) return rows([]);
  if (/UPDATE app_sessions SET revoked_at/.test(s)) {
    const sess = db.sessions.find((x) => x.id === params[0]);
    if (sess && !sess.revoked_at) sess.revoked_at = agora();
    return rows([]);
  }
  if (/INSERT INTO app_push_devices/.test(s)) {
    const [user_id, session_id, plataforma, token] = params;
    const ex = db.push.find((p) => p.token === token);
    if (ex) Object.assign(ex, { user_id, session_id, plataforma });
    else db.push.push({ id: 'push-' + (db.push.length + 1), user_id, session_id, plataforma, token });
    return rows([{ id: (ex || db.push[db.push.length - 1]).id }]);
  }
  if (/DELETE FROM app_push_devices WHERE session_id/.test(s)) {
    db.push = db.push.filter((p) => p.session_id !== params[0]);
    return rows([]);
  }
  // login por e-mail
  if (/FROM users WHERE LOWER\(email\) = LOWER\(\$1\) AND deleted_at IS NULL/.test(s)) {
    const u = Object.values(db.users).find((x) => !x.deleted_at && x.email.toLowerCase() === String(params[0]).toLowerCase());
    return rows(u ? [u] : []);
  }
  if (/google_id = \$1 OR LOWER\(email\) = \$2/.test(s)) {
    const u = Object.values(db.users).find((x) => !x.deleted_at && (x.google_id === params[0] || x.email.toLowerCase() === params[1]));
    return rows(u ? [u] : []);
  }
  if (/UPDATE users SET google_id/.test(s)) { db.users[params[1]].google_id = params[0]; return rows([]); }
  if (/apple_id = \$1 OR/.test(s)) {
    const [sub, email, verificado] = params;
    const u = Object.values(db.users).find((x) => !x.deleted_at && (x.apple_id === sub || (email && verificado && x.email.toLowerCase() === email)));
    return rows(u ? [u] : []);
  }
  if (/UPDATE users SET apple_id/.test(s)) { db.users[params[1]].apple_id = params[0]; return rows([]); }
  // me
  if (/FROM users WHERE id = \$1 AND deleted_at IS NULL/.test(s)) {
    const u = db.users[params[0]];
    return rows(u && !u.deleted_at ? [{ ...u, tem_senha: !!u.encrypted_password }] : []);
  }
  if (/'owner' AS role, NULL::uuid\[\]/.test(s)) {
    const out = [];
    for (const [id, w] of Object.entries(db.workspaces)) {
      if (w.owner_id === params[0]) out.push({ workspace_id: id, name: w.name, owner_id: w.owner_id, role: 'owner', category_ids: null, permissions: null, is_owner: true });
    }
    for (const m of db.members.filter((x) => x.user_id === params[0] && x.accepted_at)) {
      const w = db.workspaces[m.workspace_id];
      out.push({ workspace_id: m.workspace_id, name: w.name, owner_id: w.owner_id, role: m.role, category_ids: m.category_ids || null, permissions: m.permissions || null, is_owner: false });
    }
    return rows(out);
  }
  if (/information_schema\.columns/.test(s)) return rows([{ '?column?': 1 }]);
  if (/FROM clubs WHERE workspace_id = ANY/.test(s)) return rows(db.clubs.filter((c) => params[0].includes(c.workspace_id)));
  if (/FROM categories WHERE workspace_id = ANY/.test(s)) return rows(db.categories.filter((c) => params[0].includes(c.workspace_id)));
  if (/WHERE m\.accepted_at IS NULL AND m\.invite_token IS NOT NULL/.test(s)) {
    return rows(db.members
      .filter((m) => !m.accepted_at && m.invite_token && String(m.invited_email).toLowerCase() === String(params[0]).toLowerCase())
      .map((m) => ({ token: m.invite_token, role: m.role, workspace_name: db.workspaces[m.workspace_id].name, club_name: null, invited_by_name: 'Dono' })));
  }
  // convites
  if (/WHERE m\.invite_token = \$1/.test(s)) {
    const m = db.members.find((x) => x.invite_token === params[0]);
    return rows(m ? [{ ...m, workspace_name: db.workspaces[m.workspace_id].name }] : []);
  }
  if (/SELECT id FROM workspace_members WHERE workspace_id = \$1 AND user_id = \$2 AND accepted_at IS NOT NULL/.test(s)) {
    return rows(db.members.filter((m) => m.workspace_id === params[0] && m.user_id === params[1] && m.accepted_at));
  }
  if (/COUNT\(\*\)::int AS n FROM workspace_members WHERE workspace_id = \$1 AND accepted_at IS NOT NULL/.test(s)) {
    return rows([{ n: db.members.filter((m) => m.workspace_id === params[0] && m.accepted_at).length }]);
  }
  if (/UPDATE workspace_members SET user_id = \$1, accepted_at = NOW\(\)/.test(s)) {
    const m = db.members.find((x) => x.id === params[1] && !x.accepted_at);
    if (!m) return rows([]);
    Object.assign(m, { user_id: params[0], accepted_at: agora(), invite_token: null });
    return rows([{ id: m.id }]);
  }
  throw new Error('consulta não simulada: ' + s.slice(0, 120));
}

function instalar(rel, exports) {
  const p = path.join(__dirname, '..', rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}
instalar('src/config/database.js', { query, pool: {} });
// Billing simulado: assinatura efetiva por workspace (padrão = só leitura).
instalar('src/services/billing.js', {
  getEffectiveSubscription: async ({ workspaceId }) => db.subs[workspaceId] || { plan_id: 'inactive', read_only: true },
  limiteConvidados: (sub) => (sub?.read_only ? 0 : (typeof sub?.limite === 'number' ? sub.limite : -1)),
});
const authWeb = (req, res, next) => next();
authWeb.invalidateAccessibleCache = () => {};
instalar('src/middleware/auth.js', authWeb);

const express = require('express');
const request = require('supertest');
const appRoutes = require('../src/routes/app');
const appSessoes = require('../src/services/appSessoes');
const appMe = require('../src/services/appMe');
const appLogin = require('../src/services/appLogin');
const { configDoApp } = require('../src/routes/appAuth');
const { PERMISSIONS } = require('../src/utils/permissions');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/api/app', appRoutes);

const DONO = '00000000-0000-4000-8000-000000000001';
const TECNICO = '00000000-0000-4000-8000-000000000002';
const WS_DONO = 'aaaaaaaa-0000-4000-8000-000000000001';
const WS_OUTRA = 'aaaaaaaa-0000-4000-8000-000000000002';
const SENHA = 'segredo123';
const HASH = bcrypt.hashSync(SENHA, 4);
let ipSeq = 0;
// IP diferente por teste: o limite de 5 erros/15 min por IP não vaza de um teste para outro.
const ip = () => `10.0.0.${++ipSeq}`;

function cenario() {
  novoBanco();
  db.users[DONO] = { id: DONO, email: 'dono@exemplo.com', name: 'Marcos Andrade', role: 'coach', encrypted_password: HASH, profile_photo: '/uploads/profile-photos/m.png' };
  db.users[TECNICO] = { id: TECNICO, email: 'ana@exemplo.com', name: 'Ana Ribeiro', role: 'coach', encrypted_password: HASH };
  db.workspaces[WS_DONO] = { owner_id: DONO, name: 'Demo FC' };
  db.workspaces[WS_OUTRA] = { owner_id: 'outro', name: 'Escolinha Bola de Ouro' };
  db.clubs.push(
    { id: 'c1', name: 'Demo FC', modality: 'football_11', workspace_id: WS_DONO, logo_path: '/uploads/club-logos/x.png', logo_dark_path: null, primary_color: '#21a652', branding: null, archived_at: null },
    { id: 'c2', name: 'Demo FC Antigo', modality: 'futsal', workspace_id: WS_DONO, logo_path: null, logo_dark_path: null, primary_color: null, branding: null, archived_at: '2026-10-01' },
    { id: 'c3', name: 'Bola de Ouro', modality: 'football_7', workspace_id: WS_OUTRA, logo_path: null, logo_dark_path: null, primary_color: '#2563eb', branding: { light: { primary: '#FACC15', background: '#ffffff', surface: '#f8fafc', border: '#e2e8f0', text: '#0f172a', textSecondary: '#64748b' } }, archived_at: null },
  );
  db.categories.push(
    { id: 'k1', name: 'Sub-17', club_id: 'c1', workspace_id: WS_DONO, display_order: 2 },
    { id: 'k2', name: 'Sub-15', club_id: 'c1', workspace_id: WS_DONO, display_order: 1 },
    { id: 'k3', name: 'Sub-9', club_id: 'c3', workspace_id: WS_OUTRA, display_order: 0 },
    { id: 'k4', name: 'Sub-11', club_id: 'c3', workspace_id: WS_OUTRA, display_order: 1 },
  );
  db.subs[WS_DONO] = { plan_id: 'clube', read_only: false, limite: 5 };
  return db;
}

async function entrar(email = 'dono@exemplo.com', senha = SENHA) {
  return request(app).post('/api/app/auth/entrar').set('X-Forwarded-For', ip())
    .send({ email, senha, aparelho: { plataforma: 'ios', nome: 'iPhone de teste', versao_app: '1.0.0' } });
}

// ---------- token ----------

test('token do app: formato tpa_ + 256 bits, guardado só como SHA-256', async () => {
  const t = appSessoes.gerarToken();
  assert.match(t, /^tpa_[A-Za-z0-9_-]{43}$/);
  assert.ok(appSessoes.pareceToken(t));
  assert.ok(!appSessoes.pareceToken('eyJhbGciOi.jwt.do.web'));
  cenario();
  const s = await appSessoes.criar({ userId: DONO, metodo: 'senha', plataforma: 'IOS', aparelho: 'x\u0000y', versaoApp: '1.0' });
  const linha = db.sessions[0];
  assert.strictEqual(linha.token_hash, sha(s.token));
  assert.ok(!JSON.stringify(db.sessions).includes(s.token));
  assert.strictEqual(linha.plataforma, 'ios');
  assert.strictEqual(linha.aparelho, 'xy');
});

test('token malformado nem chega no banco; vencido, revogado ou de conta removida não entra', async () => {
  cenario();
  assert.strictEqual(await appSessoes.validar('qualquer'), null);
  assert.strictEqual(db.log.length, 0);
  const s = await appSessoes.criar({ userId: DONO, metodo: 'senha' });
  assert.ok(await appSessoes.validar(s.token));
  db.sessions[0].expires_at = new Date(Date.now() - 1000).toISOString();
  assert.strictEqual(await appSessoes.validar(s.token), null);
  const s2 = await appSessoes.criar({ userId: DONO, metodo: 'senha' });
  await appSessoes.revogar(db.sessions[1].id);
  assert.strictEqual(await appSessoes.validar(s2.token), null);
  const s3 = await appSessoes.criar({ userId: DONO, metodo: 'senha' });
  db.users[DONO].deleted_at = '2026-10-21';
  assert.strictEqual(await appSessoes.validar(s3.token), null);
});

test('validade padrão de 180 dias, configurável e com teto de 365', () => {
  delete process.env.APP_SESSAO_DIAS;
  assert.strictEqual(appSessoes.diasDeValidade(), 180);
  process.env.APP_SESSAO_DIAS = '30';
  assert.strictEqual(appSessoes.diasDeValidade(), 30);
  process.env.APP_SESSAO_DIAS = '9999';
  assert.strictEqual(appSessoes.diasDeValidade(), 365);
  process.env.APP_SESSAO_DIAS = 'lixo';
  assert.strictEqual(appSessoes.diasDeValidade(), 180);
  delete process.env.APP_SESSAO_DIAS;
});

// ---------- entrar / sair ----------

test('entrar com e-mail e senha devolve token + me; o e-mail não diferencia caixa', async () => {
  cenario();
  const r = await entrar('Dono@Exemplo.com');
  assert.strictEqual(r.status, 200);
  assert.match(r.body.token, /^tpa_/);
  assert.match(r.body.expira_em, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.strictEqual(r.body.me.usuario.email, 'dono@exemplo.com');
  assert.strictEqual(r.headers['cache-control'], 'no-store');
  assert.strictEqual(db.sessions[0].metodo, 'senha');
  assert.strictEqual(db.sessions[0].versao_app, '1.0.0');
});

test('senha errada e e-mail inexistente dão o MESMO 401 (sem revelar quem tem conta)', async () => {
  cenario();
  const a = await entrar('dono@exemplo.com', 'errada');
  const b = await entrar('ninguem@exemplo.com', 'errada');
  assert.strictEqual(a.status, 401);
  assert.strictEqual(b.status, 401);
  assert.deepStrictEqual(a.body, b.body);
  assert.strictEqual(a.body.code, 'CREDENCIAIS');
  assert.strictEqual(db.sessions.length, 0);
});

test('conta sem senha (só Google) não entra por senha', async () => {
  cenario();
  db.users[DONO].encrypted_password = null;
  const r = await entrar();
  assert.strictEqual(r.status, 401);
});

test('campos vazios: 400', async () => {
  cenario();
  const r = await request(app).post('/api/app/auth/entrar').set('X-Forwarded-For', ip()).send({ email: '', senha: '' });
  assert.strictEqual(r.status, 400);
});

test('5 erros seguidos do mesmo IP: 429', async () => {
  cenario();
  const mesmo = '10.9.9.9';
  for (let i = 0; i < 5; i++) {
    await request(app).post('/api/app/auth/entrar').set('X-Forwarded-For', mesmo).send({ email: 'dono@exemplo.com', senha: 'x' });
  }
  const r = await request(app).post('/api/app/auth/entrar').set('X-Forwarded-For', mesmo).send({ email: 'dono@exemplo.com', senha: SENHA });
  assert.strictEqual(r.status, 429);
});

test('sair revoga o token e solta o push do aparelho; depois disso tudo é 401', async () => {
  cenario();
  const { body } = await entrar();
  const auth = { Authorization: 'Bearer ' + body.token };
  await request(app).post('/api/app/push/registrar').set(auth).send({ token: 'fcm-123', plataforma: 'android' });
  assert.strictEqual(db.push.length, 1);
  const s = await request(app).post('/api/app/auth/sair').set(auth);
  assert.strictEqual(s.status, 200);
  assert.strictEqual(db.push.length, 0);
  assert.ok(db.sessions[0].revoked_at);
  const me = await request(app).get('/api/app/me').set(auth);
  assert.strictEqual(me.status, 401);
  assert.strictEqual(me.body.code, 'SESSAO_INVALIDA');
});

test('JWT do web e falta de token não abrem o /me', async () => {
  cenario();
  assert.strictEqual((await request(app).get('/api/app/me')).status, 401);
  const jwt = require('jsonwebtoken');
  const web = jwt.sign({ id: DONO }, 'DEV-ONLY-fallback-secret-change-me-in-production-32chars');
  assert.strictEqual((await request(app).get('/api/app/me').set('Authorization', 'Bearer ' + web)).status, 401);
});

// ---------- Google / Apple (só quem já tem conta) ----------

test('Google: desligado por padrão (503); com flag e client, entra quem já tem conta', async () => {
  cenario();
  delete process.env.APP_LOGIN_GOOGLE;
  process.env.GOOGLE_CLIENT_ID = 'web.apps.googleusercontent.com';
  const r = await request(app).post('/api/app/auth/google').set('X-Forwarded-For', ip()).send({ id_token: 'x' });
  assert.strictEqual(r.status, 503);
  const verificar = async () => ({ sub: 'g-1', email: 'ANA@exemplo.com', email_verified: true });
  const u = await appLogin.entrarComGoogle('tok', { verificar });
  assert.strictEqual(u.id, TECNICO);
  assert.strictEqual(db.users[TECNICO].google_id, 'g-1');
  delete process.env.GOOGLE_CLIENT_ID;
});

test('Google/Apple sem conta: 404 SEM_CONTA (o app não cria conta)', async () => {
  cenario();
  process.env.GOOGLE_CLIENT_ID = 'web.apps.googleusercontent.com';
  await assert.rejects(
    appLogin.entrarComGoogle('tok', { verificar: async () => ({ sub: 'g-9', email: 'novo@exemplo.com', email_verified: true }) }),
    (e) => e.status === 404 && e.codigo === 'SEM_CONTA'
  );
  await assert.rejects(
    appLogin.entrarComApple('tok', { verificar: async () => ({ sub: 'a-9', email: 'novo@exemplo.com', email_verified: 'true' }) }),
    (e) => e.status === 404 && e.codigo === 'SEM_CONTA'
  );
  assert.strictEqual(Object.keys(db.users).length, 2);
  delete process.env.GOOGLE_CLIENT_ID;
});

test('Google com e-mail não verificado ou token inválido: 401', async () => {
  cenario();
  process.env.GOOGLE_CLIENT_ID = 'web.apps.googleusercontent.com';
  await assert.rejects(
    appLogin.entrarComGoogle('tok', { verificar: async () => ({ sub: 'g', email: 'ana@exemplo.com', email_verified: false }) }),
    (e) => e.status === 401
  );
  await assert.rejects(
    appLogin.entrarComGoogle('tok', { verificar: async () => { throw new Error('assinatura'); } }),
    (e) => e.status === 401
  );
  delete process.env.GOOGLE_CLIENT_ID;
});

test('Apple: e-mail só vincula se verificado; apple_id já vinculado entra direto', async () => {
  cenario();
  await assert.rejects(
    appLogin.entrarComApple('tok', { verificar: async () => ({ sub: 'a-1', email: 'ana@exemplo.com', email_verified: false }) }),
    (e) => e.codigo === 'SEM_CONTA'
  );
  const u = await appLogin.entrarComApple('tok', { verificar: async () => ({ sub: 'a-1', email: 'ana@exemplo.com', email_verified: 'true' }) });
  assert.strictEqual(u.id, TECNICO);
  assert.strictEqual(db.users[TECNICO].apple_id, 'a-1');
  const de_novo = await appLogin.entrarComApple('tok', { verificar: async () => ({ sub: 'a-1' }) });
  assert.strictEqual(de_novo.id, TECNICO);
  assert.ok(appLogin.audienciasApple().includes('com.faggin.tactiplan.app'));
});

test('config: Google e Apple desligados sem flag; Google no iPhone só com o client iOS', () => {
  const base = configDoApp({});
  assert.strictEqual(base.google.ativo, false);
  assert.strictEqual(base.apple.ativo, false);
  assert.strictEqual(base.google.ios_client_id, null);
  const so_web = configDoApp({ GOOGLE_CLIENT_ID: 'web', APP_LOGIN_GOOGLE: 'on' });
  assert.strictEqual(so_web.google.ativo, true);
  assert.strictEqual(so_web.google.ios_client_id, null);
  assert.strictEqual(so_web.google.android_server_client_id, 'web');
  const tudo = configDoApp({ GOOGLE_CLIENT_ID: 'web', GOOGLE_IOS_CLIENT_ID: 'ios', APP_LOGIN_GOOGLE: 'on', APP_LOGIN_APPLE: 'on', APP_VERSAO_MINIMA_IOS: '1.0.1' });
  assert.strictEqual(tudo.google.ios_client_id, 'ios');
  assert.strictEqual(tudo.apple.ativo, true);
  assert.strictEqual(tudo.versao_minima.ios, '1.0.1');
  assert.match(tudo.privacidade_url, /^https:\/\//);
});

// ---------- /me ----------

test('/me do dono: conta própria com papel Dono, 16 permissões, categorias em ordem e cor do clube', async () => {
  cenario();
  const { body } = await entrar();
  const r = await request(app).get('/api/app/me').set('Authorization', 'Bearer ' + body.token);
  assert.strictEqual(r.status, 200);
  const me = r.body;
  assert.strictEqual(me.usuario.nome, 'Marcos Andrade');
  assert.strictEqual(me.usuario.foto_url, 'https://app.exemplo.com/uploads/profile-photos/m.png');
  assert.strictEqual(me.usuario.tem_senha, true);
  assert.strictEqual(me.workspaces.length, 1);
  const w = me.workspaces[0];
  assert.strictEqual(w.papel, 'owner');
  assert.strictEqual(w.papel_rotulo, 'Dono');
  assert.deepStrictEqual(w.permissoes, PERMISSIONS);
  assert.strictEqual(w.somente_leitura, false);
  assert.strictEqual(w.categorias_restritas, false);
  assert.deepStrictEqual(w.clubes.map((c) => c.nome), ['Demo FC', 'Demo FC Antigo']); // ativos primeiro
  assert.strictEqual(w.clubes[1].arquivado, true);
  assert.deepStrictEqual(w.clubes[0].categorias.map((c) => c.nome), ['Sub-15', 'Sub-17']);
  const p = w.clubes[0].personalizacao;
  assert.deepStrictEqual(p.cor_primaria, { claro: '#21a652', escuro: '#21a652' }); // primary_color legada
  assert.strictEqual(p.logo_url, 'https://app.exemplo.com/uploads/club-logos/x.png');
  assert.strictEqual(w.clubes[1].personalizacao.cor_primaria.claro, null);
});

test('/me do membro: papel, permissões do papel, categorias restritas e só leitura herdada do dono', async () => {
  cenario();
  db.members.push({ id: 'm1', workspace_id: WS_OUTRA, user_id: TECNICO, role: 'assistant_coach', category_ids: ['k3'], permissions: null, accepted_at: 1 });
  const me = await appMe.carregarMe(TECNICO);
  const w = me.workspaces[0];
  assert.strictEqual(w.papel_rotulo, 'Treinador auxiliar');
  assert.ok(w.permissoes.includes('training:edit'));
  assert.ok(!w.permissoes.includes('members:manage'));
  assert.strictEqual(w.categorias_restritas, true);
  assert.deepStrictEqual(w.clubes[0].categorias.map((c) => c.id), ['k3']);
  assert.strictEqual(w.somente_leitura, true); // a conta do dono está sem assinatura
  // branding salvo vence a primary_color; só o tema claro personalizado
  assert.deepStrictEqual(w.clubes[0].personalizacao.cor_primaria, { claro: '#facc15', escuro: null });
  assert.strictEqual(me.mensagem_somente_leitura, 'Somente leitura. Fale com o responsável pela equipe.');
});

test('/me nunca fala de plano, preço ou assinatura (Apple 3.1.3)', async () => {
  cenario();
  db.members.push({ id: 'm1', workspace_id: WS_OUTRA, user_id: DONO, role: 'head_coach', accepted_at: 1 });
  const texto = JSON.stringify(await appMe.carregarMe(DONO)).toLowerCase();
  for (const proibido of ['plan', 'preço', 'preco', 'price', 'assin', 'checkout', 'upgrade', 'r$']) {
    assert.ok(!texto.includes(proibido), `apareceu "${proibido}"`);
  }
});

test('admin global vê tudo como dono das permissões', () => {
  const me = appMe.montarMe({
    usuario: { id: 'a', email: 'a@x', role: 'admin' },
    workspaces: [{ workspace_id: 'w', name: 'X', role: 'viewer', is_owner: false, category_ids: ['k'] }],
    assinaturas: { w: { read_only: false } },
  });
  assert.deepStrictEqual(me.workspaces[0].permissoes, PERMISSIONS);
  assert.strictEqual(me.workspaces[0].categorias_restritas, false);
});

test('personalização: cor inválida e azul padrão do web = sem cor própria', () => {
  const p = appMe.personalizacaoDoClube({ primary_color: '#2563EB', branding: { light: { primary: 'azul' } } }, 'https://x');
  assert.deepStrictEqual(p.cor_primaria, { claro: null, escuro: null });
  assert.strictEqual(p.branding, null);
  assert.strictEqual(appMe.personalizacaoDoClube({ primary_color: '#ff0000aa' }, '').cor_primaria.claro, '#ff0000');
  assert.strictEqual(appMe.urlAbsoluta('https://cdn/x.png', 'https://y'), 'https://cdn/x.png');
});

// ---------- convites ----------

function convidar({ email = 'dono@exemplo.com', token = 'ab'.repeat(24), ws = WS_OUTRA } = {}) {
  db.members.push({ id: 'conv-1', workspace_id: ws, user_id: null, invited_email: email, role: 'assistant_coach', invite_token: token, accepted_at: null });
  return token;
}

test('convite pendente aparece no /me e é aceito no app (some da lista, a conta entra)', async () => {
  cenario();
  db.subs[WS_OUTRA] = { read_only: false, limite: 5 };
  const token = convidar();
  const { body } = await entrar();
  assert.strictEqual(body.me.convites.length, 1);
  assert.strictEqual(body.me.convites[0].papel_rotulo, 'Treinador auxiliar');
  assert.strictEqual(body.me.convites[0].workspace_nome, 'Escolinha Bola de Ouro');
  const r = await request(app).post(`/api/app/convites/${token}/aceitar`).set('Authorization', 'Bearer ' + body.token);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.workspace_id, WS_OUTRA);
  assert.strictEqual(r.body.me.convites.length, 0);
  assert.strictEqual(r.body.me.workspaces.length, 2);
  const de_novo = await request(app).post(`/api/app/convites/${token}/aceitar`).set('Authorization', 'Bearer ' + body.token);
  assert.strictEqual(de_novo.status, 404); // o token do convite é apagado no aceite
});

test('convite de outro e-mail: 403; equipe cheia ou em só leitura: 402 com frase neutra', async () => {
  cenario();
  const outro = convidar({ email: 'ana@exemplo.com' });
  const { body } = await entrar();
  const auth = { Authorization: 'Bearer ' + body.token };
  assert.strictEqual((await request(app).post(`/api/app/convites/${outro}/aceitar`).set(auth)).status, 403);
  db.members = [];
  const t = convidar({ token: 'cd'.repeat(24) });
  const r = await request(app).post(`/api/app/convites/${t}/aceitar`).set(auth); // WS_OUTRA sem assinatura
  assert.strictEqual(r.status, 402);
  assert.match(r.body.error, /Fale com o responsável pela equipe/);
  db.subs[WS_OUTRA] = { read_only: false, limite: 1 };
  db.members.push({ id: 'm9', workspace_id: WS_OUTRA, user_id: 'x', accepted_at: 1 });
  assert.strictEqual((await request(app).post(`/api/app/convites/${t}/aceitar`).set(auth)).status, 402);
  assert.strictEqual((await request(app).post('/api/app/convites/nao-hex/aceitar').set(auth)).status, 404);
});

// ---------- push ----------

test('push: guarda o token (sem envio); token repetido muda de dono; dado inválido = 400', async () => {
  cenario();
  const a = (await entrar()).body.token;
  const r = await request(app).post('/api/app/push/registrar').set('Authorization', 'Bearer ' + a).send({ token: 'apns-1', plataforma: 'ios' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.envio_ativo, false);
  const b = (await entrar('ana@exemplo.com')).body.token;
  await request(app).post('/api/app/push/registrar').set('Authorization', 'Bearer ' + b).send({ token: 'apns-1', plataforma: 'ios' });
  assert.strictEqual(db.push.length, 1);
  assert.strictEqual(db.push[0].user_id, TECNICO);
  const ruim = await request(app).post('/api/app/push/registrar').set('Authorization', 'Bearer ' + b).send({ token: 'x', plataforma: 'windows' });
  assert.strictEqual(ruim.status, 400);
});

test('rota desconhecida do app: 404 próprio (não cai nos routers do web)', async () => {
  const r = await request(app).get('/api/app/semana');
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.body.code, 'NAO_ENCONTRADA');
});
