const express = require('express');
const { query } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/workspaces — lista workspaces acessíveis (próprias + onde sou member)
// Inclui status da subscription de cada uma pra permitir auto-swap em paywall.
router.get('/', async (req, res) => {
  const accessible = req.user.accessibleWorkspaces || [];
  if (accessible.length === 0) return res.json({ data: [], active: null });

  // Assinatura efetiva de cada workspace (cortesia/admin/paga/só leitura).
  const billing = require('../services/billing');
  const data = [];
  for (const w of accessible) {
    let sub = null;
    try { sub = await billing.getEffectiveSubscription({ userId: req.user.id, workspaceId: w.workspace_id }); } catch (_) { /* segue */ }
    data.push({
      id: w.workspace_id,
      name: w.name,
      owner_id: w.owner_id,
      tipo: w.tipo || null, // 'clube' | 'comissao' | null (não informado → textos de clube)
      role: w.role,
      is_owner: w.is_owner,
      category_ids: w.category_ids || null,
      permissions: w.permissions || null,
      subscription_status: sub?.status || 'none',
      plan_id: sub?.plan_id || null,
      read_only: !!sub?.read_only,
      usable: !!sub && !sub.read_only, // workspace com acesso de escrita (paga, cortesia ou admin)
    });
  }
  res.json({ data, active: req.user.workspaceId || null });
});

// POST /api/workspaces — cria nova workspace (segunda assinatura/conta)
router.post('/', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name é obrigatório' });

    const wsRes = await query(
      `INSERT INTO workspaces (name, owner_id) VALUES ($1, $2) RETURNING *`,
      [name.trim(), req.user.id]
    );
    const workspace = wsRes.rows[0];

    // F1: sem trial nem plano grátis — a conta nova nasce em só leitura até ser assinada.

    authMiddleware.invalidateAccessibleCache?.(req.user.id);

    res.status(201).json(workspace);
  } catch (err) {
    console.error('Create workspace error:', err);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

// PUT /api/workspaces/:id — renomear (só owner)
router.put('/:id', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name é obrigatório' });
    if (!req.user.isWorkspaceOwner(req.params.id)) {
      return res.status(403).json({ error: 'Apenas o dono pode renomear' });
    }
    const r = await query(
      `UPDATE workspaces SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [name.trim(), req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Workspace não encontrada' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Update workspace error:', err);
    res.status(500).json({ error: 'Failed to update workspace' });
  }
});

// PUT /api/workspaces/:id/tipo — "Você é": clube/escolinha ou comissão técnica (só owner).
// Só ajusta textos ("seu clube"/"seus clubes", dica de arquivar); o preço é o mesmo.
router.put('/:id/tipo', async (req, res) => {
  try {
    const { tipo } = req.body || {};
    if (!['clube', 'comissao'].includes(tipo)) return res.status(400).json({ error: "tipo deve ser 'clube' ou 'comissao'" });
    if (!req.user.isWorkspaceOwner(req.params.id)) {
      return res.status(403).json({ error: 'Apenas o dono pode alterar o tipo da conta' });
    }
    const r = await query(
      `UPDATE workspaces SET tipo = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, tipo`,
      [tipo, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Workspace não encontrada' });
    authMiddleware.invalidateAccessibleCache?.(req.user.id);
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Update workspace tipo error:', err);
    res.status(500).json({ error: 'Failed to update workspace' });
  }
});

module.exports = router;
