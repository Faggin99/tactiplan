const express = require('express');
const { formatarNome } = require('../utils/formatarNome');
const { getPlanFeatures } = require('../utils/planFeatures');
const fs = require('fs');
const path = require('path');
const { query } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { uploadAthletePhoto } = require('../middleware/upload');

const router = express.Router();

router.use(authMiddleware);

// GET /api/athletes
router.get('/', async (req, res) => {
  try {
    if (!req.user.can('athletes:view')) return res.status(403).json({ error: 'Sem permissão pra ver atletas' });

    const { club_id, group, status } = req.query;
    const workspaceIds = req.user.workspaceIds || [];

    let sql, params, paramIndex;
    if (club_id) {
      const wsId = req.user.readableWorkspaceForClub(club_id);
      if (!wsId) return res.status(403).json({ error: 'Sem acesso a esse clube' });
      sql = 'SELECT * FROM athletes WHERE club_id = $1 AND workspace_id = $2';
      params = [club_id, wsId];
      paramIndex = 3;
    } else {
      sql = 'SELECT * FROM athletes WHERE workspace_id = ANY($1)';
      params = [workspaceIds];
      paramIndex = 2;
    }

    // HARD scoping por categoria: se o member tem categorias atribuídas, filtra.
    const allowedCats = req.user.allowedCategoryIds;
    if (Array.isArray(allowedCats)) {
      if (allowedCats.length === 0) return res.json([]);
      sql += ` AND category_id = ANY($${paramIndex++})`;
      params.push(allowedCats);
    }

    if (group) { sql += ` AND "group" = $${paramIndex++}`; params.push(group); }
    if (status) { sql += ` AND status = $${paramIndex++}`; params.push(status); }

    sql += ' ORDER BY name ASC';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('List athletes error:', err);
    res.status(500).json({ error: 'Failed to list athletes' });
  }
});

// PUT /api/athletes/batch-groups
router.put('/batch-groups', async (req, res) => {
  try {
    if (!req.user.can('athletes:edit')) return res.status(403).json({ error: 'Sem permissão pra editar atletas' });
    const { athletes } = req.body;
    if (!Array.isArray(athletes) || athletes.length === 0) {
      return res.status(400).json({ error: 'Athletes array is required' });
    }
    const workspaceIds = req.user.workspaceIds || [];

    const results = [];
    for (const athlete of athletes) {
      const result = await query(
        `UPDATE athletes SET "group" = $1, updated_at = NOW()
         WHERE id = $2 AND workspace_id = ANY($3)
         RETURNING *`,
        [athlete.group, athlete.id, workspaceIds]
      );
      if (result.rows.length > 0) {
        results.push(result.rows[0]);
      }
    }

    res.json(results);
  } catch (err) {
    console.error('Batch update groups error:', err);
    res.status(500).json({ error: 'Failed to batch update groups' });
  }
});

// GET /api/athletes/:id
router.get('/:id', async (req, res) => {
  try {
    if (!req.user.can('athletes:view')) return res.status(403).json({ error: 'Sem permissão' });
    const result = await query(
      'SELECT * FROM athletes WHERE id = $1 AND workspace_id = ANY($2)',
      [req.params.id, req.user.workspaceIds || []]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Athlete not found' });
    }
    const athlete = result.rows[0];
    if (!req.user.assertCanAccessCategory(athlete.category_id)) {
      return res.status(403).json({ error: 'Sem acesso a essa categoria' });
    }
    res.json(athlete);
  } catch (err) {
    console.error('Get athlete error:', err);
    res.status(500).json({ error: 'Failed to get athlete' });
  }
});

function normalizeFoot(v) {
  return (v === 'right' || v === 'left' || v === 'both') ? v : null;
}

