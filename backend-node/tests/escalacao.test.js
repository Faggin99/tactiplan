// Escalação no campo: formação por jogo + vaga (slot) por titular.
// Uso: node --test tests/escalacao.test.js  (banco e auth simulados, sem Postgres)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

// ---------- banco simulado ----------
const db = { sessions: {}, players: [], log: [] };
async function query(sql, params = []) {
  db.log.push({ sql, params });
  if (/SELECT m\.workspace_id, c\.modality, s\.formation/.test(sql)) {
    const s = db.sessions[params[0]];
    return { rows: s ? [{ workspace_id: s.workspace_id, modality: s.modality, formation: s.formation }] : [] };
  }
  if (/SELECT id FROM training_sessions WHERE id = \$1 AND workspace_id = ANY/.test(sql)) {
    const s = db.sessions[params[0]];
    return { rows: s && params[1].includes(s.workspace_id) ? [{ id: params[0] }] : [] };
  }
  if (/SELECT \* FROM training_sessions WHERE id = \$1 AND workspace_id = ANY/.test(sql)) {
    const s = db.sessions[params[0]];
    return { rows: s && params[1].includes(s.workspace_id) ? [{ id: params[0], ...s }] : [] };
  }
  if (/UPDATE training_sessions/.test(sql)) {
    const s = db.sessions[params[8]];
    if (s) s.formation = params[10];
    return { rows: [] };
  }
  if (/DELETE FROM match_players/.test(sql)) {
    db.players = db.players.filter((p) => p.session_id !== params[0]);
    return { rows: [] };
  }
  if (/INSERT INTO match_players/.test(sql)) {
    const [session_id, athlete_id, status, minutes_played, jersey_number, workspace_id, slot] = params;
    db.players.push({ session_id, athlete_id, status, minutes_played, jersey_number, workspace_id, slot });
    return { rows: [] };
  }
  if (/FROM match_players mp/.test(sql)) {
    return { rows: db.players.filter((p) => p.session_id === params[0]) };
  }
  return { rows: [] };
}
const client = { query, release() {} };
const dbPath = path.join(__dirname, '../src/config/database.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query, pool: { connect: async () => client } } };

// ---------- auth simulado ----------
let usuario = null;
const authPath = path.join(__dirname, '../src/middleware/auth.js');
require.cache[authPath] = {
  id: authPath, filename: authPath, loaded: true,
  exports: (req, res, next) => { req.user = usuario; next(); },
};

const express = require('express');
const request = require('supertest');
const { validarEscalacao, totalVagas, formacaoPadrao, formacaoValida } = require('../src/utils/formacao');
const gamesRoutes = require('../src/routes/games');

const app = express();
app.use(express.json());
app.use('/api/games', gamesRoutes);

const WS = 'ws-1';
const SESS = 'jogo-1';

function cenario({ perms = ['games:view', 'games:edit'], modality = 'football_11', formation = null, ws = WS } = {}) {
  db.sessions = { [SESS]: { workspace_id: WS, modality, formation } };
  db.players = [];
  db.log = [];
  usuario = { id: 'u1', workspaceIds: [ws], can: (p) => perms.includes(p) };
}
const titular = (n, slot) => ({ athlete_id: `a${n}`, status: 'starter', slot });
const reserva = (n) => ({ athlete_id: `a${n}`, status: 'substitute' });
const salvar = (body) => request(app).post(`/api/games/${SESS}`).send({ opponent_name: 'Rival', match_duration: 90, events: [], ...body });
const gravou = () => db.log.some((l) => /INSERT INTO match_players|UPDATE training_sessions/.test(l.sql));

// ---------- regras puras ----------
test('formações por modalidade e padrão', () => {
  assert.strictEqual(formacaoPadrao('football_11'), '4-4-2');
  assert.strictEqual(formacaoPadrao('football_7'), '2-3-1');
  assert.strictEqual(formacaoPadrao('futsal'), '2-2');
  assert.strictEqual(formacaoPadrao('desconhecida'), '4-4-2');
  assert.ok(formacaoValida('football_11', '4-2-3-1'));
  assert.ok(!formacaoValida('football_11', '2-2'));
  assert.ok(!formacaoValida('futsal', '4-4-2'));
  assert.ok(formacaoValida('futsal', '4-0'));
  assert.strictEqual(totalVagas('4-4-2'), 11);
  assert.strictEqual(totalVagas('4-2-3-1'), 11);
  assert.strictEqual(totalVagas('2-3-1'), 7);
  assert.strictEqual(totalVagas('4-0'), 5);
});

test('validarEscalacao: aceita slots dentro da formação e sem slot', () => {
  const r = validarEscalacao({ modality: 'futsal', formation: '1-2-1', players: [titular(1, 0), titular(2, 4), titular(3), reserva(4)] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.formation, '1-2-1');
  assert.deepStrictEqual(r.slots, [0, 4, null, null]);
});

test('validarEscalacao: recusa slot fora do total, repetido, de reserva e formação de outra modalidade', () => {
  assert.strictEqual(validarEscalacao({ modality: 'futsal', formation: '2-2', players: [titular(1, 5)] }).ok, false);
  assert.strictEqual(validarEscalacao({ modality: 'football_11', formation: '4-4-2', players: [titular(1, -1)] }).ok, false);
  assert.strictEqual(validarEscalacao({ modality: 'football_11', formation: '4-4-2', players: [titular(1, 1.5)] }).ok, false);
  assert.strictEqual(validarEscalacao({ modality: 'football_11', formation: '4-4-2', players: [titular(1, 'x')] }).ok, false);
  assert.strictEqual(validarEscalacao({ modality: 'football_11', formation: '4-4-2', players: [titular(1, 3), titular(2, 3)] }).ok, false);
  assert.strictEqual(validarEscalacao({ modality: 'football_11', formation: '4-4-2', players: [{ ...reserva(1), slot: 2 }] }).ok, false);
  assert.strictEqual(validarEscalacao({ modality: 'football_11', formation: '4-4-2', players: [titular(1, 1), titular(1, 2)] }).ok, false);
  assert.strictEqual(validarEscalacao({ modality: 'football_7', formation: '4-4-2', players: [] }).ok, false);
});

test('validarEscalacao: sem formation no body mantém a do banco e valida contra ela', () => {
  const r = validarEscalacao({ modality: 'football_7', storedFormation: '3-2-1', players: [titular(1, 6)] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.formation, '3-2-1');
  // sem nada salvo: vale o padrão da modalidade (futsal 2-2 = 5 vagas)
  assert.strictEqual(validarEscalacao({ modality: 'futsal', players: [titular(1, 5)] }).ok, false);
  assert.strictEqual(validarEscalacao({ modality: 'futsal', players: [titular(1, 4)] }).ok, true);
});

// ---------- rota ----------
test('POST salva formação e slot; GET devolve', async () => {
  cenario();
  const res = await salvar({ formation: '4-3-3', players: [titular(1, 0), titular(2, 10), titular(3), reserva(4)] });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(db.sessions[SESS].formation, '4-3-3');
  assert.deepStrictEqual(db.players.map((p) => [p.athlete_id, p.status, p.slot]), [
    ['a1', 'starter', 0], ['a2', 'starter', 10], ['a3', 'starter', null], ['a4', 'substitute', null],
  ]);
  const get = await request(app).get(`/api/games/${SESS}`);
  assert.strictEqual(get.status, 200);
  assert.strictEqual(get.body.formation, '4-3-3');
  assert.strictEqual(get.body.players.length, 4);
});

test('POST sem formation (cliente antigo) não apaga a formação salva', async () => {
  cenario({ formation: '3-5-2' });
  const res = await salvar({ players: [titular(1)] });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(db.sessions[SESS].formation, '3-5-2');
  assert.strictEqual(db.players[0].slot, null);
});

test('POST inválido: 400 e não grava nada', async () => {
  cenario({ modality: 'futsal' });
  for (const body of [
    { formation: '4-4-2', players: [] },
    { formation: '2-2', players: [titular(1, 5)] },
    { formation: '2-2', players: [titular(1, 1), titular(2, 1)] },
  ]) {
    const res = await salvar(body);
    assert.strictEqual(res.status, 400, JSON.stringify(body));
    assert.ok(res.body.error);
  }
  assert.strictEqual(gravou(), false);
});

test('sem games:edit: 403 e não grava', async () => {
  cenario({ perms: ['games:view'] });
  const res = await salvar({ formation: '4-4-2', players: [titular(1, 0)] });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(gravou(), false);
});

test('jogo de outra workspace: 404', async () => {
  cenario({ ws: 'ws-outra' });
  const res = await salvar({ formation: '4-4-2', players: [titular(1, 0)] });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(gravou(), false);
});
