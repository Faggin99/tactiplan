// Orquestra os relatórios PDF: busca os MESMOS dados das telas
// (services/statsData, services/sessionData), monta o view model (builders),
// desenha o HTML (templates) e converte com o Chromium (renderer).
const { query } = require('../config/database');
const stats = require('../services/statsData');
const { getSessionDetail } = require('../services/sessionData');
const B = require('./builders');
const F = require('./format');
const { teamPalette, normalizeHex } = require('./theme');
const { loadLogo, loadPhotos, loadThumbs, filterImageAttachments } = require('./photos');
const { renderPdf } = require('./renderer');
const PC = require('./photoConfig');
const { toPreviewHtml } = require('./preview');
const { renderGames } = require('./templates/games');
const { renderTraining } = require('./templates/training');
const { renderSession } = require('./templates/session');
const { renderConvocacao } = require('./templates/convocacao');
const { formacaoValida, formacaoPadrao } = require('../utils/formacao');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPAN_DAYS = 400;

class ReportError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function safeName(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^\w-]/g, '');
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
    const logo = await loadLogo(club.logo_path);
    if (logo) {
      assets.set('img/logo', logo);
      logoUrl = 'img/logo';
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

// Candidatas: TODAS as fotos (imagem) das sessões, ordem de envio, com legenda
// e o dia da sessão. É contra esta lista que os ids do modal são validados
// (sessões já filtradas por clube/workspace/categoria do usuário).
async function photoCandidates(sessions, workspaceIds) {
  const files = await sessionImageFiles(sessions.map((s) => s.id), workspaceIds);
  if (!files.length) return [];
  const bySession = new Map(sessions.map((s) => [s.id, s]));
  const info = await activitiesInfo(Array.from(new Set(files.map((f) => f.activity_id).filter(Boolean))));
  return B.selectSessionPhotos(files, info).map((f) => {
    const sess = bySession.get(f.session_id);
    return { ...f, id: String(f.id), date: sess ? F.toDateStr(sess.date) : null };
  });
}

const LIST_MAX = 60; // miniaturas no modal (o relatório aceita até PC.MAX_FOTOS)

// Lista do modal "Fotos do relatório": miniaturas + seleção padrão.
async function photoList(cands, byDay, limit) {
  const ordered = cands.slice().sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
  const thumbs = await loadThumbs(ordered.slice(0, LIST_MAX));
  const loaded = new Set(thumbs.map((t) => t.id));
  const defaultOrder = byDay ? B.interleaveByDay(cands, byDay) : cands;
  const ids = defaultOrder.filter((c) => loaded.has(c.id)).slice(0, limit).map((c) => c.id);
  return {
    fotos: thumbs.map((t) => ({
      id: t.id,
      date: t.date,
      dia: t.date ? F.weekdayLong(t.date) : null,
      dd: t.date ? F.ddmm(t.date) : null,
      titulo: t.caption?.title || '',
      origem: t.caption?.context || '',
      thumb: `data:image/jpeg;base64,${t.buffer.toString('base64')}`,
    })),
    total: cands.length,
    semana: !!byDay,
    limite: PC.MAX_FOTOS,
    padrao: { ids, layout: PC.gridOptions(null, ids.length).layout, proporcao: '4:3', legendas: true, agrupar: true },
  };
}

function emptyList(week) {
  return { fotos: [], total: 0, semana: !!week, limite: PC.MAX_FOTOS, padrao: { ids: [], layout: 'medio', proporcao: '4:3', legendas: true, agrupar: true } };
}

// Seção de fotos do relatório. mode: 'pdf' (fotos em 1400px) | 'html' (prévia,
// miniaturas) | 'fotos' (lista do modal). Sem body.fotos = padrão de antes.
async function preparePhotos({ sessions, workspaceIds, body, mode, assets, week }) {
  const byDay = week ? new Map(sessions.map((s) => [s.id, s])) : null;
  const limit = week ? B.SPECIAL_LIMITS.weekPhotos : B.SPECIAL_LIMITS.sessionPhotos;
  const cands = await photoCandidates(sessions, workspaceIds);
  if (mode === 'fotos') return cands.length ? photoList(cands, byDay, limit) : emptyList(week);
  let config;
  try {
    config = PC.parseFotosConfig(body.fotos, new Set(cands.map((c) => c.id)));
  } catch (e) {
    throw new ReportError(400, e.message);
  }
  if (!cands.length || (config && !config.ids.length)) return null;
  let items;
  let hidden = 0;
  if (config) {
    const chosen = PC.applyFotosConfig(cands, config);
    items = mode === 'html' ? await loadThumbs(chosen) : (await loadPhotos(chosen, chosen.length)).photos;
  } else {
    const ordered = byDay ? B.interleaveByDay(cands, byDay) : cands;
    if (mode === 'html') {
      items = (await loadThumbs(ordered.slice(0, limit + 3))).slice(0, limit);
      hidden = Math.max(0, ordered.length - items.length);
    } else {
      ({ photos: items, hidden } = await loadPhotos(ordered, limit));
    }
  }
  if (!items.length) return null;
  items.forEach((p, i) => {
    const key = `img/foto-${i + 1}.jpg`;
    assets.set(key, { body: p.buffer, contentType: 'image/jpeg' });
    p.src = key;
    delete p.buffer;
  });
  return B.buildPhotoSection({ items, hidden, config, sessionsById: byDay });
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

async function buildTreino(body, user, assets, mode = 'pdf') {
  const { workspaceIds, allowedCategoryIds } = scope(user);
  const period = validPeriod(body);
  const team = await loadTeam(body.club_id, workspaceIds, assets, body.primary_color);
  const q = { workspaceIds, start: period.start, end: period.end, clubId: team.id, allowedCategoryIds };
  // Fotos só no relatório de 1 microciclo (ver decisão no relatório da entrega)
  const withPhotos = period.isSingleWeek && body.include_photos !== false;
  if (mode !== 'pdf') {
    // lista/prévia das fotos: não precisa das estatísticas
    if (!withPhotos) return mode === 'fotos' ? { list: emptyList(true) } : { html: null };
    const sessions = await stats.getPeriodSessions(q);
    const r = await preparePhotos({ sessions, workspaceIds, body, mode, assets, week: true });
    if (mode === 'fotos') return { list: r };
    if (!r) return { html: null };
    return { html: renderTraining({ team, right: B.periodRight(period), photos: r }, { now: new Date(), onlyPhotos: true }), count: r.items.length };
  }
  const [data, sessions, games] = await Promise.all([
    stats.getTrainingStats(q),
    stats.getPeriodSessions(q),
    stats.getGameStats(q),
  ]);
  const gamesById = new Map((games.matchesHistory || []).map((m) => [m.session_id, m]));
  const photos = withPhotos ? await preparePhotos({ sessions, workspaceIds, body, mode, assets, week: true }) : null;
  const vm = B.buildTrainingReport({ stats: data, sessions, gamesById, team, period, photos });
  return {
    html: renderTraining(vm, { now: new Date() }),
    filename: `Estatisticas_Treino_${safeName(team.name)}_${safeName(body.period_label || period.label)}.pdf`,
  };
}

async function buildSessao(body, user, assets, mode = 'pdf') {
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
  const withPhotos = body.include_photos !== false;
  if (mode === 'fotos' && !withPhotos) return { list: emptyList(false) };
  // 'visualizar' = a ficha inteira na tela (resumo do dia), com miniaturas como a prévia
  const photoMode = mode === 'visualizar' ? 'html' : mode;
  const photos = withPhotos ? await preparePhotos({ sessions: [session], workspaceIds, body, mode: photoMode, assets, week: false }) : null;
  if (mode === 'fotos') return { list: photos };
  let game = null;
  if ((mode === 'pdf' || mode === 'visualizar') && session.session_type === 'match') {
    const g = await stats.getGameStats({ workspaceIds, start: date, end: date, clubId: team.id });
    game = (g.matchesHistory || []).find((m) => m.session_id === session.id) || null;
  }
  const weekNumber = micro.week_identifier ? Number(String(micro.week_identifier).split('-')[1]) || null : (F.isoWeek(date)?.week || null);
  const vm = B.buildSessionSheet({ session, team, weekNumber, game, photos });
  if (mode === 'html') {
    return photos ? { html: renderSession(vm, { now: new Date(), onlyPhotos: true }), count: photos.items.length } : { html: null };
  }
  if (mode === 'visualizar') return { html: renderSession(vm, { now: new Date() }) };
  return {
    html: renderSession(vm, { now: new Date() }),
    filename: `treino-${safeName(session.day_name || F.weekdayLong(date))}-${date}.pdf`,
  };
}

// Convocação (A4 paisagem): jogo salvo + jogadores do jogo. Mesma regra do
// editor para a formação: a salva se valer para a modalidade, senão a padrão;
// vaga fora da formação efetiva = titular sem vaga (fora do campo).
async function buildConvocacao(body, user, assets) {
  const { workspaceIds } = scope(user);
  const sessionId = String(body.session_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new ReportError(400, 'session_id inválido');
  const r = await query(
    `SELECT s.id, s.date, s.session_type, s.opponent_name, s.match_location, s.match_round, s.formation,
            s.competition_id, s.club_id AS session_club_id, m.club_id, m.category_id
       FROM training_sessions s
       LEFT JOIN training_microcycles m ON m.id = s.microcycle_id
      WHERE s.id = $1 AND s.workspace_id = ANY($2)`,
    [sessionId, workspaceIds],
  );
  const session = r.rows[0];
  if (!session || session.session_type !== 'match') throw new ReportError(404, 'Jogo não encontrado');
  if (session.category_id && !user.assertCanAccessCategory(session.category_id)) {
    throw new ReportError(403, 'Sem acesso a essa categoria');
  }
  const team = await loadTeam(session.club_id || session.session_club_id, workspaceIds, assets, body.primary_color);
  const [players, comp] = await Promise.all([
    query(
      `SELECT mp.athlete_id, mp.status, mp.slot, mp.jersey_number, a.jersey_number AS athlete_jersey, a.name, a.position
         FROM match_players mp
         JOIN athletes a ON a.id = mp.athlete_id
        WHERE mp.session_id = $1 AND mp.workspace_id = ANY($2)
        -- mesma ordem da lista do modal do jogo (GET /api/games/:id): reservas na ordem em que foram salvas
        ORDER BY mp.slot ASC NULLS LAST, mp.created_at ASC, mp.ctid ASC`,
      [session.id, workspaceIds],
    ),
    session.competition_id
      ? query('SELECT name FROM competitions WHERE id = $1 AND workspace_id = ANY($2)', [session.competition_id, workspaceIds])
      : Promise.resolve({ rows: [] }),
  ]);
  const formation = formacaoValida(team.modality, session.formation) ? session.formation : formacaoPadrao(team.modality);
  const vm = B.buildCallUp({ session, team, players: players.rows, formation, competitionName: comp.rows[0]?.name || null });
  const date = F.toDateStr(session.date);
  const [y, m, d] = date.split('-');
  return {
    html: renderConvocacao(vm, { now: new Date() }),
    // mesmo nome do PDF antigo: Convocacao_<adversario>_<dd-mm-aaaa>.pdf
    filename: `Convocacao_${safeName(vm.opponent) || 'Adversario'}_${d}-${m}-${y}.pdf`,
    landscape: true,
  };
}

const BUILDERS = { jogos: buildJogos, treino: buildTreino, sessao: buildSessao, convocacao: buildConvocacao };
// convocacao: a mesma permissão de abrir o jogo (GET /api/games/:id)
const PERMISSION = { jogos: 'stats:view', treino: 'stats:view', sessao: 'training:view', convocacao: 'games:view' };

async function generateReport(tipo, body, user, { isStale } = {}) {
  const build = BUILDERS[tipo];
  if (!build) throw new ReportError(404, 'Tipo de relatório desconhecido');
  const assets = new Map();
  const { html, filename, landscape = false } = await build(body || {}, user, assets, 'pdf');
  const { pdf, pages } = await renderPdf(html, assets, { isStale, landscape });
  return { pdf, pages, filename };
}

// Fotos que o modal "Fotos do relatório" lista (só ficha do dia e semana).
async function listReportPhotos(tipo, body, user) {
  if (tipo !== 'treino' && tipo !== 'sessao') return emptyList(false);
  const { list } = await BUILDERS[tipo](body || {}, user, new Map(), 'fotos');
  return list;
}

// Prévia: HTML só da(s) página(s) de fotos, com miniaturas e fontes embutidas,
// para o iframe do modal. Não usa o Chromium (a paginação roda no navegador
// de quem vê, com o MESMO template e o mesmo paginador do PDF).
async function previewReportPhotos(tipo, body, user) {
  if (tipo !== 'treino' && tipo !== 'sessao') throw new ReportError(400, 'Este relatório não tem fotos');
  const assets = new Map();
  const { html, count } = await BUILDERS[tipo](body || {}, user, assets, 'html');
  return { html: html ? toPreviewHtml(html, assets) : null, fotos: count || 0 };
}

// Ficha de sessão inteira em HTML para VER na tela (resumo do dia): mesmo template
// do PDF, fontes e miniaturas embutidas, paginada no navegador. Não usa o Chromium.
async function viewSessionSheet(body, user) {
  const assets = new Map();
  const { html } = await buildSessao(body || {}, user, assets, 'visualizar');
  return { html: toPreviewHtml(html, assets) };
}

module.exports = { generateReport, listReportPhotos, previewReportPhotos, viewSessionSheet, ReportError, PERMISSION, BUILDERS };
