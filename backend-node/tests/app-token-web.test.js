// T1 do app nativo: o token do app ("tpa_…") também abre as rotas do WEB (authMiddleware), com
// as MESMAS regras do JWT — permissões, workspaces, só leitura (402), clube arquivado (409).
// Uso: node --test tests/app-token-web.test.js  (banco simulado, billing de verdade, sem Postgres)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fake = require('./helpers/fakeDb');

delete process.env.CONTA_LOGIN; // senha conferida localmente (bcrypt)
fake.instalar();

// ---------- banco: o fakeDb da F1 + sessões do app, clubes, sessões de treino ----------
const extra = { sessoesApp: [], clubes: {}, treinos: {}, senhas: {}, membrosConvite: [], falharApp: false, push: 0 };
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

async function query(sql, params = []) {
  const s = sql.replace(/\s+/g, ' ');
  const rows = (r) => ({ rows: r });
  const c = fake.cenario;
  if (/FROM app_sessions s JOIN users u/.test(s)) {
    if (extra.falharApp) throw new Error('banco fora');
    const sess = extra.sessoesApp.find((x) => x.token_hash === params[0]);
    if (!sess || sess.revoked_at || new Date(sess.expires_at).getTime() <= Date.now()) return rows([]);
    const u = c.users[sess.user_id];
    if (!u || u.deleted_at) return rows([]);
    return rows([{ ...sess, email: u.email, role: u.role }]);
  }
  if (/UPDATE app_sessions SET last_used_at/.test(s)) return rows([]);
  if (/UPDATE app_sessions SET revoked_at = now\(\) WHERE user_id = \$1/.test(s)) {
    const caiu = extra.sessoesApp.filter((x) => x.user_id === params[0] && !x.revoked_at);
    caiu.forEach((x) => { x.revoked_at = Date.now(); });
    return rows(caiu.map((x) => ({ id: x.id })));
  }
  if (/DELETE FROM app_push_devices WHERE user_id/.test(s)) { extra.push++; return rows([]); }
  // clubes acessíveis (loadAccessible)
  if (/c\.id AS club_id, c\.tenant_id, c\.workspace_id, 'owner' AS role/.test(s)) {
    const out = [];
    for (const [id, cl] of Object.entries(extra.clubes)) {
      const w = c.workspaces[cl.ws];
      if (w && w.owner_id === params[0]) out.push({ club_id: id, tenant_id: w.owner_id, workspace_id: cl.ws, role: 'owner', is_owner: true });
      const m = c.members.find((x) => x.workspace_id === cl.ws && x.user_id === params[0] && x.accepted);
      if (m) out.push({ club_id: id, tenant_id: w.owner_id, workspace_id: cl.ws, role: m.role || 'head_coach', is_owner: false });
    }
    return rows(out);
  }
  // trava de clube arquivado
  if (/SELECT COALESCE\(s\.club_id, m\.club_id\) AS club_id FROM training_sessions s/.test(s)) {
    const t = extra.treinos[params[0]];
    return rows(t ? [{ club_id: t.club }] : []);
  }
  if (/FROM clubs WHERE id = ANY\(\$1::uuid\[\]\) AND archived_at IS NOT NULL/.test(s)) {
    return rows(params[0].filter((id) => extra.clubes[id]?.arquivado).map((id) => ({ id, name: extra.clubes[id].nome })));
  }
  // PUT /api/sessions/:id/type
  if (/UPDATE training_sessions SET session_type = \$1/.test(s)) {
    const t = extra.treinos[params[2]];
    if (!t || !params[3].includes(extra.clubes[t.club].ws)) return rows([]);
    t.tipo = params[0];
    return rows([{ id: params[2], session_type: params[0] }]);
  }
  // PUT /api/auth/password
  if (/SELECT encrypted_password FROM users WHERE id = \$1/.test(s)) {
    return rows(c.users[params[0]] ? [{ encrypted_password: extra.senhas[params[0]] || null }] : []);
  }
  if (/UPDATE users SET encrypted_password = \$1/.test(s)) { extra.senhas[params[1]] = params[0]; return rows([]); }
  return fake.query(sql, params);
}

