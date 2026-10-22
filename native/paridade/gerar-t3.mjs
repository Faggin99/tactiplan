#!/usr/bin/env node
// Gera native/paridade/t3.json: casos da FASE T3 (Elenco, Staff, Estatísticas, Cadastros)
// calculados pelo CÓDIGO DO WEB sempre que ele existe como função:
//   - formatarNome            → frontend/src/lib/formatarNome.js
//   - posições por modalidade → frontend/src/lib/sportConfig.js (POSITIONS, MODALITY_LABELS)
//   - ordem por posição       → mapa `positionOrder` do PlantelPage.jsx (lido do arquivo)
//   - papéis e permissões     → frontend/src/lib/memberPermissions.js
//   - formatMinutes           → components/stats/TrainingDashboard.jsx (lido do arquivo)
//   - "Minutagem completa"    → ordenação do AllMinutesModal (GameStatsContent.jsx)
//   - cards de jogos          → GameSummaryCards (mesmas contas, transcritas abaixo)
//   - filtros de período      → TrainingStatsPage.jsx (mesmas contas, transcritas abaixo)
// Os testes do app (TactiPlanKit e Android) leem este arquivo e conferem o MESMO resultado.
//   node native/paridade/gerar-t3.mjs          → regrava o arquivo
//   node native/paridade/gerar-t3.mjs --check  → falha se o web mudou e o arquivo não
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const SAIDA = path.join(AQUI, 't3.json');

const { formatarNome } = await import(path.join(RAIZ, 'frontend/src/lib/formatarNome.js'));
const sport = await import(path.join(RAIZ, 'frontend/src/lib/sportConfig.js'));
const perms = await import(path.join(RAIZ, 'frontend/src/lib/memberPermissions.js'));

// positionOrder do PlantelPage (objeto literal no corpo do componente)
function positionOrder() {
  const src = ler('frontend/src/modules/training-management/pages/PlantelPage.jsx');
  const i = src.indexOf('const positionOrder = {');
  if (i < 0) throw new Error('PlantelPage sem positionOrder');
  const j = src.indexOf('};', i);
  // eslint-disable-next-line no-new-func
  return new Function(`${src.slice(i, j + 2)}\nreturn positionOrder;`)();
}

function pegaFuncao(arquivo, nome) {
  const src = ler(arquivo);
  const i = src.indexOf(`function ${nome}(`);
  if (i < 0) throw new Error(`${arquivo} sem ${nome}`);
  let n = 0; let j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') n++; else if (src[j] === '}') { n--; if (n === 0) break; } }
  // eslint-disable-next-line no-new-func
  return new Function(`${src.slice(i, j + 1)}\nreturn ${nome};`)();
}

const formatMinutes = pegaFuncao('frontend/src/components/stats/TrainingDashboard.jsx', 'formatMinutes');
const ORDEM = positionOrder();

// ---- Elenco
const nomes = [
  'alcindo de oliveira neto', 'JOÃO DA SILVA', 'Léo reis', 'ana-maria  souza', "d'avila santos", "pedro d'avila",
  "o'neil costa", 'joão silva ii', 'McDonald silva', '  maria   das dores  ', 'josé e silva', 'van basten', 'gustavo von held',
  'ÉRICA ÁVILA', 'kauã dos santos', '',
];
const atletas = [
  { name: 'Zeca', position: 'CA' }, { name: 'Álvaro', position: 'GOL' }, { name: 'Alice', position: 'GOL' },
  { name: 'Bruno', position: 'LD' }, { name: 'Caio', position: 'ZAG' }, { name: 'Davi', position: 'LE' },
  { name: 'Enzo', position: 'VOL' }, { name: 'Fábio', position: 'MEI' }, { name: 'Gil', position: 'ED' },
  { name: 'Hugo', position: 'EE' }, { name: 'Ivo', position: null }, { name: 'Juca', position: 'XYZ' },
  { name: 'Kiko', position: 'FIX' }, { name: 'Lia', position: 'ALA-D' }, { name: 'Mel', position: 'PIV' },
  { name: 'Nino', position: 'DC' }, { name: 'Otto', position: 'GR' },
];
// mesma comparação do web: posição (999 = desconhecida) e depois nome (localeCompare pt-BR)
const porPosicao = [...atletas].sort((a, b) => {
  const oa = ORDEM[a.position] || 999; const ob = ORDEM[b.position] || 999;
  if (oa !== ob) return oa - ob;
  return (a.name || '').localeCompare(b.name || '', 'pt-BR');
}).map((a) => a.name);
const porNome = [...atletas].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR')).map((a) => a.name);

// ---- Staff
const membros = [
  { role: 'head_coach', permissions: null },
  { role: 'assistant_coach', permissions: null },
  { role: 'specialist', permissions: null },
  { role: 'other', permissions: null },
  { role: 'other', permissions: ['training:view', 'games:edit'] },
  { role: 'owner', permissions: null },
  { role: 'manager', permissions: null },
  { role: 'viewer', permissions: null },
  { role: 'desconhecido', permissions: null },
];

