// Períodos do dia (Manhã/Tarde/Noite) contra um Postgres DE VERDADE (schema de
// produção + migration 057) — ensure, adicionar/trocar/remover período, regras
// de tipo, estatísticas somando, fichas/relatórios e compatibilidade.
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'periodos-test-'));
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

const SEMANA = '2031-11'; // semana longe de qualquer dado: 10/03/2031 (seg) a 16/03/2031
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
  const u = await query(`INSERT INTO users (email, name) VALUES ($1, 'Teste Períodos') RETURNING id`, [`periodos-${Date.now()}@teste.local`]);
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

test('ensure: 7 dias, todos de período único (igual a antes)', async () => {
  const r = await request(app).post('/api/microcycles/ensure').send({ week: SEMANA, club_id: ctx.clubId });
  assert.equal(r.status, 200);
  assert.equal(r.body.sessions.length, 7);
  for (const s of r.body.sessions) {
    assert.equal(s.periodo, null);
    assert.equal(s.periodos, undefined, 'dia de 1 período não ganha campo novo');
    assert.equal(s.blocks.length, 6);
  }
  ctx.antes = r.body.sessions;
  ctx.terca = r.body.sessions[1];
});

test('adicionar período: o treino que existia vira Manhã, o novo é Tarde', async () => {
  // 1º período exige o nome do atual
  let r = await request(app).post(`/api/sessions/${ctx.terca.id}/periodos`).send({ novo: 'tarde' });
  assert.equal(r.status, 400);
  r = await request(app).post(`/api/sessions/${ctx.terca.id}/periodos`).send({ atual: 'tarde', novo: 'tarde' });
  assert.equal(r.status, 400);

  r = await request(app).post(`/api/sessions/${ctx.terca.id}/periodos`).send({ atual: 'manha', novo: 'tarde' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.periodos.map((p) => p.periodo), ['manha', 'tarde']);
  assert.equal(r.body.periodos[0].id, ctx.terca.id, 'os dados que existiam continuam no 1º período');
  assert.equal(r.body.periodos[1].blocks.length, 6);
  ctx.tarde = r.body.id;

  const m = await microciclo();
  assert.equal(m.sessions.length, 7, '`sessions` continua com 1 por dia (app T1/T2)');
  const terca = m.sessions[1];
  assert.equal(terca.id, ctx.terca.id);
  assert.equal(terca.periodo, 'manha');
  assert.deepEqual(terca.periodos.map((p) => p.periodo), ['manha', 'tarde']);
  assert.equal(terca.periodos[1].periodos, undefined, 'sem referência circular');
  JSON.stringify(m); // serializa sem ciclo
});

test('ensure de novo não duplica nem mexe nos períodos', async () => {
  const r = await request(app).post('/api/microcycles/ensure').send({ week: SEMANA, club_id: ctx.clubId });
  assert.equal(r.status, 200);
  assert.equal(r.body.sessions.length, 7);
  const n = await query('SELECT COUNT(*)::int AS n FROM training_sessions WHERE workspace_id = $1', [ctx.wsId]);
  assert.equal(n.rows[0].n, 8);
  assert.deepEqual(r.body.sessions[1].periodos.map((p) => p.periodo), ['manha', 'tarde']);
});

test('regras: período repetido, máximo 3, descanso do dia, 1 jogo por dia', async () => {
  let r = await request(app).post(`/api/sessions/${ctx.terca.id}/periodos`).send({ novo: 'tarde' });
  assert.equal(r.status, 409);
  r = await request(app).post(`/api/sessions/${ctx.tarde}/periodos`).send({ novo: 'noite' });
  assert.equal(r.status, 201);
  ctx.noite = r.body.id;
  r = await request(app).post(`/api/sessions/${ctx.terca.id}/periodos`).send({ novo: 'manha' });
  assert.equal(r.status, 409, 'máximo de 3');
  // o índice novo também segura (corrida entre dois cliques)
  await assert.rejects(query(
    `INSERT INTO training_sessions (microcycle_id, date, day_name, day_of_week, workspace_id, club_id, periodo)
     SELECT microcycle_id, date, day_name, day_of_week, workspace_id, club_id, 'noite' FROM training_sessions WHERE id = $1`, [ctx.terca.id]),
  /duplicate key/);

  r = await request(app).put(`/api/sessions/${ctx.noite}/type`).send({ session_type: 'rest' });
  assert.equal(r.status, 409, 'descanso é do dia inteiro');
  r = await request(app).put(`/api/sessions/${ctx.tarde}/type`).send({ session_type: 'match', opponent_name: 'Rival FC' });
  assert.equal(r.status, 200);
  r = await request(app).put(`/api/sessions/${ctx.noite}/type`).send({ session_type: 'match', opponent_name: 'Outro' });
  assert.equal(r.status, 409, 'só 1 jogo por dia');
  // dia de descanso não ganha período
  const quarta = ctx.antes[2];
  await request(app).put(`/api/sessions/${quarta.id}/type`).send({ session_type: 'rest' });
  r = await request(app).post(`/api/sessions/${quarta.id}/periodos`).send({ atual: 'manha', novo: 'tarde' });
  assert.equal(r.status, 409);
  await request(app).put(`/api/sessions/${quarta.id}/type`).send({ session_type: 'training' });
  // volta a Tarde para treino (o resto do teste usa Manhã + Tarde de treino)
  r = await request(app).put(`/api/sessions/${ctx.tarde}/type`).send({ session_type: 'training' });
  assert.equal(r.status, 200);
});

test('trocar o horário de um período', async () => {
  let r = await request(app).put(`/api/sessions/${ctx.noite}/periodo`).send({ periodo: 'tarde' });
  assert.equal(r.status, 409);
  r = await request(app).put(`/api/sessions/${ctx.antes[0].id}/periodo`).send({ periodo: 'tarde' });
  assert.equal(r.status, 409, 'dia de período único não troca horário');
  r = await request(app).put(`/api/sessions/${ctx.noite}/periodo`).send({ periodo: 'xx' });
  assert.equal(r.status, 400);
});

test('estatísticas somam os períodos e o dia conta como 1 sessão', async () => {
  const m = await microciclo();
  const [manha, tarde] = m.sessions[1].periodos;
  await atividade(manha.blocks[0].id, 90, ctx.tatico);
  const a2 = await atividade(tarde.blocks[0].id, 60, ctx.fisico);
  ctx.atividadeTarde = a2.id;
  await request(app).put(`/api/sessions/${manha.id}/distance`).send({ avg_distance_km: 5 });
  await request(app).put(`/api/sessions/${tarde.id}/distance`).send({ avg_distance_km: '3,5' });
  // segunda-feira (período único) para comparar
  await atividade(m.sessions[0].blocks[0].id, 30, ctx.fisico);

  const q = { workspaceIds: [ctx.wsId], start: '2031-03-10', end: '2031-03-16', clubId: ctx.clubId };
  const s = await stats.getTrainingStats(q);
  assert.equal(s.totals.minutes, 180);
  assert.equal(s.totals.sessions, 2, 'terça (2 períodos) = 1 sessão + segunda');
  assert.equal(s.totals.activities, 3);
  assert.equal(s.sessionsWithActivity, 2);
  const tat = s.byDimensionPredominance.find((d) => d.dimension === 'tatico');
  assert.equal(tat.sessions, 1, 'terça: tático predomina por tempo (90 > 60)');
  const pres = s.byDimensionPresence.find((d) => d.dimension === 'fisico');
  assert.equal(pres.sessions, 2, 'físico presente em 2 dias (seg + tarde de terça)');
  assert.equal(s.distance.daysWithData, 1);
  assert.equal(s.distance.byDay[0].km, 8.5, 'distância do dia = soma dos períodos');
  const terca = s.sessionsByDate.find((d) => d.date === '2031-03-11');
  assert.equal(terca.session_id, manha.id);
  assert.equal(terca.contents.length, 2);
});

test('relatórios: ficha com os períodos em sequência, só um período, semana com a divisão', async () => {
  const m = await microciclo();
  const [manha, tarde] = m.sessions[1].periodos;
  const { html } = await viewSessionSheet({ session_id: tarde.id }, usuario);
  assert.match(html, /Linha do tempo · Manhã/);
  assert.match(html, /Linha do tempo · Tarde/);
  assert.match(html, /150 min/);
  assert.ok(html.indexOf('Linha do tempo · Manhã') < html.indexOf('Linha do tempo · Tarde'));

  const so = await viewSessionSheet({ session_id: tarde.id, so_periodo: true }, usuario);
  assert.doesNotMatch(so.html, /Linha do tempo · Manhã/);
  assert.match(so.html, /60 min/);

  const seg = await viewSessionSheet({ session_id: m.sessions[0].id }, usuario);
  assert.doesNotMatch(seg.html, /per-h"/, 'dia de período único: ficha de antes');
  assert.match(seg.html, /30 min/);

  const semana = await BUILDERS.treino({ club_id: ctx.clubId, start_date: '2031-03-10', end_date: '2031-03-16', filter_type: '1-micro', include_photos: false }, usuario, new Map(), 'pdf');
  assert.match(semana.html, /90\+60/);
  assert.match(semana.html, /Manhã 90(&#39;|&#x27;|') \+ Tarde 60(&#39;|&#x27;|') = 150/);
  assert.equal(manha.periodo, 'manha');
});

test('remover período apaga atividades e anexos; sobrando 1, o dia volta a ser único', async () => {
  // anexo da atividade da Tarde (registro + arquivo no disco)
  const dir = path.join(TMP, 'session-files');
  fs.mkdirSync(dir, { recursive: true });
  const arq = path.join(dir, 'teste-periodo.jpg');
  fs.writeFileSync(arq, 'x');
  await query(
    `INSERT INTO training_activity_files (session_id, activity_id, title, file_path, file_name, mime_type, workspace_id)
     VALUES ($1, $2, 'foto', '/uploads/session-files/teste-periodo.jpg', 'teste-periodo.jpg', 'image/jpeg', $3)`,
    [ctx.tarde, ctx.atividadeTarde, ctx.wsId]
  );

  let r = await request(app).delete(`/api/sessions/${ctx.antes[0].id}/periodo`);
  assert.equal(r.status, 409, 'dia de período único não remove');

  r = await request(app).delete(`/api/sessions/${ctx.tarde}/periodo`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.anexos_apagados, 1);
  assert.equal(fs.existsSync(arq), false, 'arquivo apagado do disco');
  assert.deepEqual(r.body.periodos.map((p) => p.periodo), ['manha', 'noite']);
  const sobra = await query('SELECT COUNT(*)::int AS n FROM training_activities WHERE id = $1', [ctx.atividadeTarde]);
  assert.equal(sobra.rows[0].n, 0);

  r = await request(app).delete(`/api/sessions/${ctx.noite}/periodo`);
  assert.equal(r.status, 200);
  assert.equal(r.body.periodos.length, 1);
  assert.equal(r.body.periodos[0].periodo, null, 'volta a período único');

  const m = await microciclo();
  assert.equal(m.sessions[1].id, ctx.terca.id);
  assert.equal(m.sessions[1].periodo, null);
  assert.equal(m.sessions[1].periodos, undefined);
  assert.equal(m.sessions[1].blocks[0].activity.duration_minutes, 90, 'Manhã (o treino original) ficou intacto');
});

test('compatibilidade: dias sem período idênticos ao ensure inicial', async () => {
  const m = await microciclo();
  const limpar = (s) => ({ id: s.id, date: s.date, day_name: s.day_name, day_of_week: s.day_of_week, periodo: s.periodo, keys: Object.keys(s).sort() });
  for (const i of [3, 4, 5, 6]) assert.deepEqual(limpar(m.sessions[i]), limpar(ctx.antes[i]));
});
