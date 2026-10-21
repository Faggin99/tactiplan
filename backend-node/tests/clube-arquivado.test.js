// Clube arquivado = só leitura (409 CLUB_ARCHIVED) + limite conta só clubes ATIVOS.
// Banco simulado. Uso: node --test tests/clube-arquivado.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ARQ = '11111111-1111-4111-8111-111111111111';   // clube arquivado
const ATIVO = '22222222-2222-4222-8222-222222222222'; // clube ativo
const ATLETA_ARQ = '33333333-3333-4333-8333-333333333333';
const SESSAO_ARQ = '44444444-4444-4444-8444-444444444444';

const consultas = [];
const dbPath = path.join(__dirname, '../src/config/database.js');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    query: async (sql, params) => {
      consultas.push({ sql, params });
      if (/FROM clubs WHERE id = ANY\(\$1::uuid\[\]\) AND archived_at IS NOT NULL/.test(sql)) {
        return { rows: params[0].includes(ARQ) ? [{ id: ARQ, name: 'Time Antigo' }] : [] };
      }
      if (/FROM athletes WHERE id = \$1/.test(sql)) return { rows: params[0] === ATLETA_ARQ ? [{ club_id: ARQ }] : [] };
      if (/FROM training_sessions s/.test(sql)) return { rows: params[0] === SESSAO_ARQ ? [{ club_id: ARQ }] : [] };
      return { rows: [] };
    },
  },
};

const { travaClubeArquivado } = require('../src/utils/clubArquivado');

function rodar(req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ bloqueado: true, status: this.statusCode, body: b }); return this; },
    };
    travaClubeArquivado({ query: {}, body: {}, ...req }, res, () => resolve({ bloqueado: false }));
  });
}

test('escrita com club_id de clube arquivado → 409 com mensagem clara', async () => {
  const r = await rodar({ method: 'POST', originalUrl: '/api/athletes', body: { club_id: ARQ, name: 'x' } });
  assert.strictEqual(r.bloqueado, true);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.code, 'CLUB_ARCHIVED');
  assert.match(r.body.error, /arquivado/);
  assert.match(r.body.error, /Time Antigo/);
});

test('escrita em recurso de clube arquivado (atleta, sessão) → 409', async () => {
  assert.strictEqual((await rodar({ method: 'PUT', originalUrl: `/api/athletes/${ATLETA_ARQ}`, body: { name: 'y' } })).status, 409);
  assert.strictEqual((await rodar({ method: 'POST', originalUrl: `/api/games/${SESSAO_ARQ}`, body: {} })).status, 409);
  assert.strictEqual((await rodar({ method: 'PUT', originalUrl: `/api/sessions/${SESSAO_ARQ}/type`, body: {} })).status, 409);
});

test('leitura, clube ativo, biblioteca da conta e arquivar/desarquivar passam', async () => {
  assert.strictEqual((await rodar({ method: 'GET', originalUrl: `/api/athletes?club_id=${ARQ}`, query: { club_id: ARQ } })).bloqueado, false);
  assert.strictEqual((await rodar({ method: 'POST', originalUrl: '/api/athletes', body: { club_id: ATIVO } })).bloqueado, false);
  assert.strictEqual((await rodar({ method: 'POST', originalUrl: '/api/contents', body: { club_id: ARQ } })).bloqueado, false);
  assert.strictEqual((await rodar({ method: 'POST', originalUrl: `/api/clubs/${ARQ}/unarchive` })).bloqueado, false);
  assert.strictEqual((await rodar({ method: 'DELETE', originalUrl: `/api/clubs/${ARQ}` })).bloqueado, false);
  assert.strictEqual((await rodar({ method: 'POST', originalUrl: '/api/microcycles/ensure', body: { club_id: ARQ } })).bloqueado, false);
});

test('roda uma vez por requisição (vários routers em /api)', async () => {
  const req = { method: 'POST', originalUrl: '/api/athletes', body: { club_id: ATIVO }, query: {} };
  await new Promise((resolve) => travaClubeArquivado(req, {}, resolve));
  const antes = consultas.length;
  const r = await new Promise((resolve) => travaClubeArquivado(req, {}, () => resolve('next')));
  assert.strictEqual(r, 'next');
  assert.strictEqual(consultas.length, antes);
});

test('limite de clubes conta só os NÃO arquivados', () => {
  const fonte = require('fs').readFileSync(path.join(__dirname, '../src/routes/clubs.js'), 'utf8');
  assert.match(fonte, /FROM clubs WHERE workspace_id = \$1 AND archived_at IS NULL/);
  assert.doesNotMatch(fonte, /COUNT\(\*\)::int AS n FROM clubs WHERE workspace_id = \$1'/);
});
