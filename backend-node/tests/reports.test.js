// Relatórios PDF: paleta, formatação pt-BR, filtro de anexos, builders e permissão da rota.
// Uso: node --test tests/reports.test.js  (banco simulado; o Chromium não é chamado)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fake = require('./helpers/fakeDb');
fake.instalar();

const { teamPalette, contrast, normalizeHex } = require('../src/reports/theme');
const F = require('../src/reports/format');
const P = require('../src/reports/photos');
const B = require('../src/reports/builders');

// ------------------------------------------------------------------ paleta
test('teamPalette: verde padrão, texto branco e tinta com contraste >= 4.5', () => {
  const p = teamPalette('#1B8A3E');
  assert.strictEqual(p.team, '#1B8A3E');
  assert.strictEqual(p.onTeam, '#FFFFFF');
  assert.ok(contrast(p.teamInk, '#FFFFFF') >= 4.5);
  assert.strictEqual(p.pTat, p.team);
});

test('teamPalette: amarelo usa texto escuro no header e tinta/barra escurecidas', () => {
  const p = teamPalette('#FFD200');
  assert.strictEqual(p.onTeam, '#0F172A');
  assert.ok(contrast(p.teamInk, '#FFFFFF') >= 4.5, 'título legível no branco');
  assert.notStrictEqual(p.teamInk, p.team);
  assert.strictEqual(p.pTat, p.teamInk, 'barras/pilar tático usam a versão escura');
  assert.ok(contrast(p.onTeam, p.team) >= 4.5, 'texto do header legível sobre o amarelo');
});

test('teamPalette: preto mantém texto branco; cor inválida cai no padrão', () => {
  const black = teamPalette('#111111');
  assert.strictEqual(black.onTeam, '#FFFFFF');
  assert.strictEqual(black.teamInk, '#111111');
  assert.strictEqual(teamPalette('azul').team, '#1B8A3E');
  assert.strictEqual(teamPalette(null).team, '#1B8A3E');
  assert.strictEqual(normalizeHex('#abc'), '#AABBCC');
  assert.strictEqual(teamPalette('#15803d').team, '#15803D');
});

// ------------------------------------------------------------------ formatação
test('pluralização e números pt-BR', () => {
  assert.strictEqual(F.plural(1, 'jogo', 'jogos'), '1 jogo');
  assert.strictEqual(F.plural(2, 'jogo', 'jogos'), '2 jogos');
  assert.strictEqual(F.plural(0, 'empate', 'empates'), '0 empates');
  assert.strictEqual(F.plural(1, 'vitória', 'vitórias'), '1 vitória');
  assert.strictEqual(F.dec1(5), '5,0');
  assert.strictEqual(F.dec1(4.25), '4,3');
  assert.strictEqual(F.dec1(null), '—');
  assert.strictEqual(F.int(1690), '1.690');
  assert.strictEqual(F.signed(1), '+1');
  assert.strictEqual(F.signed(-2), '-2');
  assert.strictEqual(F.pct(1, 3), 33);
  assert.strictEqual(F.pct(1, 0), 0);
});

test('tempo: KPI "4h51" / "15 min"; tabela "3h06" / "0h15"', () => {
  assert.strictEqual(F.duration(291), '4h51');
  assert.strictEqual(F.duration(15), '15 min');
  assert.strictEqual(F.duration(186, 'table'), '3h06');
  assert.strictEqual(F.duration(15, 'table'), '0h15');
});

test('datas: dd/mm, dia da semana, semana ISO e intervalo', () => {
  assert.strictEqual(F.ddmm('2026-10-19'), '19/10');
  assert.strictEqual(F.ddmmyy('2026-10-20'), '20/10/26');
  assert.strictEqual(F.weekdayLong('2026-10-19'), 'Segunda-feira');
  assert.strictEqual(F.weekdayShort('2026-10-25'), 'Dom');
  assert.deepStrictEqual(F.isoWeek('2026-10-19'), { year: 2026, week: 43 });
  assert.strictEqual(F.rangeShort('2026-10-19', '2026-10-25'), '19/10 – 25/10');
  assert.strictEqual(F.rangeLong('2025-12-29', '2026-01-04'), '29/12/2025 – 04/01/2026');
  assert.strictEqual(F.mondayOf('2026-10-25'), '2026-10-19');
  assert.strictEqual(F.ddmm(new Date(2026, 9, 19)), '19/10', 'Date do pg (meia-noite local)');
  assert.strictEqual(F.generatedAt(new Date('2026-10-20T12:34:00Z')), '20/10/2026, 09:34', 'horário de Brasília');
});

