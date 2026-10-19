const express = require('express');
const { query } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

function getDateRange(period, startDate, endDate) {
  const now = new Date();
  let start, end;

  if (period === 'custom' && startDate && endDate) {
    start = startDate;
    end = endDate;
  } else if (period === 'week') {
    const d = new Date(now);
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - day + 1);
    start = d.toISOString().split('T')[0];
    end = now.toISOString().split('T')[0];
  } else if (period === 'month') {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - 1);
    start = d.toISOString().split('T')[0];
    end = now.toISOString().split('T')[0];
  } else if (period === '3months') {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - 3);
    start = d.toISOString().split('T')[0];
    end = now.toISOString().split('T')[0];
  } else {
    // Default: last month
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - 1);
    start = d.toISOString().split('T')[0];
    end = now.toISOString().split('T')[0];
  }

  return { start, end };
}

// Divide um período em N buckets uniformes, retornando [{ start, end }, ...]
function makeBuckets(startStr, endStr, n) {
  const startMs = new Date(startStr + 'T00:00:00Z').getTime();
  const endMs = new Date(endStr + 'T23:59:59Z').getTime();
  const totalMs = endMs - startMs;
  const step = totalMs / n;
  const buckets = [];
  for (let i = 0; i < n; i++) {
    const s = new Date(startMs + i * step);
    const e = new Date(startMs + (i + 1) * step - 1);
    buckets.push({
      start: s.toISOString().split('T')[0],
      end: e.toISOString().split('T')[0],
      label: `${s.toISOString().split('T')[0].slice(5)}`, // MM-DD
    });
  }
  return buckets;
}

// Distância ideal (training_sessions.avg_distance_km, info do dia).
// Só dias de TREINO entram (o campo só é editável em dia de treino; dia de jogo/
// descanso que ficou com valor antigo não distorce a média).
// - avgKm: média simples dos dias preenchidos (dia sem registro NÃO conta como 0)
// - totalKm: soma dos dias = quanto, em média, cada jogador acumulou no período
// - series: por DIA quando o período tem até 14 dias; por SEMANA (seg–dom) acima disso
function toDateStr(d) {
  return d instanceof Date ? d.toISOString().split('T')[0] : String(d).split('T')[0];
}
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - dow + 1);
  return d.toISOString().split('T')[0];
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}
const round2 = (n) => Math.round(n * 100) / 100;
function buildDistanceStats(sessions, start, end) {
  const days = (sessions || [])
    .filter(s => s.avg_distance_km !== null && s.avg_distance_km !== undefined)
    .filter(s => (s.session_type || 'training') === 'training')
    .map(s => ({ date: toDateStr(s.date), km: Number(s.avg_distance_km) }))
    .filter(d => Number.isFinite(d.km))
    .sort((a, b) => a.date.localeCompare(b.date));

  const spanDays = Math.round((new Date(end + 'T00:00:00Z') - new Date(start + 'T00:00:00Z')) / 86400000) + 1;
  const granularity = spanDays <= 14 ? 'day' : 'week';
  if (days.length === 0) {
    return { daysWithData: 0, avgKm: null, totalKm: 0, maxKm: null, minKm: null, granularity, series: [], byDay: [] };
  }
  const total = days.reduce((s, d) => s + d.km, 0);

  let series;
  if (granularity === 'day') {
    series = days.map(d => ({ label: d.date.slice(8, 10) + '/' + d.date.slice(5, 7), start: d.date, end: d.date, avgKm: round2(d.km), days: 1 }));
  } else {
    const weeks = new Map();
    for (const d of days) {
      const wk = mondayOf(d.date);
      if (!weeks.has(wk)) weeks.set(wk, []);
      weeks.get(wk).push(d.km);
    }
    series = Array.from(weeks.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([wk, kms]) => ({
        label: wk.slice(8, 10) + '/' + wk.slice(5, 7),
        start: wk,
        end: addDays(wk, 6),
        avgKm: round2(kms.reduce((s, k) => s + k, 0) / kms.length),
        days: kms.length,
      }));
  }

  return {
    daysWithData: days.length,
    avgKm: round2(total / days.length),
    totalKm: round2(total),
    maxKm: round2(Math.max(...days.map(d => d.km))),
    minKm: round2(Math.min(...days.map(d => d.km))),
    granularity,
    series,
    byDay: days.map(d => ({ date: d.date, km: round2(d.km) })),
  };
}

