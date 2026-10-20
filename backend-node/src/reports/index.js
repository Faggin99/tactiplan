// Orquestra os relatórios PDF: busca os MESMOS dados das telas
// (services/statsData, services/sessionData), monta o view model (builders),
// desenha o HTML (templates) e converte com o Chromium (renderer).
const { query } = require('../config/database');
const stats = require('../services/statsData');
const { getSessionDetail } = require('../services/sessionData');
const B = require('./builders');
const F = require('./format');
const { teamPalette, normalizeHex } = require('./theme');
const { loadLogoBuffer, loadPhotos, filterImageAttachments } = require('./photos');
const { renderPdf } = require('./renderer');
const { renderGames } = require('./templates/games');
const { renderTraining } = require('./templates/training');
const { renderSession } = require('./templates/session');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPAN_DAYS = 400;

class ReportError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function safeName(s) {
  return String(s || '').replace(/\s+/g, '_').replace(/[^\w-]/g, '');
}

function scope(user) {
  return { workspaceIds: user.workspaceIds || [], allowedCategoryIds: user.allowedCategoryIds ?? null };
}

function validPeriod(body) {
  const start = String(body.start_date || '');
  const end = String(body.end_date || '');
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) throw new ReportError(400, 'start_date e end_date (AAAA-MM-DD) são obrigatórios');
  const span = F.daysBetween(start, end);
  if (span < 0) throw new ReportError(400, 'Período inválido');
  if (span > MAX_SPAN_DAYS) throw new ReportError(400, 'Período longo demais para o relatório');
  return B.buildPeriod({ start, end, filterType: body.filter_type });
}

async function loadTeam(clubId, workspaceIds, assets, colorOverride) {
  if (!clubId) throw new ReportError(400, 'club_id é obrigatório');
  const r = await query(
    'SELECT id, name, modality, primary_color, logo_path FROM clubs WHERE id = $1 AND workspace_id = ANY($2)',
    [clubId, workspaceIds],
  );
  const club = r.rows[0];
  if (!club) throw new ReportError(404, 'Clube não encontrado');
  let logoUrl = null;
  if (club.logo_path) {
    const buf = await loadLogoBuffer(club.logo_path);
    if (buf) {
      assets.set('img/logo.png', { body: buf, contentType: 'image/png' });
      logoUrl = 'img/logo.png';
    }
  }
  const color = normalizeHex(colorOverride) || club.primary_color;
  return {
    id: club.id,
    name: club.name,
    short: F.initials(club.name),
    modality: club.modality || 'football_11',
    modalityLabel: F.modalityLabel(club.modality),
    palette: teamPalette(color),
    logoUrl,
  };
}

async function activitiesInfo(activityIds) {
  const map = new Map();
  if (!activityIds.length) return map;
  const r = await query(
    `SELECT a.id, b.name AS block_name, t.title
       FROM training_activities a
       JOIN training_activity_blocks b ON b.id = a.block_id
       LEFT JOIN activity_titles t ON t.id = a.title_id
      WHERE a.id = ANY($1)`,
    [activityIds],
  );
  for (const row of r.rows) map.set(row.id, { blockName: row.block_name, title: row.title });
  return map;
}

// Anexos das sessões (e das atividades dessas sessões), só imagens.
async function sessionImageFiles(sessionIds, workspaceIds) {
  if (!sessionIds.length) return [];
  const r = await query(
    `SELECT f.id, f.session_id, f.activity_id, f.title, f.file_name, f.file_path, f.mime_type, f.created_at
       FROM training_activity_files f
      WHERE f.workspace_id = ANY($2)
        AND (f.session_id = ANY($1) OR f.activity_id IN (
              SELECT a.id FROM training_activities a
                JOIN training_activity_blocks b ON b.id = a.block_id
               WHERE b.session_id = ANY($1)))
      ORDER BY f.created_at ASC`,
    [sessionIds, workspaceIds],
  );
  const files = filterImageAttachments(r.rows);
  // anexo de atividade sem session_id: herda a sessão da atividade
  const missing = files.filter((f) => !f.session_id && f.activity_id).map((f) => f.activity_id);
  if (missing.length) {
    const rs = await query(
      `SELECT a.id, b.session_id FROM training_activities a JOIN training_activity_blocks b ON b.id = a.block_id WHERE a.id = ANY($1)`,
      [missing],
    );
    const bySession = new Map(rs.rows.map((x) => [x.id, x.session_id]));
    for (const f of files) if (!f.session_id) f.session_id = bySession.get(f.activity_id) || null;
  }
  return files;
}

async function preparePhotos(files, limit, assets, sessionsById = null) {
  const info = await activitiesInfo(Array.from(new Set(files.map((f) => f.activity_id).filter(Boolean))));
  let selected = B.selectSessionPhotos(files, info);
  if (sessionsById) selected = B.interleaveByDay(selected, sessionsById);
  const { photos, hidden } = await loadPhotos(selected, limit);
  photos.forEach((p, i) => {
    const key = `img/foto-${i + 1}.jpg`;
    assets.set(key, { body: p.buffer, contentType: 'image/jpeg' });
    p.src = key;
    delete p.buffer;
  });
  return { items: photos, hidden, total: photos.length + hidden };
}

