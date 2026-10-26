// Montagem dos dados de cada relatório (funções PURAS, testadas em
// tests/reports.test.js). Entram os objetos que as telas já usam
// (services/statsData, services/sessionData) e saem "view models" que os
// templates só desenham — nenhuma regra de negócio nova aqui.
const F = require('./format');
const { filterImageAttachments } = require('./photos');
const { gridOptions } = require('./photoConfig');
const { positionSector, roleSector, sectorInfo, SECTOR_ORDER, normCode, comparePlayers } = require('./positionSector');
const { slotPosition, playerInitials } = require('./lineup');
const { posicaoEmCampo } = require('../utils/posicaoEmCampo');
const P = require('../services/periodos');

const PERIOD_LABELS = {
  '1-micro': 'Microciclo',
  '4-micros': '4 Microciclos',
  semester: 'Semestre',
  '1-year': 'Ano',
  custom: 'Período personalizado',
};

const DIM_ORDER = ['tatico', 'fisico', 'tecnico', 'mental'];
const DIM_LABELS = { tatico: 'Tático', fisico: 'Físico', tecnico: 'Técnico', mental: 'Mental' };

// Mesmas abreviações da Programação (TrainingPage.abbreviateContent)
const CONTENT_ABBR = {
  'Bola Parada Ofensiva': 'BP Of',
  'Bola Parada Defensiva': 'BP Def',
  'Transição Ofensiva': 'Trans Of',
  'Transição Defensiva': 'Trans Def',
  'Organização Ofensiva': 'Org Of',
  'Organização Defensiva': 'Org Def',
};
function abbreviateContent(name) { return CONTENT_ABBR[name] || name; }

// Abreviação média para as etiquetas do Relatório do clube (como no protótipo)
const CONTENT_CHIP_ABBR = {
  'Bola Parada Ofensiva': 'Bola Parada Of.',
  'Bola Parada Defensiva': 'Bola Parada Def.',
  'Transição Ofensiva': 'Trans. Ofensiva',
  'Transição Defensiva': 'Trans. Defensiva',
  'Organização Ofensiva': 'Org. Ofensiva',
  'Organização Defensiva': 'Org. Defensiva',
};
function chipContent(name) { return CONTENT_CHIP_ABBR[name] || name; }

const SPECIAL_LIMITS = { sessionPhotos: 9, weekPhotos: 12 };

// ---------------------------------------------------------------- período
function buildPeriod({ start, end, filterType }) {
  const span = F.daysBetween(start, end) + 1;
  const iso = F.isoWeek(start);
  const isWeek = span === 7 && F.mondayOf(start) === start;
  return {
    start,
    end,
    days: span,
    isSingleWeek: isWeek,
    weekNumber: isWeek ? iso.week : null,
    label: PERIOD_LABELS[filterType] || (isWeek ? 'Microciclo' : 'Período personalizado'),
    rangeShort: F.rangeShort(start, end),
    rangeLong: F.rangeLong(start, end),
    year: F.year(end),
  };
}

function periodMeta(team, period) {
  const parts = [team.modalityLabel, period.label];
  if (period.weekNumber) parts.push(`Semana ${period.weekNumber}`);
  return parts.join(' · ');
}
function periodRight(period) {
  return period.weekNumber ? `Semana ${period.weekNumber} · ${period.rangeLong}` : period.rangeLong;
}

// ---------------------------------------------------------------- JOGOS
// Tipos de gol (novos + legados) → 5 categorias do relatório
function goalCategory(type) {
  const t = String(type || '');
  if (/penalty/.test(t)) return 'penalti';
  if (/^bp_/.test(t) || t === 'free_kick' || t === 'corner') return 'bola_parada';
  if (/^org_/.test(t) || t === 'offensive_org') return 'organizacao';
  if (/^trans_/.test(t) || t === 'offensive_transition') return 'transicao';
  return 'outros';
}
const GOAL_CATS_FOR = [
  ['organizacao', 'Org. ofensiva'], ['transicao', 'Transição'], ['bola_parada', 'Bola parada'], ['penalti', 'Pênalti'], ['outros', 'Outros'],
];
const GOAL_CATS_AGAINST = [
  ['organizacao', 'Org. defensiva'], ['transicao', 'Transição'], ['bola_parada', 'Bola parada'], ['penalti', 'Pênalti'], ['outros', 'Outros'],
];

function goalsByCategory(byType, labels) {
  const acc = Object.fromEntries(labels.map(([k]) => [k, 0]));
  for (const g of byType || []) acc[goalCategory(g.type)] += Number(g.value) || 0;
  const order = labels.map(([k], i) => [k, i]);
  const rows = labels.map(([key, label]) => ({ key, label, value: acc[key] }));
  // maior primeiro; empates mantêm a ordem fixa; zeros por último
  rows.sort((a, b) => (b.value - a.value) || (order.find((o) => o[0] === a.key)[1] - order.find((o) => o[0] === b.key)[1]));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return { rows, total, max: Math.max(0, ...rows.map((r) => r.value)) };
}

// "7ª rodada" → "7"; texto livre fica como está
function roundLabel(r) {
  if (r === null || r === undefined || r === '') return null;
  const m = String(r).match(/^\s*(\d+)/);
  return m ? m[1] : String(r);
}

const LOCATION_LABELS = { home: 'Casa', away: 'Fora', neutral: 'Neutro' };