test('sigla do escudo', () => {
  assert.strictEqual(F.initials('Uberlândia EC'), 'UEC');
  assert.strictEqual(F.initials('Esporte Clube Vila Nova'), 'ECV');
  assert.strictEqual(F.initials('Flamengo'), 'FLA');
  assert.strictEqual(F.initials('Clube de Regatas do Flamengo'), 'CRF');
  assert.strictEqual(F.esc('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});

// ------------------------------------------------------------------ anexos
test('filtro de anexos: só imagens (sem SVG), mime ou extensão', () => {
  const files = [
    { file_path: '/uploads/session-files/a.jpg', mime_type: 'image/jpeg' },
    { file_path: '/uploads/session-files/b.png', mime_type: 'image/png' },
    { file_path: '/uploads/session-files/c.webp', mime_type: 'image/webp' },
    { file_path: '/uploads/session-files/d.heic', mime_type: 'image/heic' },
    { file_path: '/uploads/session-files/e.pdf', mime_type: 'application/pdf' },
    { file_path: '/uploads/session-files/f.mp4', mime_type: 'video/mp4' },
    { file_path: '/uploads/session-files/g.svg', mime_type: 'image/svg+xml' },
    { file_path: '/uploads/session-files/h.jpeg', mime_type: null, file_name: 'h.jpeg' },
    { file_path: '/uploads/session-files/i.doc', mime_type: '', file_name: 'i.doc' },
    { file_path: null, mime_type: 'image/jpeg' },
  ];
  const kept = P.filterImageAttachments(files).map((f) => path.basename(f.file_path));
  assert.deepStrictEqual(kept, ['a.jpg', 'b.png', 'c.webp', 'd.heic', 'h.jpeg']);
});

test('fotos: reduz no processo filho (lado máx. 1400px, JPEG) e pula arquivo ilegível', async () => {
  const fs = require('fs');
  const os = require('os');
  const sharp = require('sharp');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rel-fotos-'));
  const big = path.join(dir, 'grande.png');
  await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#1d4ed8' } }).png().toFile(big);
  const bad = path.join(dir, 'quebrada.jpg');
  fs.writeFileSync(bad, 'isto não é uma imagem');
  const [ok, broken] = await P.resizeInWorker([{ path: big }, { path: bad }]);
  assert.strictEqual(broken, null);
  const meta = await sharp(ok).metadata();
  assert.deepStrictEqual([meta.format, meta.width, meta.height], ['jpeg', 1400, 933]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('caminho do anexo fica preso na pasta de uploads', () => {
  const root = '/srv/uploads';
  assert.strictEqual(P.resolveUploadPath('/uploads/session-files/x.jpg', root), '/srv/uploads/session-files/x.jpg');
  assert.strictEqual(P.resolveUploadPath('session-files/x.jpg', root), '/srv/uploads/session-files/x.jpg');
  assert.strictEqual(P.resolveUploadPath('/uploads/../../etc/passwd', root), null);
  assert.strictEqual(P.resolveUploadPath('', root), null);
});

test('arquivo ausente no disco é ignorado sem erro', async () => {
  assert.strictEqual(await P.loadLogo('/uploads/club-logos/nao-existe.png'), null);
  const { photos, hidden } = await P.loadPhotos([{ file_path: '/uploads/session-files/nao-existe.jpg' }], 9);
  assert.deepStrictEqual([photos.length, hidden], [0, 0]);
});

test('legenda e seleção das fotos da sessão (ordem de envio, contexto da atividade)', () => {
  const acts = new Map([['act-1', { blockName: 'Atividade 1', title: 'Escanteios' }]]);
  const files = [
    { id: 2, file_path: '/u/2.jpg', mime_type: 'image/jpeg', title: 'Treino.jpg', file_name: 'Treino.jpg', created_at: '2026-10-19T12:00:00Z' },
    { id: 1, file_path: '/u/1.jpg', mime_type: 'image/jpeg', title: 'Marcação', file_name: 'IMG_1.jpg', activity_id: 'act-1', created_at: '2026-10-19T11:00:00Z' },
    { id: 3, file_path: '/u/3.pdf', mime_type: 'application/pdf', title: 'Plano', file_name: 'p.pdf', created_at: '2026-10-19T10:00:00Z' },
  ];
  const sel = B.selectSessionPhotos(files, acts);
  assert.deepStrictEqual(sel.map((f) => f.id), [1, 2]);
  assert.deepStrictEqual(sel[0].caption, { title: 'Marcação', context: 'Atividade 1 · Escanteios' });
  assert.deepStrictEqual(sel[1].caption, { title: 'Treino', context: '' });
});

test('fotos da semana: rodízio entre os dias e agrupamento por dia', () => {
  const sessions = new Map([['s1', { date: '2026-10-19' }], ['s2', { date: '2026-10-20' }], ['s3', { date: '2026-10-22' }]]);
  const ph = [1, 2, 3, 4, 5].map((i) => ({ id: `a${i}`, session_id: 's1' })).concat([{ id: 'b1', session_id: 's2' }, { id: 'c1', session_id: 's3' }]);
  const order = B.interleaveByDay(ph, sessions).map((p) => p.id);
  assert.deepStrictEqual(order.slice(0, 4), ['a1', 'b1', 'c1', 'a2']);
  const groups = B.groupPhotosByDay(order.slice(0, 4).map((id) => ph.find((p) => p.id === id)), sessions);
  assert.deepStrictEqual(groups.map((g) => [g.label, g.dd, g.items.length]), [['Segunda-feira', '19/10', 2], ['Terça-feira', '20/10', 1], ['Quinta-feira', '22/10', 1]]);
});

// ------------------------------------------------------------------ builders
const TEAM = { name: 'Uberlândia EC', short: 'UEC', modality: 'football_11', modalityLabel: 'Futebol 11', palette: teamPalette('#1B8A3E') };
const WEEK = B.buildPeriod({ start: '2026-10-19', end: '2026-10-25', filterType: '1-micro' });

test('período: semana 43 detectada; períodos longos sem número de semana', () => {
  assert.strictEqual(WEEK.isSingleWeek, true);
  assert.strictEqual(WEEK.weekNumber, 43);
  assert.strictEqual(WEEK.label, 'Microciclo');
  const sem = B.buildPeriod({ start: '2026-07-01', end: '2026-12-31', filterType: 'semester' });
  assert.strictEqual(sem.isSingleWeek, false);
  assert.strictEqual(sem.weekNumber, null);
  assert.strictEqual(sem.label, 'Semestre');
});

test('tipos de gol → 5 categorias (novos e legados)', () => {
  assert.strictEqual(B.goalCategory('org_off'), 'organizacao');
  assert.strictEqual(B.goalCategory('offensive_org'), 'organizacao');
  assert.strictEqual(B.goalCategory('trans_def'), 'transicao');
  assert.strictEqual(B.goalCategory('bp_off_corner'), 'bola_parada');
  assert.strictEqual(B.goalCategory('free_kick'), 'bola_parada');
  assert.strictEqual(B.goalCategory('bp_off_penalty'), 'penalti');
  assert.strictEqual(B.goalCategory('penalty'), 'penalti');
  assert.strictEqual(B.goalCategory('unknown'), 'outros');
});

const GAME_STATS = {
  totalMatches: 1, totalGoalsScored: 1, totalGoalsConceded: 0, wins: 1, draws: 0, losses: 0,
  goalsScoredByType: [{ type: 'org_off', value: 1 }], goalsConcededByType: [],
  goalsScoredByMinute: [{ name: "0-14'", value: 1 }, { name: "15-29'", value: 0 }],
  goalsConcededByMinute: [{ name: "0-14'", value: 0 }, { name: "15-29'", value: 0 }],
  yellowCards: 0, redCards: 0, pointsPlayed: 3, pointsWon: 3, winStreak: 1, unbeatenStreak: 1,
  matchesHistory: [{ session_id: 'g1', date: new Date(2026, 9, 20), opponent: 'Cruzeiro', goals_scored: 1, goals_conceded: 0, result: 'win', match_round: '1', match_location: 'home' }],
  form: [{ result: 'win' }],
  topScorers: [{ name: 'Pablo Thomaz', goals: 1 }], topAssisters: [{ name: 'Thomas Bastos', assists: 1 }],
  topMinutes: [{ name: 'Pablo Thomaz', minutes: 90, appearances: 1 }, { name: 'Nathan', minutes: 88, appearances: 1 }],
  cleanSheets: 1, biggestWin: { date: new Date(2026, 9, 20), opponent: 'Cruzeiro', goals_scored: 1, goals_conceded: 0 }, biggestLoss: null,
  avgTimeFirstGoalFor: 12, avgTimeFirstGoalAgainst: null,
};

test('relatório de jogos: pontuação, legenda no plural certo, gols por tipo e minutagem', () => {
  const vm = B.buildGamesReport({ stats: GAME_STATS, team: TEAM, period: WEEK, defaultDuration: 90 });
  assert.strictEqual(vm.empty, false);
  assert.deepStrictEqual(vm.points, { won: 3, played: 3, aprov: 100 });
  assert.deepStrictEqual(vm.vedLegend, ['1 vitória', '0 empates', '0 derrotas']);
  assert.strictEqual(vm.badgeSub, '2026 · 1 jogo');
  assert.strictEqual(vm.meta, 'Futebol 11 · Microciclo · Semana 43');
  assert.strictEqual(vm.right, 'Semana 43 · 19/10 – 25/10/2026');
  assert.strictEqual(vm.goalsFor.rows[0].label, 'Org. ofensiva');
  assert.strictEqual(vm.goalsFor.rows.length, 5, 'todas as categorias, zeros inclusos');
  assert.strictEqual(vm.goalsAgainst.total, 0, 'vira EmptyState no template');
  assert.strictEqual(vm.kpis.firstAgainst, null, 'nulo vira "—", não 0');
  assert.strictEqual(vm.kpis.home, 1);
  assert.strictEqual(vm.games[0].dateLabel, '20/10/26');
  assert.strictEqual(vm.biggestWin.score, '1×0');
  assert.strictEqual(vm.biggestLoss, null);
  assert.deepStrictEqual(vm.minutes.map((m) => m.pctPossible), [100, 98]);
  assert.strictEqual(vm.minutesPossible, 90);
});

test('relatório de jogos sem jogos no período → vazio', () => {
  const vm = B.buildGamesReport({ stats: { totalMatches: 0, matchesHistory: [] }, team: TEAM, period: WEEK });
  assert.strictEqual(vm.empty, true);
  assert.strictEqual(vm.badgeSub, '2026 · 0 jogos');
});

const TRAIN_STATS = {
  totals: { activities: 7, minutes: 291, sessions: 2, uniqueTemplates: 4 },
  byDimension: [
    { dimension: 'tatico', count: 3, minutes: 186 },
    { dimension: 'fisico', count: 3, minutes: 90 },
    { dimension: 'tecnico', count: 1, minutes: 15 },
  ],
  byDimensionPresence: [{ dimension: 'tatico', sessions: 1 }, { dimension: 'fisico', sessions: 2 }, { dimension: 'tecnico', sessions: 1 }],
  byContent: [
    { name: 'Organização Defensiva', dimension: 'tatico', count: 2, minutes: 86 },
    { name: 'Bola Parada Defensiva', dimension: 'tatico', count: 1, minutes: 100 },
    { name: 'Força', dimension: 'fisico', count: 1, minutes: 60 },
  ],
  sessionsByDate: [
    { session_id: 'mon', date: '2026-10-19', contents: [{ name: 'Bola Parada Defensiva', count: 1, minutes: 100 }, { name: 'Organização Defensiva', count: 2, minutes: 86 }] },
    { session_id: 'tue', date: '2026-10-20', contents: [{ name: 'Força', count: 1, minutes: 60 }] },
  ],
  distance: { daysWithData: 1, avgKm: 5, totalKm: 5, maxKm: 5, granularity: 'day', series: [{ label: '19/10', start: '2026-10-19', avgKm: 5 }], byDay: [{ date: '2026-10-19', km: 5 }] },
};
const SESSIONS = [
  { id: 'mon', date: new Date(2026, 9, 19), session_type: 'training', minutes: 231, avg_distance_km: '5.00' },
  { id: 'tue', date: new Date(2026, 9, 20), session_type: 'match', opponent_name: 'Cruzeiro', minutes: 60 },
  { id: 'wed', date: new Date(2026, 9, 21), session_type: 'rest', minutes: 0 },
  { id: 'thu', date: new Date(2026, 9, 22), session_type: 'training', minutes: 0 },
];

test('relatório de treino: microciclo com treino/jogo/descanso/sem registro e nota do dia', () => {
  const gamesById = new Map([['tue', { goals_scored: 1, goals_conceded: 0, result: 'win' }]]);
  const vm = B.buildTrainingReport({ stats: TRAIN_STATS, sessions: SESSIONS, gamesById, team: TEAM, period: WEEK });
  assert.deepStrictEqual(vm.days.map((d) => d.kind), ['treino', 'jogo', 'descanso', 'vazio', 'vazio', 'vazio', 'vazio']);
  assert.strictEqual(vm.days[0].focus, 'BP Def', 'predominante por tempo, abreviado como na Programação');
  assert.strictEqual(vm.days[1].score, '1×0');
  assert.strictEqual(vm.days[1].result, 'V');
  assert.match(vm.dayNotes[0], /^Ter 20\/10: 60' de Força com os não relacionados/);
  assert.strictEqual(vm.kpis.avgPerSession, 146);
  assert.strictEqual(vm.kpis.matches, 1);
  assert.strictEqual(vm.badgeSub, '2026 · 2 sessões');
  assert.deepStrictEqual(vm.pillars.map((p) => [p.label, p.pctActivities, p.pctTime]), [['Tático', 43, 64], ['Físico', 43, 31], ['Técnico', 14, 5]]);
  assert.deepStrictEqual(vm.topContents[0].rows.map((r) => r.name), ['Bola Parada Defensiva', 'Organização Defensiva'], 'ordenado por minutos');
  assert.strictEqual(vm.distance.sessions, 1);
  assert.strictEqual(vm.distance.series[0].label, 'Seg 19/10');
  assert.strictEqual(vm.weeks, null);
});

test('relatório de treino em período longo: colunas por semana, sem grade diária', () => {
  const period = B.buildPeriod({ start: '2026-09-14', end: '2026-10-11', filterType: '4-micros' });
  const vm = B.buildTrainingReport({ stats: TRAIN_STATS, sessions: SESSIONS, gamesById: new Map(), team: TEAM, period });
  assert.strictEqual(vm.days, null);
  assert.strictEqual(vm.weeks.length, 4);
  assert.strictEqual(vm.meta, 'Futebol 11 · 4 Microciclos');
});

test('relatório de treino vazio', () => {
  const vm = B.buildTrainingReport({ stats: { totals: { activities: 0 }, distance: { daysWithData: 0 } }, sessions: [], team: TEAM, period: WEEK });
  assert.strictEqual(vm.empty, true);
  assert.strictEqual(vm.distance.empty, true);
});

const act = (o) => ({ duration_minutes: 0, contents: [], stages: [], groups: [], ...o });
const SESSION = {
  date: new Date(2026, 9, 19), session_type: 'training', avg_distance_km: '5.00',
  blocks: [
    { name: 'Aquecimento', activity: act({ duration_minutes: 10, contents: [{ name: 'Aeróbio', dimension: 'fisico' }], groups: ['G1'], description: ' desenvolvimento da via aeróbia ' }) },
    { name: 'Preparatório', activity: act({ duration_minutes: 20, contents: [{ name: 'Anaer. Láctico', dimension: 'fisico' }] }) },
    { name: 'Atividade 1', activity: act({ duration_minutes: 100, title: { title: 'Escanteios' }, contents: [{ name: 'Bola Parada Defensiva', dimension: 'tatico' }], stages: [{ stage_name: 'Falta Frontal' }], groups: ['G1', 'G2', 'G3'] }) },
    { name: 'Atividade 2', activity: null },
    { name: 'Atividade 3', activity: act({}) },
    { name: 'Complementos', activity: act({ duration_minutes: 15, title: { title: 'Cruzamentos' }, contents: [{ name: 'Finalização', dimension: 'tecnico' }], groups: ['G1'] }) },
  ],
};

test('ficha de sessão: ignora blocos vazios, minutos acumulados, foco e grupos', () => {
  const vm = B.buildSessionSheet({ session: SESSION, team: TEAM, weekNumber: 43 });
  assert.deepStrictEqual(vm.blocks.map((b) => b.phase), ['Aquecimento', 'Preparatório', 'Atividade 1', 'Complementos']);
  assert.deepStrictEqual(vm.blocks.map((b) => [b.from, b.to]), [[0, 10], [10, 30], [30, 130], [130, 145]]);
  assert.strictEqual(vm.total, 145);
  assert.strictEqual(vm.title, 'Segunda-feira, 19/10');
  assert.strictEqual(vm.eyebrow, 'Ficha de sessão · Semana 43');
  assert.strictEqual(vm.focus, 'BP Def');
  assert.strictEqual(vm.badgeTop, '145 min');
  assert.strictEqual(vm.badgeSub, '5,0 km · 4 blocos');
  assert.deepStrictEqual(vm.groupsAll, ['G1', 'G2', 'G3']);
  assert.deepStrictEqual(vm.pillarsPresent, ['tatico', 'fisico', 'tecnico']);
  assert.strictEqual(vm.blocks[0].title, 'Aeróbio', 'sem título usa o conteúdo');
  assert.strictEqual(vm.blocks[0].description, 'desenvolvimento da via aeróbia');
  assert.strictEqual(vm.blocks[1].groups.length, 0, 'vazio = "Todos" no template');
});

test('ficha de dia de jogo e de descanso', () => {
  const match = B.buildSessionSheet({
    session: { date: '2026-10-20', session_type: 'match', opponent_name: 'Cruzeiro', match_round: '1', match_location: 'home', blocks: [{ name: 'Aquecimento', activity: act({ duration_minutes: 60, contents: [{ name: 'Força', dimension: 'fisico' }] }) }] },
    team: TEAM,
    game: { goals_scored: 1, goals_conceded: 0, result: 'win' },
  });
  assert.strictEqual(match.game.score, '1 × 0');
  assert.strictEqual(match.game.result, 'V');
  assert.strictEqual(match.blocks[0].phase, 'Não relacionados');
  assert.strictEqual(match.distanceKm, null, 'distância só em dia de treino');
  const rest = B.buildSessionSheet({ session: { date: '2026-10-21', session_type: 'rest', blocks: [] }, team: TEAM });
  assert.strictEqual(rest.badgeTop, 'Descanso');
  assert.strictEqual(rest.blocks.length, 0);
});

// ------------------------------------------------------------------ templates (HTML, sem Chromium)
test('templates geram HTML com a cor do time e escapam texto do usuário', () => {
  const { renderGames } = require('../src/reports/templates/games');
  const { renderSession } = require('../src/reports/templates/session');
  const team = { ...TEAM, name: 'Time <script>x</script>', palette: teamPalette('#FFD200') };
  const html = renderGames(B.buildGamesReport({ stats: GAME_STATS, team, period: WEEK }), { now: new Date() });
  assert.ok(html.includes('--team:#FFD200'));
  assert.ok(html.includes('--on-team:#0F172A'));
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(html.includes('Nenhum gol sofrido no período'), 'EmptyState no lugar do gráfico vazio');
  assert.ok(html.includes('fonts/poppins-latin-700-normal.woff2'), 'fontes locais');
  const sheet = renderSession(B.buildSessionSheet({ session: SESSION, team: TEAM, weekNumber: 43 }), { now: new Date() });
  assert.ok(sheet.includes('Grupos: G1, G2, G3'));
  assert.ok(!sheet.includes('Atividade 2'), 'bloco vazio não é impresso');
});

// ------------------------------------------------------------------ rota (permissão + plano)
const reportsPath = require.resolve('../src/reports');
let generated = [];
require.cache[reportsPath] = {
  id: reportsPath, filename: reportsPath, loaded: true,
  exports: {
    PERMISSION: { jogos: 'stats:view', treino: 'stats:view', sessao: 'training:view' },
    ReportError: class extends Error {},
    generateReport: async (tipo, body) => { generated.push({ tipo, body }); return { pdf: Buffer.from('%PDF-1.4 teste'), pages: 2, filename: 'x.pdf' }; },
  },
};

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../src/config/auth');
const requireActiveSubscription = require('../src/middleware/requireActiveSubscription');
const reportsRouter = require('../src/routes/reports');

const DONO = '00000000-0000-4000-8000-0000000000a1';
const MEMBRO = '00000000-0000-4000-8000-0000000000a2';
const WS = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const dia = 24 * 60 * 60 * 1000;
const app = express();
app.use(express.json());
app.use(requireActiveSubscription);
app.use('/api/reports', reportsRouter);
const token = (id) => 'Bearer ' + jwt.sign({ id }, jwtSecret);

function cenario({ subs = [], memberPermissions = null } = {}) {
  const c = fake.reset();
  c.users[DONO] = { email: 'dono@exemplo.com', role: 'coach', cortesia_permanente: false };
  c.users[MEMBRO] = { email: 'membro@exemplo.com', role: 'coach', cortesia_permanente: false };
  c.workspaces[WS] = { owner_id: DONO, name: 'Sub-17' };
  c.members.push({ workspace_id: WS, user_id: MEMBRO, accepted: true, role: 'other', permissions: memberPermissions });
  subs.forEach((s, i) => c.subs.push({ user_id: DONO, workspace_id: WS, created_at: i + 1, ...s }));
  generated = [];
}
const post = (id, tipo = 'treino') => request(app).post(`/api/reports/${tipo}`)
  .set('Authorization', token(id)).set('X-Workspace-Id', WS).send({ club_id: 'c1', start_date: '2026-10-19', end_date: '2026-10-25' });
const ATIVA = { plan_id: 'pro', status: 'active', current_period_end: new Date(Date.now() + 30 * dia).toISOString() };

test('rota: sem token → 401', async () => {
  cenario({ subs: [ATIVA] });
  const r = await request(app).post('/api/reports/treino').send({});
  assert.strictEqual(r.status, 401);
});

test('rota: assinatura ativa gera o PDF (application/pdf)', async () => {
  cenario({ subs: [ATIVA] });
  const r = await post(DONO);
  assert.strictEqual(r.status, 200);
  assert.match(r.headers['content-type'], /application\/pdf/);
  assert.strictEqual(r.headers['x-report-pages'], '2');
  assert.strictEqual(generated[0].tipo, 'treino');
});

test('rota: conta só leitura NÃO exporta (402 PLAN_REQUIRED pdf_export, não READ_ONLY)', async () => {
  cenario();
  const r = await post(DONO);
  assert.strictEqual(r.status, 402);
  assert.strictEqual(r.body.code, 'PLAN_REQUIRED');
  assert.strictEqual(r.body.required_feature, 'pdf_export');
  assert.strictEqual(generated.length, 0);
});

test('rota: membro sem stats:view → 403; com training:view gera a ficha', async () => {
  cenario({ subs: [ATIVA], memberPermissions: ['training:view'] });
  assert.strictEqual((await post(MEMBRO, 'treino')).status, 403);
  assert.strictEqual((await post(MEMBRO, 'jogos')).status, 403);
  assert.strictEqual((await post(MEMBRO, 'sessao')).status, 200);
  // o auth guarda o acesso em cache por 30s: limpa antes de trocar as permissões
  require('../src/middleware/auth').invalidateAccessibleCache();
  cenario({ subs: [ATIVA], memberPermissions: ['stats:view'] });
  assert.strictEqual((await post(MEMBRO, 'sessao')).status, 403);
  assert.strictEqual((await post(MEMBRO, 'jogos')).status, 200);
});

test('rota: tipo desconhecido → 404', async () => {
  cenario({ subs: [ATIVA] });
  assert.strictEqual((await post(DONO, 'plantel')).status, 404);
});
