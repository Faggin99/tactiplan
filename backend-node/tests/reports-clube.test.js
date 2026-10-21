// Relatório do clube (temporada): minutos trabalhados (regra única), builder,
// agrupamento do plantel por setor, template e permissão da rota.
// Uso: node --test tests/reports-clube.test.js
const test = require('node:test');
const assert = require('node:assert');
const fake = require('./helpers/fakeDb');
fake.instalar();

const { minutosTrabalhados } = require('../src/services/statsData');
const B = require('../src/reports/builders');
const { teamPalette } = require('../src/reports/theme');
const { renderClube } = require('../src/reports/templates/clube');

// ------------------------------------------------------------------ minutos trabalhados
test('minutos trabalhados: todas as atividades, uma vez cada, inclusive dia de jogo e sem conteúdo', () => {
  const rows = [
    // segunda (treino): 6 atividades, 125 min
    { id: 'a1', duration_minutes: 10, session_id: 'seg' }, { id: 'a2', duration_minutes: 20, session_id: 'seg' },
    { id: 'a3', duration_minutes: 30, session_id: 'seg' }, { id: 'a4', duration_minutes: 30, session_id: 'seg' },
    { id: 'a5', duration_minutes: 20, session_id: 'seg' }, { id: 'a6', duration_minutes: 15, session_id: 'seg' },
    // terça (jogo): "Não relacionados" 60 min
    { id: 'nr', duration_minutes: 60, session_id: 'ter' },
  ];
  assert.strictEqual(minutosTrabalhados(rows), 185);
  // a mesma atividade em 2 linhas (2 conteúdos no JOIN) conta uma vez
  assert.strictEqual(minutosTrabalhados([...rows, { id: 'a3', duration_minutes: 30 }]), 185);
  // sem duração = 0; sem conteúdo também entra
  assert.strictEqual(minutosTrabalhados([{ id: 'x', duration_minutes: null }, { id: 'y', duration_minutes: '12' }]), 12);
  assert.strictEqual(minutosTrabalhados([]), 0);
  assert.strictEqual(minutosTrabalhados(null), 0);
});

// ------------------------------------------------------------------ dados (Lauro, temporada 2026)
const team = { name: 'Uberlândia EC', short: 'UEC', modality: 'football_11', modalityLabel: 'Futebol 11', palette: teamPalette('#1B8A3E'), logoUrl: null };
const period = B.buildPeriod({ start: '2026-01-01', end: '2026-12-31' });
const A = (id, name, position, extra = {}) => ({ id, name, position, jersey_number: null, group: null, ...extra });
const SQUAD = [
  A('jef', 'Jeferson', 'GOL'), A('mar', 'Marcelo', 'ZAG'), A('max', 'Max', 'ZAG'), A('sam', 'Samuel', 'LD'),
  A('luf', 'Luis Felipe', 'LE'), A('nat', 'Nathan', 'LE'), A('fum', 'Fumaça', 'VOL'), A('raf', 'Rafinha', 'VOL'),
  A('tho', 'Thomas Bastos', 'MEI'), A('cal', 'Calazans', 'ED'), A('leo', 'Léo reis', 'ED'), A('das', 'Da Silva', 'CA'),
  A('kai', 'Kaike', 'CA'), A('pab', 'Pablo Thomaz', 'CA'),
];
const GAMES = {
  totalMatches: 2, wins: 1, draws: 1, losses: 0, pointsWon: 4, pointsPlayed: 6,
  totalGoalsScored: 2, totalGoalsConceded: 1, winStreak: 0, unbeatenStreak: 2,
  matchesHistory: [
    { session_id: 's1', date: '2026-10-20', opponent: 'Cruzeiro', goals_scored: 1, goals_conceded: 0, result: 'win', match_round: '1', match_location: 'home' },
    { session_id: 's2', date: '2026-10-22', opponent: 'Atlético MG', goals_scored: 1, goals_conceded: 1, result: 'draw', match_round: '2', match_location: 'away' },
  ],
  form: [{ result: 'draw' }, { result: 'win' }],
  playerStats: [
    { athlete_id: 'pab', name: 'Pablo Thomaz', goals: 1, assists: 0, minutes: 189, appearances: 2 },
    { athlete_id: 'raf', name: 'Rafinha', goals: 1, assists: 0, minutes: 93, appearances: 1 },
    { athlete_id: 'sam', name: 'Samuel', goals: 0, assists: 1, minutes: 99, appearances: 2 },
  ],
};
const TRAINING = {
  totals: { activities: 7, minutes: 185, sessions: 2, uniqueTemplates: 5 },
  byDimension: [
    { dimension: 'tatico', count: 3, minutes: 80 }, { dimension: 'fisico', count: 3, minutes: 90 }, { dimension: 'tecnico', count: 1, minutes: 15 },
  ],
  byContent: [
    { name: 'Bola Parada Defensiva', dimension: 'tatico', count: 1, minutes: 30 },
    { name: 'Organização Ofensiva', dimension: 'tatico', count: 1, minutes: 30 },
    { name: 'Organização Defensiva', dimension: 'tatico', count: 1, minutes: 20 },
    { name: 'Aeróbio', dimension: 'fisico', count: 1, minutes: 10 },
    { name: 'Velocidade', dimension: 'fisico', count: 1, minutes: 20 },
    { name: 'Força', dimension: 'fisico', count: 1, minutes: 60 },
    { name: 'Finalização', dimension: 'tecnico', count: 1, minutes: 15 },
  ],
};
const build = (over = {}) => B.buildClubReport({ gameStats: GAMES, trainingStats: TRAINING, athletes: SQUAD, team, period, ...over });