// POST /api/athletes
router.post('/', async (req, res) => {
  try {
    if (!req.user.can('athletes:edit')) return res.status(403).json({ error: 'Sem permissão pra criar atletas' });
    const {
      name, position, jersey_number, status, observation, group, photo_url, club_id, category_id,
      birthdate, height_cm, preferred_foot, previous_club,
    } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Athlete name is required' });
    }
    if (!club_id) {
      return res.status(400).json({ error: 'club_id is required' });
    }
    const wsId = req.user.writableWorkspaceForClub(club_id);
    if (!wsId) {
      return res.status(403).json({ error: 'Sem permissão de escrita nesse clube' });
    }
    if (!req.user.assertCanAccessCategory(category_id)) {
      return res.status(403).json({ error: 'Sem acesso a essa categoria' });
    }

    // Limite de atletas do plano (Free: 30; pagos: -1 = ilimitado). Conta a
    // workspace inteira. Mensagem neutra (app nativo / Apple 3.1.3(f)).
    const feats = await getPlanFeatures(req.user);
    const maxAthletes = feats && !feats.__unlimited ? Number(feats.max_athletes) : -1;
    if (Number.isFinite(maxAthletes) && maxAthletes >= 0) {
      const cnt = await query('SELECT COUNT(*)::int AS n FROM athletes WHERE workspace_id = $1', [wsId]);
      if (cnt.rows[0].n >= maxAthletes) {
        return res.status(402).json({
          error: `Seu plano permite até ${maxAthletes} atletas.`,
          code: 'PLAN_REQUIRED',
          required_feature: 'max_athletes',
          limit: maxAthletes,
        });
      }
    }

    const result = await query(
      `INSERT INTO athletes (name, position, jersey_number, status, observation, "group", photo_url,
                             club_id, category_id, workspace_id,
                             birthdate, height_cm, preferred_foot, previous_club)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [formatarNome(name), position || null, jersey_number || null, status || 'active', observation || null,
       group || null, photo_url || null, club_id, category_id || null, wsId,
       birthdate || null, Number.isFinite(+height_cm) && +height_cm > 0 ? +height_cm : null,
       normalizeFoot(preferred_foot), previous_club?.trim() || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create athlete error:', err);
    res.status(500).json({ error: 'Failed to create athlete' });
  }
});

// PUT /api/athletes/:id
router.put('/:id', async (req, res) => {
  try {
    if (!req.user.can('athletes:edit')) return res.status(403).json({ error: 'Sem permissão pra editar atletas' });
    const {
      name, position, jersey_number, status, observation, group, photo_url, club_id, category_id,
      birthdate, height_cm, preferred_foot, previous_club,
    } = req.body;
    if (club_id && !req.user.writableWorkspaceForClub(club_id)) {
      return res.status(403).json({ error: 'Sem permissão de escrita nesse clube' });
    }
    if (!req.user.assertCanAccessCategory(category_id)) {
      return res.status(403).json({ error: 'Sem acesso a essa categoria' });
    }

    const result = await query(
      `UPDATE athletes SET name = $1, position = $2, jersey_number = $3, status = $4,
       observation = $5, "group" = $6, photo_url = $7, club_id = $8, category_id = $9,
       birthdate = $10, height_cm = $11, preferred_foot = $12, previous_club = $13,
       updated_at = NOW()
       WHERE id = $14 AND workspace_id = ANY($15)
       RETURNING *`,
      [formatarNome(name), position || null, jersey_number || null, status || 'active', observation || null,
       group || null, photo_url || null, club_id, category_id || null,
       birthdate || null, Number.isFinite(+height_cm) && +height_cm > 0 ? +height_cm : null,
       normalizeFoot(preferred_foot), previous_club?.trim() || null,
       req.params.id, req.user.workspaceIds || []]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Athlete not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update athlete error:', err);
    res.status(500).json({ error: 'Failed to update athlete' });
  }
});

// POST /api/athletes/:id/photo — upload de foto do atleta (multipart/form-data, campo "photo")
router.post('/:id/photo', (req, res, next) => {
  uploadAthletePhoto(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.user.can('athletes:edit')) {
      // Limpa o arquivo se a permissão falhou pra não deixar lixo no disco
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: 'Sem permissão pra editar atletas' });
    }
    if (!req.file) return res.status(400).json({ error: 'Arquivo "photo" é obrigatório' });

    const workspaceIds = req.user.workspaceIds || [];
    const existing = await query(
      'SELECT id, photo_url, category_id FROM athletes WHERE id = $1 AND workspace_id = ANY($2)',
      [req.params.id, workspaceIds]
    );
    if (existing.rows.length === 0) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Athlete not found' });
    }
    if (!req.user.assertCanAccessCategory(existing.rows[0].category_id)) {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: 'Sem acesso a essa categoria' });
    }

    // URL pública servida por express.static em /uploads (vide server.js)
    const photoUrl = `/uploads/athlete-photos/${req.file.filename}`;

    // Remove a foto antiga se existir e estiver dentro de /uploads/athlete-photos/
    const oldUrl = existing.rows[0].photo_url;
    if (oldUrl && oldUrl.startsWith('/uploads/athlete-photos/')) {
      const oldPath = path.resolve(process.env.UPLOAD_DIR || '../uploads', 'athlete-photos', path.basename(oldUrl));
      fs.unlink(oldPath, () => {});
    }

    const updated = await query(
      `UPDATE athletes SET photo_url = $1, updated_at = NOW()
       WHERE id = $2 AND workspace_id = ANY($3)
       RETURNING *`,
      [photoUrl, req.params.id, workspaceIds]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Athlete photo upload error:', err);
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Failed to upload athlete photo' });
  }
});

// DELETE /api/athletes/:id/photo — remove foto do atleta
router.delete('/:id/photo', async (req, res) => {
  try {
    if (!req.user.can('athletes:edit')) return res.status(403).json({ error: 'Sem permissão pra editar atletas' });
    const workspaceIds = req.user.workspaceIds || [];
    const existing = await query(
      'SELECT id, photo_url, category_id FROM athletes WHERE id = $1 AND workspace_id = ANY($2)',
      [req.params.id, workspaceIds]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Athlete not found' });
    if (!req.user.assertCanAccessCategory(existing.rows[0].category_id)) {
      return res.status(403).json({ error: 'Sem acesso a essa categoria' });
    }
    const oldUrl = existing.rows[0].photo_url;
    if (oldUrl && oldUrl.startsWith('/uploads/athlete-photos/')) {
      const oldPath = path.resolve(process.env.UPLOAD_DIR || '../uploads', 'athlete-photos', path.basename(oldUrl));
      fs.unlink(oldPath, () => {});
    }
    const updated = await query(
      `UPDATE athletes SET photo_url = NULL, updated_at = NOW()
       WHERE id = $1 AND workspace_id = ANY($2) RETURNING *`,
      [req.params.id, workspaceIds]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Athlete photo delete error:', err);
    res.status(500).json({ error: 'Failed to delete athlete photo' });
  }
});

// DELETE /api/athletes/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!req.user.can('athletes:edit')) return res.status(403).json({ error: 'Sem permissão pra remover atletas' });
    // checa categoria do atleta antes de remover
    if (Array.isArray(req.user.allowedCategoryIds)) {
      const existing = await query('SELECT category_id FROM athletes WHERE id = $1 AND workspace_id = ANY($2)',
        [req.params.id, req.user.workspaceIds || []]);
      if (existing.rows.length === 0) return res.status(404).json({ error: 'Athlete not found' });
      if (!req.user.assertCanAccessCategory(existing.rows[0].category_id)) {
        return res.status(403).json({ error: 'Sem acesso a essa categoria' });
      }
    }
    const result = await query(
      'DELETE FROM athletes WHERE id = $1 AND workspace_id = ANY($2) RETURNING id',
      [req.params.id, req.user.workspaceIds || []]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Athlete not found' });
    }
    res.json({ message: 'Athlete deleted successfully' });
  } catch (err) {
    console.error('Delete athlete error:', err);
    res.status(500).json({ error: 'Failed to delete athlete' });
  }
});

module.exports = router;
