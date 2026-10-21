const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const { isAdmin, isLifetime } = require('../config/specialUsers');
const { loginLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * POST /api/admin/auth/login
 * Login dedicado da área admin. Rejeita não-admins na própria autenticação.
 * Rate limit dedicado (5/15min por IP) — é a conta de maior privilégio.
 */
router.post('/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email e password obrigatórios' });

    const r = await query('SELECT id, email, name, role, encrypted_password FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (r.rows.length === 0) return res.status(401).json({ error: 'Credenciais inválidas' });
    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.encrypted_password || '');
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

    const allowed = user.role === 'admin' || isAdmin(user.email);
    if (!allowed) return res.status(403).json({ error: 'Acesso restrito a administradores' });

    const token = jwt.sign({ id: user.id, email: user.email, scope: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    console.error('admin login error', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Daqui pra baixo, exige auth + admin
router.use(authMiddleware, requireAdmin);

/**
 * GET /api/admin/dashboard
 * KPIs agregados.
 */
router.get('/dashboard', async (_req, res) => {
  try {
    const r = await query(`
      WITH u AS (SELECT * FROM users),
           s AS (SELECT user_id, plan_id, status FROM subscriptions),
           latest AS (
             SELECT DISTINCT ON (user_id) user_id, plan_id, status
             FROM subscriptions
             ORDER BY user_id, created_at DESC
           )
      SELECT
        (SELECT COUNT(*) FROM u) AS total_users,
        (SELECT COUNT(*) FROM latest WHERE status='trialing') AS in_trial,
        (SELECT COUNT(*) FROM latest WHERE status='active' AND plan_id <> 'lifetime') AS paying,
        (SELECT COUNT(*) FROM latest WHERE status='active' AND plan_id = 'lifetime') AS lifetime,
        (SELECT COUNT(*) FROM u WHERE created_at >= NOW() - INTERVAL '7 days') AS new_this_week
    `);
    res.json(r.rows[0]);
  } catch (err) {
    console.error('admin dashboard error', err);
    res.status(500).json({ error: 'Failed dashboard' });
  }
});

/**
 * GET /api/admin/users
 * Lista todos os usuários com subscription atual + contagens de atividade.
 */
router.get('/users', async (req, res) => {
  try {
    const { search = '', status = '' } = req.query;
    const params = [];
    let where = '1=1';
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where += ` AND (LOWER(u.email) LIKE $${params.length} OR LOWER(u.name) LIKE $${params.length})`;
    }
    const r = await query(`
      WITH latest_sub AS (
        SELECT DISTINCT ON (user_id) user_id, plan_id, status, trial_ends_at, current_period_end, canceled_at
        FROM subscriptions
        ORDER BY user_id, created_at DESC
      )
      SELECT
        u.id, u.email, u.name, u.role, u.phone, u.created_at, u.updated_at,
        s.plan_id, s.status, s.trial_ends_at, s.current_period_end, s.canceled_at,
        (SELECT COUNT(*) FROM clubs c JOIN workspaces w ON w.id = c.workspace_id WHERE w.owner_id = u.id) AS clubs_count,
        (SELECT COUNT(*) FROM athletes a JOIN workspaces w ON w.id = a.workspace_id WHERE w.owner_id = u.id) AS athletes_count,
        (SELECT COUNT(*) FROM activity_titles t JOIN workspaces w ON w.id = t.workspace_id WHERE w.owner_id = u.id) AS templates_count,
        (SELECT COUNT(*) FROM training_microcycles m JOIN workspaces w ON w.id = m.workspace_id WHERE w.owner_id = u.id) AS microcycles_count,
        (SELECT COUNT(*) FROM training_activities ta JOIN workspaces w ON w.id = ta.workspace_id WHERE w.owner_id = u.id) AS activities_count
      FROM users u
      LEFT JOIN latest_sub s ON s.user_id = u.id
      WHERE ${where}
      ORDER BY u.created_at DESC
    `, params);

    const rows = r.rows;
    const filtered = status ? rows.filter((x) => (x.status || 'none') === status) : rows;
    res.json(filtered);
  } catch (err) {
    console.error('admin users error', err);
    res.status(500).json({ error: 'Failed users list' });
  }
});

/**
 * GET /api/admin/users/:id
 * Detalhe: perfil + todas subscriptions + billing events + último acesso (proxy: updated_at).
 */
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const u = await query('SELECT id, email, name, role, phone, bio, created_at, updated_at FROM users WHERE id = $1', [id]);
    if (u.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

    const subs = await query(`
      SELECT id, plan_id, status, trial_ends_at, current_period_start, current_period_end,
             canceled_at, mp_preapproval_id, mp_status, created_at, updated_at
      FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC
    `, [id]);

    // Schema real de billing_events vem da migration 006: (type, status, raw, mp_resource_id, amount_cents).
    // Retornamos com os aliases event_type/mp_status/payload pra manter compatibilidade
    // com o consumidor no admin dashboard, sem quebrar código legado.
    let events = { rows: [] };
    try {
      events = await query(`
        SELECT id,
               type          AS event_type,
               status        AS mp_status,
               raw           AS payload,
               mp_resource_id,
               amount_cents,
               created_at
        FROM billing_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50
      `, [id]);
    } catch (_) { /* tabela pode não existir em ambientes antigos */ }

    const stats = await query(`
      WITH user_workspaces AS (SELECT id FROM workspaces WHERE owner_id = $1)
      SELECT
        (SELECT COUNT(*) FROM clubs WHERE workspace_id IN (SELECT id FROM user_workspaces)) AS clubs,
        (SELECT COUNT(*) FROM athletes WHERE workspace_id IN (SELECT id FROM user_workspaces)) AS athletes,
        (SELECT COUNT(*) FROM activity_titles WHERE workspace_id IN (SELECT id FROM user_workspaces)) AS templates,
        (SELECT COUNT(*) FROM training_microcycles WHERE workspace_id IN (SELECT id FROM user_workspaces)) AS microcycles,
        (SELECT COUNT(*) FROM training_sessions WHERE workspace_id IN (SELECT id FROM user_workspaces)) AS sessions,
        (SELECT COUNT(*) FROM training_activities WHERE workspace_id IN (SELECT id FROM user_workspaces)) AS activities,
        (SELECT COUNT(*) FROM tactical_plays WHERE workspace_id IN (SELECT id FROM user_workspaces)) AS plays
    `, [id]);

    res.json({
      user: u.rows[0],
      subscriptions: subs.rows,
      billingEvents: events.rows,
      stats: stats.rows[0],
    });
  } catch (err) {
    console.error('admin user detail error', err);
    res.status(500).json({ error: 'Failed user detail' });
  }
});