function buildGamesReport({ stats, team, period, defaultDuration = 90, competitionName = null }) {
  const s = stats || {};
  const total = Number(s.totalMatches) || 0;
  const games = (s.matchesHistory || [])
    .slice()
    .sort((a, b) => String(F.toDateStr(a.date)).localeCompare(String(F.toDateStr(b.date))))
    .map((m) => ({
      date: F.toDateStr(m.date),
      dateLabel: F.ddmmyy(m.date),
      round: roundLabel(m.match_round),
      location: LOCATION_LABELS[m.match_location] || '—',
      opponent: m.opponent || 'Adversário',
      goalsFor: m.goals_scored,
      goalsAgainst: m.goals_conceded,
      result: m.result,
      hasVideo: !!(m.video_full_url || m.video_highlights_url || m.video_goals_url),
      subs: (m.substitutions || []).length,
    }));
  const home = (s.matchesHistory || []).filter((m) => m.match_location === 'home').length;
  const away = (s.matchesHistory || []).filter((m) => m.match_location === 'away').length;
  const pointsPlayed = Number(s.pointsPlayed) || total * 3;
  const pointsWon = Number(s.pointsWon) || ((s.wins || 0) * 3 + (s.draws || 0));
  const aprov = pointsPlayed > 0 ? Math.round((pointsWon / pointsPlayed) * 100) : 0;

  const fmtGame = (g) => (g ? {
    score: `${g.goals_scored}×${g.goals_conceded}`,
    opponent: g.opponent || 'Adversário',
    date: F.ddmm(g.date),
  } : null);

  // forma: o backend manda as 5 mais recentes (desc) → exibir mais recente à direita
  const form = (s.form || []).slice(0, 5).reverse().map((f) => f.result);

  const byMinFor = s.goalsScoredByMinute || [];
  const byMinAgainst = s.goalsConcededByMinute || [];
  const buckets = byMinFor.map((b, i) => ({
    label: b.name,
    for: Number(b.value) || 0,
    against: Number(byMinAgainst[i]?.value) || 0,
  }));
  const bucketMax = Math.max(0, ...buckets.map((b) => Math.max(b.for, b.against)));
  const anyAgainstByMin = buckets.some((b) => b.against > 0);

  // Minutos possíveis = soma das durações dos jogos do período (cai na duração padrão
  // × jogos se a estatística não trouxer). Minutagem: TODOS que jogaram (a tabela
  // quebra de página sozinha), com titularidades e entradas.
  const possible = Number.isFinite(Number(s.minutesPossible)) && Number(s.minutesPossible) > 0
    ? Number(s.minutesPossible)
    : defaultDuration * total;
  const minuteRows = Array.isArray(s.playerStats) && s.playerStats.some((p) => p.minutes > 0)
    ? s.playerStats.filter((p) => p.minutes > 0).slice().sort((a, b) => b.minutes - a.minutes || String(a.name).localeCompare(String(b.name), 'pt-BR'))
    : (s.topMinutes || []);
  const minutes = minuteRows.map((p) => ({
    name: F.truncate(p.name, 28),
    minutes: p.minutes,
    games: p.appearances,
    starts: p.starts ?? null,
    entries: p.sub_entries ?? null,
    pctPossible: possible > 0 ? Math.round((p.minutes / possible) * 100) : 0,
    bar: possible > 0 ? Math.min(100, Math.round((p.minutes / possible) * 100)) : 0,
  }));

  // Substituições de cada jogo (minuto, sai, entra), em ordem de data
  const subGames = (s.matchesHistory || [])
    .slice()
    .sort((a, b) => String(F.toDateStr(a.date)).localeCompare(String(F.toDateStr(b.date))))
    .filter((m) => (m.substitutions || []).length > 0)
    .map((m) => ({
      dateLabel: F.ddmmyy(m.date),
      opponent: m.opponent || 'Adversário',
      rows: m.substitutions.map((x) => ({
        minute: x.minute != null ? `${x.minute}'` : '—',
        out: x.out_name || '—',
        in: x.in_name || '—',
      })),
    }));
  const subsTotal = Number(s.substitutionsTotal) || subGames.reduce((n, g) => n + g.rows.length, 0);
  const substitutions = {
    total: subsTotal,
    perGame: total ? subsTotal / total : 0,
    avgMinute: s.avgSubstitutionMinute ?? null,
    games: subGames,
    topEntries: (s.topSubEntries || []).slice(0, 5).map((p) => ({ name: p.name, value: p.sub_entries })),
  };

  return {
    kind: 'jogos',
    team,
    period,
    meta: competitionName ? `${periodMeta(team, period)} · ${competitionName}` : periodMeta(team, period),
    competitionName,
    right: competitionName ? `${competitionName} · ${periodRight(period)}` : periodRight(period),
    badgeTop: period.rangeShort,
    badgeSub: `${period.year} · ${F.plural(total, 'jogo', 'jogos')}`,
    empty: total === 0,
    total,
    points: { won: pointsWon, played: pointsPlayed, aprov },
    wins: s.wins || 0,
    draws: s.draws || 0,
    losses: s.losses || 0,
    vedLegend: [F.plural(s.wins || 0, 'vitória', 'vitórias'), F.plural(s.draws || 0, 'empate', 'empates'), F.plural(s.losses || 0, 'derrota', 'derrotas')],
    winStreak: s.winStreak || 0,
    unbeatenStreak: s.unbeatenStreak || 0,
    biggestWin: fmtGame(s.biggestWin),
    biggestLoss: fmtGame(s.biggestLoss),
    form,
    kpis: {
      games: total,
      home,
      away,
      goalsFor: s.totalGoalsScored || 0,
      goalsAgainst: s.totalGoalsConceded || 0,
      avgFor: total ? (s.totalGoalsScored || 0) / total : 0,
      avgAgainst: total ? (s.totalGoalsConceded || 0) / total : 0,
      diff: (s.totalGoalsScored || 0) - (s.totalGoalsConceded || 0),
      cleanSheets: s.cleanSheets || 0,
      cleanPct: F.pct(s.cleanSheets || 0, total),
      firstFor: s.avgTimeFirstGoalFor ?? null,
      firstAgainst: s.avgTimeFirstGoalAgainst ?? null,
      yellow: s.yellowCards || 0,
      red: s.redCards || 0,
    },
    games,
    goalsFor: goalsByCategory(s.goalsScoredByType, GOAL_CATS_FOR),
    goalsAgainst: goalsByCategory(s.goalsConcededByType, GOAL_CATS_AGAINST),
    buckets,
    bucketMax,
    anyAgainstByMin,
    scorers: (s.topScorers || []).slice(0, 5).map((p) => ({ name: p.name, value: p.goals })),
    assists: (s.topAssisters || []).slice(0, 5).map((p) => ({ name: p.name, value: p.assists })),
    minutes,
    minutesPossible: possible,
    substitutions,
  };
}

// ---------------------------------------------------------------- TREINO
// Conteúdo predominante do dia, por TEMPO (mesma regra da Programação e das
// Estatísticas); sem tempo preenchido, por nº de atividades. Empate → todos.
function dayFocus(contents) {
  const items = (contents || []).filter((c) => c && c.name);
  if (items.length === 0) return '';
  const temTempo = items.some((c) => (Number(c.minutes) || 0) > 0);
  const peso = (c) => (temTempo ? Number(c.minutes) || 0 : Number(c.count) || 0);
  const max = Math.max(...items.map(peso));
  const winners = items.filter((c) => peso(c) === max).map((c) => abbreviateContent(c.name));
  return winners.length <= 2 ? winners.join(' | ') : `${winners.slice(0, 2).join(' | ')} +${winners.length - 2}`;
}

// Segmentos de pilar de um dia/semana: { tatico: 60, fisico: 25, none: 10 } →
// [{ key, minutes }] na ordem dos pilares (sem pilar por último), só os com tempo.
function pillarSegments(pm) {
  const m = pm || {};
  return DIM_ORDER.concat(['none'])
    .filter((k) => (Number(m[k]) || 0) > 0)
    .map((k) => ({ key: k, label: DIM_LABELS[k] || 'Sem pilar', minutes: Number(m[k]) || 0 }));
}

function somarPilares(alvo, pm) {
  for (const [k, v] of Object.entries(pm || {})) alvo[k] = (alvo[k] || 0) + (Number(v) || 0);
  return alvo;
}