function instalar(rel, exports) {
  const p = path.join(__dirname, '..', rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}
instalar('src/config/database.js', { query, pool: {} });

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../src/config/auth');
const authMiddleware = require('../src/middleware/auth');
const requireActiveSubscription = require('../src/middleware/requireActiveSubscription');
const appSessoes = require('../src/services/appSessoes');
const { effectivePermissionsForMember, PERMISSIONS } = require('../src/utils/permissions');

// Servidor como o server.js: só leitura global → json → routers com authMiddleware.
const app = express();
app.use(requireActiveSubscription);
app.use(express.json());
const eco = express.Router();
eco.use(authMiddleware);
eco.all('*', (req, res) => res.json({
  id: req.user.id, email: req.user.email, role: req.user.role, viaApp: req.user.viaApp,
  workspaceId: req.user.workspaceId, workspaceIds: req.user.workspaceIds,
  permissoes: [...req.user.permissions].sort(), categorias: req.user.allowedCategoryIds,
  podeVerClube: req.user.readableWorkspaceForClub(req.query.club_id || null),
  sessao: req.appSessao || null,
}));
app.use('/api/eco', eco);
app.use('/api/sessions', require('../src/routes/sessions'));
app.use('/api/microcycles', require('../src/routes/microcycles'));
app.use('/api/auth', require('../src/routes/auth'));
const fechada = express.Router();
fechada.use(authMiddleware);
fechada.all('*', (req, res) => res.json({ passou: true }));
app.use('/api/billing', fechada);
app.use('/api/admin', fechada);

const DONO = '00000000-0000-4000-8000-000000000001';
const TECNICO = '00000000-0000-4000-8000-000000000002';
const OUTRO = '00000000-0000-4000-8000-000000000003';
const WS = 'aaaaaaaa-0000-4000-8000-000000000001';
const WS_OUTRO = 'aaaaaaaa-0000-4000-8000-000000000003';
const CLUBE = 'cccccccc-0000-4000-8000-000000000001';
const CLUBE_ARQ = 'cccccccc-0000-4000-8000-000000000002';
const CLUBE_OUTRO = 'cccccccc-0000-4000-8000-000000000003';
const TREINO = 'dddddddd-0000-4000-8000-000000000001';
const TREINO_ARQ = 'dddddddd-0000-4000-8000-000000000002';
const TREINO_OUTRO = 'dddddddd-0000-4000-8000-000000000003';
const CAT = 'eeeeeeee-0000-4000-8000-000000000001';
const SENHA = 'segredo123';
const dia = 864e5;

function cenario({ pago = true, cortesia = false } = {}) {
  const c = fake.reset();
  authMiddleware.invalidateAccessibleCache();
  extra.sessoesApp = [];
  extra.falharApp = false;
  extra.push = 0;
  c.users[DONO] = { email: 'dono@exemplo.com', role: 'coach', cortesia_permanente: cortesia, cortesia_motivo: cortesia ? 'teste' : null };
  c.users[TECNICO] = { email: 'ana@exemplo.com', role: 'coach', cortesia_permanente: false };
  c.users[OUTRO] = { email: 'outro@exemplo.com', role: 'coach', cortesia_permanente: false };
  c.workspaces[WS] = { owner_id: DONO, name: 'Demo FC' };
  c.workspaces[WS_OUTRO] = { owner_id: OUTRO, name: 'Outra Escolinha' };
  c.members.push({ workspace_id: WS, user_id: TECNICO, accepted: true, role: 'assistant_coach', category_ids: [CAT] });
  if (pago) c.subs.push({ user_id: DONO, workspace_id: WS, plan_id: 'clube', status: 'active', created_at: 1, current_period_end: new Date(Date.now() + 30 * dia).toISOString() });
  c.subs.push({ user_id: OUTRO, workspace_id: WS_OUTRO, plan_id: 'clube', status: 'active', created_at: 2, current_period_end: new Date(Date.now() + 30 * dia).toISOString() });
  extra.clubes = {
    [CLUBE]: { ws: WS, nome: 'Demo FC' },
    [CLUBE_ARQ]: { ws: WS, nome: 'Demo Antigo', arquivado: true },
    [CLUBE_OUTRO]: { ws: WS_OUTRO, nome: 'Outra' },
  };
  extra.treinos = { [TREINO]: { club: CLUBE }, [TREINO_ARQ]: { club: CLUBE_ARQ }, [TREINO_OUTRO]: { club: CLUBE_OUTRO } };
  extra.senhas = { [DONO]: bcrypt.hashSync(SENHA, 4) };
}

// Sessão do app gravada como o appSessoes.criar grava (só o hash).
function sessaoApp(userId, { vencida = false, revogada = false } = {}) {
  const token = appSessoes.gerarToken();
  extra.sessoesApp.push({
    id: 'sess-' + (extra.sessoesApp.length + 1), user_id: userId, token_hash: sha(token), metodo: 'senha', plataforma: 'ios',
    last_used_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + (vencida ? -1 : 180) * dia).toISOString(),
    revoked_at: revogada ? Date.now() : null,
  });
  return token;
}
const bearer = (t) => ({ Authorization: 'Bearer ' + t });

// ---------- validação do token ----------

