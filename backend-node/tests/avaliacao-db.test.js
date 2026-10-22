// Período de AVALIAÇÃO contra um Postgres DE VERDADE (schema de produção + 057/058/059):
// manhã de avaliação + tarde de treino, tipo com chips, estatísticas SEM a avaliação,
// ficha e semana. Mesmo banco descartável do teste de períodos.
// Só roda com PERIODOS_TEST_DB=<url de um banco DESCARTÁVEL> (senão: pulado).
// Ex.: PERIODOS_TEST_DB=postgresql://sports_admin:...@localhost:5432/sports_periodos_test \
//        node --test tests/periodos-db.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL_DB = process.env.PERIODOS_TEST_DB;
if (!URL_DB) {
  test('períodos no banco (pulado: defina PERIODOS_TEST_DB)', { skip: true }, () => {});
  return;
}
if (/\/sports_platform(\?|$)/.test(URL_DB)) throw new Error('PERIODOS_TEST_DB não pode ser o banco de produção');

process.env.DATABASE_URL = URL_DB;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avaliacao-test-'));
process.env.UPLOAD_DIR = TMP;

// auth simulada: dono da workspace de teste
let usuario = null;
const authPath = path.join(__dirname, '../src/middleware/auth.js');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: (req, res, next) => { req.user = usuario; next(); } };

const express = require('express');
const request = require('supertest');
const { pool, query } = require('../src/config/database');
const stats = require('../src/services/statsData');
const { BUILDERS, viewSessionSheet } = require('../src/reports');

const app = express();
app.use(express.json());
app.use('/api/microcycles', require('../src/routes/microcycles'));
app.use('/api/sessions', require('../src/routes/sessions'));
app.use('/api/activities', require('../src/routes/activities'));

const SEMANA = '2031-12'; // 17/03/2031 (seg) a 23/03/2031
const ctx = {};

function dono(wsId, clubId) {
  return {
    id: ctx.userId,
    workspaceIds: [wsId],
    allowedCategoryIds: null,
    can: () => true,
    readableWorkspaceForClub: (c) => (c === clubId ? wsId : null),
    writableWorkspaceForClub: (c) => (c === clubId ? wsId : null),
    canWriteWorkspace: (w) => w === wsId,
    assertCanAccessCategory: () => true,
  };
}

async function microciclo() {
  const r = await request(app).get(`/api/microcycles?week=${SEMANA}&club_id=${ctx.clubId}`);
  assert.equal(r.status, 200);
  return r.body;
}

