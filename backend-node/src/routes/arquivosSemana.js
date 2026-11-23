// ARQUIVOS DA SEMANA (23/11/2026, migration 072): material da comissão ligado ao microciclo (não a uma atividade).
// Não entram em estatísticas, relatórios nem minutos.
//   GET    /api/arquivos-semana?week=AAAA-SS&club_id=…   lista (training:view); semana ainda não criada = []
//   POST   /api/arquivos-semana  multipart {week, club_id, file, title?}   (training:edit; cria a semana se preciso)
//   DELETE /api/arquivos-semana/:id                                       (training:edit)
const express = require('express');
const fs = require('fs');
const { query } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { uploadArquivoSemana } = require('../middleware/upload');
const { removeStoredFile } = require('../utils/sessionFiles');

const router = express.Router();
router.use(authMiddleware);

const MAX_ARQUIVOS = 30;
const SEMANA = /^\d{4}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

async function microcicloDe(user, week, clubId) {
  const r = await query(
    `SELECT id, workspace_id FROM training_microcycles WHERE week_identifier = $1 AND club_id = $2 AND workspace_id = ANY($3)
      ORDER BY created_at LIMIT 1`, [week, clubId, user.workspaceIds || []]);
  return r.rows[0] || null;
}

router.get('/', async (req, res) => {
  try {
    if (!req.user.can('training:view')) return res.status(403).json({ error: 'Sem permissão' });
    const { week, club_id: clubId } = req.query;
    if (!SEMANA.test(String(week || '')) || !UUID.test(String(clubId || ''))) return res.status(400).json({ error: 'Semana inválida' });
    const mc = await microcicloDe(req.user, week, clubId);
    if (!mc) return res.json({ data: [] });
    const r = await query(
      `SELECT f.id, f.title, f.file_path AS url, f.file_name, f.file_size, f.mime_type, f.created_at, u.name AS enviado_por
         FROM training_microcycle_files f LEFT JOIN users u ON u.id = f.created_by
        WHERE f.microcycle_id = $1 ORDER BY f.created_at`, [mc.id]);
    res.json({ data: r.rows });
  } catch (err) {
    console.error('Arquivos semana list error:', err);
    res.status(500).json({ error: 'Falha ao carregar os arquivos da semana' });
  }
});

router.post('/', (req, res) => {
  if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
  uploadArquivoSemana(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo maior que 50 MB.' : err.message });
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const recusar = (status, error) => { try { fs.unlinkSync(req.file.path); } catch { /* já não existe */ } return res.status(status).json({ error }); };
    try {
      const week = String(req.body.week || '');
      const clubId = String(req.body.club_id || '');
      if (!SEMANA.test(week) || !UUID.test(clubId)) return recusar(400, 'Semana inválida');
      const mc = await microcicloDe(req.user, week, clubId);
      if (!mc) return recusar(404, 'Semana não encontrada. Abra a semana na Programação antes.');
      if (!req.user.canWriteWorkspace(mc.workspace_id)) return recusar(403, 'Sem permissão de escrita');
      const n = await query('SELECT count(*)::int AS n FROM training_microcycle_files WHERE microcycle_id = $1', [mc.id]);
      if (n.rows[0].n >= MAX_ARQUIVOS) return recusar(409, `Máximo de ${MAX_ARQUIVOS} arquivos por semana`);
      const nome = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      const titulo = String(req.body.title || '').replace(/\s+/g, ' ').trim().slice(0, 255) || nome;
      const r = await query(
        `INSERT INTO training_microcycle_files (microcycle_id, workspace_id, title, file_path, file_name, file_size, mime_type, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, title, file_path AS url, file_name, file_size, mime_type, created_at`,
        [mc.id, mc.workspace_id, titulo, `/uploads/semana-files/${req.file.filename}`, nome, req.file.size, req.file.mimetype, req.user.id || null]);
      res.status(201).json(r.rows[0]);
    } catch (e) {
      console.error('Arquivos semana upload error:', e);
      recusar(500, 'Falha ao enviar o arquivo');
    }
  });
});

router.delete('/:id', async (req, res) => {
  try {
    if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'id inválido' });
    const r = await query(
      `DELETE FROM training_microcycle_files WHERE id = $1 AND workspace_id = ANY($2) RETURNING file_path, workspace_id`,
      [req.params.id, req.user.workspaceIds || []]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Arquivo não encontrado' });
    removeStoredFile(r.rows[0].file_path);
    res.json({ ok: true });
  } catch (err) {
    console.error('Arquivos semana delete error:', err);
    res.status(500).json({ error: 'Falha ao excluir o arquivo' });
  }
});

module.exports = router;
