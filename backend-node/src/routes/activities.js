const express = require('express');
const { query, pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { removeStoredFile } = require('../utils/sessionFiles');

const router = express.Router();

router.use(authMiddleware);

// Resolve a workspace_id (owner) do bloco. Usado pra INSERT — deriva do clube
// associado à hierarquia block → session → microcycle.
async function workspaceForBlock(client, blockId) {
  const r = await client.query(
    `SELECT m.workspace_id
       FROM training_activity_blocks b
       JOIN training_sessions s ON s.id = b.session_id
       JOIN training_microcycles m ON m.id = s.microcycle_id
      WHERE b.id = $1`,
    [blockId]
  );
  return r.rows[0]?.workspace_id || null;
}

async function resolveContentId(client, data) {
  // Single content por atividade. Pode vir explícito do body (content_id) ou
  // herdado do title-template (activity_titles.content_id). Frontend legado
  // ainda envia selectedContents[] — pegamos só o primeiro nesse caso.
  if (data.content_id) return data.content_id;
  if (Array.isArray(data.selectedContents) && data.selectedContents.length > 0) {
    return data.selectedContents[0];
  }
  if (data.title_id) {
    const r = await client.query('SELECT content_id FROM activity_titles WHERE id = $1', [data.title_id]);
    return r.rows[0]?.content_id || null;
  }
  return null;
}

async function createActivity(client, data, workspaceId) {
  const { block_id, title_id, description, duration_minutes, groups, is_rest, selectedStages } = data;

  const activityResult = await client.query(
    `INSERT INTO training_activities (block_id, title_id, description, duration_minutes, groups, is_rest, workspace_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [block_id, title_id || null, description || null, duration_minutes || null, groups ? JSON.stringify(groups) : null, is_rest || false, workspaceId]
  );

  const activity = activityResult.rows[0];

  const contentId = await resolveContentId(client, data);
  if (contentId) {
    await client.query(
      'INSERT INTO training_activity_contents (activity_id, content_id) VALUES ($1, $2)',
      [activity.id, contentId]
    );
  }

  if (selectedStages && selectedStages.length > 0) {
    for (let i = 0; i < selectedStages.length; i++) {
      const stageId = selectedStages[i];
      const stageResult = await client.query('SELECT id, name FROM stages WHERE id = $1', [stageId]);
      const stageName = stageResult.rows.length > 0 ? stageResult.rows[0].name : stageId;
      const stageFk = stageResult.rows.length > 0 ? stageResult.rows[0].id : null;
      await client.query(
        'INSERT INTO training_activity_stages (activity_id, stage_id, stage_name, "order") VALUES ($1, $2, $3, $4)',
        [activity.id, stageFk, stageName, i + 1]
      );
    }
  }

  return activity;
}

async function updateActivity(client, activityId, data, workspaceId) {
  const { title_id, description, duration_minutes, groups, is_rest, selectedStages } = data;

  const activityResult = await client.query(
    `UPDATE training_activities SET title_id = $1, description = $2, duration_minutes = $3,
     groups = $4, is_rest = $5, updated_at = NOW()
     WHERE id = $6 AND workspace_id = $7
     RETURNING *`,
    [title_id || null, description || null, duration_minutes || null, groups ? JSON.stringify(groups) : null, is_rest || false, activityId, workspaceId]
  );

  if (activityResult.rows.length === 0) return null;

  // Replace content (single)
  await client.query('DELETE FROM training_activity_contents WHERE activity_id = $1', [activityId]);
  const contentId = await resolveContentId(client, data);
  if (contentId) {
    await client.query(
      'INSERT INTO training_activity_contents (activity_id, content_id) VALUES ($1, $2)',
      [activityId, contentId]
    );
  }

  // Replace stages
  await client.query('DELETE FROM training_activity_stages WHERE activity_id = $1', [activityId]);
  if (selectedStages && selectedStages.length > 0) {
    for (let i = 0; i < selectedStages.length; i++) {
      const stageId = selectedStages[i];
      const stageResult = await client.query('SELECT id, name FROM stages WHERE id = $1', [stageId]);
      const stageName = stageResult.rows.length > 0 ? stageResult.rows[0].name : stageId;
      const stageFk = stageResult.rows.length > 0 ? stageResult.rows[0].id : null;
      await client.query(
        'INSERT INTO training_activity_stages (activity_id, stage_id, stage_name, "order") VALUES ($1, $2, $3, $4)',
        [activityId, stageFk, stageName, i + 1]
      );
    }
  }

  return activityResult.rows[0];
}

// POST /api/activities
router.post('/', async (req, res) => {
  if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const wsId = await workspaceForBlock(client, req.body.block_id);
    if (!wsId || !req.user.workspaceIds?.includes(wsId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Sem permissão de escrita no bloco' });
    }
    const activity = await createActivity(client, req.body, wsId);
    await client.query('COMMIT');
    res.status(201).json(activity);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create activity error:', err);
    res.status(500).json({ error: 'Failed to create activity' });
  } finally {
    client.release();
  }
});

// PUT /api/activities/:id
router.put('/:id', async (req, res) => {
  if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tenantIds = req.user.workspaceIds || [];
    // updateActivity já filtra por tenant_id; modificar pra aceitar array
    const { title_id, description, duration_minutes, groups, is_rest, selectedStages } = req.body;
    const activityResult = await client.query(
      `UPDATE training_activities SET title_id = $1, description = $2, duration_minutes = $3,
       groups = $4, is_rest = $5, updated_at = NOW()
       WHERE id = $6 AND workspace_id = ANY($7)
       RETURNING *`,
      [title_id || null, description || null, duration_minutes || null, groups ? JSON.stringify(groups) : null, is_rest || false, req.params.id, tenantIds]
    );
    if (activityResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Activity not found' });
    }
    // contents/stages: mesmo replace
    await client.query('DELETE FROM training_activity_contents WHERE activity_id = $1', [req.params.id]);
    const contentId = await resolveContentId(client, req.body);
    if (contentId) {
      await client.query('INSERT INTO training_activity_contents (activity_id, content_id) VALUES ($1, $2)', [req.params.id, contentId]);
    }
    await client.query('DELETE FROM training_activity_stages WHERE activity_id = $1', [req.params.id]);
    if (selectedStages && selectedStages.length > 0) {
      for (let i = 0; i < selectedStages.length; i++) {
        const stageId = selectedStages[i];
        const stageResult = await client.query('SELECT id, name FROM stages WHERE id = $1', [stageId]);
        const stageName = stageResult.rows.length > 0 ? stageResult.rows[0].name : stageId;
        const stageFk = stageResult.rows.length > 0 ? stageResult.rows[0].id : null;
        await client.query(
          'INSERT INTO training_activity_stages (activity_id, stage_id, stage_name, "order") VALUES ($1, $2, $3, $4)',
          [req.params.id, stageFk, stageName, i + 1]
        );
      }
    }
    await client.query('COMMIT');
    res.json(activityResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update activity error:', err);
    res.status(500).json({ error: 'Failed to update activity' });
  } finally {
    client.release();
  }
});

// DELETE /api/activities/block/:blockId
router.delete('/block/:blockId', async (req, res) => {
  if (!req.user.can('training:delete')) return res.status(403).json({ error: 'Sem permissão pra apagar treinos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tenantIds = req.user.workspaceIds || [];

    const activitiesResult = await client.query(
      'SELECT id FROM training_activities WHERE block_id = $1 AND workspace_id = ANY($2)',
      [req.params.blockId, tenantIds]
    );

    for (const activity of activitiesResult.rows) {
      await client.query('DELETE FROM training_activity_contents WHERE activity_id = $1', [activity.id]);
      await client.query('DELETE FROM training_activity_stages WHERE activity_id = $1', [activity.id]);
    }

    // Anexos da atividade: o registro sai por FK CASCADE; o arquivo do disco, aqui.
    const filesResult = await client.query(
      'SELECT file_path FROM training_activity_files WHERE activity_id = ANY($1)',
      [activitiesResult.rows.map((a) => a.id)]
    );

    await client.query(
      'DELETE FROM training_activities WHERE block_id = $1 AND workspace_id = ANY($2)',
      [req.params.blockId, tenantIds]
    );

    await client.query('COMMIT');
    for (const f of filesResult.rows) removeStoredFile(f.file_path);
    res.json({ message: 'Activities deleted successfully', files_removed: filesResult.rows.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete block activities error:', err);
    res.status(500).json({ error: 'Failed to delete activities' });
  } finally {
    client.release();
  }
});

// POST /api/activities/upsert
router.post('/upsert', async (req, res) => {
  if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { block_id } = req.body;
    if (!block_id) {
      return res.status(400).json({ error: 'block_id is required' });
    }

    const wsId = await workspaceForBlock(client, block_id);
    if (!wsId || !req.user.workspaceIds?.includes(wsId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Sem permissão de escrita no bloco' });
    }

    const existing = await client.query(
      'SELECT id FROM training_activities WHERE block_id = $1 AND workspace_id = $2',
      [block_id, wsId]
    );

    let activity;
    if (existing.rows.length > 0) {
      activity = await updateActivity(client, existing.rows[0].id, req.body, wsId);
    } else {
      activity = await createActivity(client, req.body, wsId);
    }

    await client.query('COMMIT');
    res.json(activity);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Upsert activity error:', err);
    res.status(500).json({ error: 'Failed to upsert activity' });
  } finally {
    client.release();
  }
});

module.exports = router;