async function atividade(blockId, minutos, contentId) {
  const r = await request(app).post('/api/activities').send({ block_id: blockId, duration_minutes: minutos, selectedContents: [contentId] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

test.before(async () => {
  const u = await query(`INSERT INTO users (email, name) VALUES ($1, 'Teste Avaliação') RETURNING id`, [`avaliacao-${Date.now()}@teste.local`]);
  ctx.userId = u.rows[0].id;
  const w = await query(`INSERT INTO workspaces (name, owner_id) VALUES ('WS Períodos', $1) RETURNING id`, [ctx.userId]);
  ctx.wsId = w.rows[0].id;
  const c = await query(`INSERT INTO clubs (name, workspace_id, modality) VALUES ('Clube Períodos', $1, 'football_11') RETURNING id`, [ctx.wsId]);
  ctx.clubId = c.rows[0].id;
  const tat = await query(`INSERT INTO contents (name, dimension, workspace_id) VALUES ('Organização Ofensiva', 'tatico', $1) RETURNING id`, [ctx.wsId]);
  const fis = await query(`INSERT INTO contents (name, dimension, workspace_id) VALUES ('Resistência', 'fisico', $1) RETURNING id`, [ctx.wsId]);
  ctx.tatico = tat.rows[0].id;
  ctx.fisico = fis.rows[0].id;
  usuario = dono(ctx.wsId, ctx.clubId);
});

test.after(async () => {
  if (ctx.wsId) await query('DELETE FROM workspaces WHERE id = $1', [ctx.wsId]);
  if (ctx.userId) await query('DELETE FROM users WHERE id = $1', [ctx.userId]);
  await pool.end();
  fs.rmSync(TMP, { recursive: true, force: true });
});


test('ensure + manhã de avaliação + tarde de treino', async () => {
  const r = await request(app).post('/api/microcycles/ensure').send({ week: SEMANA, club_id: ctx.clubId });
  assert.equal(r.status, 200);
  const seg = r.body.sessions[0];
  ctx.seg = seg.id;
  ctx.qua = r.body.sessions[2].id;
  // tipo inválido / "Outra" sem texto
  let x = await request(app).put(`/api/sessions/${seg.id}/type`).send({ session_type: 'assessment', assessment_types: ['nutricional'] });
  assert.equal(x.status, 400);
  x = await request(app).put(`/api/sessions/${seg.id}/type`).send({ session_type: 'assessment', assessment_types: ['outra'] });
  assert.equal(x.status, 400);
  x = await request(app).put(`/api/sessions/${seg.id}/type`).send({ session_type: 'assessment', assessment_types: ['tecnica', 'fisica'], opponent_name: 'X' });
  assert.equal(x.status, 200, JSON.stringify(x.body));
  assert.deepEqual(x.body.assessment_types, ['fisica', 'tecnica']);
  assert.equal(x.body.opponent_name, null);
  // tarde de treino
  x = await request(app).post(`/api/sessions/${seg.id}/periodos`).send({ novo: 'tarde' });
  assert.equal(x.status, 201, JSON.stringify(x.body));
  ctx.segTarde = x.body.id;
  assert.deepEqual(x.body.periodos.map((p) => [p.periodo, p.session_type]), [['manha', 'assessment'], ['tarde', 'training']]);
  // período novo já de avaliação (noite)
  x = await request(app).post(`/api/sessions/${seg.id}/periodos`).send({ novo: 'noite', tipo: 'assessment', assessment_types: [], assessment_other: 'Yo-Yo' });
  assert.equal(x.status, 201, JSON.stringify(x.body));
  const noite = x.body.periodos.find((p) => p.periodo === 'noite');
  assert.equal(noite.session_type, 'assessment');
  assert.deepEqual(noite.assessment_types, ['outra']);
  assert.equal(noite.assessment_other, 'Yo-Yo');
  ctx.segNoite = noite.id;
  // quarta: só avaliação
  x = await request(app).put(`/api/sessions/${ctx.qua}/type`).send({ session_type: 'assessment', assessment_types: ['antropometrica'] });
  assert.equal(x.status, 200);
  const m = await microciclo();
  assert.equal(m.sessions.length, 7);
  assert.equal(m.sessions[0].session_type, 'assessment');
  assert.equal(m.sessions[0].periodos.length, 3);
});

test('estatísticas: avaliação não soma minutos, pilares nem sessão', async () => {
  const m = await microciclo();
  const tarde = m.sessions[0].periodos.find((p) => p.periodo === 'tarde');
  await atividade(tarde.blocks[0].id, 125, ctx.tatico);
  // atividade "esquecida" num período que virou avaliação (era treino antes)
  const qua = m.sessions[2];
  await request(app).put(`/api/sessions/${qua.id}/type`).send({ session_type: 'training' });
  await atividade(qua.blocks[0].id, 40, ctx.fisico);
  await request(app).put(`/api/sessions/${qua.id}/type`).send({ session_type: 'assessment', assessment_types: ['antropometrica'] });
  const q = { workspaceIds: [ctx.wsId], start: '2031-03-17', end: '2031-03-23', clubId: ctx.clubId };
  const s = await stats.getTrainingStats(q);
  assert.equal(s.totals.minutes, 125, 'os 40 da avaliação ficam de fora');
  assert.equal(s.totals.sessions, 1, 'quarta (só avaliação) não é sessão de treino');
  assert.equal(s.totals.activities, 1);
  assert.deepEqual(s.byDimension.map((d) => d.dimension), ['tatico']);
  assert.equal(s.assessments, undefined, 'avaliação não aparece nas estatísticas');
  const seg = s.sessionsByDate.find((d) => d.date === '2031-03-17');
  assert.equal(seg.session_id, tarde.id, 'o dia nas estatísticas é o 1º período de treino');
  assert.deepEqual(seg.pillarMinutes, { tatico: 125 });
  const ps = await stats.getPeriodSessions(q);
  assert.equal(ps.find((x) => x.id === qua.id).minutes, 0);
});

test('relatórios: ficha com o card de avaliação; semana com AVALIAÇÃO e sem "125+0"', async () => {
  const { html } = await viewSessionSheet({ session_id: ctx.seg }, usuario);
  assert.match(html, /Avaliação · Física, Técnica/);
  assert.match(html, /Avaliação · Yo-Yo/);
  assert.match(html, /Linha do tempo · Tarde/);
  assert.match(html, /125 min/);
  const qua = await viewSessionSheet({ session_id: ctx.qua }, usuario);
  assert.match(qua.html, /Avaliação · Antropométrica/);
  assert.doesNotMatch(qua.html, /40 min/);

  const semana = await BUILDERS.treino({ club_id: ctx.clubId, start_date: '2031-03-17', end_date: '2031-03-23', filter_type: '1-micro', include_photos: false }, usuario, new Map(), 'pdf');
  assert.doesNotMatch(semana.html, /125\+0/);
  assert.match(semana.html, /Treino \+ Avaliação/);
  assert.match(semana.html, /class="day assess"/);
  assert.match(semana.html, /Antropométrica/);
  assert.match(semana.html, /class="pbar"/);
});

test('trocar avaliação para treino limpa os tipos (app antigo segue igual)', async () => {
  const x = await request(app).put(`/api/sessions/${ctx.segNoite}/type`).send({ session_type: 'training' });
  assert.equal(x.status, 200);
  assert.equal(x.body.assessment_types, null);
  assert.equal(x.body.assessment_other, null);
});