test('builder: header da temporada, desempenho e sequência', () => {
  const vm = build();
  assert.strictEqual(vm.meta, 'Futebol 11 · Temporada 2026');
  assert.strictEqual(vm.badgeTop, '01/01 – 31/12');
  assert.strictEqual(vm.badgeSub, '2026 · 2 jogos · 2 sessões · 14 atletas');
  assert.strictEqual(vm.right, 'Temporada 2026 · 01/01 – 31/12');
  assert.deepStrictEqual(vm.games.points, { won: 4, played: 6, aprov: 67 });
  assert.deepStrictEqual(vm.kpis.streak, { kind: 'unbeaten', value: 2, wins: 0 });
  assert.strictEqual(vm.kpis.diff, 1);
  assert.deepStrictEqual(vm.games.form, ['win', 'draw'], 'mais recente à direita');
});

test('builder: sequência "Sem vencer há N" quando o último jogo foi derrota', () => {
  const hist = [
    { date: '2026-03-01', result: 'win' }, { date: '2026-03-08', result: 'draw' }, { date: '2026-03-15', result: 'loss' },
  ];
  assert.deepStrictEqual(B.clubStreak(hist, 0, 0), { kind: 'winless', value: 2, wins: 0 });
  assert.deepStrictEqual(B.clubStreak([], 0, 0), { kind: 'none', value: 0, wins: 0 });
});

test('builder: treinos com minutos trabalhados, média por sessão e pilares por tempo', () => {
  const t = build().training;
  assert.deepStrictEqual([t.minutes, t.sessions, t.activities, t.distinctContents, t.avgPerSession], [185, 2, 7, 7, 93]);
  assert.strictEqual(t.useTime, true);
  assert.deepStrictEqual(t.pillars.map((p) => [p.label, p.activities, p.pct]), [['Físico', 3, 49], ['Tático', 3, 43], ['Técnico', 1, 8]]);
  assert.deepStrictEqual(t.pillars[1].chips, ['Bola Parada Def.', 'Org. Ofensiva', 'Org. Defensiva']);
  // mais de 8 conteúdos num pilar: 8 + "+N"
  const many = { ...TRAINING, byContent: Array.from({ length: 11 }, (_, i) => ({ name: `C${i}`, dimension: 'tatico', count: 11 - i, minutes: 0 })) };
  const p = B.buildClubTraining(many).pillars.find((x) => x.key === 'tatico');
  assert.deepStrictEqual([p.chips.length, p.more, p.chips[0]], [8, 3, 'C0']);
});