test('token do app válido abre rota do web com o MESMO req.user do JWT', async () => {
  cenario();
  const t = sessaoApp(DONO);
  const viaApp = await request(app).get('/api/eco').set(bearer(t)).set('X-Workspace-Id', WS);
  const viaWeb = await request(app).get('/api/eco').set(bearer(jwt.sign({ id: DONO, email: 'dono@exemplo.com' }, jwtSecret))).set('X-Workspace-Id', WS);
  assert.strictEqual(viaApp.status, 200);
  assert.strictEqual(viaApp.body.viaApp, true);
  assert.strictEqual(viaWeb.body.viaApp, false);
  for (const k of ['id', 'email', 'role', 'workspaceId', 'workspaceIds', 'permissoes', 'categorias']) {
    assert.deepStrictEqual(viaApp.body[k], viaWeb.body[k], k);
  }
  assert.deepStrictEqual(viaApp.body.permissoes, [...PERMISSIONS].sort());
  assert.strictEqual(viaApp.body.sessao.id, 'sess-1');
  // o banco só conhece o hash
  assert.ok(!JSON.stringify(extra.sessoesApp).includes(t));
});

test('membro pelo app: permissões do papel e categorias restritas, iguais ao web', async () => {
  cenario();
  const r = await request(app).get('/api/eco?club_id=' + CLUBE).set(bearer(sessaoApp(TECNICO))).set('X-Workspace-Id', WS);
  assert.strictEqual(r.status, 200);
  const esperado = [...effectivePermissionsForMember({ role: 'assistant_coach', permissions: null, is_owner: false })].sort();
  assert.deepStrictEqual(r.body.permissoes, esperado);
  assert.deepStrictEqual(r.body.categorias, [CAT]);
  assert.strictEqual(r.body.podeVerClube, WS);
});

test('token REVOGADO → 401 SESSAO_INVALIDA (o app sai da conta)', async () => {
  cenario();
  const r = await request(app).get('/api/eco').set(bearer(sessaoApp(DONO, { revogada: true })));
  assert.strictEqual(r.status, 401);
  assert.strictEqual(r.body.code, 'SESSAO_INVALIDA');
});

test('token VENCIDO → 401', async () => {
  cenario();
  const r = await request(app).get('/api/microcycles?week=2026-43&club_id=' + CLUBE).set(bearer(sessaoApp(DONO, { vencida: true })));
  assert.strictEqual(r.status, 401);
  assert.strictEqual(r.body.code, 'SESSAO_INVALIDA');
});

test('token inexistente, malformado ou de conta removida → 401', async () => {
  cenario();
  assert.strictEqual((await request(app).get('/api/eco').set(bearer(appSessoes.gerarToken()))).status, 401);
  assert.strictEqual((await request(app).get('/api/eco').set(bearer('tpa_curto'))).status, 401);
  const t = sessaoApp(TECNICO);
  fake.cenario.users[TECNICO].deleted_at = '2026-10-21';
  assert.strictEqual((await request(app).get('/api/eco').set(bearer(t))).status, 401);
});

test('banco fora na conferência do token: 503 (nunca 401, que tiraria a pessoa da conta)', async () => {
  cenario();
  const t = sessaoApp(DONO);
  extra.falharApp = true;
  const r = await request(app).get('/api/eco').set(bearer(t));
  assert.strictEqual(r.status, 503);
});

test('token de OUTRO usuário não acessa a workspace alheia', async () => {
  cenario();
  const t = sessaoApp(OUTRO);
  // pedir a workspace do Demo FC no cabeçalho: 403
  const ws = await request(app).get('/api/eco').set(bearer(t)).set('X-Workspace-Id', WS);
  assert.strictEqual(ws.status, 403);
  assert.strictEqual(ws.body.error, 'workspace_not_accessible');
  // sem cabeçalho: cai na PRÓPRIA workspace; o clube alheio não abre
  const eco2 = await request(app).get('/api/eco?club_id=' + CLUBE).set(bearer(t));
  assert.deepStrictEqual(eco2.body.workspaceIds, [WS_OUTRO]);
  assert.strictEqual(eco2.body.podeVerClube, null);
  const sem = await request(app).get(`/api/microcycles?week=2026-43&club_id=${CLUBE}`).set(bearer(t));
  assert.strictEqual(sem.status, 403);
  // escrever numa sessão de treino alheia: 404 (filtro por workspace), nada muda
  const put = await request(app).put(`/api/sessions/${TREINO}/type`).set(bearer(t)).send({ session_type: 'rest' });
  assert.strictEqual(put.status, 404);
  assert.strictEqual(extra.treinos[TREINO].tipo, undefined);
});