/**
 * POST /api/admin/users/:id/grant-lifetime
 * Cria/atualiza subscription pra lifetime active sem cobrança.
 */
router.post('/users/:id/grant-lifetime', async (req, res) => {
  try {
    const { id } = req.params;
    // Cancela subscriptions anteriores ativas
    await query(`UPDATE subscriptions SET status='canceled', canceled_at=NOW(), updated_at=NOW()
                 WHERE user_id=$1 AND status IN ('active','trialing')`, [id]);
    // Cria nova lifetime
    const r = await query(`
      INSERT INTO subscriptions (user_id, plan_id, status, current_period_start, current_period_end, metadata)
      VALUES ($1, 'lifetime', 'active', NOW(), NOW() + INTERVAL '100 years', '{"grantedBy":"admin"}'::jsonb)
      RETURNING *
    `, [id]);
    res.json({ ok: true, subscription: r.rows[0] });
  } catch (err) {
    console.error('grant-lifetime error', err);
    res.status(500).json({ error: 'Failed to grant lifetime' });
  }
});

/**
 * POST /api/admin/users/:id/cortesia
 * Body: { ativo: boolean, motivo?: string }
 * Cortesia PERMANENTE (F1): tudo liberado, sem assinatura, nunca expira.
 * Vale para a workspace do usuário e para quem ele convidar.
 */