// ------------------------------------------------------------------ tipos
async function buildJogos(body, user, assets) {
  const { workspaceIds, allowedCategoryIds } = scope(user);
  const period = validPeriod(body);
  const team = await loadTeam(body.club_id, workspaceIds, assets, body.primary_color);
  const data = await stats.getGameStats({ workspaceIds, start: period.start, end: period.end, clubId: team.id, allowedCategoryIds });
  const vm = B.buildGamesReport({
    stats: data, team, period, defaultDuration: stats.DEFAULT_DURATION_BY_MODALITY[data.modality || team.modality] || 90,
  });
  return {
    html: renderGames(vm, { now: new Date() }),
    filename: `Desempenho_${safeName(team.name)}_${safeName(body.period_label || period.label)}.pdf`,
  };
}

async function buildTreino(body, user, assets) {
  const { workspaceIds, allowedCategoryIds } = scope(user);
  const period = validPeriod(body);
  const team = await loadTeam(body.club_id, workspaceIds, assets, body.primary_color);
  const q = { workspaceIds, start: period.start, end: period.end, clubId: team.id, allowedCategoryIds };
  const [data, sessions, games] = await Promise.all([
    stats.getTrainingStats(q),
    stats.getPeriodSessions(q),
    stats.getGameStats(q),
  ]);
  const gamesById = new Map((games.matchesHistory || []).map((m) => [m.session_id, m]));
  // Fotos só no relatório de 1 microciclo (ver decisão no relatório da entrega)
  let photos = null;
  if (period.isSingleWeek && body.include_photos !== false) {
    const files = await sessionImageFiles(sessions.map((s) => s.id), workspaceIds);
    if (files.length) {
      const sessionsById = new Map(sessions.map((s) => [s.id, s]));
      const p = await preparePhotos(files, B.SPECIAL_LIMITS.weekPhotos, assets, sessionsById);
      if (p.items.length) photos = { groups: B.groupPhotosByDay(p.items, sessionsById), hidden: p.hidden, total: p.total };
    }
  }
  const vm = B.buildTrainingReport({ stats: data, sessions, gamesById, team, period, photos });
  return {
    html: renderTraining(vm, { now: new Date() }),
    filename: `Estatisticas_Treino_${safeName(team.name)}_${safeName(body.period_label || period.label)}.pdf`,
  };
}

async function buildSessao(body, user, assets) {
  const { workspaceIds } = scope(user);
  const sessionId = String(body.session_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new ReportError(400, 'session_id inválido');
  const session = await getSessionDetail(sessionId, workspaceIds);
  if (!session) throw new ReportError(404, 'Sessão não encontrada');
  const mc = await query('SELECT club_id, category_id, week_identifier FROM training_microcycles WHERE id = $1', [session.microcycle_id]);
  const micro = mc.rows[0] || {};
  if (micro.category_id && !user.assertCanAccessCategory(micro.category_id)) {
    throw new ReportError(403, 'Sem acesso a essa categoria');
  }
  const team = await loadTeam(micro.club_id || session.club_id, workspaceIds, assets, body.primary_color);
  const date = F.toDateStr(session.date);
  let game = null;
  if (session.session_type === 'match') {
    const g = await stats.getGameStats({ workspaceIds, start: date, end: date, clubId: team.id });
    game = (g.matchesHistory || []).find((m) => m.session_id === session.id) || null;
  }
  let photos = null;
  if (body.include_photos !== false) {
    const files = await sessionImageFiles([session.id], workspaceIds);
    if (files.length) {
      const p = await preparePhotos(files, B.SPECIAL_LIMITS.sessionPhotos, assets);
      if (p.items.length) photos = p;
    }
  }
  const weekNumber = micro.week_identifier ? Number(String(micro.week_identifier).split('-')[1]) || null : (F.isoWeek(date)?.week || null);
  const vm = B.buildSessionSheet({ session, team, weekNumber, game, photos });
  return {
    html: renderSession(vm, { now: new Date() }),
    filename: `treino-${safeName(session.day_name || F.weekdayLong(date))}-${date}.pdf`,
  };
}

const BUILDERS = { jogos: buildJogos, treino: buildTreino, sessao: buildSessao };
const PERMISSION = { jogos: 'stats:view', treino: 'stats:view', sessao: 'training:view' };

async function generateReport(tipo, body, user) {
  const build = BUILDERS[tipo];
  if (!build) throw new ReportError(404, 'Tipo de relatório desconhecido');
  const assets = new Map();
  const { html, filename } = await build(body || {}, user, assets);
  const { pdf, pages } = await renderPdf(html, assets);
  return { pdf, pages, filename };
}

module.exports = { generateReport, ReportError, PERMISSION, BUILDERS };