// ---- Estatísticas: períodos (TrainingStatsPage.jsx: getCurrentWeekId, getDateOfISOWeek,
// getDateRangeParams, pickRangeFilter). Datas como texto (sem fuso).
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const somaDias = (s, n) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
function semanaIso(s) {
  const d = utc(s);
  const dow = d.getUTCDay() || 7;
  const qui = new Date(d); qui.setUTCDate(d.getUTCDate() + 4 - dow);
  const jan1 = Date.UTC(qui.getUTCFullYear(), 0, 1);
  const n = Math.ceil(((qui - jan1) / 86400000 + 1) / 7);
  return `${qui.getUTCFullYear()}-${pad(n)}`;
}
function segundaDaSemana(id) {
  const [y, w] = id.split('-').map(Number);
  const simple = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
  const dow = simple.getUTCDay();
  const start = new Date(simple);
  if (dow <= 4) start.setUTCDate(simple.getUTCDate() - dow + 1); else start.setUTCDate(simple.getUTCDate() + 8 - dow);
  return iso(start);
}
function periodo(filtro, hoje) {
  const sem = semanaIso(hoje);
  const seg = segundaDaSemana(sem);
  const y = hoje.slice(0, 4); const mes = Number(hoje.slice(5, 7)) - 1;
  switch (filtro) {
    case '1-micro': return { semana: sem, inicio: seg, fim: somaDias(seg, 6) };
    case '4-micros': return { semana: sem, inicio: seg, fim: somaDias(seg, 27) };
    case 'semester': return mes < 6 ? { inicio: `${y}-01-01`, fim: `${y}-06-30` } : { inicio: `${y}-07-01`, fim: `${y}-12-31` };
    case '1-year': return { inicio: `${y}-01-01`, fim: `${y}-12-31` };
    default: return null;
  }
}
const hojes = ['2026-10-22', '2026-01-01', '2026-12-31', '2027-01-03', '2026-06-30', '2026-07-01', '2020-12-31', '2021-01-04'];
const periodos = [];
for (const h of hojes) for (const f of ['1-micro', '4-micros', 'semester', '1-year']) periodos.push({ hoje: h, filtro: f, ...periodo(f, h) });
// Semestre/ano: mudar a data inicial recalcula o fim (efeito do TrainingStatsPage).
const fimDoSemestre = (ini) => (Number(ini.slice(5, 7)) - 1 < 6 ? `${ini.slice(0, 4)}-06-30` : `${ini.slice(0, 4)}-12-31`);
const ajustes = ['2026-03-15', '2026-08-02', '2025-06-30'].map((ini) => ({ inicio: ini, semestre: fimDoSemestre(ini), ano: `${ini.slice(0, 4)}-12-31` }));
// semana anterior/seguinte (setas ±7 dias)
const navegacao = ['2026-10-19', '2026-12-28', '2027-01-04'].map((seg) => ({ segunda: seg, anterior: semanaIso(somaDias(seg, -7)), seguinte: semanaIso(somaDias(seg, 7)), semana: semanaIso(seg) }));

// ---- Cards de jogos (GameSummaryCards): mesmas contas
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const dec = (v) => String(v ?? 0).replace('.', ',');
function cards(st) {
  const jogos = st.totalMatches || 0;
  const pts = st.pointsWon || 0;
  const ptsMax = st.pointsPlayed || jogos * 3;
  const pct = ptsMax ? Math.round((pts / ptsMax) * 100) : 0;
  const sequencia = (st.winStreak || 0) > 1 ? `${st.winStreak} vitórias seguidas`
    : (st.unbeatenStreak || 0) > 0 ? `Invicto há ${plural(st.unbeatenStreak, 'jogo', 'jogos')}` : 'Sem vencer no último jogo';
  const saldo = st.goalDifference || 0;
  return {
    pct, pts, ptsMax, sequencia,
    vedText: `${plural(st.wins || 0, 'vitória', 'vitórias')} · ${plural(st.draws || 0, 'empate', 'empates')} · ${plural(st.losses || 0, 'derrota', 'derrotas')}`,
    saldo: saldo > 0 ? `+${saldo}` : saldo < 0 ? `−${Math.abs(saldo)}` : '0',
    media: `${dec(st.avgGoalsScored)} × ${dec(st.avgGoalsConceded)}`,
    maiorVitoria: st.biggestWin ? `${st.biggestWin.goals_scored}×${st.biggestWin.goals_conceded} vs ${st.biggestWin.opponent}` : 'Sem vitórias',
    pontosTexto: `pontos · ${plural(jogos, 'jogo', 'jogos')}`,
  };
}
const jogosEntrada = [
  { totalMatches: 5, wins: 3, draws: 1, losses: 1, pointsWon: 10, pointsPlayed: 15, winStreak: 2, unbeatenStreak: 3, goalDifference: 4, avgGoalsScored: 1.6, avgGoalsConceded: 0.8, biggestWin: { goals_scored: 3, goals_conceded: 0, opponent: 'Rival' } },
  { totalMatches: 1, wins: 0, draws: 1, losses: 0, pointsWon: 1, pointsPlayed: 3, winStreak: 0, unbeatenStreak: 1, goalDifference: 0, avgGoalsScored: 1, avgGoalsConceded: 1, biggestWin: null },
  { totalMatches: 3, wins: 0, draws: 0, losses: 3, pointsWon: 0, pointsPlayed: 9, winStreak: 0, unbeatenStreak: 0, goalDifference: -5, avgGoalsScored: 0.33, avgGoalsConceded: 2, biggestWin: null },
  { totalMatches: 2, wins: 2, draws: 0, losses: 0, pointsWon: 6, winStreak: 2, unbeatenStreak: 2, goalDifference: 3, avgGoalsScored: 2.5, avgGoalsConceded: 1, biggestWin: { goals_scored: 3, goals_conceded: 1, opponent: 'B' } },
];

