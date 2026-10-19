// Distância média por jogador (info do dia): validação, permissão e agregação das estatísticas.
// Uso: node --test tests/distancia.test.js  (banco e auth simulados, sem Postgres)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

// ---------- banco simulado ----------
const db = { sessions: {}, log: [] };
async function query(sql, params = []) {
  db.log.push({ sql, params });
  if (/FROM training_sessions s\s+LEFT JOIN training_microcycles m/.test(sql)) {
    const s = db.sessions[params[0]];
    return { rows: s && params[1].includes(s.workspace_id) ? [{ id: params[0], workspace_id: s.workspace_id, category_id: s.category_id }] : [] };
  }
  if (/UPDATE training_sessions SET avg_distance_km/.test(sql)) {
    const s = db.sessions[params[1]];
    if (!s || !params[2].includes(s.workspace_id)) return { rows: [] };
    s.avg_distance_km = params[0] === null ? null : params[0].toFixed(2); // pg devolve NUMERIC como string
    return { rows: [{ id: params[1], avg_distance_km: s.avg_distance_km }] };
  }
  return { rows: [] };
}
const dbPath = path.join(__dirname, '../src/config/database.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query, pool: {} } };

// ---------- auth simulado: o teste define req.user ----------
let usuario = null;
const authPath = path.join(__dirname, '../src/middleware/auth.js');
require.cache[authPath] = {
  id: authPath, filename: authPath, loaded: true,
  exports: (req, res, next) => { req.user = usuario; next(); },
};

const express = require('express');
const request = require('supertest');
const { parseDistanciaKm } = require('../src/utils/distancia');
const sessionsRoutes = require('../src/routes/sessions');
const { buildDistanceStats } = require('../src/routes/stats');

const app = express();
app.use(express.json());
app.use('/api/sessions', sessionsRoutes);

const WS = 'ws-1';
const SESS = 'sess-1';
const CAT = 'cat-sub15';

function criarUsuario({ perms = ['training:edit'], role = 'head_coach', ws = WS, categorias = null } = {}) {
  return {
    id: 'u1',
    workspaceIds: [ws],
    allowedCategoryIds: categorias,
    can: (p) => perms.includes(p),
    canWriteWorkspace: (w) => w === ws && role !== 'viewer',
    assertCanAccessCategory: (c) => categorias === null || categorias.includes(c),
  };
}
function cenario(opts) {
  db.sessions = { [SESS]: { workspace_id: WS, category_id: CAT, avg_distance_km: null } };
  db.log = [];
  usuario = criarUsuario(opts);
}
const salvar = (avg_distance_km) => request(app).put(`/api/sessions/${SESS}/distance`).send({ avg_distance_km });
const houveUpdate = () => db.log.some((l) => /UPDATE training_sessions/.test(l.sql));

// ---------- validação ----------
test('parseDistanciaKm: aceita número, vírgula e ponto; null/"" limpam', () => {
  assert.deepStrictEqual(parseDistanciaKm(5.2), { ok: true, value: 5.2 });
  assert.deepStrictEqual(parseDistanciaKm('5,2'), { ok: true, value: 5.2 });
  assert.deepStrictEqual(parseDistanciaKm(' 6.75 '), { ok: true, value: 6.75 });
  assert.deepStrictEqual(parseDistanciaKm('0'), { ok: true, value: 0 });
  assert.deepStrictEqual(parseDistanciaKm(99.99), { ok: true, value: 99.99 });
  assert.deepStrictEqual(parseDistanciaKm(null), { ok: true, value: null });
  assert.deepStrictEqual(parseDistanciaKm(''), { ok: true, value: null });
  assert.deepStrictEqual(parseDistanciaKm(undefined), { ok: true, value: null });
});

test('parseDistanciaKm: recusa negativo, >= 100, mais de 2 casas e lixo', () => {
  for (const v of [-1, '-1', 100, '100', 150.5, 5.123, '5,123', 'abc', '5,2km', '1.2.3', NaN, Infinity, true, {}, [5]]) {
    assert.strictEqual(parseDistanciaKm(v).ok, false, `deveria recusar ${JSON.stringify(v)}`);
  }
});

// ---------- rota ----------
test('PUT /distance salva com vírgula e devolve número', async () => {
  cenario();
  const res = await salvar('5,2');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, { id: SESS, avg_distance_km: 5.2 });
  assert.strictEqual(db.sessions[SESS].avg_distance_km, '5.20');
});

