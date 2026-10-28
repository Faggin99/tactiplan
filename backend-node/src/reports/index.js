// Orquestra os relatórios PDF: busca os MESMOS dados das telas
// (services/statsData, services/sessionData), monta o view model (builders),
// desenha o HTML (templates) e converte com o Chromium (renderer).
const fs = require('fs');
const path = require('path');
const { query } = require('../config/database');
const stats = require('../services/statsData');
const { getSessionDetail } = require('../services/sessionData');
const B = require('./builders');
const F = require('./format');
const { teamPalette, normalizeHex } = require('./theme');
const { positionSector, sectorInfo } = require('./positionSector');
const { loadLogo, loadPhotos, loadThumbs, filterImageAttachments, resolveUploadPath } = require('./photos');
const { renderPdf } = require('./renderer');
const PC = require('./photoConfig');
const { toPreviewHtml } = require('./preview');
const { renderGames } = require('./templates/games');
const { renderTraining } = require('./templates/training');
const { renderSession } = require('./templates/session');
const { renderConvocacao } = require('./templates/convocacao');
const { renderClube } = require('./templates/clube');
const { renderPlantel } = require('./templates/plantel');
const { renderJogo } = require('./templates/jogo');
const { renderWeekProgram } = require('./templates/semana');
const { renderAnalise } = require('./templates/analise');
const { montarDeck } = require('./analiseDeck');
const { gerarPptx } = require('./analisePptx');
const AA = require('../services/analiseAdversario');
const { formacaoValida, formacaoPadrao } = require('../utils/formacao');
const P = require('../services/periodos');

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
    `SELECT a.id, b.name AS block_name, t.title,
            (SELECT string_agg(c.name, ', ' ORDER BY c.name) FROM training_activity_contents tac
               JOIN contents c ON c.id = tac.content_id WHERE tac.activity_id = a.id) AS conteudos
       FROM training_activities a
       JOIN training_activity_blocks b ON b.id = a.block_id
       LEFT JOIN activity_titles t ON t.id = a.title_id
      WHERE a.id = ANY($1)`,
    [activityIds],
  );
  // título da foto = a atividade (título; sem título, os conteúdos)
  for (const row of r.rows) map.set(row.id, { blockName: row.block_name, title: row.title || row.conteudos || null });
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
    return { ...f, id: String(f.id), date: sess ? F.toDateStr(sess.date) : null, periodo: sess?.periodo || null };
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
      // dia com 2+ períodos: o modal agrupa por período (null = período único)
      periodo: t.periodo || null,
      periodoRotulo: P.rotuloPeriodo(t.periodo),
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
  // Filtro de campeonato (opcional): id do campeonato ou 'none' (só amistosos/sem campeonato)
  let competitionId = null;
  let competitionName = null;
  if (body.competition_id === 'none') {
    competitionId = 'none';
    competitionName = 'Sem campeonato';
  } else if (body.competition_id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(body.competition_id))) throw new ReportError(400, 'competition_id inválido');
    const c = await query('SELECT id, name FROM competitions WHERE id = $1 AND workspace_id = ANY($2)', [body.competition_id, workspaceIds]);
    if (!c.rows[0]) throw new ReportError(404, 'Campeonato não encontrado');
    competitionId = c.rows[0].id;
    competitionName = c.rows[0].name;
  }
  const data = await stats.getGameStats({ workspaceIds, start: period.start, end: period.end, clubId: team.id, allowedCategoryIds, competitionId });
  const vm = B.buildGamesReport({
    stats: data, team, period, defaultDuration: stats.DEFAULT_DURATION_BY_MODALITY[data.modality || team.modality] || 90,
    competitionName,
  });
  return {
    html: renderGames(vm, { now: new Date() }),
    filename: `Desempenho_${safeName(team.name)}${competitionName ? `_${safeName(competitionName)}` : ''}_${safeName(body.period_label || period.label)}.pdf`,
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

// Programação da semana (A4 paisagem): o resumo da tela Programação — dias, períodos e
// blocos —, não as estatísticas. Mesmas fotos (modal) do relatório de treino da semana.
async function buildSemana(body, user, assets, mode = 'pdf') {
  const { workspaceIds, allowedCategoryIds } = scope(user);
  const period = validPeriod({ ...body, filter_type: '1-micro' });
  if (F.daysBetween(period.start, period.end) !== 6) throw new ReportError(400, 'A programação é de uma semana (7 dias)');
  const team = await loadTeam(body.club_id, workspaceIds, assets, body.primary_color);
  const q = { workspaceIds, start: period.start, end: period.end, clubId: team.id, allowedCategoryIds };
  const sessions = await stats.getPeriodSessions(q);
  const withPhotos = body.include_photos !== false;
  if (mode !== 'pdf') {
    if (!withPhotos) return mode === 'fotos' ? { list: emptyList(true) } : { html: null };
    const r = await preparePhotos({ sessions, workspaceIds, body, mode, assets, week: true });
    if (mode === 'fotos') return { list: r };
    if (!r) return { html: null };
    return { html: renderWeekProgram({ team, right: B.periodRight(period), photos: r, days: [] }, { now: new Date(), onlyPhotos: true }), count: r.items.length };
  }
  const details = [];
  for (const s of sessions) {
    const d = await getSessionDetail(s.id, workspaceIds);
    if (d) details.push(d);
  }
  const gamesById = new Map();
  if (details.some((d) => d.session_type === 'match')) {
    const g = await stats.getGameStats(q);
    for (const m of g.matchesHistory || []) gamesById.set(m.session_id, m);
  }
  const photos = withPhotos ? await preparePhotos({ sessions, workspaceIds, body, mode, assets, week: true }) : null;
  const weekNumber = F.isoWeek(period.start)?.week || null;
  const vm = B.buildWeekProgram({ team, period, details, gamesById, weekNumber, photos });
  return {
    html: renderWeekProgram(vm, { now: new Date() }),
    filename: `Programacao_${safeName(team.name)}_Semana_${weekNumber || ''}.pdf`,
    landscape: true,
  };
}

// Períodos do dia da sessão (getSessionDetail de cada um), ordem Manhã → Noite.
// Dia de período único = [a própria sessão].
async function periodosDoDia(session, workspaceIds) {
  const r = await query(
    `SELECT id FROM training_sessions
      WHERE workspace_id = $1 AND date = $2 AND club_id IS NOT DISTINCT FROM $3
      ORDER BY ${P.ordemSql()} ASC`,
    [session.workspace_id, F.toDateStr(session.date), session.club_id],
  );
  if (r.rows.length <= 1) return [session];
  const out = [];
  for (const row of r.rows) {
    if (row.id === session.id) { out.push(session); continue; }
    const d = await getSessionDetail(row.id, workspaceIds);
    if (d) out.push(d);
  }
  return out.sort(P.compararPeriodos);
}

// body.so_periodo = true: só o período de session_id (dia com 2+ períodos).
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
  const sessoes = body.so_periodo === true ? [session] : await periodosDoDia(session, workspaceIds);
  const withPhotos = body.include_photos !== false;
  if (mode === 'fotos' && !withPhotos) return { list: emptyList(false) };
  // 'visualizar' = a ficha inteira na tela (resumo do dia), com miniaturas como a prévia
  const photoMode = mode === 'visualizar' ? 'html' : mode;
  const photos = withPhotos ? await preparePhotos({ sessions: sessoes, workspaceIds, body, mode: photoMode, assets, week: false }) : null;
  if (mode === 'fotos') return { list: photos };
  const gamesById = new Map();
  if ((mode === 'pdf' || mode === 'visualizar') && sessoes.some((s) => s.session_type === 'match')) {
    const g = await stats.getGameStats({ workspaceIds, start: date, end: date, clubId: team.id });
    for (const m of g.matchesHistory || []) gamesById.set(m.session_id, m);
  }
  const weekNumber = micro.week_identifier ? Number(String(micro.week_identifier).split('-')[1]) || null : (F.isoWeek(date)?.week || null);
  const vm = B.buildDaySheet({ sessions: sessoes, team, weekNumber, gamesById, photos });
  if (mode === 'html') {
    if (!photos) return { html: null };
    // fotos junto dos blocos: a prévia precisa mostrar a ficha inteira
    const inteira = photos.posicao === 'blocos';
    return { html: renderSession(vm, { now: new Date(), onlyPhotos: !inteira }), count: photos.items.length };
  }
  if (mode === 'visualizar') return { html: renderSession(vm, { now: new Date() }) };
  const sufixo = sessoes.length === 1 && session.periodo ? `-${safeName(P.rotuloPeriodo(session.periodo))}` : '';
  return {
    html: renderSession(vm, { now: new Date() }),
    filename: `treino-${safeName(session.day_name || F.weekdayLong(date))}-${date}${sufixo}.pdf`,
  };
}

