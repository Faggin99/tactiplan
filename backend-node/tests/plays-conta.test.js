// Jogadas do quadro tático são da CONTA (workspace), não do clube.
// Banco e auth simulados. Uso: node --test tests/plays-conta.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const WS = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTRA_WS = 'aaaaaaaa-0000-4000-8000-000000000002';
const CLUBE_A = '11111111-1111-4111-8111-111111111111';
const CLUBE_B = '22222222-2222-4222-8222-222222222222'; // arquivado
const PLAY = '33333333-3333-4333-8333-333333333333';

const consultas = [];
const dbPath = path.join(__dirname, '../src/config/database.js');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    query: async (sql, params) => {
      consultas.push({ sql, params });
      if (/FROM clubs WHERE id = ANY\(\$1::uuid\[\]\) AND archived_at IS NOT NULL/.test(sql)) {
        return { rows: params[0].includes(CLUBE_B) ? [{ id: CLUBE_B, name: 'Time Antigo' }] : [] };
      }
      if (/INSERT INTO tactical_plays/.test(sql)) return { rows: [{ id: PLAY, club_id: params[8], workspace_id: params[9], club_name: 'X' }] };
      if (/UPDATE tactical_plays/.test(sql)) return { rows: [{ id: PLAY, club_id: CLUBE_A, club_name: 'Clube A' }] };
      if (/FROM tactical_plays p/.test(sql)) {
        return { rows: [
          { id: 'p1', club_id: CLUBE_A, club_name: 'Clube A', workspace_id: WS },
          { id: 'p2', club_id: CLUBE_B, club_name: 'Time Antigo', workspace_id: WS },
        ] };
      }
      return { rows: [] };
    },
  },
};

// Auth simulado: perfil vem do cabeçalho x-perfil (ver/editar/nada).
let perfil = 'editar';
const authPath = path.join(__dirname, '../src/middleware/auth.js');
require.cache[authPath] = {
  id: authPath, filename: authPath, loaded: true,
  exports: (req, res, next) => {
    const perms = { editar: ['tactical:view', 'tactical:edit'], ver: ['tactical:view'], nada: [] }[perfil];
    req.user = {
      id: 'u1', workspaceId: WS, workspaceIds: [WS],
      can: (p) => perms.includes(p),
      writableWorkspaceForClub: (id) => ([CLUBE_A, CLUBE_B].includes(id) ? WS : null),
    };
    next();
  },
};

const express = require('express');
const request = require('supertest');
const { travaClubeArquivado } = require('../src/utils/clubArquivado');
const app = express();
app.use(express.json());
app.use('/api/plays', require('../src/routes/plays'));

test('lista todas as jogadas da workspace, ignorando o clube aberto', async () => {
  perfil = 'editar';
  consultas.length = 0;
  const r = await request(app).get(`/api/plays?club_id=${CLUBE_A}`);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.map((p) => p.id), ['p1', 'p2']);
  const q = consultas.find((c) => /FROM tactical_plays p/.test(c.sql));
  assert.doesNotMatch(q.sql, /club_id = \$/);
  assert.deepStrictEqual(q.params, [[WS]]);
  assert.match(q.sql, /c\.name AS club_name/);
  assert.ok(!q.params.flat().includes(OUTRA_WS));
});

test('criar grava o clube como "criada em"; editar não muda o clube', async () => {
  perfil = 'editar';
  const c = await request(app).post('/api/plays').send({ name: 'Saída 3-2', club_id: CLUBE_A });
  assert.strictEqual(c.status, 201);
  assert.strictEqual(c.body.club_id, CLUBE_A);
  assert.strictEqual(c.body.workspace_id, WS);
  consultas.length = 0;
  const u = await request(app).put(`/api/plays/${PLAY}`).send({ name: 'Saída 3-2', club_id: CLUBE_B });
  assert.strictEqual(u.status, 200);
  const q = consultas.find((x) => /UPDATE tactical_plays/.test(x.sql));
  assert.doesNotMatch(q.sql, /club_id =/);
  assert.ok(!q.params.includes(CLUBE_B));
});

test('permissão: sem tactical:view não lista; só view não cria/edita/exclui', async () => {
  perfil = 'nada';
  assert.strictEqual((await request(app).get('/api/plays')).status, 403);
  perfil = 'ver';
  assert.strictEqual((await request(app).get('/api/plays')).status, 200);
  assert.strictEqual((await request(app).post('/api/plays').send({ name: 'x' })).status, 403);
  assert.strictEqual((await request(app).put(`/api/plays/${PLAY}`).send({ name: 'x' })).status, 403);
  assert.strictEqual((await request(app).delete(`/api/plays/${PLAY}`)).status, 403);
});

test('clube de fora da conta não serve de "criada em" (403)', async () => {
  perfil = 'editar';
  const r = await request(app).post('/api/plays').send({ name: 'x', club_id: '99999999-9999-4999-8999-999999999999' });
  assert.strictEqual(r.status, 403);
});

function trava(req) {
  return new Promise((resolve) => {
    const res = { status(c) { this.c = c; return this; }, json(b) { resolve({ bloqueado: true, status: this.c, body: b }); return this; } };
    travaClubeArquivado({ query: {}, body: {}, ...req }, res, () => resolve({ bloqueado: false }));
  });
}

test('clube arquivado aberto não trava criar/editar/excluir jogada', async () => {
  assert.strictEqual((await trava({ method: 'POST', originalUrl: '/api/plays', body: { name: 'x', club_id: CLUBE_B } })).bloqueado, false);
  assert.strictEqual((await trava({ method: 'PUT', originalUrl: `/api/plays/${PLAY}`, body: { club_id: CLUBE_B } })).bloqueado, false);
  assert.strictEqual((await trava({ method: 'DELETE', originalUrl: `/api/plays/${PLAY}` })).bloqueado, false);
  // controle: o resto do clube arquivado continua travado
  assert.strictEqual((await trava({ method: 'POST', originalUrl: '/api/athletes', body: { club_id: CLUBE_B } })).status, 409);
});
