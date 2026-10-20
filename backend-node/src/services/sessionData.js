// Sessão (dia) com blocos → atividade (+ conteúdos e submomentos), no formato
// da tela Programação. Compartilhado por GET /api/sessions/:id e pela ficha
// de sessão em PDF (POST /api/reports/sessao).
const { query } = require('../config/database');

// Retorna null se a sessão não existe na(s) workspace(s) informada(s).
async function getSessionDetail(sessionId, workspaceIds) {
  const sessionResult = await query(
    'SELECT * FROM training_sessions WHERE id = $1 AND workspace_id = ANY($2)',
    [sessionId, workspaceIds || []]
  );

  if (sessionResult.rows.length === 0) return null;

  const session = sessionResult.rows[0];

  const blocksResult = await query(
    'SELECT * FROM training_activity_blocks WHERE session_id = $1 ORDER BY "order" ASC',
    [session.id]
  );

  const blocks = [];
  for (const block of blocksResult.rows) {
    const activitiesResult = await query(
      `SELECT a.*, t.title as title_name, t.description as title_description
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
        'SELECT * FROM training_activity_stages WHERE activity_id = $1 ORDER BY "order" ASC',
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
  return session;
}

module.exports = { getSessionDetail };