// GET /api/stats/training — dashboard
router.get('/training', async (req, res) => {
  try {
    if (!req.user.can('stats:view')) return res.status(403).json({ error: 'Sem permissão' });
    const { start_date, end_date, clubId } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date e end_date são obrigatórios' });
    }
    const start = start_date;
    const end = end_date;

    const tenantIds = req.user.workspaceIds || [];
    let sessionSql = `
      SELECT s.id, s.date, s.session_type, s.avg_distance_km
      FROM training_sessions s
      JOIN training_microcycles m ON s.microcycle_id = m.id
      WHERE s.workspace_id = ANY($1) AND s.date >= $2 AND s.date <= $3
    `;
    const sessionParams = [tenantIds, start, end];
    if (clubId) {
      sessionSql += ` AND m.club_id = $4`;
      sessionParams.push(clubId);
    }
    const sessionsResult = await query(sessionSql, sessionParams);
    const sessionIds = sessionsResult.rows.map(s => s.id);
    const distance = buildDistanceStats(sessionsResult.rows, start, end);

    const empty = {
      range: { start, end },
      totals: { activities: 0, minutes: 0, sessions: 0, uniqueTemplates: 0 },
      sparklines: { activities: Array(8).fill(0), minutes: Array(8).fill(0) },
      byDimension: [],
      byContent: [],
      bySubcontent: [],
      byDimensionPresence: [],
      byContentPresence: [],
      byDimensionPredominance: [],
      byContentPredominance: [],
      bySubcontentPredominance: [],
      sessionsByDate: [],
      sessionsWithActivity: 0,
      topTitles: [],
      trend: [],
      distance,
    };
    if (sessionIds.length === 0) return res.json(empty);

    // Atividades com content (snapshot via junction) + subconteúdos
    const activitiesResult = await query(
      `SELECT a.id, a.duration_minutes, a.title_id, b.session_id, s.date AS session_date,
              t.title AS title_name,
              c.id AS content_id, c.name AS content_name, c.dimension
       FROM training_activities a
       JOIN training_activity_blocks b ON a.block_id = b.id
       JOIN training_sessions s ON b.session_id = s.id
       LEFT JOIN activity_titles t ON a.title_id = t.id
       LEFT JOIN training_activity_contents tac ON tac.activity_id = a.id
       LEFT JOIN contents c ON c.id = tac.content_id
       WHERE b.session_id = ANY($1) AND a.workspace_id = ANY($2)`,
      [sessionIds, tenantIds]
    );

    const activities = activitiesResult.rows;
    const activityIds = activities.map(a => a.id);
    const totalMinutes = activities.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
    const sessionsWithActivities = new Set(activities.map(a => a.session_id));
    const uniqueTemplates = new Set(activities.filter(a => a.title_id).map(a => a.title_id));

    // Subconteúdos por atividade
    const stagesResult = activityIds.length === 0 ? { rows: [] } : await query(
      `SELECT tas.activity_id, tas.stage_id, s.name AS stage_name, s.content_id
       FROM training_activity_stages tas
       LEFT JOIN stages s ON s.id = tas.stage_id
       WHERE tas.activity_id = ANY($1)`,
      [activityIds]
    );
    const subsByActivity = new Map();
    for (const r of stagesResult.rows) {
      if (!r.stage_id) continue;
      if (!subsByActivity.has(r.activity_id)) subsByActivity.set(r.activity_id, []);
      subsByActivity.get(r.activity_id).push(r);
    }

    // byDimension: agrega todos os contents da dimensão
    const DIM_LABELS = { tatico: 'Tático', tecnico: 'Técnico', fisico: 'Físico', mental: 'Mental' };
    const DIM_ORDER = ['tatico', 'fisico', 'tecnico', 'mental'];
    const dimAgg = new Map();
    for (const a of activities) {
      const dim = a.dimension || null;
      if (!dim) continue;
      if (!dimAgg.has(dim)) dimAgg.set(dim, { dimension: dim, label: DIM_LABELS[dim] || dim, count: 0, minutes: 0 });
      const agg = dimAgg.get(dim);
      agg.count += 1;
      agg.minutes += a.duration_minutes || 0;
    }
    const byDimension = DIM_ORDER
      .filter(d => dimAgg.has(d))
      .map(d => dimAgg.get(d));

    // byContent: cada content individualmente (drill da dimensão)
    const contentAgg = new Map();
    for (const a of activities) {
      if (!a.content_id) continue;
      if (!contentAgg.has(a.content_id)) {
        contentAgg.set(a.content_id, {
          content_id: a.content_id,
          name: a.content_name,
          dimension: a.dimension,
          count: 0,
          minutes: 0,
        });
      }
      const agg = contentAgg.get(a.content_id);
      agg.count += 1;
      agg.minutes += a.duration_minutes || 0;
    }
    const byContent = Array.from(contentAgg.values()).sort((a, b) => b.count - a.count);

    // Predominância: agrupa atividades por sessão e pega conteúdo(s) com maior contagem.
    // Empate marca todos. Cada dia contribui 1 (dividido se houver empate) pra cada predominante.
    const sessionToContents = new Map(); // session_id → { content_id: { count, content_name, dimension } }
    for (const a of activities) {
      if (!a.content_id || !a.session_id) continue;
      if (!sessionToContents.has(a.session_id)) sessionToContents.set(a.session_id, new Map());
      const m = sessionToContents.get(a.session_id);
      if (!m.has(a.content_id)) {
        m.set(a.content_id, { content_id: a.content_id, name: a.content_name, dimension: a.dimension, count: 0, minutes: 0 });
      }
      m.get(a.content_id).count += 1;
      m.get(a.content_id).minutes += Number(a.duration_minutes) || 0;
    }
    const dimPredAgg = new Map();
    const contentPredAgg = new Map();
    const sessionsCount = sessionToContents.size;
    for (const [, m] of sessionToContents) {
      const items = Array.from(m.values());
      if (items.length === 0) continue;
      // Predominância POR TEMPO (decisão do Arthur, 19/10/2026): ganha o conteúdo com
      // mais minutos no dia, de qualquer pilar (antes o tático tinha prioridade).
      // Dia sem nenhum tempo preenchido: cai para o nº de atividades.
      const temTempo = items.some(i => i.minutes > 0);
      const peso = (i) => (temTempo ? i.minutes : i.count);
      const max = Math.max(...items.map(peso));
      const winners = items.filter(i => peso(i) === max);
      // Em caso de empate, CADA empatado conta 1 (não divide). Soma final pode
      // ser maior que o nº de sessões nesse caso, mas reflete a regra do usuário:
      // "se empatar, contabiliza os dois".
      for (const w of winners) {
        if (!contentPredAgg.has(w.content_id)) {
          contentPredAgg.set(w.content_id, {
            content_id: w.content_id, name: w.name, dimension: w.dimension, sessions: 0,
          });
        }
        contentPredAgg.get(w.content_id).sessions += 1;
        if (w.dimension) {
          if (!dimPredAgg.has(w.dimension)) {
            dimPredAgg.set(w.dimension, { dimension: w.dimension, label: DIM_LABELS[w.dimension] || w.dimension, sessions: 0 });
          }
          dimPredAgg.get(w.dimension).sessions += 1;
        }
      }
    }
    const byDimensionPredominance = DIM_ORDER
      .filter(d => dimPredAgg.has(d))
      .map(d => dimPredAgg.get(d));
    const byContentPredominance = Array.from(contentPredAgg.values())
      .sort((a, b) => b.sessions - a.sessions);

    // PRESENÇA binária por sessão: cada conteúdo/pilar conta 1 se apareceu naquela
    // sessão (sem peso, sem prioridade tática). Usado no dashboard principal pro
    // modo "Sessão" — responde "em quantas sessões isso apareceu?".
    const dimPresAgg = new Map();
    const contentPresAgg = new Map();
    for (const [, m] of sessionToContents) {
      const items = Array.from(m.values());
      const seenDims = new Set();
      for (const i of items) {
        if (!contentPresAgg.has(i.content_id)) {
          contentPresAgg.set(i.content_id, {
            content_id: i.content_id, name: i.name, dimension: i.dimension, sessions: 0,
          });
        }
        contentPresAgg.get(i.content_id).sessions += 1;
        if (i.dimension && !seenDims.has(i.dimension)) {
          seenDims.add(i.dimension);
        }
      }
      for (const d of seenDims) {
        if (!dimPresAgg.has(d)) {
          dimPresAgg.set(d, { dimension: d, label: DIM_LABELS[d] || d, sessions: 0 });
        }
        dimPresAgg.get(d).sessions += 1;
      }
    }
    const byDimensionPresence = DIM_ORDER
      .filter(d => dimPresAgg.has(d))
      .map(d => dimPresAgg.get(d));
    const byContentPresence = Array.from(contentPresAgg.values())
      .sort((a, b) => b.sessions - a.sessions);

    // Presença de SUBMOMENTOS por sessão (binária).
    // Pra cada submomento, conta em quantas SESSÕES DISTINTAS ele apareceu — não
    // importa se uma atividade marcou 2x ou 3 atividades marcaram. É só "esse
    // submomento foi trabalhado nesse dia?". Evita inflar contagem por atividade.
    const sessionToSubsSet = new Map(); // session_id → Set(stage_id)
    const subMeta = new Map(); // stage_id → { name, content_id }
    for (const a of activities) {
      if (!a.session_id) continue;
      const subs = subsByActivity.get(a.id) || [];
      if (subs.length === 0) continue;
      if (!sessionToSubsSet.has(a.session_id)) sessionToSubsSet.set(a.session_id, new Set());
      const set = sessionToSubsSet.get(a.session_id);
      for (const s of subs) {
        set.add(s.stage_id);
        if (!subMeta.has(s.stage_id)) {
          subMeta.set(s.stage_id, { name: s.stage_name, content_id: s.content_id });
        }
      }
    }
    const subPresenceAgg = new Map();
    for (const [, set] of sessionToSubsSet) {
      for (const stageId of set) {
        if (!subPresenceAgg.has(stageId)) {
          const meta = subMeta.get(stageId) || {};
          subPresenceAgg.set(stageId, {
            subcontent_id: stageId, name: meta.name, content_id: meta.content_id,
            dimension: 'tatico',
            sessions: 0,
          });
        }
        subPresenceAgg.get(stageId).sessions += 1;
      }
    }
    const bySubcontentPredominance = Array.from(subPresenceAgg.values())
      .sort((a, b) => b.sessions - a.sessions);

    // bySubcontent: contagem = 1 por aparição. Tempo = proporcional (duration / N_subs por atividade).
    const subAgg = new Map();
    for (const a of activities) {
      const subs = subsByActivity.get(a.id) || [];
      if (subs.length === 0) continue;
      const perSubMinutes = (a.duration_minutes || 0) / subs.length;
      for (const s of subs) {
        const key = s.stage_id;
        if (!subAgg.has(key)) {
          subAgg.set(key, {
            subcontent_id: s.stage_id,
            name: s.stage_name,
            content_id: s.content_id,
            dimension: a.dimension,
            count: 0,
            minutes: 0,
          });
        }
        const agg = subAgg.get(key);
        agg.count += 1;
        agg.minutes += perSubMinutes;
      }
    }
    const bySubcontent = Array.from(subAgg.values())
      .map(s => ({ ...s, minutes: Math.round(s.minutes) }))
      .sort((a, b) => b.count - a.count);

    // topTitles: agrupa por title_id
    const titleAgg = new Map();
    for (const a of activities) {
      if (!a.title_id) continue;
      if (!titleAgg.has(a.title_id)) {
        titleAgg.set(a.title_id, {
          title_id: a.title_id,
          title: a.title_name,
          dimension: a.dimension,
          content_name: a.content_name,
          count: 0,
          minutes: 0,
        });
      }
      const agg = titleAgg.get(a.title_id);
      agg.count += 1;
      agg.minutes += a.duration_minutes || 0;
    }
    const topTitles = Array.from(titleAgg.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // sparklines: 8 buckets
    const SPARK_BUCKETS = 8;
    const sparkBuckets = makeBuckets(start, end, SPARK_BUCKETS);
    const sparkActivities = Array(SPARK_BUCKETS).fill(0);
    const sparkMinutes = Array(SPARK_BUCKETS).fill(0);
    for (const a of activities) {
      const dateStr = a.session_date instanceof Date
        ? a.session_date.toISOString().split('T')[0]
        : String(a.session_date).split('T')[0];
      for (let i = 0; i < SPARK_BUCKETS; i++) {
        if (dateStr >= sparkBuckets[i].start && dateStr <= sparkBuckets[i].end) {
          sparkActivities[i] += 1;
          sparkMinutes[i] += a.duration_minutes || 0;
          break;
        }
      }
    }

    // trend: 4 buckets do mesmo range, com decomposição por dimensão (count + minutes)
    const TREND_BUCKETS = 4;
    const trendBuckets = makeBuckets(start, end, TREND_BUCKETS);
    const trend = trendBuckets.map(b => ({
      period: b.label,
      startDate: b.start,
      endDate: b.end,
      total: 0,
      minutes: 0,
      byDimension: { tatico: 0, tecnico: 0, fisico: 0, mental: 0 },
    }));
    const seenActivities = new Set();
    for (const a of activities) {
      if (seenActivities.has(a.id)) continue;
      seenActivities.add(a.id);
      const dim = a.dimension;
      const dateStr = a.session_date instanceof Date
        ? a.session_date.toISOString().split('T')[0]
        : String(a.session_date).split('T')[0];
      for (let i = 0; i < TREND_BUCKETS; i++) {
        if (dateStr >= trendBuckets[i].start && dateStr <= trendBuckets[i].end) {
          trend[i].total += 1;
          trend[i].minutes += a.duration_minutes || 0;
          if (dim) trend[i].byDimension[dim] = (trend[i].byDimension[dim] || 0) + 1;
          break;
        }
      }
    }

    // sessionsByDate: agrupa por data — cada sessão lista os conteúdos trabalhados
    // (com count + minutes pra heatmap suportar todos os 3 modos).
    const sessionDateMap = new Map(); // session_id → { date, contents: Map(content_id → {count, minutes, name, dimension}) }
    for (const a of activities) {
      if (!a.session_id) continue;
      const dateStr = a.session_date instanceof Date
        ? a.session_date.toISOString().split('T')[0]
        : String(a.session_date).split('T')[0];
      if (!sessionDateMap.has(a.session_id)) {
        sessionDateMap.set(a.session_id, { session_id: a.session_id, date: dateStr, contents: new Map() });
      }
      if (a.content_id) {
        const sess = sessionDateMap.get(a.session_id);
        if (!sess.contents.has(a.content_id)) {
          sess.contents.set(a.content_id, {
            content_id: a.content_id, name: a.content_name, dimension: a.dimension,
            count: 0, minutes: 0,
          });
        }
        const c = sess.contents.get(a.content_id);
        c.count += 1;
        c.minutes += a.duration_minutes || 0;
      }
    }
    const sessionsByDate = Array.from(sessionDateMap.values())
      .map(s => ({
        session_id: s.session_id,
        date: s.date,
        contents: Array.from(s.contents.values()),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      range: { start, end },
      totals: {
        activities: activities.filter(a => a.id).length === 0 ? 0 : new Set(activities.map(a => a.id)).size,
        minutes: totalMinutes,
        sessions: sessionsWithActivities.size,
        uniqueTemplates: uniqueTemplates.size,
      },
      sparklines: { activities: sparkActivities, minutes: sparkMinutes },
      byDimension,
      byContent,
      bySubcontent,
      byDimensionPresence,
      byContentPresence,
      byDimensionPredominance,
      byContentPredominance,
      bySubcontentPredominance,
      sessionsByDate,
      sessionsWithActivity: sessionsCount,
      topTitles,
      trend,
      distance,
    });
  } catch (err) {
    console.error('Training stats error:', err);
    res.status(500).json({ error: 'Failed to get training stats' });
  }
});

// Ranges de minutos por modalidade — espelha frontend/lib/sportConfig.js.
const MINUTE_RANGES_BY_MODALITY = {
  football_11: [
    { key: '0-14',   label: "0-14'",  min: 0,  max: 14,  color: '#22c55e' },
    { key: '15-29',  label: "15-29'", min: 15, max: 29,  color: '#3b82f6' },
    { key: '30-45+', label: "30-45+'", min: 30, max: 52, color: '#f59e0b' },
    { key: '46-59',  label: "46-59'", min: 46, max: 59,  color: '#8b5cf6' },
    { key: '60-74',  label: "60-74'", min: 60, max: 74,  color: '#ec4899' },
    { key: '75-90+', label: "75-90+'", min: 75, max: 120, color: '#ef4444' },
  ],
  football_7: [
    { key: '0-9',    label: "0-9'",   min: 0,  max: 9,  color: '#22c55e' },
    { key: '10-24+', label: "10-24+'", min: 10, max: 30, color: '#f59e0b' },
    { key: '25-39',  label: "25-39'", min: 25, max: 39, color: '#8b5cf6' },
    { key: '40-50+', label: "40-50+'", min: 40, max: 90, color: '#ef4444' },
  ],
  futsal: [
    { key: '0-9',    label: "0-9'",   min: 0,  max: 9,   color: '#22c55e' },
    { key: '10-19+', label: "10-19+'", min: 10, max: 25, color: '#f59e0b' },
    { key: '20-29',  label: "20-29'", min: 20, max: 29,  color: '#8b5cf6' },
    { key: '30-40+', label: "30-40+'", min: 30, max: 90, color: '#ef4444' },
  ],
};
const DEFAULT_DURATION_BY_MODALITY = { football_11: 90, football_7: 50, futsal: 40 };

// GET /api/stats/games
router.get('/games', async (req, res) => {
  try {
    if (!req.user.can('stats:view')) return res.status(403).json({ error: 'Sem permissão' });
    const { start_date, end_date, clubId } = req.query;
    const { start, end } = getDateRange('custom', start_date, end_date);

    // Modalidade do clube (pra parametrizar ranges/duração). Default football_11.
    let modality = 'football_11';
    if (clubId) {
      const r = await query('SELECT modality FROM clubs WHERE id = $1', [clubId]);
      if (r.rows.length > 0 && r.rows[0].modality) modality = r.rows[0].modality;
    }

    const tenantIds = req.user.workspaceIds || [];
    let sessionSql = `
      SELECT s.id, s.date, s.opponent_name, s.session_type, s.match_duration,
             s.match_round, s.match_location, s.competition_id,
             s.video_full_url, s.video_highlights_url, s.video_goals_url,
             m.club_id
      FROM training_sessions s
      JOIN training_microcycles m ON s.microcycle_id = m.id
      WHERE s.workspace_id = ANY($1) AND s.date >= $2 AND s.date <= $3
        AND s.session_type = 'match'
    `;
    const sessionParams = [tenantIds, start, end];
    let paramIdx = 4;

    if (clubId) {
      sessionSql += ` AND m.club_id = $${paramIdx++}`;
      sessionParams.push(clubId);
    }

    sessionSql += ' ORDER BY s.date ASC';

    const sessionsResult = await query(sessionSql, sessionParams);
    const sessionIds = sessionsResult.rows.map(s => s.id);

    if (sessionIds.length === 0) {
      return res.json({
        totalMatches: 0,
        totalGoalsScored: 0,
        totalGoalsConceded: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsScoredByType: [],
        goalsConcededByType: [],
        goalsScoredByMinute: [],
        goalsConcededByMinute: [],
        redCards: 0,
        yellowCards: 0,
        assists: 0,
        matchesHistory: [],
        topScorers: [],
        topAssisters: [],
        topMinutes: [],
        playerStats: [],
        avgGoalsScored: 0,
        avgGoalsConceded: 0,
        cleanSheets: 0,
        biggestWin: null,
        biggestLoss: null,
        form: [],
        avgTimeFirstGoalFor: null,
        avgTimeFirstGoalAgainst: null,
        goalDifference: 0,
      });
    }

    // Get all events for these sessions (incl. assistência/substituição via secondary_player)
    const eventsResult = await query(
      `SELECT me.*,
              a.name AS athlete_name, a.jersey_number,
              b.id   AS secondary_athlete_id,
              b.name AS secondary_athlete_name, b.jersey_number AS secondary_jersey_number
       FROM match_events me
       LEFT JOIN athletes a ON me.player_id           = a.id
       LEFT JOIN athletes b ON me.secondary_player_id = b.id
       WHERE me.session_id = ANY($1) AND me.workspace_id = ANY($2)`,
      [sessionIds, tenantIds]
    );

    // Get all match_players (escalações) pra calcular minutagem
    const playersResult = await query(
      `SELECT mp.session_id, mp.athlete_id, mp.status,
              a.name, a.jersey_number
       FROM match_players mp
       LEFT JOIN athletes a ON mp.athlete_id = a.id
       WHERE mp.session_id = ANY($1) AND mp.workspace_id = ANY($2)`,
      [sessionIds, tenantIds]
    );

    const events = eventsResult.rows;
    const matchPlayers = playersResult.rows;
    const totalMatches = sessionsResult.rows.length;

    // Goals scored and conceded (using event_type from frontend: goal_scored, goal_conceded)
    const goalsScored = events.filter(e => e.event_type === 'goal_scored');
    const goalsConceded = events.filter(e => e.event_type === 'goal_conceded');
    const totalGoalsScored = goalsScored.length;
    const totalGoalsConceded = goalsConceded.length;

    // Goals by type - labels e cores pros valores novos e os antigos (legacy).
    // Novos: org_off, trans_off, bp_off_*, org_def, trans_def, bp_def_*
    // Antigos: offensive_org, offensive_transition, free_kick, corner, penalty (sem orientação)
    const goalTypeLabels = {
      // Novos ofensivos
      'org_off':         'Org. Ofensiva',
      'trans_off':       'Transição Ofensiva',
      'bp_off_falta':    'BP Of. — Falta',
      'bp_off_corner':   'BP Of. — Escanteio',
      'bp_off_lateral':  'BP Of. — Lateral',
      'bp_off_penalty':  'BP Of. — Pênalti',
      // Novos defensivos
      'org_def':         'Org. Defensiva',
      'trans_def':       'Transição Defensiva',
      'bp_def_falta':    'BP Def. — Falta',
      'bp_def_corner':   'BP Def. — Escanteio',
      'bp_def_lateral':  'BP Def. — Lateral',
      'bp_def_penalty':  'BP Def. — Pênalti',
      // Legacy
      'offensive_org':        'Org. Ofensiva',
      'offensive_transition': 'Transição Ofensiva',
      'free_kick':            'Falta',
      'corner':               'Escanteio',
      'penalty':              'Pênalti',
      'unknown':              'Não definido',
    };
    const goalTypeColors = {
      'org_off':         '#22c55e',
      'trans_off':       '#3b82f6',
      'bp_off_falta':    '#f59e0b',
      'bp_off_corner':   '#8b5cf6',
      'bp_off_lateral':  '#06b6d4',
      'bp_off_penalty':  '#ef4444',
      'org_def':         '#22c55e',
      'trans_def':       '#3b82f6',
      'bp_def_falta':    '#f59e0b',
      'bp_def_corner':   '#8b5cf6',
      'bp_def_lateral':  '#06b6d4',
      'bp_def_penalty':  '#ef4444',
      // Legacy
      'offensive_org':        '#22c55e',
      'offensive_transition': '#3b82f6',
      'free_kick':            '#f59e0b',
      'corner':               '#8b5cf6',
      'penalty':              '#ef4444',
      'unknown':              '#6b7280',
    };

    function buildTypeArray(goals) {
      const byType = {};
      for (const g of goals) {
        const type = g.goal_type || 'unknown';
        byType[type] = (byType[type] || 0) + 1;
      }
      return Object.entries(byType)
        .map(([type, count]) => ({
          type,
          name: goalTypeLabels[type] || type,
          value: count,
          color: goalTypeColors[type] || '#6b7280',
        }))
        .sort((a, b) => b.value - a.value);
    }

    const goalsScoredByType = buildTypeArray(goalsScored);
    const goalsConcededByType = buildTypeArray(goalsConceded);

    // Goals by minute intervals — ranges variam por modalidade do clube
    const minuteRanges = MINUTE_RANGES_BY_MODALITY[modality] || MINUTE_RANGES_BY_MODALITY.football_11;

    function getMinuteRange(minute) {
      for (const range of minuteRanges) {
        if (minute >= range.min && minute <= range.max) return range;
      }
      return minuteRanges[minuteRanges.length - 1];
    }

    function buildMinuteArray(goals) {
      const byRange = {};
      minuteRanges.forEach(r => { byRange[r.key] = 0; });
      for (const g of goals) {
        if (g.minute != null) {
          const range = getMinuteRange(g.minute);
          byRange[range.key] += 1;
        }
      }
      return minuteRanges.map(range => ({
        key: range.key,
        name: range.label,
        value: byRange[range.key] || 0,
        color: range.color,
      }));
    }

    const goalsScoredByMinute = buildMinuteArray(goalsScored);
    const goalsConcededByMinute = buildMinuteArray(goalsConceded);

    // Cartões (apenas do próprio time)
    const ownEvents = events.filter(e => e.team === 'own');
    const yellowCardsTotal = ownEvents.filter(e => e.event_type === 'yellow_card').length;
    const redCards         = ownEvents.filter(e => e.event_type === 'red_card').length;
    const assistsTotal     = events.filter(e => e.event_type === 'goal_scored' && e.secondary_athlete_id).length;
    // Métricas exclusivas de futsal — contam 0 nas demais modalidades
    const accumulatedFouls = ownEvents.filter(e => e.event_type === 'accumulated_foul').length;
    const sixthFouls       = ownEvents.filter(e => e.event_type === 'sixth_foul').length;

    // Match history com resultados + métricas auxiliares
    const matchesHistory = [];
    let wins = 0, draws = 0, losses = 0;
    let cleanSheets = 0;
    let biggestWin = null;
    let biggestLoss = null;
    const firstGoalForTimes = [];     // minuto do 1º gol nosso em cada jogo (se houve)
    const firstGoalAgainstTimes = []; // minuto do 1º gol sofrido em cada jogo (se houve)

    for (const session of sessionsResult.rows) {
      const sessionEvents = events.filter(e => e.session_id === session.id);
      const goalsFor = sessionEvents
        .filter(e => e.event_type === 'goal_scored')
        .sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
      const goalsAgainst = sessionEvents
        .filter(e => e.event_type === 'goal_conceded')
        .sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
      const scored = goalsFor.length;
      const conceded = goalsAgainst.length;

      let result;
      if (scored > conceded) { result = 'win'; wins++; }
      else if (scored < conceded) { result = 'loss'; losses++; }
      else { result = 'draw'; draws++; }

      if (conceded === 0) cleanSheets++;

      const margin = scored - conceded;
      if (margin > 0 && (!biggestWin || margin > (biggestWin.goals_scored - biggestWin.goals_conceded))) {
        biggestWin = { session_id: session.id, date: session.date, opponent: session.opponent_name, goals_scored: scored, goals_conceded: conceded };
      }
      if (margin < 0 && (!biggestLoss || margin < (biggestLoss.goals_scored - biggestLoss.goals_conceded))) {
        biggestLoss = { session_id: session.id, date: session.date, opponent: session.opponent_name, goals_scored: scored, goals_conceded: conceded };
      }
      if (goalsFor.length > 0 && goalsFor[0].minute != null)         firstGoalForTimes.push(goalsFor[0].minute);
      if (goalsAgainst.length > 0 && goalsAgainst[0].minute != null) firstGoalAgainstTimes.push(goalsAgainst[0].minute);

      matchesHistory.push({
        session_id: session.id,
        date: session.date,
        opponent: session.opponent_name,
        goals_scored: scored,
        goals_conceded: conceded,
        result,
        match_round:        session.match_round || null,
        match_location:     session.match_location || null,
        competition_id:     session.competition_id || null,
        video_full_url:       session.video_full_url || null,
        video_highlights_url: session.video_highlights_url || null,
        video_goals_url:      session.video_goals_url || null,
      });
    }

    // Pontos disputados/ganhos + sequências (estilo PDF do CIU)
    const pointsPlayed = matchesHistory.length * 3;
    const pointsWon = (wins * 3) + draws;
    // Sequência mais recente: caminha do mais recente pra trás
    const byDateDesc = matchesHistory.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    let winStreak = 0, unbeatenStreak = 0, drawStreak = 0;
    for (const m of byDateDesc) {
      if (m.result === 'win') winStreak++;
      else break;
    }
    for (const m of byDateDesc) {
      if (m.result === 'win' || m.result === 'draw') unbeatenStreak++;
      else break;
    }
    for (const m of byDateDesc) {
      if (m.result === 'draw') drawStreak++;
      else break;
    }

    // Forma (últimas 5 partidas) — ordenada pela data desc
    const form = matchesHistory
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 5)
      .map(m => ({ result: m.result, date: m.date, opponent: m.opponent, goals_scored: m.goals_scored, goals_conceded: m.goals_conceded }));

    const avg = (arr) => arr.length === 0 ? null : Math.round(arr.reduce((s, n) => s + n, 0) / arr.length);
    const avgTimeFirstGoalFor     = avg(firstGoalForTimes);
    const avgTimeFirstGoalAgainst = avg(firstGoalAgainstTimes);
    const goalDifference          = totalGoalsScored - totalGoalsConceded;

    // ─────────────────────────────────────────────────────────────
    // Estatísticas por atleta — goals, assists, yellow, red, minutes, appearances
    // Minutagem reconstruída a partir de match_players + eventos de substituição.
    // ─────────────────────────────────────────────────────────────
    const playerStatsMap = new Map(); // athlete_id → { name, jersey_number, goals, assists, yellow, red, minutes, appearances }
    function ensure(id, name, jersey) {
      if (!id) return null;
      if (!playerStatsMap.has(id)) {
        playerStatsMap.set(id, { athlete_id: id, name: name || '—', jersey_number: jersey || null, goals: 0, assists: 0, yellow_cards: 0, red_cards: 0, minutes: 0, appearances: 0 });
      }
      return playerStatsMap.get(id);
    }

    // Gols / cartões / assists (só do próprio time)
    for (const e of events) {
      if (e.team !== 'own') continue;
      const p = ensure(e.player_id, e.athlete_name, e.jersey_number);
      if (!p) continue;
      if (e.event_type === 'goal_scored') p.goals++;
      else if (e.event_type === 'yellow_card') p.yellow_cards++;
      else if (e.event_type === 'red_card') p.red_cards++;
      if (e.event_type === 'goal_scored' && e.secondary_athlete_id) {
        const assister = ensure(e.secondary_athlete_id, e.secondary_athlete_name, e.secondary_jersey_number);
        if (assister) assister.assists++;
      }
    }

    // Minutagem — por sessão, reconstrói com starters + substitutions
    const sessionsById = new Map(sessionsResult.rows.map(s => [s.id, s]));
    const playersBySession = new Map();
    for (const mp of matchPlayers) {
      if (!playersBySession.has(mp.session_id)) playersBySession.set(mp.session_id, []);
      playersBySession.get(mp.session_id).push(mp);
    }

    for (const [sessionId, players] of playersBySession) {
      const session = sessionsById.get(sessionId);
      if (!session) continue;
      const duration = session.match_duration || DEFAULT_DURATION_BY_MODALITY[modality] || 90;
      const subs = events.filter(e => e.session_id === sessionId && e.event_type === 'substitution');

      // Mapas: minuto em que jogador saiu (substituído) / minuto em que jogador entrou
      const wentOutAt = new Map();
      const cameInAt = new Map();
      for (const ev of subs) {
        if (ev.secondary_player_id) wentOutAt.set(ev.secondary_player_id, ev.minute ?? duration);
        if (ev.player_id)            cameInAt.set(ev.player_id, ev.minute ?? 0);
      }

      for (const mp of players) {
        const p = ensure(mp.athlete_id, mp.name, mp.jersey_number);
        if (!p) continue;
        const isStarter = mp.status === 'starter';
        if (isStarter) {
          const exitMin = wentOutAt.get(mp.athlete_id);
          p.minutes += (exitMin != null ? exitMin : duration);
          p.appearances++;
        } else {
          const entryMin = cameInAt.get(mp.athlete_id);
          if (entryMin != null) {
            p.minutes += Math.max(0, duration - entryMin);
            p.appearances++;
          }
        }
      }
    }

    const playerStats = Array.from(playerStatsMap.values())
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.minutes - a.minutes);

    const topScorers = playerStats
      .filter(p => p.goals > 0)
      .slice(0, 10)
      .map(p => ({ athlete_id: p.athlete_id, name: p.name, jersey_number: p.jersey_number, goals: p.goals }));

    const topAssisters = playerStats
      .filter(p => p.assists > 0)
      .sort((a, b) => b.assists - a.assists)
      .slice(0, 10)
      .map(p => ({ athlete_id: p.athlete_id, name: p.name, jersey_number: p.jersey_number, assists: p.assists }));

    const topMinutes = playerStats
      .filter(p => p.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 10)
      .map(p => ({ athlete_id: p.athlete_id, name: p.name, jersey_number: p.jersey_number, minutes: p.minutes, appearances: p.appearances }));

    res.json({
      totalMatches,
      totalGoalsScored,
      totalGoalsConceded,
      wins,
      draws,
      losses,
      goalsScoredByType,
      goalsConcededByType,
      goalsScoredByMinute,
      goalsConcededByMinute,
      redCards,
      yellowCards: yellowCardsTotal,
      assists: assistsTotal,
      accumulatedFouls,
      sixthFouls,
      modality,
      pointsPlayed,
      pointsWon,
      winStreak,
      unbeatenStreak,
      drawStreak,
      matchesHistory,
      topScorers,
      topAssisters,
      topMinutes,
      playerStats,
      avgGoalsScored: totalMatches > 0 ? Math.round((totalGoalsScored / totalMatches) * 100) / 100 : 0,
      avgGoalsConceded: totalMatches > 0 ? Math.round((totalGoalsConceded / totalMatches) * 100) / 100 : 0,
      cleanSheets,
      biggestWin,
      biggestLoss,
      form,
      avgTimeFirstGoalFor,
      avgTimeFirstGoalAgainst,
      goalDifference,
    });
  } catch (err) {
    console.error('Game stats error:', err);
    res.status(500).json({ error: 'Failed to get game stats' });
  }
});

module.exports = router;
module.exports.buildDistanceStats = buildDistanceStats;
