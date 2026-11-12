const express = require('express');
const { query } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { proximasPorDia, ordemSql, periodoEfetivo } = require('../services/periodos');

const router = express.Router();
router.use(authMiddleware);

// GET /api/home/dashboard?clubId=... — agrega indicadores pra HomePage
router.get('/home/dashboard', async (req, res) => {
  try {
    const workspaceIds = req.user.workspaceIds || [];
    const clubId = req.query.clubId || null;
    if (workspaceIds.length === 0) {
      return res.json({ nextSessions: [], nextMatch: null, lastMatch: null, activeInjuries: [], announcements: [], summary: { totalAthletes: 0, activeInjuries: 0, transicao: 0 } });
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
      SELECT s.id, s.date, s.day_name, s.opponent_name, m.club_id,
             s.match_kickoff, s.match_venue, s.match_meet_time, s.match_location, s.formation
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

    // Último jogo já disputado (até hoje) — atalho "Análise de vídeo" da Início
    const lastMatchResult = await query(`
      SELECT s.id, s.date, s.day_name, s.opponent_name, m.club_id
        FROM training_sessions s
        JOIN training_microcycles m ON s.microcycle_id = m.id
       WHERE s.workspace_id = ANY($1)
         AND s.date <= CURRENT_DATE
         AND s.session_type = 'match'
         ${clubId ? 'AND m.club_id = $2' : ''}
       ORDER BY s.date DESC
       LIMIT 1`, nextSessionParams);

    // DM = grupo DM, situação "Lesionado" ou lesão aberta na ficha (12/11/2026: antes só a lesão
    // aberta contava e quem era posto no grupo DM não aparecia na Início).
    const activeInjuriesSql = `
      SELECT COALESCE(i.id, a.id) AS id, a.id AS athlete_id, i.injury_type, i.body_part, i.severity,
             i.started_at, i.expected_return, a.name AS athlete_name, a.jersey_number, a.photo_url
        FROM athletes a
        LEFT JOIN LATERAL (
          SELECT * FROM athlete_injuries x WHERE x.athlete_id = a.id AND x.resolved_at IS NULL
           ORDER BY x.started_at DESC LIMIT 1) i ON TRUE
       WHERE a.workspace_id = ANY($1)
         ${clubId ? 'AND a.club_id = $2' : ''}
         AND (a."group" = 'DM' OR a.status = 'injured' OR i.id IS NOT NULL)
       ORDER BY i.started_at DESC NULLS LAST, a.name
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
         (SELECT COUNT(*) FROM athletes a
           WHERE a.workspace_id = ANY($1) ${clubId ? 'AND a.club_id = $2' : ''}
             AND (a."group" = 'DM' OR a.status = 'injured'
                  OR EXISTS (SELECT 1 FROM athlete_injuries i WHERE i.athlete_id = a.id AND i.resolved_at IS NULL))) AS active_injuries,
         (SELECT COUNT(*) FROM athletes a
           WHERE a.workspace_id = ANY($1) ${clubId ? 'AND a.club_id = $2' : ''} AND a."group" = 'Transição'
             AND a.status <> 'injured'
             AND NOT EXISTS (SELECT 1 FROM athlete_injuries i WHERE i.athlete_id = a.id AND i.resolved_at IS NULL)) AS transicao`,
      nextSessionParams
    );

    // ?semanaDe=AAAA-MM-DD: mostra a semana desse dia (prévia/teste); padrão = hoje
    const semanaDe = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.semanaDe || '')) ? req.query.semanaDe : null;
    const semana = await semanaAtual(nextSessionParams, clubId, semanaDe);

    res.json({
      semana,
      // 1 linha por dia (dia com 2+ períodos traz `periodos`)
      nextSessions: proximasPorDia(nextSessionsResult.rows, 5),
      nextMatch: nextMatchResult.rows[0] || null,
      lastMatch: lastMatchResult.rows[0] || null,
      activeInjuries: activeInjuriesResult.rows,
      announcements: announcementsResult.rows,
      summary: {
        totalAthletes: parseInt(summaryRow.rows[0]?.total_athletes || 0, 10),
        activeInjuries: parseInt(summaryRow.rows[0]?.active_injuries || 0, 10),
        transicao: parseInt(summaryRow.rows[0]?.transicao || 0, 10),
      },
    });
  } catch (err) {
    console.error('Home dashboard error:', err);
    res.status(500).json({ error: 'Failed to load home dashboard' });
  }
});

// Semana ATUAL (seg–dom) para o quadro da Início: por dia os períodos, com as atividades
// (título, minutos e o pilar do 1º conteúdo, que pinta o ímã) e o total de minutos.
async function semanaAtual(baseParams, clubId, semanaDe) {
  const params = [...baseParams, semanaDe];
  const ref = `COALESCE($${params.length}::date, CURRENT_DATE)`;
  const r = await query(`
    SELECT s.id, s.date::text AS date, s.session_type, s.periodo, s.opponent_name, s.treino_transicao,
           b."order" AS ordem, b.name AS bloco, a.id AS atividade_id, a.duration_minutes AS minutos,
           COALESCE(NULLIF(t.title, ''), NULLIF(a.description, '')) AS titulo,
           (SELECT c.dimension FROM training_activity_contents tc JOIN contents c ON c.id = tc.content_id
             WHERE tc.activity_id = a.id ORDER BY c.name LIMIT 1) AS pilar
      FROM training_sessions s
      JOIN training_microcycles m ON m.id = s.microcycle_id
      LEFT JOIN training_activity_blocks b ON b.session_id = s.id
      LEFT JOIN training_activities a ON a.block_id = b.id AND COALESCE(a.is_rest, false) = false
      LEFT JOIN activity_titles t ON t.id = a.title_id
     WHERE s.workspace_id = ANY($1)
       ${clubId ? 'AND m.club_id = $2' : ''}
       AND s.date BETWEEN date_trunc('week', ${ref})::date AND (date_trunc('week', ${ref})::date + 6)
     ORDER BY s.date, ${ordemSql('s')}, b."order"`, params);
  const dias = new Map();
  for (const row of r.rows) {
    let dia = dias.get(row.date);
    if (!dia) { dia = { date: row.date, periodos: [], minutos: 0 }; dias.set(row.date, dia); }
    let p = dia.periodos.find((x) => x.id === row.id);
    if (!p) {
      p = { id: row.id, tipo: row.session_type || 'training', transicao: !!row.treino_transicao, periodo: row.session_type === 'training' || row.session_type === 'assessment' ? periodoEfetivo(row) : row.periodo, adversario: row.opponent_name || null, atividades: [], minutos: 0 };
      dia.periodos.push(p);
    }
    if (row.atividade_id && (row.titulo || row.minutos)) {
      const min = Number(row.minutos) || 0;
      p.atividades.push({ titulo: row.titulo || row.bloco, bloco: row.bloco, minutos: min, pilar: row.pilar || null });
      p.minutos += min;
      // treino de transição não soma no total do dia (não é carga do grupo)
      if (!row.treino_transicao) dia.minutos += min;
    }
  }
  return Array.from(dias.values());
}

module.exports = router;