// Avaliação do dia (períodos de avaliação): null sem nenhuma. Não soma minutos.
function dayAssessment(list) {
  const av = (list || []).filter((s) => P.ehAvaliacao(s));
  if (!av.length) return null;
  const tipos = [];
  for (const s of av) for (const t of P.rotulosAvaliacao(s)) if (!tipos.includes(t)) tipos.push(t);
  return {
    types: tipos,
    text: tipos.join(', '),
    periods: av.map((s) => P.rotuloPeriodo(P.periodoEfetivo(s))).filter(Boolean),
  };
}

// sessions: linhas de statsData.getPeriodSessions (uma por sessão do período)
// gamesById: Map session_id → { goals_scored, goals_conceded, result } (de matchesHistory)
function buildDays({ period, sessions, sessionsByDate, gamesById }) {
  const contentsBySession = new Map((sessionsByDate || []).map((s) => [s.session_id, s.contents || []]));
  const pillarsBySession = new Map((sessionsByDate || []).map((s) => [s.session_id, s.pillarMinutes || {}]));
  const contentsByPeriod = new Map((sessionsByDate || []).flatMap((s) => Object.entries(s.contentsByPeriod || {})));
  const byDate = new Map();
  for (const s of sessions || []) {
    const d = F.toDateStr(s.date);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(s);
  }
  const days = [];
  for (let i = 0; i < period.days; i++) {
    const date = F.addDays(period.start, i);
    const list = (byDate.get(date) || []).slice().sort(P.compararPeriodos);
    // avaliação não soma minutos (getPeriodSessions já devolve 0 para ela)
    const minutes = list.reduce((sum, s) => sum + (P.ehAvaliacao(s) ? 0 : Number(s.minutes) || 0), 0);
    const match = list.find((s) => s.session_type === 'match');
    const isRest = list.length > 0 && list.every((s) => s.session_type === 'rest');
    const contents = list.flatMap((s) => contentsBySession.get(s.id) || []);
    const pillarMinutes = list.reduce((acc, s) => somarPilares(acc, pillarsBySession.get(s.id)), {});
    const assessment = dayAssessment(list);
    const base = {
      date, dn: F.weekdayShort(date), dd: F.ddmm(date), minutes, note: null, distanceKm: null, periods: null, split: null,
      pillars: pillarSegments(pillarMinutes), assessment,
    };
    // Dia com 2+ períodos (Manhã/Tarde/Noite): soma no dia + divisão por período
    const comPeriodos = list.length > 1 && list.some((s) => s.periodo);
    if (comPeriodos) {
      base.periods = list.map((s) => ({
        periodo: s.periodo,
        label: P.rotuloPeriodo(s.periodo) || 'Período',
        kind: s.session_type === 'match' ? 'jogo' : (P.ehAvaliacao(s) ? 'avaliacao' : 'treino'),
        minutes: P.ehAvaliacao(s) ? 0 : Number(s.minutes) || 0,
        // o que o período treinou (a célula do dia mostra uma linha por período)
        focus: s.session_type === 'match' ? ''
          : (P.ehAvaliacao(s) ? (P.rotulosAvaliacao(s).join(', ') || 'Avaliação') : dayFocus(contentsByPeriod.get(s.id) || [])),
      }));
      // "90+60" só quando 2+ períodos têm minutos (nunca "125+0")
      base.split = P.divisaoMinutos(base.periods);
    }
    if (match) {
      const g = gamesById?.get(match.id);
      const extra = list.filter((s) => s.id !== match.id).reduce((sum, s) => sum + (P.ehAvaliacao(s) ? 0 : Number(s.minutes) || 0), 0) + (Number(match.minutes) || 0);
      let note = null;
      if (extra > 0 && comPeriodos) {
        // Manhã de treino + Tarde de jogo: cada período com o seu tempo
        const partes = base.periods.filter((p) => p.minutes > 0).map((p) => (p.kind === 'jogo'
          ? `${p.minutes}' com os não relacionados (${p.label})`
          : `${p.label} ${p.minutes}' de treino`));
        note = `${F.weekdayShort(date)} ${F.ddmm(date)}: ${partes.join(' + ')} (contabilizado no total do período).`;
      } else if (extra > 0) {
        const names = Array.from(new Set(contents.map((c) => c.name))).slice(0, 2).join(' e ');
        note = `${F.weekdayShort(date)} ${F.ddmm(date)}: ${extra}'${names ? ` de ${names}` : ''} com os não relacionados (contabilizado no total do período).`;
      }
      days.push({
        ...base,
        kind: 'jogo',
        opponent: match.opponent_name || 'Adversário',
        score: g ? `${g.goals_scored}×${g.goals_conceded}` : null,
        result: g ? ({ win: 'V', draw: 'E', loss: 'D' })[g.result] : null,
        note,
      });
    } else if (isRest) {
      days.push({ ...base, kind: 'descanso' });
    } else if (minutes > 0 || contents.length > 0) {
      const km = P.distanciaDoDia(list);
      const comMin = comPeriodos ? base.periods.filter((p) => p.minutes > 0) : [];
      // dia com períodos: a célula já mostra cada período com o seu tempo (sem nota de rodapé)
      const note = !comPeriodos && comMin.length >= 2
        ? `${F.weekdayShort(date)} ${F.ddmm(date)}: ${comMin.map((p) => `${p.label} ${p.minutes}'`).join(' + ')} = ${minutes}'.`
        : null;
      days.push({ ...base, kind: 'treino', focus: dayFocus(contents), distanceKm: km != null ? Number(km) : null, note });
    } else if (assessment) {
      // dia só de avaliação: etiqueta AVALIAÇÃO + os tipos, sem minutos
      days.push({ ...base, kind: 'avaliacao' });
    } else {
      days.push({ ...base, kind: 'vazio' });
    }
  }
  return days;
}

// Minutos por semana, com a divisão por pilar (coluna empilhada no PDF).
function buildWeeks({ period, sessions, sessionsByDate = null }) {
  const weeks = new Map();
  for (let d = F.mondayOf(period.start); d <= period.end; d = F.addDays(d, 7)) weeks.set(d, { minutes: 0, pm: {} });
  for (const s of sessions || []) {
    if (P.ehAvaliacao(s)) continue;
    const wk = F.mondayOf(F.toDateStr(s.date));
    if (weeks.has(wk)) weeks.get(wk).minutes += Number(s.minutes) || 0;
  }
  for (const x of sessionsByDate || []) {
    const wk = F.mondayOf(F.toDateStr(x.date));
    if (weeks.has(wk)) somarPilares(weeks.get(wk).pm, x.pillarMinutes);
  }
  return Array.from(weeks.entries()).map(([start, w]) => ({
    start, label: F.ddmm(start), week: F.isoWeek(start).week, minutes: w.minutes, pillars: pillarSegments(w.pm),
  }));
}

function buildPillars(stats) {
  const dims = (stats.byDimension || []).filter((d) => DIM_ORDER.includes(d.dimension));
  const presence = new Map((stats.byDimensionPresence || []).map((d) => [d.dimension, d.sessions]));
  const totalCount = dims.reduce((s, d) => s + (d.count || 0), 0);
  const totalMin = dims.reduce((s, d) => s + (d.minutes || 0), 0);
  return dims
    .map((d) => ({
      key: d.dimension,
      label: DIM_LABELS[d.dimension],
      sessions: presence.get(d.dimension) || 0,
      activities: d.count || 0,
      minutes: d.minutes || 0,
      pctActivities: F.pct(d.count, totalCount),
      pctTime: F.pct(d.minutes, totalMin),
    }))
    .sort((a, b) => (b.minutes - a.minutes) || (b.activities - a.activities));
}

function buildTopContents(stats, pillars) {
  const out = [];
  for (const p of pillars) {
    const rows = (stats.byContent || [])
      .filter((c) => c.dimension === p.key)
      .sort((a, b) => (b.minutes - a.minutes) || (b.count - a.count))
      .slice(0, 5)
      .map((c) => ({ name: c.name, activities: c.count, minutes: c.minutes }));
    if (rows.length) out.push({ key: p.key, label: p.label, rows });
  }
  return out;
}

function buildDistance(stats, trainingSessionsCount) {
  const d = stats.distance || {};
  if (!d.daysWithData) return { empty: true };
  const byDay = d.byDay || [];
  const maxDay = byDay.reduce((best, x) => (!best || x.km > best.km ? x : best), null);
  const series = (d.series || []).map((x) => ({
    label: d.granularity === 'day' ? `${F.weekdayShort(x.start)} ${x.label}` : `Sem ${x.label}`,
    km: x.avgKm,
  }));
  const max = Math.max(...series.map((x) => x.km), d.avgKm || 0);
  return {
    empty: false,
    avgKm: d.avgKm,
    totalKm: d.totalKm,
    maxKm: d.maxKm,
    maxDate: maxDay ? F.ddmm(maxDay.date) : '',
    daysWithData: d.daysWithData,
    sessions: trainingSessionsCount,
    granularity: d.granularity,
    series,
    max,
  };
}

function buildTrainingReport({ stats, sessions, gamesById, team, period, photos = null }) {
  const s = stats || {};
  const totals = s.totals || {};
  const days = buildDays({ period, sessions, sessionsByDate: s.sessionsByDate, gamesById });
  const matchDays = (sessions || []).filter((x) => x.session_type === 'match').length;
  const trainingDaysWithActivity = days.filter((d) => d.kind === 'treino').length;
  const pillars = buildPillars(s);
  const dayMax = Math.max(0, ...days.filter((d) => d.kind === 'treino').map((d) => d.minutes));
  const weeks = period.isSingleWeek ? null : buildWeeks({ period, sessions, sessionsByDate: s.sessionsByDate });
  const sessionsCount = totals.sessions || 0;
  return {
    kind: 'treino',
    team,
    period,
    meta: periodMeta(team, period),
    right: periodRight(period),
    badgeTop: period.rangeShort,
    badgeSub: `${period.year} · ${F.plural(sessionsCount, 'sessão', 'sessões')}`,
    empty: (totals.activities || 0) === 0 && !(s.distance && s.distance.daysWithData),
    kpis: {
      minutes: totals.minutes || 0,
      sessions: sessionsCount,
      matches: matchDays,
      activities: totals.activities || 0,
      distinct: totals.uniqueTemplates || 0,
      avgPerSession: sessionsCount ? Math.round((totals.minutes || 0) / sessionsCount) : null,
      distanceKm: s.distance && s.distance.daysWithData ? s.distance.totalKm : null,
    },
    days: period.isSingleWeek ? days : null,
    dayMax,
    dayNotes: period.isSingleWeek ? days.filter((d) => d.note).map((d) => d.note) : [],
    weeks,
    weekMax: weeks ? Math.max(0, ...weeks.map((w) => w.minutes)) : 0,
    pillars,
    topContents: buildTopContents(s, pillars),
    distance: buildDistance(s, trainingDaysWithActivity),
    photos,
  };
}

// ---------------------------------------------------------------- FICHA
function blockIsFilled(block) {
  const a = block && block.activity;
  if (!a) return false;
  return !!((a.title && a.title.title) || (a.contents && a.contents.length) || (Number(a.duration_minutes) || 0) > 0 || (a.description && a.description.trim()));
}

function blockPillar(activity) {
  const dims = (activity.contents || []).map((c) => c.dimension).filter(Boolean);
  return dims[0] || null;
}

function buildSessionSheet({ session, team, weekNumber = null, game = null, photos = null }) {
  const type = session.session_type || 'training';
  // avaliação: sem blocos (atividades antigas de quando era treino não aparecem)
  const filled = type === 'assessment' ? [] : (session.blocks || []).filter(blockIsFilled);
  let acc = 0;
  const blocks = filled.map((b) => {
    const a = b.activity;
    const minutes = Number(a.duration_minutes) || 0;
    const from = acc;
    acc += minutes;
    const contents = (a.contents || []).map((c) => c.name).filter(Boolean);
    const pillar = blockPillar(a);
    return {
      activityId: a.id || null,
      phase: type === 'match' ? 'Não relacionados' : (b.name || ''),
      minutes,
      from,
      to: acc,
      pillar,
      pillarLabel: DIM_LABELS[pillar] || null,
      title: (a.title && a.title.title) || contents.join(', ') || b.name || 'Atividade',
      contents,
      subMoments: (a.stages || []).map((st) => st.stage_name).filter(Boolean),
      groups: Array.isArray(a.groups) ? a.groups.filter(Boolean) : [],
      description: (a.description || '').trim(),
    };
  });
  const total = acc;
  const groupsAll = Array.from(new Set(blocks.flatMap((b) => b.groups))).sort();
  const focus = dayFocus(
    Object.values(blocks.reduce((m, b) => {
      for (const c of b.contents) {
        m[c] = m[c] || { name: c, count: 0, minutes: 0 };
        m[c].count += 1;
        m[c].minutes += b.minutes;
      }
      return m;
    }, {})),
  );
  const date = F.toDateStr(session.date);
  const km = type === 'training' && session.avg_distance_km != null ? Number(session.avg_distance_km) : null;
  const pillarsPresent = DIM_ORDER.filter((d) => blocks.some((b) => b.pillar === d));
  const badgeSubParts = [];
  if (km != null) badgeSubParts.push(`${F.dec1(km)} km`);
  badgeSubParts.push(F.plural(blocks.length, 'bloco', 'blocos'));
  return {
    kind: 'sessao',
    team,
    type, // training | match | rest
    date,
    weekNumber,
    title: `${F.weekdayLong(date)}, ${F.ddmm(date)}`,
    eyebrow: weekNumber ? `Ficha de sessão · Semana ${weekNumber}` : 'Ficha de sessão',
    focus,
    distanceKm: km,
    total,
    badgeTop: type === 'rest' ? 'Descanso' : type === 'assessment' ? 'Avaliação' : (type === 'match' && total === 0 ? 'Jogo' : `${total} min`),
    badgeSub: type === 'rest' || type === 'assessment' || (type === 'match' && total === 0)
      ? F.ddmmyyyy(date)
      : (type === 'match' ? `${F.plural(blocks.length, 'bloco', 'blocos')} · não relacionados` : badgeSubParts.join(' · ')),
    blocks,
    pillarsPresent,
    groupsAll,
    assessment: type === 'assessment' ? { types: P.rotulosAvaliacao(session), text: P.textoAvaliacao(session) } : null,
    game: type === 'match' ? {
      opponent: session.opponent_name || 'Adversário',
      round: session.match_round || null,
      location: LOCATION_LABELS[session.match_location] || null,
      score: game ? `${game.goals_scored} × ${game.goals_conceded}` : null,
      result: game ? ({ win: 'V', draw: 'E', loss: 'D' })[game.result] : null,
    } : null,
    photos,
  };
}

// Ficha do DIA com 2+ períodos: cada período com a própria linha do tempo e
// blocos (vm de buildSessionSheet), em sequência; o cabeçalho soma o dia.
// sessions: detalhes (getSessionDetail) na ordem Manhã → Noite.
// gamesById: Map session_id → jogo (matchesHistory) do período de jogo.
function buildDaySheet({ sessions, team, weekNumber = null, gamesById = null, photos = null }) {
  const list = (sessions || []).slice().sort(P.compararPeriodos);
  if (list.length <= 1) {
    const only = list[0];
    const vm = buildSessionSheet({ session: only, team, weekNumber, game: gamesById?.get(only?.id) || null, photos });
    // o título diz o período (discreto): só um período de um dia com vários (so_periodo)
    // ou o dia de período único — "Manhã" é o padrão do dia sem nome. Jogo e descanso não.
    const ef = only && ['training', 'assessment'].includes(only.session_type || 'training') ? P.periodoEfetivo(only) : null;
    if (ef) vm.title = `${vm.title} · ${P.rotuloPeriodo(ef)}`;
    return vm;
  }
  const periodos = list.map((s) => {
    const vm = buildSessionSheet({ session: s, team, weekNumber, game: gamesById?.get(s.id) || null, photos: null });
    return { ...vm, sessionId: s.id, periodo: s.periodo, label: P.rotuloPeriodo(s.periodo) || 'Período' };
  });
  const blocks = periodos.flatMap((p) => p.blocks);
  const total = periodos.reduce((sum, p) => sum + p.total, 0);
  const focus = dayFocus(
    Object.values(blocks.reduce((m, b) => {
      for (const c of b.contents) {
        m[c] = m[c] || { name: c, count: 0, minutes: 0 };
        m[c].count += 1;
        m[c].minutes += b.minutes;
      }
      return m;
    }, {})),
  );
  const km = P.distanciaDoDia(list);
  const date = F.toDateStr(list[0].date);
  // "90+60" só quando 2+ períodos têm minutos (avaliação/jogo sem tempo não vira "+0")
  const split = P.divisaoMinutos(periodos.map((p) => ({ minutes: p.total })));
  const badgeSubParts = [];
  if (km != null) badgeSubParts.push(`${F.dec1(km)} km`);
  badgeSubParts.push(`${periodos.length} períodos${split ? ` · ${split}` : ''}`);
  return {
    kind: 'sessao',
    team,
    type: 'periodos',
    date,
    weekNumber,
    title: `${F.weekdayLong(date)}, ${F.ddmm(date)}`,
    eyebrow: weekNumber ? `Ficha de sessão · Semana ${weekNumber}` : 'Ficha de sessão',
    focus,
    distanceKm: km,
    total,
    split,
    badgeTop: `${total} min`,
    badgeSub: badgeSubParts.join(' · '),
    blocks,
    pillarsPresent: DIM_ORDER.filter((d) => blocks.some((b) => b.pillar === d)),
    groupsAll: Array.from(new Set(blocks.flatMap((b) => b.groups))).sort(),
    periodos,
    game: null,
    photos,
  };
}

// ---------------------------------------------------------------- FOTOS
// Legenda (em CIMA da foto): título = a ATIVIDADE (pedido do dono, 26/10); embaixo dele o
// bloco e o título do anexo quando foi digitado (o nome cru do arquivo não aparece).
// Foto sem atividade (anexo do dia): o título do anexo.
function captionFor(file, activityInfo) {
  const raw = String(file.title || '').trim();
  const fileName = String(file.file_name || '').trim();
  const semExt = fileName.replace(/\.[a-z0-9]+$/i, '');
  const proprio = raw && raw !== fileName && raw !== semExt ? raw : '';
  if (activityInfo && (activityInfo.title || activityInfo.blockName)) {
    const title = activityInfo.title || activityInfo.blockName;
    const context = [activityInfo.title ? activityInfo.blockName : null, proprio || null].filter(Boolean).join(' · ');
    return { title: F.truncate(title, 60), context: F.truncate(context, 80) };
  }
  return { title: F.truncate(proprio || semExt, 60), context: '' };
}

// files: linhas de training_activity_files (qualquer tipo); activities: Map
// activity_id → { blockName, title }. Devolve só imagens, ordem de envio.
function selectSessionPhotos(files, activities) {
  return filterImageAttachments(files)
    .slice()
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    .map((f) => ({ ...f, caption: captionFor(f, f.activity_id ? activities?.get(f.activity_id) : null) }));
}

// Semana com mais fotos que o limite: escolhe em rodízio entre os dias (1ª foto
// de cada dia, depois a 2ª…) para nenhum dia sumir porque outro teve muitas.
function interleaveByDay(photos, sessionsById) {
  const byDay = new Map();
  for (const p of photos) {
    const sess = sessionsById.get(p.session_id);
    const date = sess ? F.toDateStr(sess.date) : '9999-99-99';
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date).push(p);
  }
  const queues = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, list]) => list.slice());
  const out = [];
  while (queues.some((q) => q.length)) {
    for (const q of queues) if (q.length) out.push(q.shift());
  }
  return out;
}

// Agrupa fotos da semana por dia (dia, data, legenda), respeitando o limite.
function groupPhotosByDay(photos, sessionsById) {
  const groups = new Map();
  for (const p of photos) {
    const sess = sessionsById.get(p.session_id);
    const date = sess ? F.toDateStr(sess.date) : null;
    if (!date) continue;
    if (!groups.has(date)) groups.set(date, { date, label: `${F.weekdayLong(date)}`, dd: F.ddmm(date), items: [] });
    groups.get(date).items.push(p);
  }
  return Array.from(groups.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Seção de fotos pronta para o template. config = escolha do modal (ou null =
// padrão). sessionsById só na semana: agrupa por dia, salvo "lista corrida".
// Com escolha do usuário não há "+N não exibidas" (ele tirou de propósito).
function buildPhotoSection({ items, hidden = 0, config = null, sessionsById = null }) {
  const grouped = !!sessionsById && (!config || config.agrupar);
  const hid = config ? 0 : hidden;
  return {
    items,
    groups: grouped ? groupPhotosByDay(items, sessionsById) : null,
    hidden: hid,
    total: items.length + hid,
    grid: gridOptions(config, items.length),
    posicao: (config && config.posicao) || 'fim',
  };
}

// ---------------------------------------------------------------- convocação (5b)
// Camisa DESTE jogo → nº permanente do plantel → null.
function shirtOf(p) {
  for (const v of [p.jersey_number, p.athlete_jersey]) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return null;
}

// H1 "Time vs Adversário": 20pt; nomes longos encolhem até 14pt (e reticências no CSS).
function callUpTitleSize(team, opponent) {
  const len = String(team || '').length + String(opponent || '').length + 4;
  return Math.max(14, Math.min(20, 20 - (len - 30) * 0.25));
}

function byName(a, b) { return String(a.name).localeCompare(String(b.name), 'pt-BR'); }

/**
 * players: [{ athlete_id, status, slot, jersey_number (do jogo), athlete_jersey, name, position }]
 * formation: a formação EFETIVA (a mesma que o editor usa: salva se válida, senão a padrão).
 */
function buildCallUp({ session, team, players = [], formation, competitionName = null }) {
  const opponent = String(session.opponent_name || '').trim() || 'Adversário';
  const date = F.toDateStr(session.date);
  const starters = [];
  const bench = [];
  for (const p of players) {
    const name = String(p.name || '').trim() || 'Atleta';
    const pos = normCode(p.position) || null;
    const base = { id: p.athlete_id || null, name, pos, shirt: shirtOf(p), posSector: positionSector(pos) };
    if ((p.status || 'starter') === 'starter') starters.push({ ...base, slot: p.slot ?? null });
    else bench.push(base);
  }

  // Campo: posição pela VAGA; setor pela LINHA da vaga (não pela posição cadastrada).
  const field = [];
  const unplaced = [];
  for (const s of starters) {
    const at = slotPosition(formation, s.slot);
    if (!at) {
      s.sector = s.posSector || 'outros';
      s.offField = true;
      unplaced.push(s);
      continue;
    }
    // 'LIN' (futsal 4-0): a linha não diz o setor → posição cadastrada (fora goleiro), senão Meio
    s.sector = roleSector(at.role) || (s.posSector && s.posSector !== 'gol' ? s.posSector : 'mei');
    s.at = at;
    // Etiqueta = posição EM CAMPO (pela vaga), não a cadastrada. null (futsal 4-0) = cadastrada.
    s.fieldPos = posicaoEmCampo(formation, s.slot, team.modality);
    field.push({
      name: s.name,
      token: s.shirt != null ? String(s.shirt) : playerInitials(s.name),
      hasShirt: s.shirt != null,
      gk: at.role === 'GOL',
      x: Math.round(at.x * 100) / 100,
      y: Math.round(at.y * 100) / 100,
      small: at.perLine > 5,
      maxWidthPct: Math.round(Math.min(at.spacing, 40) * 100) / 100,
    });
  }

  const row = (p, groupSector) => {
    if (p.fieldPos) {
      return { id: p.id, name: p.name, shirt: p.shirt, pos: p.fieldPos, posColor: sectorInfo(positionSector(p.fieldPos)).color, offField: false };
    }
    const posKey = p.pos ? p.posSector : null;
    return {
      id: p.id,
      name: p.name,
      shirt: p.shirt,
      pos: p.pos || (p.at ? p.at.role : null),
      posColor: sectorInfo(posKey || groupSector).color,
      offField: !!p.offField,
    };
  };
  const groups = SECTOR_ORDER.map((key) => {
    const placed = starters.filter((s) => s.sector === key && s.at).sort((a, b) => a.slot - b.slot);
    const off = starters.filter((s) => s.sector === key && !s.at).sort(byName);
    const rows = placed.concat(off).map((s) => row(s, key));
    return rows.length ? { key, label: sectorInfo(key).label, color: sectorInfo(key).color, rows } : null;
  }).filter(Boolean);

  // Reservas sem agrupamento, na ordem do jogo (a mesma da lista do modal)
  const benchRows = bench
    .map((p) => ({ id: p.id, name: p.name, shirt: p.shirt, pos: p.pos, posColor: sectorInfo(p.posSector).color }));

  const meta = [];
  if (competitionName) meta.push(competitionName);
  const rd = roundLabel(session.match_round);
  if (rd) meta.push(/^\d+$/.test(rd) ? `Rodada ${rd}` : rd);
  if (LOCATION_LABELS[session.match_location]) meta.push(LOCATION_LABELS[session.match_location]);

  return {
    team,
    opponent,
    date,
    weekday: F.weekdayLong(date),
    ddmm: F.ddmm(date),
    titleSizePt: callUpTitleSize(team.name, opponent),
    meta,
    // Dados do jogo (migration 061); vazio aparece como "—"
    info: [
      { label: 'Horário', value: session.match_kickoff || null },
      { label: 'Local', value: session.match_venue || null },
      { label: 'Apresentação', value: session.match_meet_time || null },
    ],
    formation,
    field,
    hasLineup: field.length > 0,
    groups,
    bench: benchRows,
    benchLayout: benchRows.length > 12 ? 'two' : benchRows.length > 7 ? 'compact' : '',
    startersCompact: starters.length + groups.length > 15,
    unplaced: unplaced.map((s) => s.name),
    counts: { total: starters.length + bench.length, starters: starters.length, bench: bench.length },
  };
}

// ---------------------------------------------------------------- PROGRAMAÇÃO DA SEMANA
// Resumo da Programação (o que a tela mostra), não as estatísticas: 7 colunas, cada dia
// com os períodos (Manhã · Tático) e os blocos (fase, conteúdo, atividade), jogo/descanso/
// avaliação, e no pé os minutos e a distância.
//   details: getSessionDetail dos períodos da semana · gamesById: Map session_id → jogo
function predominancia(blocks) {
  const m = {};
  for (const b of blocks) if (b.pillar && b.minutes > 0) m[b.pillar] = (m[b.pillar] || 0) + b.minutes;
  const best = DIM_ORDER.filter((d) => m[d]).sort((a, b) => m[b] - m[a])[0];
  if (best) return DIM_LABELS[best];
  const first = blocks.find((b) => b.pillar);
  return first ? DIM_LABELS[first.pillar] : null;
}

function buildWeekProgram({ team, period, details = [], gamesById = null, weekNumber = null, photos = null }) {
  const byDate = new Map();
  for (const s of details) {
    const d = F.toDateStr(s.date);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(s);
  }
  let totalMin = 0;
  let treinos = 0;
  let jogos = 0;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = F.addDays(period.start, i);
    const list = (byDate.get(date) || []).slice().sort(P.compararPeriodos);
    const varios = list.length > 1;
    const periodos = list.map((s) => {
      const vm = buildSessionSheet({ session: s, team, game: gamesById?.get(s.id) || null });
      const ef = vm.type === 'training' || vm.type === 'assessment' ? (P.rotuloPeriodo(P.periodoEfetivo(s)) || null) : (varios ? P.rotuloPeriodo(s.periodo) : null);
      return {
        type: vm.type,
        label: ef,
        pillar: vm.type === 'training' ? predominancia(vm.blocks) : null,
        blocks: vm.blocks.map((b) => ({ phase: b.phase, content: b.contents.join(' · '), title: b.title !== b.contents.join(', ') ? b.title : '', minutes: b.minutes, pillar: b.pillar })),
        total: vm.total,
        game: vm.game,
        assessment: vm.assessment,
      };
    });
    const minutes = periodos.reduce((t, p) => t + (p.type === 'assessment' ? 0 : p.total), 0);
    totalMin += minutes;
    if (periodos.some((p) => p.type === 'match')) jogos++;
    else if (periodos.some((p) => p.type === 'training' && p.blocks.length)) treinos++;
    const km = P.distanciaDoDia(list);
    const isRest = list.length > 0 && list.every((s) => (s.session_type || 'training') === 'rest');
    days.push({
      date, dn: F.weekdayLong(date), dd: F.ddmm(date),
      kind: !list.length ? 'vazio' : (isRest ? 'descanso' : 'dia'),
      periodos: isRest ? [] : periodos,
      minutes,
      km: km != null ? Number(km) : null,
      split: P.divisaoMinutos(periodos.map((p) => ({ minutes: p.type === 'assessment' ? 0 : p.total }))),
    });
  }
  // Faixas (linhas do PDF): os períodos dos dias com 2+ períodos, na ordem Manhã → Noite (sem dia
  // dividido = 1 faixa só). Cada período vai para a faixa do seu nome — também o do dia de período
  // único ("Tarde · Tático" fica na faixa Tarde). Ocupam a coluna inteira: descanso, dia vazio e o
  // período sem nome de faixa (jogo de período único).
  const ORDEM = ['Manhã', 'Tarde', 'Noite'];
  const bandas = ORDEM.filter((b) => days.some((d) => d.periodos.length > 1 && d.periodos.some((p) => p.label === b)));
  for (const d of days) {
    d.span = bandas.length < 2 || !d.periodos.length || d.periodos.some((p) => !bandas.includes(p.label));
  }
  const meta = [team.modalityLabel, weekNumber ? `Semana ${weekNumber}` : null, period.rangeLong].filter(Boolean).join(' · ');
  return {
    kind: 'semana',
    bandas: bandas.length >= 2 ? bandas : [],
    team,
    period,
    weekNumber,
    meta,
    right: weekNumber ? `Semana ${weekNumber} · ${period.rangeShort}` : period.rangeShort,
    badgeTop: totalMin > 0 ? F.duration(totalMin) : '—',
    badgeSub: [F.plural(treinos, 'treino', 'treinos'), jogos ? F.plural(jogos, 'jogo', 'jogos') : null].filter(Boolean).join(' · '),
    days,
    photos,
  };
}

// ---------------------------------------------------------------- JOGO (1 jogo só)
// Relatório de um jogo: placar, lances em ordem de minuto e os atletas do jogo
// (titulares na ordem da escalação, depois reservas) com minutos, gols, assistências e cartões.
//   callUp: buildCallUp do jogo · game: getGameStats({ sessionId }) · events: match_events do jogo
//   goalTypeLabel: rótulo do tipo de gol (statsData.goalTypeLabel)
const RESULT_LABEL = { win: 'Vitória', draw: 'Empate', loss: 'Derrota' };
function buildGameSheet({ callUp, game, events = [], duration, goalTypeLabel = (t) => t || '' }) {
  const m = (game.matchesHistory || [])[0] || { goals_scored: 0, goals_conceded: 0, result: 'draw' };
  const statsById = new Map((game.playerStats || []).map((p) => [p.athlete_id, p]));
  const nm = (name) => String(name || '').trim();
  const lances = [];
  for (const e of events) {
    const own = !e.team || e.team === 'own';
    const min = e.minute ?? null;
    if (e.event_type === 'goal_scored') {
      const quem = nm(e.athlete_name) || 'Autor não informado';
      const extra = [e.secondary_athlete_name ? `assist. ${nm(e.secondary_athlete_name)}` : null, goalTypeLabel(e.goal_type)].filter(Boolean);
      lances.push({ min, kind: 'gol', label: 'Gol', text: quem, sub: extra.join(' · ') });
    } else if (e.event_type === 'goal_conceded') {
      lances.push({ min, kind: 'sofrido', label: 'Gol sofrido', text: goalTypeLabel(e.goal_type), sub: e.notes ? String(e.notes) : '' });
    } else if (own && (e.event_type === 'yellow_card' || e.event_type === 'red_card')) {
      lances.push({ min, kind: e.event_type === 'red_card' ? 'vermelho' : 'amarelo', label: e.event_type === 'red_card' ? 'Vermelho' : 'Amarelo', text: nm(e.athlete_name) || 'Atleta', sub: '' });
    } else if (own && e.event_type === 'substitution') {
      lances.push({ min, kind: 'troca', label: 'Substituição', text: `Entra ${nm(e.athlete_name) || '—'}`, sub: `Sai ${nm(e.secondary_athlete_name) || '—'}` });
    }
  }
  const ordem = { gol: 0, sofrido: 0, amarelo: 1, vermelho: 1, troca: 2 };
  lances.sort((a, b) => (a.min ?? 999) - (b.min ?? 999) || ordem[a.kind] - ordem[b.kind]);

  const linha = (r, titular) => {
    const st = statsById.get(r.id) || {};
    return {
      name: r.name, shirt: r.shirt, pos: r.pos, posColor: r.posColor,
      minutes: st.minutes || 0,
      played: titular || (st.minutes || 0) > 0,
      goals: st.goals || 0, assists: st.assists || 0,
      yellow: st.yellow_cards || 0, red: st.red_cards || 0,
    };
  };
  const titulares = callUp.groups.flatMap((g) => g.rows).map((r) => linha(r, true));
  const reservas = callUp.bench.map((r) => linha(r, false));
  const usados = titulares.length + reservas.filter((r) => r.played).length;
  const subs = (m.substitutions || []).length;
  const cartoes = titulares.concat(reservas).reduce((acc, r) => ({ y: acc.y + r.yellow, r: acc.r + r.red }), { y: 0, r: 0 });

  const meta = callUp.meta.slice();
  meta.push(`${F.weekdayLong(callUp.date)}, ${F.ddmmyyyy(callUp.date)}`);
  return {
    team: callUp.team,
    opponent: callUp.opponent,
    date: callUp.date,
    meta,
    score: `${m.goals_scored} × ${m.goals_conceded}`,
    result: m.result,
    resultLabel: RESULT_LABEL[m.result] || '',
    formation: callUp.formation,
    duration,
    lances,
    titulares,
    reservas,
    kpis: { usados, convocados: titulares.length + reservas.length, subs, yellow: cartoes.y, red: cartoes.r },
  };
}

// ---------------------------------------------------------------- CLUBE
// Relatório 5 (seção 5c). Junta o que as outras telas já calculam:
// getGameStats (jogos + minutagem pelas substituições), getTrainingStats
// (minutos trabalhados = statsData.minutosTrabalhados) e o Plantel.

const GROUP_LABELS = { 1: 'G1', 2: 'G2', 3: 'G3', 'Transição': 'Transição', DM: 'DM' };
const CONTENTS_PER_PILLAR = 8;

// Temporada = 01/01–31/12 do mesmo ano.
function isSeason(period) {
  return period.start.slice(5) === '01-01' && period.end.slice(5) === '12-31' && period.start.slice(0, 4) === period.end.slice(0, 4);
}

// Sequência atual a partir do jogo mais recente: invicto (V/E) ou, se o último
// foi derrota, há quantos jogos sem vencer (E/D).
function clubStreak(matchesHistory, winStreak, unbeatenStreak) {
  const desc = (matchesHistory || []).slice().sort((a, b) => String(F.toDateStr(b.date)).localeCompare(String(F.toDateStr(a.date))));
  if (!desc.length) return { kind: 'none', value: 0, wins: 0 };
  if (unbeatenStreak > 0) return { kind: 'unbeaten', value: unbeatenStreak, wins: winStreak };
  let winless = 0;
  for (const m of desc) {
    if (m.result === 'win') break;
    winless++;
  }
  return { kind: 'winless', value: winless, wins: 0 };
}

function buildClubTraining(ts) {
  const s = ts || {};
  const totals = s.totals || {};
  const pillars = buildPillars(s);
  const useTime = pillars.some((p) => p.minutes > 0);
  const contents = s.byContent || [];
  const pillarCols = pillars.map((p) => {
    const list = contents
      .filter((c) => c.dimension === p.key)
      .sort((a, b) => (b.count - a.count) || (b.minutes - a.minutes) || String(a.name).localeCompare(String(b.name), 'pt-BR'));
    return {
      key: p.key,
      label: p.label,
      activities: p.activities,
      minutes: p.minutes,
      pct: useTime ? p.pctTime : p.pctActivities,
      chips: list.slice(0, CONTENTS_PER_PILLAR).map((c) => chipContent(c.name)),
      more: Math.max(0, list.length - CONTENTS_PER_PILLAR),
    };
  });
  const sessions = totals.sessions || 0;
  const minutes = totals.minutes || 0;
  return {
    empty: (totals.activities || 0) === 0,
    minutes,
    sessions,
    activities: totals.activities || 0,
    distinctContents: contents.length,
    avgPerSession: sessions ? Math.round(minutes / sessions) : null,
    useTime,
    pillars: pillarCols,
  };
}

// Plantel: setor pela posição CADASTRADA; estatísticas do período por atleta
// (getGameStats.playerStats: jogos, minutos pelas substituições/minutes_manual, gols, assistências).
function buildSquad(athletes, playerStats) {
  const statsById = new Map((playerStats || []).map((p) => [p.athlete_id, p]));
  const withStats = (playerStats || []).length > 0;
  const players = (athletes || []).map((a) => {
    const pos = normCode(a.position) || null;
    const st = statsById.get(a.id);
    const g = a.group != null && a.group !== '' ? (GROUP_LABELS[a.group] || String(a.group)) : null;
    return {
      id: a.id,
      name: String(a.name || '').trim() || 'Atleta',
      pos,
      shirt: a.jersey_number != null && a.jersey_number !== '' ? Number(a.jersey_number) : null,
      group: g,
      sector: positionSector(pos) || 'outros',
      posColor: sectorInfo(positionSector(pos)).color,
      stats: withStats ? {
        games: st ? st.appearances || 0 : 0,
        minutes: st ? st.minutes || 0 : 0,
        goals: st ? st.goals || 0 : 0,
        assists: st ? st.assists || 0 : 0,
      } : null,
    };
  });
  // os 4 setores sempre aparecem (card vazio = "Nenhum atleta"); "Outros" só se houver
  const sectors = SECTOR_ORDER
    .map((key) => {
      const list = players.filter((p) => p.sector === key).sort(comparePlayers);
      const info = sectorInfo(key);
      return { key, label: info.plural, color: info.color, players: list, count: list.length };
    })
    .filter((x) => x.key !== 'outros' || x.count > 0);
  return {
    total: players.length,
    withStats,
    noGroup: players.length > 0 && players.every((p) => !p.group),
    sectors,
    composition: sectors.filter((x) => x.count > 0).map((x) => ({ key: x.key, label: x.label, color: x.color, count: x.count, pct: (x.count / players.length) * 100 })),
  };
}

function buildClubReport({ gameStats, trainingStats, athletes, team, period, squadAllowed = true, defaultDuration = 90 }) {
  const games = buildGamesReport({ stats: gameStats, team, period, defaultDuration });
  const g = gameStats || {};
  const training = buildClubTraining(trainingStats);
  const squad = buildSquad(squadAllowed ? athletes : [], g.playerStats);
  const season = isSeason(period);
  const label = season ? `Temporada ${period.start.slice(0, 4)}` : period.label;
  const k = games.kpis;
  return {
    kind: 'clube',
    team,
    period: { ...period, label },
    meta: [team.modalityLabel, label].filter(Boolean).join(' · '),
    right: `${label} · ${period.rangeShort}`,
    badgeTop: period.rangeShort,
    badgeSub: [period.year, F.plural(games.total, 'jogo', 'jogos'), F.plural(training.sessions, 'sessão', 'sessões')]
      .concat(squadAllowed ? [F.plural(squad.total, 'atleta', 'atletas')] : []).join(' · '),
    games,
    kpis: {
      goalsFor: k.goalsFor,
      goalsAgainst: k.goalsAgainst,
      avgFor: k.avgFor,
      avgAgainst: k.avgAgainst,
      diff: k.diff,
      streak: clubStreak(g.matchesHistory, g.winStreak || 0, g.unbeatenStreak || 0),
    },
    training,
    squad,
    squadAllowed,
  };
}

module.exports = {
  buildWeekProgram,
  buildGameSheet,
  buildClubReport,
  buildSquad,
  buildClubTraining,
  clubStreak,
  isSeason,
  shirtOf,
  buildCallUp,
  PERIOD_LABELS,
  SPECIAL_LIMITS,
  abbreviateContent,
  buildPeriod,
  goalCategory,
  goalsByCategory,
  buildGamesReport,
  dayFocus,
  buildDays,
  buildWeeks,
  pillarSegments,
  dayAssessment,
  buildPillars,
  buildTrainingReport,
  blockIsFilled,
  buildSessionSheet,
  buildDaySheet,
  captionFor,
  selectSessionPhotos,
  groupPhotosByDay,
  interleaveByDay,
  buildPhotoSection,
  periodRight,
};