test('plantel: setor pela posição CADASTRADA, ordem por posição e nome, estatísticas por atleta', () => {
  const sq = build().squad;
  assert.strictEqual(sq.total, 14);
  assert.strictEqual(sq.noGroup, true);
  assert.deepStrictEqual(sq.sectors.map((s) => [s.label, s.count]), [['Goleiros', 1], ['Defensores', 5], ['Meio-campistas', 3], ['Atacantes', 5]]);
  assert.deepStrictEqual(sq.sectors[1].players.map((p) => p.name), ['Marcelo', 'Max', 'Samuel', 'Luis Felipe', 'Nathan']);
  assert.deepStrictEqual(sq.sectors[3].players.map((p) => p.pos), ['ED', 'ED', 'CA', 'CA', 'CA']);
  assert.strictEqual(sq.withStats, true);
  const pablo = sq.sectors[3].players.find((p) => p.name === 'Pablo Thomaz');
  assert.deepStrictEqual(pablo.stats, { games: 2, minutes: 189, goals: 1, assists: 0 });
  const kaike = sq.sectors[3].players.find((p) => p.name === 'Kaike');
  assert.deepStrictEqual(kaike.stats, { games: 0, minutes: 0, goals: 0, assists: 0 }, 'sem jogo: zeros');
  assert.deepStrictEqual(sq.composition.map((c) => c.count), [1, 5, 3, 5]);
});

test('plantel: posição desconhecida vai para "Outros"; grupos viram chip; futsal', () => {
  const sq = B.buildSquad([
    A('a', 'Ana', 'XYZ'), A('b', 'Bia', 'FIX', { group: '1' }), A('c', 'Cia', 'ALA-D', { group: 'DM' }), A('d', 'Dé', 'PIV'), A('e', 'Edu', null),
  ], []);
  assert.strictEqual(sq.withStats, false);
  assert.strictEqual(sq.noGroup, false);
  assert.deepStrictEqual(sq.sectors.map((s) => [s.key, s.count]), [['gol', 0], ['def', 1], ['mei', 1], ['ata', 1], ['outros', 2]]);
  assert.deepStrictEqual(sq.sectors[1].players[0].group, 'G1');
  assert.deepStrictEqual(sq.sectors[2].players[0].group, 'DM');
});

// ------------------------------------------------------------------ template
test('template: 2 páginas (resumo + plantel), tabela agrupada por setor com estatísticas', () => {
  const html = renderClube(build(), { now: new Date('2026-10-20T20:00:00Z') });
  assert.strictEqual((html.match(/<section class="page" data-subtitle/g) || []).length, 2);
  for (const s of ['Relatório do clube', 'Desempenho', 'Histórico de jogos', 'Minutos trabalhados', '3h05', '185 min', '93 min por sessão',
    'Distribuição por pilar', 'por tempo de treino', 'Invicto há', 'Composição do plantel', 'todos sem grupo definido', 'Meio-campistas']) {
    assert.ok(html.includes(s), `falta "${s}"`);
  }
  assert.ok(html.includes('class="sgrp"'), 'linha separadora por setor');
  assert.ok(html.includes('<th class="c" style="width:13mm">Jogos</th>'));
  assert.ok(!html.includes('class="sector"'), 'com estatísticas: tabela, não os cards');
  assert.ok(html.includes('class="poschip" style="--c:var(--s-gol)">GOL<'));
});

