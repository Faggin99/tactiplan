const express = require('express');
const { query } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { proximasPorDia, ordemSql } = require('../services/periodos');

const router = express.Router();
router.use(authMiddleware);

// GET /api/home/dashboard?clubId=... — agrega indicadores pra HomePage
router.get('/home/dashboard', async (req, res) => {
  try {
    const workspaceIds = req.user.workspaceIds || [];
    const clubId = req.query.clubId || null;
    if (workspaceIds.length === 0) {
      return res.json({ nextSessions: [], nextMatch: null, activeInjuries: [], announcements: [], summary: { totalAthletes: 0, activeInjuries: 0 } });
    }

    const nextSessionSql = `
      SELECT s.id, s.date, s.day_name, s.session_type, s.opponent_name, s.periodo, s.workspace_id, m.club_id
        FROM training_sessions s
        JOIN training_microcycles m ON s.microcycle_id = m.id
       WHERE s.workspace_id = ANY($1)
         AND s.date >= CURRENT_DATE
         ${clubId ? 'AND m.club_id = $2' : ''}
         AND (s.session_type != 'rest' OR s.session_type IS NULL)
       ORDER BY s.date ASC, s.day_of_week ASC, ${ordemSql('s')}
       LIMIT 15
    `;
    const nextSessionParams = clubId ? [workspaceIds, clubId] : [workspaceIds];
    const nextSessionsResult = await query(nextSessionSql, nextSessionParams);

    const nextMatchSql = `
      SELECT s.id, s.date, s.day_name, s.opponent_name, m.club_id
        FROM training_sessions s
        JOIN training_microcycles m ON s.microcycle_id = m.id
       WHERE s.workspace_id = ANY($1)
         AND s.date >= CURRENT_DATE
         AND s.session_type = 'match'
         ${clubId ? 'AND m.club_id = $2' : ''}
       ORDER BY s.date ASC
       LIMIT 1
    `;
    const nextMatchResult = await query(nextMatchSql, nextSessionParams);

    const activeInjuriesSql = `
      SELECT i.id, i.athlete_id, i.injury_type, i.body_part, i.severity, i.started_at, i.expected_return,
             a.name AS athlete_name, a.jersey_number, a.photo_url
        FROM athlete_injuries i
        JOIN athletes a ON a.id = i.athlete_id
       WHERE i.workspace_id = ANY($1)
         AND i.resolved_at IS NULL
         ${clubId ? 'AND a.club_id = $2' : ''}
       ORDER BY i.started_at DESC
       LIMIT 20
    `;
    const activeInjuriesResult = await query(activeInjuriesSql, nextSessionParams);

    // Aniversariantes do mês — não temos birthdate hoje, vou retornar vazio
    // TODO: adicionar coluna birthdate em athletes em uma migration futura.

    // Anúncios ativos pro usuário (não dismissed)
    const announcementsResult = await query(
      `SELECT a.id, a.title, a.body, a.severity, a.link_url, a.active_from
         FROM announcements a
        WHERE (a.active_from IS NULL OR a.active_from <= NOW())
          AND (a.active_until IS NULL OR a.active_until > NOW())
          AND (a.target_role = 'all' OR a.target_role = $2)
          AND NOT EXISTS (
            SELECT 1 FROM announcement_dismissals d
             WHERE d.user_id = $1 AND d.announcement_id = a.id
          )
        ORDER BY
          CASE a.severity WHEN 'important' THEN 1 WHEN 'warning' THEN 2 WHEN 'success' THEN 3 ELSE 4 END,
          a.active_from DESC
        LIMIT 10`,
      [req.user.id, req.user.role || 'all']
    );

    const summaryRow = await query(
      `SELECT
         (SELECT COUNT(*) FROM athletes WHERE workspace_id = ANY($1) ${clubId ? 'AND club_id = $2' : ''}) AS total_athletes,
         (SELECT COUNT(*) FROM athlete_injuries i
            JOIN athletes a ON a.id = i.athlete_id
           WHERE i.workspace_id = ANY($1) AND i.resolved_at IS NULL ${clubId ? 'AND a.club_id = $2' : ''}) AS active_injuries`,
      nextSessionParams
    );

    res.json({
      // 1 linha por dia (dia com 2+ períodos traz `periodos`)
      nextSessions: proximasPorDia(nextSessionsResult.rows, 5),
      nextMatch: nextMatchResult.rows[0] || null,
      activeInjuries: activeInjuriesResult.rows,
      announcements: announcementsResult.rows,
      summary: {
        totalAthletes: parseInt(summaryRow.rows[0]?.total_athletes || 0, 10),
        activeInjuries: parseInt(summaryRow.rows[0]?.active_injuries || 0, 10),
      },
    });
  } catch (err) {
    console.error('Home dashboard error:', err);
    res.status(500).json({ error: 'Failed to load home dashboard' });
  }
});

module.exports = router;
