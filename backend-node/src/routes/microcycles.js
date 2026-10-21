const express = require('express');
const { query, pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

const BLOCK_NAMES = ['Aquecimento', 'Preparatório', 'Atividade 1', 'Atividade 2', 'Atividade 3', 'Complementos'];
const DAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function getWeekDates(weekIdentifier) {
  const parts = weekIdentifier.includes('-W')
    ? weekIdentifier.split('-W')
    : weekIdentifier.split('-');
  const [year, week] = parts.map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { startDate: monday, endDate: sunday };
}

async function getFullMicrocycle(microcycleId, workspaceIds, allowedCategoryIds = null) {
  const wsIds = Array.isArray(workspaceIds) ? workspaceIds : [workspaceIds];
  const microcycleResult = await query(
    'SELECT * FROM training_microcycles WHERE id = $1 AND workspace_id = ANY($2)',
    [microcycleId, wsIds]
  );
  if (microcycleResult.rows.length === 0) return null;
  if (Array.isArray(allowedCategoryIds)) {
    const cat = microcycleResult.rows[0].category_id;
    if (cat && !allowedCategoryIds.includes(cat)) return null;
  }

  const microcycle = microcycleResult.rows[0];

  const sessionsResult = await query(
    `SELECT * FROM training_sessions WHERE microcycle_id = $1 ORDER BY date ASC`,
    [microcycleId]
  );

  const sessions = [];
  for (const session of sessionsResult.rows) {
    const blocksResult = await query(
      `SELECT * FROM training_activity_blocks WHERE session_id = $1 ORDER BY "order" ASC`,
      [session.id]
    );

    const blocks = [];
    for (const block of blocksResult.rows) {
      const activitiesResult = await query(
        `SELECT a.*, t.title as title_name, t.description as title_description,
                (SELECT COUNT(*)::int FROM training_activity_files f WHERE f.activity_id = a.id) AS files_count
         FROM training_activities a
         LEFT JOIN activity_titles t ON a.title_id = t.id
         WHERE a.block_id = $1
         ORDER BY a.created_at ASC`,
        [block.id]
      );

      const activities = [];
      for (const activity of activitiesResult.rows) {
        const contentsResult = await query(
          `SELECT c.id, c.name, c.abbreviation, c.dimension, tac.content_id
           FROM training_activity_contents tac
           LEFT JOIN contents c ON tac.content_id = c.id
           WHERE tac.activity_id = $1`,
          [activity.id]
        );

        const stagesResult = await query(
          `SELECT * FROM training_activity_stages WHERE activity_id = $1 ORDER BY "order" ASC`,
          [activity.id]
        );

        activity.contents = contentsResult.rows;
        activity.stages = stagesResult.rows;
        if (activity.title_name) {
          activity.title = { title: activity.title_name, description: activity.title_description };
        }
        activities.push(activity);
      }

      block.activity = activities.length > 0 ? activities[0] : null;
      blocks.push(block);
    }

    session.blocks = blocks;
    sessions.push(session);
  }

  microcycle.sessions = sessions;
  return microcycle;
}

// GET /api/microcycles?week=YYYY-WW&club_id=X[&category_id=Y]
router.get('/', async (req, res) => {
  try {
    if (!req.user.can('training:view')) return res.status(403).json({ error: 'Sem permissão' });
    const { week, club_id, category_id } = req.query;
    if (!week || !club_id) {
      return res.status(400).json({ error: 'week and club_id are required' });
    }

    const wsId = req.user.readableWorkspaceForClub(club_id);
    if (!wsId) return res.status(403).json({ error: 'Sem acesso a esse clube' });

    let sql = 'SELECT * FROM training_microcycles WHERE workspace_id = $1 AND week_identifier = $2 AND club_id = $3';
    const params = [wsId, week, club_id];
    let idx = 4;

    if (category_id) {
      if (!req.user.assertCanAccessCategory(category_id)) {
        return res.status(403).json({ error: 'Sem acesso a essa categoria' });
      }
      sql += ` AND category_id = $${idx++}`;
      params.push(category_id);
    } else if (Array.isArray(req.user.allowedCategoryIds)) {
      if (req.user.allowedCategoryIds.length === 0) return res.json(null);
      sql += ` AND (category_id IS NULL OR category_id = ANY($${idx++}))`;
      params.push(req.user.allowedCategoryIds);
    }

    const microcycleResult = await query(sql, params);
    if (microcycleResult.rows.length === 0) return res.json(null);

    const microcycle = await getFullMicrocycle(microcycleResult.rows[0].id, req.user.workspaceIds || [], req.user.allowedCategoryIds);
    res.json(microcycle);
  } catch (err) {
    console.error('Get microcycle error:', err);
    res.status(500).json({ error: 'Failed to get microcycle' });
  }
});

// POST /api/microcycles/ensure
router.post('/ensure', async (req, res) => {
  // Validações ANTES de pegar conexão do pool: antes havia um release() aqui
  // e outro no finally → "Release called on client which has already been released".
  if (!req.user.can('training:edit')) {
    return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
  }
  const { week, club_id, category_id } = req.body;
  if (!week || !club_id) {
    return res.status(400).json({ error: 'week and club_id are required' });
  }
  const wsId = req.user.writableWorkspaceForClub(club_id);
  if (!wsId) return res.status(403).json({ error: 'Sem permissão de escrita nesse clube' });
  if (category_id && !req.user.assertCanAccessCategory(category_id)) {
    return res.status(403).json({ error: 'Sem acesso a essa categoria' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let microcycleResult = await client.query(
      'SELECT * FROM training_microcycles WHERE workspace_id = $1 AND week_identifier = $2 AND club_id = $3',
      [wsId, week, club_id]
    );

    let microcycleId;
    if (microcycleResult.rows.length === 0) {
      const { startDate, endDate } = getWeekDates(week);
      const createResult = await client.query(
        `INSERT INTO training_microcycles (week_identifier, start_date, end_date, club_id, workspace_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [week, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0], club_id, wsId]
      );
      microcycleId = createResult.rows[0].id;
    } else {
      microcycleId = microcycleResult.rows[0].id;
    }

    const existingSessions = await client.query(
      'SELECT * FROM training_sessions WHERE microcycle_id = $1',
      [microcycleId]
    );

    const existingDates = new Set(existingSessions.rows.map(s => s.date?.toISOString?.()?.split('T')[0] || s.date));
    const { startDate } = getWeekDates(week);

    for (let i = 0; i < 7; i++) {
      const sessionDate = new Date(startDate);
      sessionDate.setUTCDate(startDate.getUTCDate() + i);
      const dateStr = sessionDate.toISOString().split('T')[0];

      if (!existingDates.has(dateStr)) {
        await client.query(
          `INSERT INTO training_sessions (microcycle_id, date, day_name, day_of_week, workspace_id, club_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (workspace_id, date, club_id) DO NOTHING`,
          [microcycleId, dateStr, DAY_NAMES[i], i + 1, wsId, club_id]
        );
      }
    }

    const allSessions = await client.query(
      'SELECT * FROM training_sessions WHERE microcycle_id = $1 ORDER BY date ASC',
      [microcycleId]
    );

    for (const session of allSessions.rows) {
      const existingBlocks = await client.query(
        'SELECT * FROM training_activity_blocks WHERE session_id = $1',
        [session.id]
      );

      const existingBlockOrders = existingBlocks.rows.map(b => b.order);

      for (let j = 0; j < 6; j++) {
        if (!existingBlockOrders.includes(j + 1)) {
          await client.query(
            `INSERT INTO training_activity_blocks (session_id, name, "order")
             VALUES ($1, $2, $3)`,
            [session.id, BLOCK_NAMES[j], j + 1]
          );
        }
      }
    }

    await client.query('COMMIT');

    const microcycle = await getFullMicrocycle(microcycleId, req.user.workspaceIds || [], req.user.allowedCategoryIds);
    res.json(microcycle);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Ensure microcycle error:', err);
    res.status(500).json({ error: 'Failed to ensure microcycle' });
  } finally {
    client.release();
  }
});

module.exports = router;
