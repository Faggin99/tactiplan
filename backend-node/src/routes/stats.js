const express = require('express');
const authMiddleware = require('../middleware/auth');
const { getTrainingStats, getGameStats, buildDistanceStats } = require('../services/statsData');

const router = express.Router();

router.use(authMiddleware);

function getDateRange(period, startDate, endDate) {
  const now = new Date();
  let start, end;

  if (period === 'custom' && startDate && endDate) {
    start = startDate;
    end = endDate;
  } else if (period === 'week') {
    const d = new Date(now);
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - day + 1);
    start = d.toISOString().split('T')[0];
    end = now.toISOString().split('T')[0];
  } else if (period === 'month') {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - 1);
    start = d.toISOString().split('T')[0];
    end = now.toISOString().split('T')[0];
  } else if (period === '3months') {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - 3);
    start = d.toISOString().split('T')[0];
    end = now.toISOString().split('T')[0];
  } else {
    // Default: last month
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - 1);
    start = d.toISOString().split('T')[0];
    end = now.toISOString().split('T')[0];
  }

  return { start, end };
}

// Divide um período em N buckets uniformes, retornando [{ start, end }, ...]

// GET /api/stats/training — dashboard
router.get('/training', async (req, res) => {
  try {
    if (!req.user.can('stats:view')) return res.status(403).json({ error: 'Sem permissão' });
    const { start_date, end_date, clubId } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date e end_date são obrigatórios' });
    }
    const data = await getTrainingStats({
      workspaceIds: req.user.workspaceIds || [],
      start: start_date,
      end: end_date,
      clubId: clubId || null,
      allowedCategoryIds: req.user.allowedCategoryIds ?? null,
    });
    res.json(data);
  } catch (err) {
    console.error('Training stats error:', err);
    res.status(500).json({ error: 'Failed to get training stats' });
  }
});

// GET /api/stats/games
router.get('/games', async (req, res) => {
  try {
    if (!req.user.can('stats:view')) return res.status(403).json({ error: 'Sem permissão' });
    const { start_date, end_date, clubId, competition_id } = req.query;
    const { start, end } = getDateRange('custom', start_date, end_date);
    const competitionId = competition_id === 'none' || /^[0-9a-f-]{36}$/i.test(competition_id || '') ? competition_id : null;
    const data = await getGameStats({
      competitionId,
      workspaceIds: req.user.workspaceIds || [],
      start,
      end,
      clubId: clubId || null,
      allowedCategoryIds: req.user.allowedCategoryIds ?? null,
    });
    res.json(data);
  } catch (err) {
    console.error('Game stats error:', err);
    res.status(500).json({ error: 'Failed to get game stats' });
  }
});

module.exports = router;
module.exports.buildDistanceStats = buildDistanceStats;
module.exports.getDateRange = getDateRange;