// ---- Minutagem completa (AllMinutesModal)
const jogadores = [
  { athlete_id: 'a', name: 'Bruno', minutes: 180, appearances: 2, called_up: 2, starts: 2, sub_entries: 0 },
  { athlete_id: 'b', name: 'Álvaro', minutes: 90, appearances: 2, called_up: 3, starts: 0, sub_entries: 2 },
  { athlete_id: 'c', name: 'Caio', minutes: 90, appearances: 1, called_up: 1, starts: 1, sub_entries: 0 },
  { athlete_id: 'd', name: 'alice', minutes: 0, appearances: 0, called_up: 2, starts: 0, sub_entries: 0 },
  { athlete_id: 'e', name: 'Zé', minutes: 0, appearances: 0, called_up: 0, starts: 0, sub_entries: 0 },
];
const minutesPossible = 270;
function minutagem(key, dir) {
  const list = jogadores.filter((p) => (p.called_up || 0) > 0 || (p.minutes || 0) > 0)
    .map((p) => ({ ...p, pct: minutesPossible > 0 ? Math.round(((p.minutes || 0) / minutesPossible) * 100) : 0 }));
  const mul = dir === 'asc' ? 1 : -1;
  return list.sort((a, b) => {
    if (key === 'name') return mul * String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    return mul * ((a[key] || 0) - (b[key] || 0)) || String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
  }).map((p) => ({ id: p.athlete_id, pct: p.pct }));
}
const ordens = [];
for (const key of ['name', 'minutes', 'appearances', 'pct', 'starts', 'sub_entries']) for (const dir of ['asc', 'desc']) ordens.push({ key, dir, ordem: minutagem(key, dir) });

const saida = {
  _gerado_por: 'node native/paridade/gerar-t3.mjs (não editar à mão)',
  elenco: {
    formatarNome: nomes.map((n) => ({ entrada: n, saida: formatarNome(n) })),
    posicoes: sport.POSITIONS,
    modalidades: sport.MODALITY_LABELS,
    ordemPosicao: ORDEM,
    atletas,
    porPosicao,
    porNome,
  },
  staff: {
    permissoes: perms.PERMISSIONS,
    rotulos: perms.PERMISSION_LABELS,
    grupos: perms.PERMISSION_GROUPS,
    papeis: perms.ROLES,
    rotulosPapel: perms.ROLE_LABELS,
    descricoesPapel: perms.ROLE_DESCRIPTIONS,
    padroes: perms.ROLE_DEFAULTS,
    efetivas: membros.map((m) => ({ ...m, efetivas: [...perms.effectivePermissions(m)].sort() })),
  },
  estatisticas: {
    formatMinutes: [0, 5, 59, 60, 61, 90, 120, 125, 1120].map((m) => ({ min: m, texto: formatMinutes(m) })),
    periodos,
    ajustes,
    navegacao,
    cards: jogosEntrada.map((st) => ({ entrada: st, saida: cards(st) })),
    minutagem: { jogadores, minutesPossible, ordens },
  },
};

const texto = `${JSON.stringify(saida, null, 1)}\n`;
if (process.argv.includes('--check')) {
  const atual = fs.existsSync(SAIDA) ? fs.readFileSync(SAIDA, 'utf8') : '';
  if (atual !== texto) { console.error('native/paridade/t3.json desatualizado: rode node native/paridade/gerar-t3.mjs'); process.exit(1); }
  console.log('t3.json em dia');
} else {
  fs.writeFileSync(SAIDA, texto);
  console.log(`gravado ${path.relative(RAIZ, SAIDA)}`);
}