test('PUT /distance com null limpa o campo', async () => {
  cenario();
  db.sessions[SESS].avg_distance_km = '4.00';
  const res = await salvar(null);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.avg_distance_km, null);
  assert.strictEqual(db.sessions[SESS].avg_distance_km, null);
});

test('PUT /distance inválido: 400 e não grava', async () => {
  cenario();
  for (const v of [-0.5, 100, '7,555', 'muito']) {
    const res = await salvar(v);
    assert.strictEqual(res.status, 400, String(v));
    assert.ok(res.body.error);
  }
  assert.strictEqual(houveUpdate(), false);
});

test('sem training:edit: 403 e não grava', async () => {
  cenario({ perms: ['training:view'] });
  const res = await salvar(5);
  assert.strictEqual(res.status, 403);
  assert.strictEqual(houveUpdate(), false);
});

test('somente leitura na workspace (viewer): 403 e não grava', async () => {
  cenario({ role: 'viewer' });
  const res = await salvar(5);
  assert.strictEqual(res.status, 403);
  assert.strictEqual(houveUpdate(), false);
});

test('membro sem acesso à categoria do microciclo: 403', async () => {
  cenario({ categorias: ['outra-categoria'] });
  const res = await salvar(5);
  assert.strictEqual(res.status, 403);
  assert.strictEqual(houveUpdate(), false);
  cenario({ categorias: [CAT] });
  assert.strictEqual((await salvar(5)).status, 200);
});

test('sessão de outra workspace: 404', async () => {
  cenario({ ws: 'ws-outra' });
  const res = await salvar(5);
  assert.strictEqual(res.status, 404);
  assert.strictEqual(houveUpdate(), false);
});

// ---------- agregação das estatísticas ----------
test('buildDistanceStats: sem dados → vazio (a tela esconde a seção)', () => {
  const r = buildDistanceStats([{ date: '2026-10-12', avg_distance_km: null, session_type: 'training' }], '2026-10-12', '2026-10-18');
  assert.strictEqual(r.daysWithData, 0);
  assert.strictEqual(r.avgKm, null);
  assert.deepStrictEqual(r.series, []);
});

test('buildDistanceStats: microciclo → por dia; média ignora dia sem registro, jogo e descanso', () => {
  const r = buildDistanceStats([
    { date: '2026-10-12', avg_distance_km: '5.20', session_type: 'training' },
    { date: '2026-10-13', avg_distance_km: null, session_type: 'training' },
    { date: '2026-10-14', avg_distance_km: '6.80', session_type: null },
    { date: '2026-10-15', avg_distance_km: '9.90', session_type: 'match' },
    { date: '2026-10-16', avg_distance_km: '3.00', session_type: 'rest' },
  ], '2026-10-12', '2026-10-18');
  assert.strictEqual(r.granularity, 'day');
  assert.strictEqual(r.daysWithData, 2);
  assert.strictEqual(r.avgKm, 6);
  assert.strictEqual(r.totalKm, 12);
  assert.strictEqual(r.maxKm, 6.8);
  assert.deepStrictEqual(r.series.map((s) => [s.label, s.avgKm]), [['12/10', 5.2], ['14/10', 6.8]]);
});

test('buildDistanceStats: período longo → por semana (seg–dom)', () => {
  const r = buildDistanceStats([
    { date: '2026-09-01', avg_distance_km: '4.00', session_type: 'training' },
    { date: '2026-09-03', avg_distance_km: '6.00', session_type: 'training' },
    { date: '2026-09-08', avg_distance_km: '7.50', session_type: 'training' },
  ], '2026-09-01', '2026-09-30');
  assert.strictEqual(r.granularity, 'week');
  assert.deepStrictEqual(r.series.map((s) => [s.start, s.avgKm, s.days]), [['2026-08-31', 5, 2], ['2026-09-07', 7.5, 1]]);
  assert.strictEqual(r.avgKm, 5.83);
  assert.strictEqual(r.totalKm, 17.5);
});
