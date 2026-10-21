const express = require('express');
const fs = require('fs');
const { query } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { uploadSessionFile } = require('../middleware/upload');
const { MAX_FILES_PER_ACTIVITY, removeStoredFile } = require('../utils/sessionFiles');
const { clubesArquivados, mensagemArquivado } = require('../utils/clubArquivado');

const router = express.Router();

router.use(authMiddleware);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Contexto da ATIVIDADE dona do anexo: workspace, sessão (derivada), categoria.
// Anexos são por atividade (bloco) desde 21/10/2026 — session_id é derivado daqui.
async function activityContext(activityId, workspaceIds) {
  if (!activityId || !UUID_RE.test(String(activityId))) return null;
  const r = await query(
    `SELECT a.id AS activity_id, a.workspace_id, b.session_id, b.name AS block_name,
            m.category_id, m.club_id
       FROM training_activities a
       JOIN training_activity_blocks b ON b.id = a.block_id
       JOIN training_sessions s ON s.id = b.session_id
       JOIN training_microcycles m ON m.id = s.microcycle_id
      WHERE a.id = $1 AND a.workspace_id = ANY($2)`,
    [activityId, workspaceIds]
  );
  return r.rows[0] || null;
}

// Pode escrever nos anexos dessa atividade? (workspace não-viewer + categoria)
function canWriteActivity(user, ctx) {
  if (!ctx) return false;
  if (!user.canWriteWorkspace(ctx.workspace_id)) return false;
  if (ctx.category_id && !user.assertCanAccessCategory(ctx.category_id)) return false;
  return true;
}

// POST /api/files/upload  (multipart: file, activity_id, title)
router.post('/upload', (req, res) => {
  if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra enviar arquivos' });
  uploadSessionFile(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // Qualquer recusa daqui pra baixo apaga o arquivo que o multer já gravou.
    const recusar = (status, error) => {
      try { fs.unlinkSync(req.file.path); } catch { /* já não existe */ }
      return res.status(status).json({ error });
    };

    try {
      const { activity_id, title } = req.body;
      if (!activity_id) return recusar(400, 'activity_id é obrigatório: o anexo pertence a uma atividade');

      const ctx = await activityContext(activity_id, req.user.workspaceIds || []);
      if (!ctx) return recusar(404, 'Atividade não encontrada');
      if (!canWriteActivity(req.user, ctx)) return recusar(403, 'Sem permissão de escrita nesta atividade');
      // Clube arquivado = só leitura (o corpo multipart só existe aqui, depois do multer).
      const arquivado = (await clubesArquivados([ctx.club_id]))[0];
      if (arquivado) return recusar(409, mensagemArquivado(arquivado.name));

      const count = await query(
        'SELECT COUNT(*)::int AS n FROM training_activity_files WHERE activity_id = $1',
        [ctx.activity_id]
      );
      if ((count.rows[0]?.n || 0) >= MAX_FILES_PER_ACTIVITY) {
        return recusar(409, `Máximo de ${MAX_FILES_PER_ACTIVITY} anexos por atividade`);
      }

      const filePath = `/uploads/session-files/${req.file.filename}`;
      const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      const cleanTitle = String(title || '').trim().slice(0, 255) || originalName;
      const result = await query(
        `INSERT INTO training_activity_files (session_id, activity_id, title, file_path, url, file_name, file_size, mime_type, workspace_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [ctx.session_id, ctx.activity_id, cleanTitle, filePath, filePath, originalName, req.file.size, req.file.mimetype, ctx.workspace_id]
      );

      res.status(201).json(result.rows[0]);
    } catch (dbErr) {
      console.error('Upload file DB error:', dbErr);
      return recusar(500, 'Failed to save file record');
    }
  });
});

// Ensure file records always have url populated (fallback to file_path)
function normalizeFileRow(row) {
  if (row && !row.url && row.file_path) {
    row.url = row.file_path;
  }
  return row;
}

// GET /api/files/session/:sessionId
router.get('/session/:sessionId', async (req, res) => {
  try {
    // Cada linha traz activity_id + block_id/block_name: o front distribui por aba.
    const result = await query(
      `SELECT f.*, a.block_id, b.name AS block_name, b."order" AS block_order
         FROM training_activity_files f
         LEFT JOIN training_activities a ON a.id = f.activity_id
         LEFT JOIN training_activity_blocks b ON b.id = a.block_id
        WHERE f.session_id = $1 AND f.workspace_id = ANY($2)
        ORDER BY b."order" NULLS LAST, f.created_at ASC`,
      [req.params.sessionId, req.user.workspaceIds || []]
    );
    res.json(result.rows.map(normalizeFileRow));
  } catch (err) {
    console.error('List session files error:', err);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// GET /api/files/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM training_activity_files WHERE id = $1 AND workspace_id = ANY($2)',
      [req.params.id, req.user.workspaceIds || []]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.json(normalizeFileRow(result.rows[0]));
  } catch (err) {
    console.error('Get file error:', err);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

// PATCH /api/files/:id  { title } — renomeia o anexo
router.patch('/:id', async (req, res) => {
  try {
    if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão' });
    const title = String(req.body?.title || '').trim().slice(0, 255);
    if (!title) return res.status(400).json({ error: 'Título obrigatório' });
    const found = await query(
      'SELECT id, activity_id FROM training_activity_files WHERE id = $1 AND workspace_id = ANY($2)',
      [req.params.id, req.user.workspaceIds || []]
    );
    if (found.rows.length === 0) return res.status(404).json({ error: 'File not found' });
    const ctx = await activityContext(found.rows[0].activity_id, req.user.workspaceIds || []);
    if (!canWriteActivity(req.user, ctx)) return res.status(403).json({ error: 'Sem permissão de escrita neste arquivo' });
    const result = await query(
      'UPDATE training_activity_files SET title = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [title, req.params.id]
    );
    res.json(normalizeFileRow(result.rows[0]));
  } catch (err) {
    console.error('Rename file error:', err);
    res.status(500).json({ error: 'Failed to rename file' });
  }
});

// DELETE /api/files/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!req.user.can('training:delete')) return res.status(403).json({ error: 'Sem permissão' });
    const workspaceIds = req.user.workspaceIds || [];
    const result = await query(
      `SELECT f.*, m.club_id, m.category_id
         FROM training_activity_files f
         JOIN training_sessions s ON s.id = f.session_id
         JOIN training_microcycles m ON m.id = s.microcycle_id
        WHERE f.id = $1 AND f.workspace_id = ANY($2)`,
      [req.params.id, workspaceIds]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];

    const writableWs = req.user.writableWorkspaceForClub(file.club_id);
    if (!writableWs) return res.status(403).json({ error: 'Sem permissão de escrita neste arquivo' });
    if (file.category_id && !req.user.assertCanAccessCategory(file.category_id)) {
      return res.status(403).json({ error: 'Sem acesso a essa categoria' });
    }

    await query(
      'DELETE FROM training_activity_files WHERE id = $1 AND workspace_id = $2',
      [req.params.id, file.workspace_id]
    );

    removeStoredFile(file.file_path);

    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;
