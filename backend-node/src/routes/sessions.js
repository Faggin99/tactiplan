const express = require('express');
const { query } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { parseDistanciaKm } = require('../utils/distancia');
const { getSessionDetail } = require('../services/sessionData');

const router = express.Router();

router.use(authMiddleware);

// GET /api/sessions/:id
router.get('/:id', async (req, res) => {
  try {
    if (!req.user.can('training:view')) return res.status(403).json({ error: 'Sem permissão' });
    const session = await getSessionDetail(req.params.id, req.user.workspaceIds || []);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    console.error('Get session error:', err);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// PUT /api/sessions/:id/type
router.put('/:id/type', async (req, res) => {
  try {
    if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
    const { session_type, opponent_name } = req.body;

    const result = await query(
      `UPDATE training_sessions SET session_type = $1, opponent_name = $2, updated_at = NOW()
       WHERE id = $3 AND workspace_id = ANY($4)
       RETURNING *`,
      [session_type || null, opponent_name || null, req.params.id, req.user.workspaceIds || []]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update session type error:', err);
    res.status(500).json({ error: 'Failed to update session type' });
  }
});

// PUT /api/sessions/:id/distance — distância média por jogador no dia (km)
// Body: { avg_distance_km: number | string ("5,2") | null }
router.put('/:id/distance', async (req, res) => {
  try {
    if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
    const parsed = parseDistanciaKm(req.body?.avg_distance_km);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    const found = await query(
      `SELECT s.id, s.workspace_id, m.category_id
       FROM training_sessions s
       LEFT JOIN training_microcycles m ON m.id = s.microcycle_id
       WHERE s.id = $1 AND s.workspace_id = ANY($2)`,
      [req.params.id, req.user.workspaceIds || []]
    );
    if (found.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    const sess = found.rows[0];
    if (!req.user.canWriteWorkspace(sess.workspace_id)) {
      return res.status(403).json({ error: 'Sem permissão de escrita nesse clube' });
    }
    if (sess.category_id && !req.user.assertCanAccessCategory(sess.category_id)) {
      return res.status(403).json({ error: 'Sem acesso a essa categoria' });
    }

    const result = await query(
      `UPDATE training_sessions SET avg_distance_km = $1, updated_at = NOW()
       WHERE id = $2 AND workspace_id = ANY($3)
       RETURNING id, avg_distance_km`,
      [parsed.value, sess.id, req.user.workspaceIds || []]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    const row = result.rows[0];
    res.json({ id: row.id, avg_distance_km: row.avg_distance_km === null ? null : Number(row.avg_distance_km) });
  } catch (err) {
    console.error('Update session distance error:', err);
    res.status(500).json({ error: 'Failed to update session distance' });
  }
});

module.exports = router;