router.post('/users/:id/cortesia', async (req, res) => {
  try {
    const ativo = req.body?.ativo !== false;
    const motivo = ativo ? String(req.body?.motivo || 'cortesia (admin)').slice(0, 200) : null;
    const r = await query(
      `UPDATE users SET cortesia_permanente = $2, cortesia_motivo = $3 WHERE id = $1
       RETURNING id, email, cortesia_permanente, cortesia_motivo`,
      [req.params.id, ativo, motivo]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ ok: true, user: r.rows[0] });
  } catch (err) {
    console.error('cortesia error', err);
    res.status(500).json({ error: 'Failed to set cortesia' });
  }
});

/**
 * POST /api/admin/users/:id/extend-trial
 * Body: { days: number }
 * Adiciona N dias na subscription mais recente que esteja em trial.
 * Se não estiver em trial, cria uma trial nova.
 */
router.post('/users/:id/extend-trial', async (req, res) => {
  try {
    const { id } = req.params;
    const days = Math.max(1, Math.min(180, parseInt(req.body?.days, 10) || 30));

    const latest = await query(`
      SELECT id, status, trial_ends_at FROM subscriptions
      WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 1
    `, [id]);

    if (latest.rows.length > 0 && latest.rows[0].status === 'trialing') {
      const r = await query(`
        UPDATE subscriptions
        SET trial_ends_at = trial_ends_at + ($2 || ' days')::interval,
            current_period_end = current_period_end + ($2 || ' days')::interval,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [latest.rows[0].id, days]);
      return res.json({ ok: true, action: 'extended', subscription: r.rows[0] });
    }

    // Sem trial ativo — cria novo no plano Clube (único plano vendido desde 21/10/2026).
    const r = await query(`
      INSERT INTO subscriptions (user_id, plan_id, status, trial_ends_at, current_period_start, current_period_end, metadata)
      VALUES ($1, 'clube', 'trialing', NOW() + ($2 || ' days')::interval, NOW(), NOW() + ($2 || ' days')::interval, '{"grantedBy":"admin"}'::jsonb)
      RETURNING *
    `, [id, days]);
    res.json({ ok: true, action: 'created', subscription: r.rows[0] });
  } catch (err) {
    console.error('extend-trial error', err);
    res.status(500).json({ error: 'Failed to extend trial' });
  }
});

/**
 * POST /api/admin/users/:id/change-plan
 * Body: { plan_id: 'clube' | 'clube_annual' } (pro/pro_annual saíram da venda: is_active=false)
 * Troca o plan_id da subscription ATUAL (trialing/active/past_due/paused) mantendo datas e status.
 * Útil pra migrar usuários antigos do trial Pro pro trial Clube sem resetar dias restantes.
 * Não mexe em MP — se a sub tem mp_preapproval_id, o valor cobrado no MP NÃO muda (admin precisa
 * lidar com isso à parte se for sub com cobrança ativa).
 */
router.post('/users/:id/change-plan', async (req, res) => {
  try {
    const { id } = req.params;
    const planId = req.body?.plan_id;
    if (!planId) return res.status(400).json({ error: 'plan_id é obrigatório' });

    const planCheck = await query(
      `SELECT id FROM plans WHERE id = $1 AND is_active = true AND id <> 'lifetime'`,
      [planId]
    );
    if (planCheck.rows.length === 0) {
      return res.status(400).json({ error: 'plan_id inválido' });
    }

    // Pega a subscription ativa mais recente
    const current = await query(
      `SELECT id, plan_id, status, mp_preapproval_id FROM subscriptions
       WHERE user_id = $1 AND status IN ('trialing','active','past_due','paused')
       ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não tem assinatura ativa pra trocar' });
    }
    const sub = current.rows[0];

    const r = await query(
      `UPDATE subscriptions
          SET plan_id = $1,
              metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('changedBy','admin','previousPlan',$2::text,'changedAt',now()::text),
              updated_at = NOW()
        WHERE id = $3
        RETURNING *`,
      [planId, sub.plan_id, sub.id]
    );
    res.json({
      ok: true,
      subscription: r.rows[0],
      warning: sub.mp_preapproval_id ? 'Subscription tem preapproval MP ativo — o valor cobrado não mudou automaticamente' : null,
    });
  } catch (err) {
    console.error('change-plan error', err);
    res.status(500).json({ error: 'Failed to change plan' });
  }
});

module.exports = router;