test('conta em SÓ LEITURA: lê, mas a escrita pelo app volta 402 READ_ONLY', async () => {
  cenario({ pago: false });
  const t = sessaoApp(DONO);
  const ler = await request(app).get('/api/eco').set(bearer(t)).set('X-Workspace-Id', WS);
  assert.strictEqual(ler.status, 200);
  const r = await request(app).put(`/api/sessions/${TREINO}/type`).set(bearer(t)).set('X-Workspace-Id', WS).send({ session_type: 'rest' });
  assert.strictEqual(r.status, 402);
  assert.strictEqual(r.body.code, 'READ_ONLY');
  assert.strictEqual(extra.treinos[TREINO].tipo, undefined);
  // membro da mesma equipe também
  const m = await request(app).put(`/api/sessions/${TREINO}/type`).set(bearer(sessaoApp(TECNICO))).set('X-Workspace-Id', WS).send({ session_type: 'rest' });
  assert.strictEqual(m.body.code, 'READ_ONLY');
});

test('cortesia do dono vale pelo app (escreve sem assinatura paga)', async () => {
  cenario({ pago: false, cortesia: true });
  const r = await request(app).put(`/api/sessions/${TREINO}/type`).set(bearer(sessaoApp(DONO))).set('X-Workspace-Id', WS).send({ session_type: 'rest' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(extra.treinos[TREINO].tipo, 'rest');
});

test('clube ARQUIVADO: escrita pelo app → 409 CLUB_ARCHIVED', async () => {
  cenario();
  const t = sessaoApp(DONO);
  const r = await request(app).put(`/api/sessions/${TREINO_ARQ}/type`).set(bearer(t)).set('X-Workspace-Id', WS).send({ session_type: 'rest' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.code, 'CLUB_ARCHIVED');
  assert.strictEqual(extra.treinos[TREINO_ARQ].tipo, undefined);
  // clube ativo da mesma conta segue editável
  const ok = await request(app).put(`/api/sessions/${TREINO}/type`).set(bearer(t)).set('X-Workspace-Id', WS).send({ session_type: 'match', opponent_name: 'Rival' });
  assert.strictEqual(ok.status, 200);
});

test('admin e cobrança ficam FECHADOS ao token do app (o JWT continua abrindo)', async () => {
  cenario();
  const t = sessaoApp(DONO);
  for (const rota of ['/api/billing/subscription', '/api/billing/checkout', '/api/admin/users']) {
    const r = await request(app).get(rota).set(bearer(t));
    assert.strictEqual(r.status, 403, rota);
    assert.strictEqual(r.body.code, 'ROTA_FORA_DO_APP');
  }
  const web = await request(app).get('/api/billing/subscription').set(bearer(jwt.sign({ id: DONO }, jwtSecret)));
  assert.strictEqual(web.status, 200);
});

test('JWT do web continua igual (regressão): válido entra, inválido 401 "Invalid token"', async () => {
  cenario();
  const ok = await request(app).get('/api/eco').set(bearer(jwt.sign({ id: DONO }, jwtSecret)));
  assert.strictEqual(ok.status, 200);
  const ruim = await request(app).get('/api/eco').set(bearer('abc.def.ghi'));
  assert.strictEqual(ruim.status, 401);
  assert.strictEqual(ruim.body.error, 'Invalid token');
});

test('trocar a senha no web derruba TODAS as sessões do app (e os aparelhos de push)', async () => {
  cenario();
  const a = sessaoApp(DONO);
  const b = sessaoApp(DONO);
  const doTecnico = sessaoApp(TECNICO);
  const web = jwt.sign({ id: DONO, email: 'dono@exemplo.com' }, jwtSecret);
  const r = await request(app).put('/api/auth/password').set(bearer(web)).send({ currentPassword: SENHA, newPassword: 'novaSenha456' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await request(app).get('/api/eco').set(bearer(a))).status, 401);
  assert.strictEqual((await request(app).get('/api/eco').set(bearer(b))).status, 401);
  assert.strictEqual(extra.push, 1);
  // a de outra pessoa não cai
  assert.strictEqual((await request(app).get('/api/eco').set(bearer(doTecnico))).status, 200);
});

test('senha atual errada não derruba nada', async () => {
  cenario();
  const a = sessaoApp(DONO);
  const web = jwt.sign({ id: DONO, email: 'dono@exemplo.com' }, jwtSecret);
  const r = await request(app).put('/api/auth/password').set(bearer(web)).send({ currentPassword: 'errada', newPassword: 'novaSenha456' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual((await request(app).get('/api/eco').set(bearer(a))).status, 200);
});

test('o BFF /api/app continua fora da trava de só leitura (sair/aceitar convite funcionam)', async () => {
  cenario({ pago: false });
  const sub = express();
  sub.use(requireActiveSubscription);
  sub.all('*', (req, res) => res.json({ passou: true }));
  const r = await request(sub).post('/api/app/auth/sair').set(bearer(sessaoApp(DONO)));
  assert.strictEqual(r.status, 200);
  const w = await request(sub).post('/api/athletes').set(bearer(sessaoApp(DONO)));
  assert.strictEqual(w.status, 402);
});