test('template: sem estatísticas → cards por setor; sem jogos/treinos → estados vazios', () => {
  const html = renderClube(build({ gameStats: { totalMatches: 0, matchesHistory: [], playerStats: [] }, trainingStats: { totals: {} } }), { now: new Date() });
  assert.ok(html.includes('Nenhum jogo registrado neste período'));
  assert.ok(html.includes('Nenhum treino registrado neste período'));
  assert.strictEqual((html.match(/class="sector"/g) || []).length, 4);
  const noSquad = renderClube(build({ squadAllowed: false }), { now: new Date() });
  assert.ok(noSquad.includes('Sem permissão para ver o plantel'));
  assert.ok(!build({ squadAllowed: false }).badgeSub.includes('atletas'));
});

test('template: escapa texto do usuário', () => {
  const html = renderClube(build({ athletes: [A('x', '<b>Zé</b>', 'GOL')] }), { now: new Date() });
  assert.ok(html.includes('&lt;b&gt;Zé&lt;/b&gt;') && !html.includes('<b>Zé</b>'));
});

// ------------------------------------------------------------------ rota (permissão + plano)
const R = require('../src/reports');
let generated = [];
R.generateReport = async (tipo, body) => { generated.push({ tipo, body }); return { pdf: Buffer.from('%PDF-1.4 teste'), pages: 2, filename: 'x.pdf' }; };

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../src/config/auth');
const requireActiveSubscription = require('../src/middleware/requireActiveSubscription');
const reportsRouter = require('../src/routes/reports');

const DONO = '00000000-0000-4000-8000-0000000000b1';
const MEMBRO = '00000000-0000-4000-8000-0000000000b2';
const WS = 'aaaaaaaa-0000-4000-8000-0000000000b1';
const app = express();
app.use(express.json());
app.use(requireActiveSubscription);
app.use('/api/reports', reportsRouter);
const token = (id) => 'Bearer ' + jwt.sign({ id }, jwtSecret);
const ATIVA = { plan_id: 'pro', status: 'active', current_period_end: new Date(Date.now() + 30 * 864e5).toISOString() };

function cenario({ subs = [], memberPermissions = null } = {}) {
  require('../src/middleware/auth').invalidateAccessibleCache();
  const c = fake.reset();
  c.users[DONO] = { email: 'dono@exemplo.com', role: 'coach', cortesia_permanente: false };
  c.users[MEMBRO] = { email: 'membro@exemplo.com', role: 'coach', cortesia_permanente: false };
  c.workspaces[WS] = { owner_id: DONO, name: 'Sub-17' };
  c.members.push({ workspace_id: WS, user_id: MEMBRO, accepted: true, role: 'other', permissions: memberPermissions });
  subs.forEach((s, i) => c.subs.push({ user_id: DONO, workspace_id: WS, created_at: i + 1, ...s }));
  generated = [];
}
const post = (id) => request(app).post('/api/reports/clube').set('Authorization', token(id)).set('X-Workspace-Id', WS).send({ club_id: 'c1' });

test('rota clube: permissão stats:view (a real, do módulo) e gate pdf_export', async () => {
  assert.strictEqual(R.PERMISSION.clube, 'stats:view');
  cenario({ subs: [ATIVA] });
  const ok = await post(DONO);
  assert.strictEqual(ok.status, 200);
  assert.match(ok.headers['content-type'], /application\/pdf/);
  assert.deepStrictEqual(generated[0], { tipo: 'clube', body: { club_id: 'c1' } });

  cenario({ subs: [ATIVA], memberPermissions: ['training:view', 'athletes:view'] });
  assert.strictEqual((await post(MEMBRO)).status, 403);
  cenario({ subs: [ATIVA], memberPermissions: ['stats:view'] });
  assert.strictEqual((await post(MEMBRO)).status, 200);

  cenario();
  const ro = await post(DONO);
  assert.strictEqual(ro.status, 402);
  assert.strictEqual(ro.body.required_feature, 'pdf_export');
});
