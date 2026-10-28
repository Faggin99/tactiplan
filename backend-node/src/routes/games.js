const express = require('express');
const { query, pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { validarEscalacao } = require('../utils/formacao');
const { computeMinutagem, checarSubstituicoes } = require('../utils/minutagem');

// Modalidades em que a minutagem sai das substituições (futsal: troca livre, não rastreia).
const RASTREIA_MINUTOS = new Set(['football_11', 'football_7']);

const router = express.Router();

router.use(authMiddleware);

// Resolve a workspace_id (owner) da sessão + modalidade do clube e formação atual.
async function contextoDaSessao(client, sessionId) {
  const r = await client.query(
    `SELECT m.workspace_id, c.modality, s.formation
       FROM training_sessions s
       JOIN training_microcycles m ON m.id = s.microcycle_id
       LEFT JOIN clubs c ON c.id = m.club_id
      WHERE s.id = $1`,
    [sessionId]
  );
  return r.rows[0] || null;
}

// ---------- Análise do adversário (migration 062) ----------
const analise = require('../services/analiseAdversario');
const fs = require('fs');
const { uploadAnaliseMidia } = require('../middleware/upload');
const { removeStoredFile } = require('../utils/sessionFiles');
const MAX_VIDEOS_ANALISE = 12;
const MAX_LINKS_ANALISE = 20;

async function midiasDaAnalise(sessionId) {
  const r = await query(
    `SELECT id, tipo, secao, titulo, file_path AS url, mime_type, size_bytes, created_at
       FROM opponent_analysis_media WHERE session_id = $1 ORDER BY tipo, created_at`, [sessionId]);
  return r.rows;
}

// Jogo da workspace do usuário (para a análise): { id, workspace_id } ou null
async function jogoDoUsuario(sessionId, workspaceIds) {
  if (!/^[0-9a-f-]{36}$/i.test(String(sessionId || ''))) return null;
  const r = await query(
    `SELECT id, workspace_id FROM training_sessions WHERE id = $1 AND workspace_id = ANY($2) AND session_type = 'match'`,
    [sessionId, workspaceIds],
  );
  return r.rows[0] || null;
}

// GET /api/games/:sessionId/analise → { data, updated_at } (sem análise: o formato vazio)
router.get('/:sessionId/analise', async (req, res) => {
  try {
    if (!req.user.can('games:view')) return res.status(403).json({ error: 'Sem permissão' });
    const jogo = await jogoDoUsuario(req.params.sessionId, req.user.workspaceIds || []);
    if (!jogo) return res.status(404).json({ error: 'Jogo não encontrado' });
    const r = await query('SELECT data, updated_at FROM opponent_analyses WHERE session_id = $1', [jogo.id]);
    res.json({ data: analise.normalizar(r.rows[0]?.data || {}), updated_at: r.rows[0]?.updated_at || null,
      secoes: analise.secoesPreenchidas(analise.normalizar(r.rows[0]?.data || {})), midias: await midiasDaAnalise(jogo.id) });
  } catch (err) {
    console.error('Get analise error:', err);
    res.status(500).json({ error: 'Falha ao carregar a análise' });
  }
});

// PUT /api/games/:sessionId/analise { data } — grava a análise inteira (normalizada)
router.put('/:sessionId/analise', async (req, res) => {
  try {
    if (!req.user.can('games:edit')) return res.status(403).json({ error: 'Sem permissão pra editar jogos' });
    const jogo = await jogoDoUsuario(req.params.sessionId, req.user.workspaceIds || []);
    if (!jogo) return res.status(404).json({ error: 'Jogo não encontrado' });
    if (JSON.stringify(req.body?.data || {}).length > 200000) return res.status(413).json({ error: 'Análise grande demais' });
    const data = analise.normalizar(req.body?.data);
    const r = await query(
      `INSERT INTO opponent_analyses (session_id, workspace_id, data, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (session_id) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING updated_at`,
      [jogo.id, jogo.workspace_id, JSON.stringify(data), req.user.id || null],
    );
    res.json({ data, updated_at: r.rows[0].updated_at, secoes: analise.secoesPreenchidas(data) });
  } catch (err) {
    console.error('Put analise error:', err);
    res.status(500).json({ error: 'Falha ao salvar a análise' });
  }
});

// POST /api/games/:sessionId/analise/midia (multipart: file, tipo 'escudo'|'video', secao?, titulo?)
// Escudo: 1 por análise (o novo substitui o anterior). Vídeo: até 12 por análise, numa seção.
router.post('/:sessionId/analise/midia', (req, res) => {
  if (!req.user.can('games:edit')) return res.status(403).json({ error: 'Sem permissão pra editar jogos' });
  uploadAnaliseMidia(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo maior que 50 MB. Para vídeo grande, use um link (YouTube, Drive…).' : err.message });
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const recusar = (status, error) => {
      try { fs.unlinkSync(req.file.path); } catch { /* já não existe */ }
      return res.status(status).json({ error });
    };
    try {
      const jogo = await jogoDoUsuario(req.params.sessionId, req.user.workspaceIds || []);
      if (!jogo) return recusar(404, 'Jogo não encontrado');
      if (!req.user.canWriteWorkspace(jogo.workspace_id)) return recusar(403, 'Sem permissão de escrita');
      const tipo = req.body.tipo === 'escudo' ? 'escudo' : 'video';
      const ehImagem = req.file.mimetype.startsWith('image/');
      if (tipo === 'escudo' && !ehImagem) return recusar(400, 'O escudo precisa ser uma imagem (JPG, PNG ou WEBP).');
      if (tipo === 'video' && ehImagem) return recusar(400, 'Envie um vídeo (MP4, MOV ou WEBM).');
      const secao = tipo === 'video' ? String(req.body.secao || '') : null;
      if (tipo === 'video' && !analise.SECOES.includes(secao)) return recusar(400, 'Seção do vídeo inválida.');
      const titulo = String(req.body.titulo || '').replace(/\s+/g, ' ').trim().slice(0, 120) || null;
      const url = `/uploads/analise/${req.file.filename}`;
      if (tipo === 'video') {
        const n = await query(`SELECT count(*)::int AS n FROM opponent_analysis_media WHERE session_id = $1 AND tipo = 'video'`, [jogo.id]);
        if (n.rows[0].n >= MAX_VIDEOS_ANALISE) return recusar(400, `Limite de ${MAX_VIDEOS_ANALISE} vídeos por análise.`);
      } else {
        const antigo = await query(`DELETE FROM opponent_analysis_media WHERE session_id = $1 AND tipo = 'escudo' RETURNING file_path`, [jogo.id]);
        for (const a of antigo.rows) removeStoredFile(a.file_path);
      }
      await query(
        `INSERT INTO opponent_analysis_media (session_id, workspace_id, tipo, secao, titulo, file_path, mime_type, size_bytes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [jogo.id, jogo.workspace_id, tipo, secao, titulo, url, req.file.mimetype, req.file.size, req.user.id || null],
      );
      res.status(201).json({ midias: await midiasDaAnalise(jogo.id) });
    } catch (e) {
      console.error('Upload midia analise error:', e);
      recusar(500, 'Falha ao enviar o arquivo');
    }
  });
});

// POST /api/games/:sessionId/analise/link { secao, titulo?, url } — vídeo grande vai por LINK (YouTube, Drive…):
// sai clicável no PDF e no PowerPoint (não é embutido). Até 20 por análise.
router.post('/:sessionId/analise/link', async (req, res) => {
  try {
    if (!req.user.can('games:edit')) return res.status(403).json({ error: 'Sem permissão pra editar jogos' });
    const jogo = await jogoDoUsuario(req.params.sessionId, req.user.workspaceIds || []);
    if (!jogo) return res.status(404).json({ error: 'Jogo não encontrado' });
    if (!req.user.canWriteWorkspace(jogo.workspace_id)) return res.status(403).json({ error: 'Sem permissão de escrita' });
    const b = req.body || {};
    const secao = String(b.secao || '');
    if (!analise.SECOES.includes(secao)) return res.status(400).json({ error: 'Seção do vídeo inválida.' });
    const url = String(b.url || '').trim();
    let ok = false;
    try { ok = /^https?:$/.test(new URL(url).protocol); } catch { ok = false; }
    if (!ok || url.length > 500) return res.status(400).json({ error: 'Link inválido. Cole o endereço completo (https://…).' });
    const titulo = String(b.titulo || '').replace(/\s+/g, ' ').trim().slice(0, 120) || null;
    const n = await query(`SELECT count(*)::int AS n FROM opponent_analysis_media WHERE session_id = $1 AND tipo = 'link'`, [jogo.id]);
    if (n.rows[0].n >= MAX_LINKS_ANALISE) return res.status(400).json({ error: `Limite de ${MAX_LINKS_ANALISE} links por análise.` });
    await query(
      `INSERT INTO opponent_analysis_media (session_id, workspace_id, tipo, secao, titulo, file_path, mime_type, created_by)
       VALUES ($1, $2, 'link', $3, $4, $5, 'text/uri-list', $6)`,
      [jogo.id, jogo.workspace_id, secao, titulo, url, req.user.id || null],
    );
    res.status(201).json({ midias: await midiasDaAnalise(jogo.id) });
  } catch (e) {
    console.error('Link analise error:', e);
    res.status(500).json({ error: 'Falha ao salvar o link' });
  }
});

// DELETE /api/games/:sessionId/analise/midia/:midiaId
router.delete('/:sessionId/analise/midia/:midiaId', async (req, res) => {
  try {
    if (!req.user.can('games:edit')) return res.status(403).json({ error: 'Sem permissão pra editar jogos' });
    const jogo = await jogoDoUsuario(req.params.sessionId, req.user.workspaceIds || []);
    if (!jogo) return res.status(404).json({ error: 'Jogo não encontrado' });
    if (!/^[0-9a-f-]{36}$/i.test(req.params.midiaId)) return res.status(400).json({ error: 'Mídia inválida' });
    const r = await query('DELETE FROM opponent_analysis_media WHERE id = $1 AND session_id = $2 RETURNING tipo, file_path', [req.params.midiaId, jogo.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Mídia não encontrada' });
    if (r.rows[0].tipo !== 'link') removeStoredFile(r.rows[0].file_path); // link: a URL é de fora
    res.json({ midias: await midiasDaAnalise(jogo.id) });
  } catch (e) {
    console.error('Delete midia analise error:', e);
    res.status(500).json({ error: 'Falha ao apagar' });
  }
});

// GET /api/games/:sessionId
router.get('/:sessionId', async (req, res) => {
  try {
    if (!req.user.can('games:view')) return res.status(403).json({ error: 'Sem permissão' });
    const workspaceIds = req.user.workspaceIds || [];
    const sessionResult = await query(
      'SELECT * FROM training_sessions WHERE id = $1 AND workspace_id = ANY($2)',
      [req.params.sessionId, workspaceIds]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const playersResult = await query(
      `SELECT mp.*,
              json_build_object('id', a.id, 'name', a.name, 'jersey_number', a.jersey_number, 'position', a.position, 'photo_url', a.photo_url) as athlete
       FROM match_players mp
       LEFT JOIN athletes a ON mp.athlete_id = a.id
       WHERE mp.session_id = $1 AND mp.workspace_id = ANY($2)
       ORDER BY mp.status ASC, mp.slot ASC NULLS LAST`,
      [req.params.sessionId, workspaceIds]
    );

    const eventsResult = await query(
      `SELECT me.*,
              CASE WHEN a.id IS NOT NULL
                   THEN json_build_object('id', a.id, 'name', a.name, 'jersey_number', a.jersey_number)
                   ELSE NULL END                          AS player,
              CASE WHEN b.id IS NOT NULL
                   THEN json_build_object('id', b.id, 'name', b.name, 'jersey_number', b.jersey_number)
                   ELSE NULL END                          AS secondary_player
       FROM match_events me
       LEFT JOIN athletes a ON me.player_id           = a.id
       LEFT JOIN athletes b ON me.secondary_player_id = b.id
       WHERE me.session_id = $1 AND me.workspace_id = ANY($2)
       ORDER BY me.minute ASC`,
      [req.params.sessionId, workspaceIds]
    );

    res.json({
      formation: sessionResult.rows[0].formation || null,
      players: playersResult.rows,
      events: eventsResult.rows
    });
  } catch (err) {
    console.error('Get game error:', err);
    res.status(500).json({ error: 'Failed to get game data' });
  }
});

// "16:00" / "9:30" → "16:00" / "09:30"; outro formato ou vazio → null
function horaOuNull(v) {
  const m = String(v ?? '').trim().match(/^(\d{1,2})[:h](\d{2})$/i);
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}
function textoCurto(v, max) {
  const t = String(v ?? '').trim();
  return t ? t.slice(0, max) : null;
}

// POST /api/games/:sessionId
router.post('/:sessionId', async (req, res) => {
  if (!req.user.can('games:edit')) return res.status(403).json({ error: 'Sem permissão pra editar jogos' });
  const client = await pool.connect();
  try {
    const {
      opponent_name, match_duration, players, events,
      competition_id, match_round, match_location,
      video_full_url, video_highlights_url, video_goals_url,
      formation,
    } = req.body;
    const workspaceIds = req.user.workspaceIds || [];

    const sessionCheck = await client.query(
      'SELECT id FROM training_sessions WHERE id = $1 AND workspace_id = ANY($2)',
      [req.params.sessionId, workspaceIds]
    );
    if (sessionCheck.rows.length === 0) return res.status(404).json({ error: 'Session not found' });

    const ctx = await contextoDaSessao(client, req.params.sessionId);
    const ownerWs = ctx?.workspace_id || null;
    if (!ownerWs || !workspaceIds.includes(ownerWs)) {
      return res.status(403).json({ error: 'Sem permissão de escrita na sessão' });
    }

    // Formação + vagas: valida antes de abrir a transação.
    const escalacao = validarEscalacao({
      modality: ctx.modality,
      formation,
      storedFormation: ctx.formation,
      players: players || [],
    });
    if (!escalacao.ok) return res.status(400).json({ error: escalacao.error });

    // Substituições: quem entra precisa ser reserva relacionado e entrar uma vez só.
    // Só recusa (400) quando o pedido vem do formulário NOVO (subs_check: true). Cliente
    // antigo / eventos legados ou incompletos: registra aviso e salva (a minutagem ignora
    // a substituição incompleta).
    const subsOk = checarSubstituicoes({ players: players || [], events: events || [] });
    if (!subsOk.ok) {
      if (req.body.subs_check === true) return res.status(400).json({ error: subsOk.error, code: 'INVALID_SUBSTITUTION' });
      console.warn(`[games] substituição inconsistente salva (cliente antigo) sessão ${req.params.sessionId}: ${subsOk.error}`);
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE training_sessions
          SET opponent_name = $1,
              match_duration = $2,
              competition_id = $3,
              match_round = $4,
              match_location = $5,
              video_full_url = $6,
              video_highlights_url = $7,
              video_goals_url = $8,
              formation = $11,
              -- horário/local/apresentação (061): só mexe quando o cliente manda (app antigo não apaga)
              match_kickoff   = CASE WHEN $12 THEN $13 ELSE match_kickoff END,
              match_venue     = CASE WHEN $14 THEN $15 ELSE match_venue END,
              match_meet_time = CASE WHEN $16 THEN $17 ELSE match_meet_time END,
              updated_at = NOW()
        WHERE id = $9 AND workspace_id = $10`,
      [opponent_name || null, match_duration || null,
       competition_id || null, match_round || null,
       (['home','away','neutral'].includes(match_location)) ? match_location : null,
       video_full_url || null, video_highlights_url || null, video_goals_url || null,
       req.params.sessionId, ownerWs, escalacao.formation,
       'match_kickoff' in req.body, horaOuNull(req.body.match_kickoff),
       'match_venue' in req.body, textoCurto(req.body.match_venue, 120),
       'match_meet_time' in req.body, horaOuNull(req.body.match_meet_time)]
    );

    // Minutagem: o servidor recalcula a partir das substituições/expulsão (a mesma
    // regra do modal). Ajuste manual explícito (minutes_manual) é mantido.
    const rastreia = RASTREIA_MINUTOS.has(ctx.modality || 'football_11');
    const minutagem = rastreia
      ? computeMinutagem({ players: players || [], events: events || [], duration: match_duration })
      : {};

    await client.query('DELETE FROM match_players WHERE session_id = $1 AND workspace_id = $2', [req.params.sessionId, ownerWs]);
    if (players && players.length > 0) {
      for (const [i, player] of players.entries()) {
        const rawJersey = player.jersey_number;
        const jersey = Number.isFinite(+rawJersey) && +rawJersey > 0 ? +rawJersey : null;
        const manual = rastreia && !!player.minutes_manual;
        const minutes = rastreia
          ? (minutagem[player.athlete_id]?.minutes ?? 0)
          : (Math.max(0, parseInt(player.minutes_played, 10) || 0));
        await client.query(
          `INSERT INTO match_players (session_id, athlete_id, status, minutes_played, jersey_number, workspace_id, slot, minutes_manual)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [req.params.sessionId, player.athlete_id, player.status || 'starter', minutes, jersey, ownerWs, escalacao.slots[i], manual]
        );
      }
    }

    await client.query('DELETE FROM match_events WHERE session_id = $1 AND workspace_id = $2', [req.params.sessionId, ownerWs]);
    if (events && events.length > 0) {
      for (const event of events) {
        await client.query(
          `INSERT INTO match_events
             (session_id, event_type, team, goal_type, minute, player_id, secondary_player_id, notes, workspace_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            req.params.sessionId,
            event.event_type,
            event.team || null,
            event.goal_type || null,
            event.minute || null,
            event.player_id || null,
            event.secondary_player_id || null,
            event.notes || null,
            ownerWs,
          ]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Game data saved successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Save game error:', err);
    res.status(500).json({ error: 'Failed to save game data' });
  } finally {
    client.release();
  }
});

module.exports = router;
module.exports.horaOuNull = horaOuNull;
