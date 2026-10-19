const express = require('express');
const { query, pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { validarEscalacao } = require('../utils/formacao');

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
              updated_at = NOW()
        WHERE id = $9 AND workspace_id = $10`,
      [opponent_name || null, match_duration || null,
       competition_id || null, match_round || null,
       (['home','away','neutral'].includes(match_location)) ? match_location : null,
       video_full_url || null, video_highlights_url || null, video_goals_url || null,
       req.params.sessionId, ownerWs, escalacao.formation]
    );

    await client.query('DELETE FROM match_players WHERE session_id = $1 AND workspace_id = $2', [req.params.sessionId, ownerWs]);
    if (players && players.length > 0) {
      for (const [i, player] of players.entries()) {
        const rawJersey = player.jersey_number;
        const jersey = Number.isFinite(+rawJersey) && +rawJersey > 0 ? +rawJersey : null;
        await client.query(
          `INSERT INTO match_players (session_id, athlete_id, status, minutes_played, jersey_number, workspace_id, slot)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [req.params.sessionId, player.athlete_id, player.status || 'starter', player.minutes_played || 0, jersey, ownerWs, escalacao.slots[i]]
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
