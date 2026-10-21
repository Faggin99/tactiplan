const express = require('express');
const path = require('path');
const fs = require('fs');
const { query } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { uploadClubLogo } = require('../middleware/upload');
const billing = require('../services/billing');
const { isAdmin, isLifetime } = require('../config/specialUsers');
const { validateBranding, primaryMirror } = require('../utils/branding');

const uploadDir = path.resolve(process.env.UPLOAD_DIR || '../uploads');
const LOGO_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Apaga um arquivo de logo antigo (só dentro de /uploads/club-logos/, sem "..").
function removerLogo(logoPath) {
  if (!logoPath || typeof logoPath !== 'string' || !logoPath.startsWith('/uploads/club-logos/')) return;
  const nome = logoPath.slice('/uploads/club-logos/'.length);
  if (!nome || nome.includes('/') || nome.includes('..')) return;
  try { fs.unlinkSync(path.join(uploadDir, 'club-logos', nome)); } catch { /* já não existe */ }
}

// ?variant=dark → logo do tema escuro (clubs.logo_dark_path); qualquer outro → logo principal.
const colunaLogo = (req) => (req.query.variant === 'dark' ? 'logo_dark_path' : 'logo_path');

// Quantos clubes a workspace ativa ainda pode criar? Retorna { allowed, limit, current }.
async function canCreateClub(user) {
  if (user.role === 'admin' || isAdmin?.(user.email) || isLifetime?.(user.email)) {
    return { allowed: true, limit: -1 };
  }
  if (!user.workspaceId) return { allowed: false, limit: 0, current: 0 };

  const sub = await billing.getEffectiveSubscription({ userId: user.id, workspaceId: user.workspaceId });
  const planLimit = sub?.features?.max_clubs;
  if (planLimit === undefined || planLimit === -1) return { allowed: true, limit: planLimit ?? -1 };

  // Add-on: slots avulsos vendidos diretamente na subscription. Plano Clube hoje
  // vem com 3 slots inclusos; cada compra adicional incrementa extra_club_slots.
  const extraSlots = Number(sub?.extra_club_slots || 0);
  const limit = planLimit + (Number.isFinite(extraSlots) ? extraSlots : 0);

  const existing = await query(
    'SELECT COUNT(*)::int AS n FROM clubs WHERE workspace_id = $1',
    [user.workspaceId]
  );
  const current = existing.rows[0].n;
  return { allowed: current < limit, limit, current, planLimit, extraSlots };
}

const router = express.Router();

router.use(authMiddleware);