// Convocação (A4 paisagem): jogo salvo + jogadores do jogo. Mesma regra do
// editor para a formação: a salva se valer para a modalidade, senão a padrão;
// vaga fora da formação efetiva = titular sem vaga (fora do campo).
// Jogo salvo + escalação (convocação e relatório do jogo). Mesma permissão de abrir o jogo.
async function carregarJogo(body, user, assets) {
  const { workspaceIds } = scope(user);
  const sessionId = String(body.session_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new ReportError(400, 'session_id inválido');
  const r = await query(
    `SELECT s.id, s.date, s.session_type, s.opponent_name, s.match_duration, s.match_location, s.match_round, s.formation,
            s.match_kickoff, s.match_venue, s.match_meet_time,
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
  const callUp = B.buildCallUp({ session, team, players: players.rows, formation, competitionName: comp.rows[0]?.name || null });
  return { session, team, callUp, workspaceIds };
}

async function buildConvocacao(body, user, assets) {
  const { callUp: vm, session } = await carregarJogo(body, user, assets);
  // Tamanho da letra escolhido na hora de exportar: normal | grande | muito_grande
  vm.fonte = ['grande', 'muito_grande'].includes(body.tamanho_fonte) ? body.tamanho_fonte : 'normal';
  const date = F.toDateStr(session.date);
  const [y, m, d] = date.split('-');
  return {
    html: renderConvocacao(vm, { now: new Date() }),
    // mesmo nome do PDF antigo: Convocacao_<adversario>_<dd-mm-aaaa>.pdf
    filename: `Convocacao_${safeName(vm.opponent) || 'Adversario'}_${d}-${m}-${y}.pdf`,
    landscape: true,
  };
}

// Relatório de UM jogo (A4 retrato): placar, lances e atletas com minutos/gols/cartões.
async function buildJogo(body, user, assets) {
  const { session, team, callUp, workspaceIds } = await carregarJogo(body, user, assets);
  const date = F.toDateStr(session.date);
  const [game, ev] = await Promise.all([
    stats.getGameStats({ workspaceIds, start: date, end: date, clubId: team.id, sessionId: session.id }),
    query(
      `SELECT me.event_type, me.team, me.minute, me.goal_type, me.notes,
              a.name AS athlete_name, b.name AS secondary_athlete_name
         FROM match_events me
         LEFT JOIN athletes a ON a.id = me.player_id
         LEFT JOIN athletes b ON b.id = me.secondary_player_id
        WHERE me.session_id = $1 AND me.workspace_id = ANY($2)`,
      [session.id, workspaceIds],
    ),
  ]);
  const duration = session.match_duration || stats.DEFAULT_DURATION_BY_MODALITY[team.modality] || 90;
  const vm = B.buildGameSheet({ callUp, game, events: ev.rows, duration, goalTypeLabel: stats.goalTypeLabel });
  const [y, m, d] = date.split('-');
  return {
    html: renderJogo(vm, { now: new Date() }),
    filename: `Jogo_${safeName(vm.opponent) || 'Adversario'}_${d}-${m}-${y}.pdf`,
  };
}

// Análise do adversário: deck 16:9 (analiseDeck.js) no desenho do modelo do dono. Capa com os dados do
// jogo + um slide por seção PREENCHIDA. Mesmo deck vira PDF (sem vídeos) ou PowerPoint (com vídeos).
async function prepararAnalise(body, user, assets) {
  const { session, team, callUp, workspaceIds } = await carregarJogo(body, user, assets);
  const [r, m] = await Promise.all([
    query('SELECT data FROM opponent_analyses WHERE session_id = $1 AND workspace_id = ANY($2)', [session.id, workspaceIds]),
    query(`SELECT id, tipo, secao, titulo, file_path, mime_type FROM opponent_analysis_media
            WHERE session_id = $1 AND workspace_id = ANY($2) ORDER BY created_at`, [session.id, workspaceIds]),
  ]);
  const a = AA.normalizar(r.rows[0]?.data || {});
  const date = F.toDateStr(session.date);
  const quando = `${F.ddmmyyyy(date)}${session.match_kickoff ? `, ${session.match_kickoff}` : ''}`;
  const fatos = [
    a.capa.fase ? { l: 'Fase', v: a.capa.fase } : null,
    a.capa.ida ? { l: 'Jogo de ida', v: a.capa.ida } : null,
    { l: 'Data', v: quando },
    session.match_venue ? { l: 'Local', v: session.match_venue } : null,
  ].filter(Boolean);
  const imagens = {};
  if (team.logoUrl) imagens.nosso = team.logoUrl;
  const escudo = m.rows.find((x) => x.tipo === 'escudo');
  if (escudo) {
    const img = await loadLogo(escudo.file_path);
    if (img) { assets.set('img/escudo-adv', img); imagens.adversario = 'img/escudo-adv'; }
  }
  const videos = m.rows.filter((x) => x.tipo === 'video' && resolveUploadPath(x.file_path))
    .map((x) => ({ id: x.id, secao: x.secao, titulo: x.titulo, path: resolveUploadPath(x.file_path) }));
  const vm = {
    a,
    adversario: callUp.opponent || 'Adversário',
    nossoNome: team.name,
    // "Libertadores 2026 · Rodada 6 · Fora" (campeonato/rodada/mando do jogo)
    subtitulo: callUp.meta.join(' · '),
    fatos,
    capaRodape: [a.capa.tecnico ? `Técnico: ${a.capa.tecnico}` : null, a.capa.observacao || null].filter(Boolean).join(' · '),
    fontes: a.fontes,
    imagens,
    videos,
  };
  const [y, mm, d] = date.split('-');
  return { deck: montarDeck(vm), vm, base: `Analise_${safeName(callUp.opponent) || 'Adversario'}_${d}-${mm}-${y}` };
}

async function buildAnalise(body, user, assets) {
  const { deck, vm, base } = await prepararAnalise(body, user, assets);
  return {
    html: renderAnalise(deck, { titulo: `Análise · ${vm.adversario}`, imagens: vm.imagens }),
    filename: `${base}.pdf`,
    landscape: true,
  };
}

// PowerPoint da análise (com os vídeos embutidos). POST /api/reports/analise { session_id, formato: 'pptx' }
async function generateAnalisePptx(body, user) {
  const assets = new Map();
  const { deck, vm, base } = await prepararAnalise(body || {}, user, assets);
  const imagens = {};
  for (const [k, ref] of Object.entries(vm.imagens)) {
    const a = assets.get(ref);
    if (a) imagens[k] = `${a.contentType};base64,${a.body.toString('base64')}`;
  }
  const videos = {};
  for (const v of vm.videos) {
    if (fs.existsSync(v.path)) videos[v.id] = { path: v.path, extn: path.extname(v.path).slice(1).toLowerCase() || 'mp4' };
  }
  const buffer = await gerarPptx(deck, { titulo: `Análise de adversário · ${vm.adversario}`, autor: vm.nossoNome, imagens, videos });
  return { buffer, filename: `${base}.pptx`, slides: deck.slides.length };
}

// Plantel do clube: mesma consulta/escopo de GET /api/athletes?club_id (categoria do membro).
async function loadSquad(clubId, workspaceIds, allowedCategoryIds) {
  if (Array.isArray(allowedCategoryIds) && allowedCategoryIds.length === 0) return [];
  const params = [clubId, workspaceIds];
  let sql = 'SELECT id, name, position, jersey_number, "group" FROM athletes WHERE club_id = $1 AND workspace_id = ANY($2)';
  if (Array.isArray(allowedCategoryIds)) {
    params.push(allowedCategoryIds);
    sql += ` AND category_id = ANY($${params.length})`;
  }
  const r = await query(`${sql} ORDER BY name ASC`, params);
  return r.rows;
}

// Relatório do clube (temporada). Período padrão: ano corrente (01/01–31/12),
// como o botão da Início sempre mandou. Plantel só com athletes:view (sem ela,
// a página do plantel diz que não há permissão — o resto do relatório sai).
async function buildClube(body, user, assets) {
  const { workspaceIds, allowedCategoryIds } = scope(user);
  const y = new Date().getFullYear();
  const period = validPeriod({ start_date: `${y}-01-01`, end_date: `${y}-12-31`, ...body });
  const team = await loadTeam(body.club_id, workspaceIds, assets, body.primary_color);
  const q = { workspaceIds, start: period.start, end: period.end, clubId: team.id, allowedCategoryIds };
  const squadAllowed = typeof user.can !== 'function' || user.can('athletes:view');
  const [gameStats, trainingStats, athletes] = await Promise.all([
    stats.getGameStats(q),
    stats.getTrainingStats(q),
    squadAllowed ? loadSquad(team.id, workspaceIds, allowedCategoryIds) : Promise.resolve([]),
  ]);
  const vm = B.buildClubReport({
    gameStats, trainingStats, athletes, team, period, squadAllowed,
    defaultDuration: stats.DEFAULT_DURATION_BY_MODALITY[gameStats.modality || team.modality] || 90,
  });
  // mesmo nome do PDF antigo (jsPDF): Relatorio_<Clube>_<ano>.pdf
  const label = body.period_label || (B.isSeason(period) ? period.start.slice(0, 4) : `${period.start}_${period.end}`);
  return {
    html: renderClube(vm, { now: new Date() }),
    filename: `Relatorio_${safeName(team.name)}_${safeName(label) || 'periodo'}.pdf`,
  };
}

// Plantel por grupo de treino (ordem do PDF do web: Grupo 1, 2, 3, Transição, DM, Sem grupo;
// nomes A–Z dentro do grupo). Função pura (testada em tests/reports-plantel.test.js).
const GRUPOS_PLANTEL = [['1', 'Grupo 1'], ['2', 'Grupo 2'], ['3', 'Grupo 3'], ['Transição', 'Transição'], ['DM', 'DM'], [null, 'Sem grupo']];
function buildPlantel(athletes) {
  const conhecidos = new Set(GRUPOS_PLANTEL.map(([k]) => k).filter(Boolean));
  const groups = [];
  for (const [key, label] of GRUPOS_PLANTEL) {
    const players = (athletes || [])
      .filter((a) => (key === null ? !conhecidos.has(a.group == null ? null : String(a.group)) : String(a.group) === key))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
      .map((a) => ({
        id: a.id, name: a.name, pos: a.position || null, posColor: sectorInfo(positionSector(a.position)).color,
        jersey: a.jersey_number ?? null, foot: a.preferred_foot || null, height: a.height_cm || null,
        birthdate: a.birthdate || null, photo_url: a.photo_url || null, prevClub: a.previous_club || null,
      }));
    if (players.length) groups.push({ key, label, players });
  }
  return { groups, total: (athletes || []).length };
}

// PDF do plantel (web e app nativo). athletes:view,
// escopo de categoria do membro. Fotos reduzidas (miniatura) quando existem.
async function buildPlantelReport(body, user, assets) {
  const { workspaceIds, allowedCategoryIds } = scope(user);
  const team = await loadTeam(body.club_id, workspaceIds, assets, body.primary_color);
  let athletes = [];
  if (!(Array.isArray(allowedCategoryIds) && allowedCategoryIds.length === 0)) {
    const params = [team.id, workspaceIds];
    let sql = `SELECT id, name, position, jersey_number, "group", photo_url, birthdate, height_cm, preferred_foot, previous_club
                 FROM athletes WHERE club_id = $1 AND workspace_id = ANY($2)`;
    if (Array.isArray(allowedCategoryIds)) { params.push(allowedCategoryIds); sql += ` AND category_id = ANY($${params.length})`; }
    // Filtro da tela do web (opcional): categoria escolhida ou 'none' (sem categoria)
    if (body.category_id === 'none') sql += ' AND category_id IS NULL';
    else if (/^[0-9a-f-]{36}$/i.test(String(body.category_id || ''))) { params.push(body.category_id); sql += ` AND category_id = $${params.length}`; }
    athletes = (await query(`${sql} ORDER BY name ASC`, params)).rows;
  }
  const vm = buildPlantel(athletes);
  const comFoto = vm.groups.flatMap((g) => g.players).filter((p) => p.photo_url).map((p) => ({ id: p.id, file_path: p.photo_url }));
  if (comFoto.length) {
    const thumbs = await loadThumbs(comFoto);
    const porId = new Map(thumbs.map((t) => [t.id, t]));
    for (const g of vm.groups) {
      for (const p of g.players) {
        const t = porId.get(p.id);
        if (!t) continue;
        p.photoKey = `img/atleta-${p.id}`;
        assets.set(p.photoKey, { body: t.buffer, contentType: 'image/jpeg' });
      }
    }
  }
  const hoje = F.toDateStr(new Date());
  const [y, m, d] = hoje.split('-');
  return {
    html: renderPlantel({ ...vm, team, meta: `${team.modalityLabel} · ${d}/${m}/${y}`, right: `${d}/${m}/${y}` }, { now: new Date() }),
    filename: `Plantel_${safeName(team.name) || 'Clube'}_${y}-${m}-${d}.pdf`,
  };
}

const BUILDERS = { jogos: buildJogos, treino: buildTreino, semana: buildSemana, sessao: buildSessao, convocacao: buildConvocacao, jogo: buildJogo, analise: buildAnalise, clube: buildClube, plantel: buildPlantelReport };
// convocacao: a mesma permissão de abrir o jogo (GET /api/games/:id)
const PERMISSION = { jogos: 'stats:view', treino: 'stats:view', semana: 'training:view', sessao: 'training:view', convocacao: 'games:view', jogo: 'games:view', analise: 'games:view', clube: 'stats:view', plantel: 'athletes:view' };

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
  if (tipo !== 'treino' && tipo !== 'sessao' && tipo !== 'semana') return emptyList(false);
  const { list } = await BUILDERS[tipo](body || {}, user, new Map(), 'fotos');
  return list;
}

// Prévia: HTML só da(s) página(s) de fotos, com miniaturas e fontes embutidas,
// para o iframe do modal. Não usa o Chromium (a paginação roda no navegador
// de quem vê, com o MESMO template e o mesmo paginador do PDF).
async function previewReportPhotos(tipo, body, user) {
  if (tipo !== 'treino' && tipo !== 'sessao' && tipo !== 'semana') throw new ReportError(400, 'Este relatório não tem fotos');
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

module.exports = { buildPlantel, generateReport, generateAnalisePptx, listReportPhotos, previewReportPhotos, viewSessionSheet, ReportError, PERMISSION, BUILDERS };