// GET /api/clubs — clubes acessíveis (todas as workspaces que o user participa)
router.get('/', async (req, res) => {
  try {
    const workspaceIds = req.user.workspaceIds || [];
    if (workspaceIds.length === 0) return res.json([]);
    const result = await query(
      `SELECT c.*,
              CASE WHEN w.owner_id = $1 THEN 'owner' ELSE COALESCE(m.role, 'coach') END AS my_role,
              (w.owner_id = $1) AS is_owner
         FROM clubs c
         JOIN workspaces w ON w.id = c.workspace_id
         LEFT JOIN workspace_members m
                ON m.workspace_id = w.id
               AND m.user_id = $1
               AND m.accepted_at IS NOT NULL
        WHERE c.workspace_id = ANY($2)
        ORDER BY is_owner DESC, c.created_at ASC`,
      [req.user.id, workspaceIds]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List clubs error:', err);
    res.status(500).json({ error: 'Failed to list clubs' });
  }
});

// GET /api/clubs/:id — acessível se o user pode ver a workspace
router.get('/:id', async (req, res) => {
  try {
    const workspaceIds = req.user.workspaceIds || [];
    if (workspaceIds.length === 0) return res.status(404).json({ error: 'Club not found' });
    const result = await query(
      `SELECT c.*,
              CASE WHEN w.owner_id = $2 THEN 'owner' ELSE COALESCE(m.role, 'coach') END AS my_role
         FROM clubs c
         JOIN workspaces w ON w.id = c.workspace_id
         LEFT JOIN workspace_members m
                ON m.workspace_id = w.id
               AND m.user_id = $2
               AND m.accepted_at IS NOT NULL
        WHERE c.id = $1 AND c.workspace_id = ANY($3)`,
      [req.params.id, req.user.id, workspaceIds]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Club not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get club error:', err);
    res.status(500).json({ error: 'Failed to get club' });
  }
});

const VALID_MODALITIES = ['football_11', 'football_7', 'futsal'];

// POST /api/clubs
router.post('/', async (req, res) => {
  try {
    const { name, description, modality, primary_color, secondary_color } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Club name is required' });
    }
    if (modality && !VALID_MODALITIES.includes(modality)) {
      return res.status(400).json({ error: 'Modalidade inválida' });
    }
    // Cores em formato HEX #RRGGBB ou #RRGGBBAA, vazio/null = sem cor
    const HEX_RE = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
    const validColor = (v) => v === '' || v === null || v === undefined ? null : (HEX_RE.test(v) ? v : undefined);
    const pc = validColor(primary_color);
    const sc = validColor(secondary_color);
    if (pc === undefined) {
      return res.status(400).json({ error: 'primary_color em formato inválido (esperado #RRGGBB)' });
    }
    if (sc === undefined) {
      return res.status(400).json({ error: 'secondary_color em formato inválido (esperado #RRGGBB)' });
    }

    if (!req.user.workspaceId) {
      return res.status(400).json({ error: 'Nenhuma workspace ativa' });
    }
    if (!req.user.canWriteWorkspace(req.user.workspaceId)) {
      return res.status(403).json({ error: 'Sem permissão de escrita nesta workspace' });
    }

    // Gate por plano: Pro/Clube = 1 clube incluso; clube extra = add-on (+R$20/mês
    // via extra_club_slots); admin/lifetime = ilimitado.
    const gate = await canCreateClub(req.user);
    if (!gate.allowed) {
      return res.status(402).json({
        error: `Seu plano permite ${gate.limit} clube${gate.limit === 1 ? '' : 's'} (já em uso: ${gate.current}). Adicione um clube extra por R$20/mês.`,
        code: 'ADDON_REQUIRED',
        required_feature: 'max_clubs',
        addon: 'extra_club',
        current: gate.current,
        limit: gate.limit,
        plan_limit: gate.planLimit,
        extra_slots: gate.extraSlots,
      });
    }

    const result = await query(
      `INSERT INTO clubs (name, description, workspace_id, modality, primary_color, secondary_color)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, description || null, req.user.workspaceId, modality || 'football_11', pc, sc]
    );
    const club = result.rows[0];

    // Cria categoria default
    try {
      await query(
        `INSERT INTO categories (workspace_id, club_id, name, display_order)
         VALUES ($1, $2, $3, 0)`,
        [req.user.workspaceId, club.id, 'Categoria Principal']
      );
    } catch (catErr) {
      console.error('Default category create failed:', catErr?.message);
    }

    res.status(201).json(club);
  } catch (err) {
    console.error('Create club error:', err);
    res.status(500).json({ error: 'Failed to create club' });
  }
});

// PUT /api/clubs/:id
router.put('/:id', async (req, res) => {
  try {
    if (!req.user.can('club_settings:manage')) return res.status(403).json({ error: 'Sem permissão' });
    const { name, description, modality, primary_color, secondary_color } = req.body;
    if (modality && !VALID_MODALITIES.includes(modality)) {
      return res.status(400).json({ error: 'Modalidade inválida' });
    }
    // Cores em formato HEX #RRGGBB ou #RRGGBBAA, vazio = remove
    const HEX_RE = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
    const validColor = (v) => v === '' || v === null ? null : (HEX_RE.test(v) ? v : undefined);
    const pc = primary_color === undefined ? undefined : validColor(primary_color);
    const sc = secondary_color === undefined ? undefined : validColor(secondary_color);
    if (pc === undefined && primary_color !== undefined) {
      return res.status(400).json({ error: 'primary_color em formato inválido (esperado #RRGGBB)' });
    }
    if (sc === undefined && secondary_color !== undefined) {
      return res.status(400).json({ error: 'secondary_color em formato inválido (esperado #RRGGBB)' });
    }

    // Se a modalidade mudar, zera position dos atletas do clube (decisão de produto:
    // posições legadas não fazem sentido em outra modalidade — usuário recadastra).
    let modalityChanged = false;
    if (modality) {
      const cur = await query('SELECT modality FROM clubs WHERE id = $1 AND workspace_id = ANY($2)',
        [req.params.id, req.user.workspaceIds || []]);
      if (cur.rows.length > 0 && cur.rows[0].modality !== modality) {
        modalityChanged = true;
      }
    }

    const result = await query(
      `UPDATE clubs
          SET name = $1,
              description = $2,
              modality = COALESCE($3, modality),
              -- Com Personalização salva, a primária é espelho de branding.light.primary
              -- (PUT /:id/branding) — o formulário do clube não sobrescreve.
              primary_color = CASE WHEN $4::text = 'KEEP' OR (branding IS NOT NULL AND branding <> '{}'::jsonb)
                                   THEN primary_color ELSE NULLIF($4, '') END,
              secondary_color = CASE WHEN $5::text = 'KEEP' THEN secondary_color ELSE NULLIF($5, '') END,
              updated_at = NOW()
        WHERE id = $6 AND workspace_id = ANY($7)
        RETURNING *`,
      [
        name,
        description || null,
        modality || null,
        primary_color === undefined ? 'KEEP' : (pc || ''),
        secondary_color === undefined ? 'KEEP' : (sc || ''),
        req.params.id,
        req.user.workspaceIds || [],
      ]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Club not found' });
    }

    if (modalityChanged) {
      await query('UPDATE athletes SET position = NULL WHERE club_id = $1', [req.params.id]);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update club error:', err);
    res.status(500).json({ error: 'Failed to update club' });
  }
});

// DELETE /api/clubs/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!req.user.can('club_settings:manage')) return res.status(403).json({ error: 'Sem permissão' });
    const result = await query(
      'DELETE FROM clubs WHERE id = $1 AND workspace_id = ANY($2) RETURNING id',
      [req.params.id, req.user.workspaceIds || []]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Club not found' });
    }
    res.json({ message: 'Club deleted successfully' });
  } catch (err) {
    console.error('Delete club error:', err);
    res.status(500).json({ error: 'Failed to delete club' });
  }
});

// PUT /api/clubs/:id/branding — cores do app por clube (Personalização).
// body { branding: { light?: {6 cores}, dark?: {6 cores} } }; tema omitido = padrão.
// Espelha light.primary em primary_color (PDFs). Sem trava de plano: conta só leitura
// já é barrada antes (402 READ_ONLY no requireActiveSubscription).
router.put('/:id/branding', async (req, res) => {
  try {
    if (!req.user.can('club_settings:manage')) return res.status(403).json({ error: 'Sem permissão' });
    const { branding, error } = validateBranding(req.body ? req.body.branding : undefined);
    if (error) return res.status(400).json({ error });
    const result = await query(
      `UPDATE clubs
          SET branding = $1::jsonb,
              primary_color = $2,
              updated_at = NOW()
        WHERE id = $3 AND workspace_id = ANY($4)
        RETURNING *`,
      [JSON.stringify(branding), primaryMirror(branding), req.params.id, req.user.workspaceIds || []]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Club not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update club branding error:', err);
    res.status(500).json({ error: 'Falha ao salvar a personalização' });
  }
});

// POST /api/clubs/:id/logo[?variant=dark] — logo principal ou a do tema escuro.
router.post('/:id/logo', (req, res) => {
  if (!req.user.can('club_settings:manage')) return res.status(403).json({ error: 'Sem permissão' });
  uploadClubLogo(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const logoPath = `/uploads/club-logos/${req.file.filename}`;
    if (!LOGO_MIMES.includes(req.file.mimetype)) {
      removerLogo(logoPath);
      return res.status(400).json({ error: 'A logo precisa ser uma imagem (JPG, PNG, GIF ou WebP).' });
    }
    const coluna = colunaLogo(req);

    try {
      const atual = await query(
        `SELECT ${coluna} AS antigo FROM clubs WHERE id = $1 AND workspace_id = ANY($2)`,
        [req.params.id, req.user.workspaceIds || []]
      );
      if (atual.rows.length === 0) {
        removerLogo(logoPath);
        return res.status(404).json({ error: 'Club not found' });
      }
      const result = await query(
        `UPDATE clubs SET ${coluna} = $1, updated_at = NOW()
         WHERE id = $2 AND workspace_id = ANY($3)
         RETURNING *`,
        [logoPath, req.params.id, req.user.workspaceIds || []]
      );

      if (result.rows.length === 0) {
        removerLogo(logoPath);
        return res.status(404).json({ error: 'Club not found' });
      }
      if (atual.rows[0].antigo !== logoPath) removerLogo(atual.rows[0].antigo);
      res.json(result.rows[0]);
    } catch (dbErr) {
      console.error('Upload logo DB error:', dbErr);
      res.status(500).json({ error: 'Failed to save logo' });
    }
  });
});

// DELETE /api/clubs/:id/logo[?variant=dark] — remove a logo (volta a marca TactiPlan no topo).
router.delete('/:id/logo', async (req, res) => {
  try {
    if (!req.user.can('club_settings:manage')) return res.status(403).json({ error: 'Sem permissão' });
    const coluna = colunaLogo(req);
    const atual = await query(
      `SELECT ${coluna} AS antigo FROM clubs WHERE id = $1 AND workspace_id = ANY($2)`,
      [req.params.id, req.user.workspaceIds || []]
    );
    if (atual.rows.length === 0) return res.status(404).json({ error: 'Club not found' });
    const result = await query(
      `UPDATE clubs SET ${coluna} = NULL, updated_at = NOW()
        WHERE id = $1 AND workspace_id = ANY($2)
        RETURNING *`,
      [req.params.id, req.user.workspaceIds || []]
    );
    removerLogo(atual.rows[0].antigo);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Delete logo error:', err);
    res.status(500).json({ error: 'Falha ao remover a logo' });
  }
});

// POST /api/clubs/:id/migrate-data — orphans → este clube (na mesma workspace)
router.post('/:id/migrate-data', async (req, res) => {
  try {
    const clubId = req.params.id;
    const wsId = req.user.workspaceId;
    if (!wsId) return res.status(400).json({ error: 'Nenhuma workspace ativa' });

    await query(
      `UPDATE training_microcycles SET club_id = $1
       WHERE workspace_id = $2 AND club_id IS NULL`,
      [clubId, wsId]
    );
    await query(
      `UPDATE athletes SET club_id = $1
       WHERE workspace_id = $2 AND club_id IS NULL`,
      [clubId, wsId]
    );
    await query(
      `UPDATE tactical_plays SET club_id = $1
       WHERE workspace_id = $2 AND club_id IS NULL`,
      [clubId, wsId]
    );

    res.json({ message: 'Data migrated successfully' });
  } catch (err) {
    console.error('Migrate data error:', err);
    res.status(500).json({ error: 'Failed to migrate data' });
  }
});

module.exports = router;
