// Análise do jogo em VÍDEO (migration 065) — /api/video-analise
//   GET    /:sessionId                 → { meta, lances, tags, tags_padrao, adversario: [{numero,nome}], duracao }
//   PUT    /:sessionId/meta            { arquivo_nome, duracao_ms, inicio1_ms, inicio2_ms }
//   POST   /:sessionId/lances          lance → { lance }
//   PATCH  /:sessionId/lances/:id      lance (completo) → { lance }
//   DELETE /:sessionId/lances/:id
//   PUT    /:sessionId/tags            { tags: [{nome, cor}] } → tags do CLUBE do jogo ([] volta ao padrão)
// Ler: games:view. Escrever: games:edit + escrita na workspace do jogo. O arquivo de vídeo nunca vem para cá.
const express = require('express');
const { query } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const AV = require('../services/analiseVideo');
const analise = require('../services/analiseAdversario');

const router = express.Router();
router.use(authMiddleware);

const UUID = /^[0-9a-f-]{36}$/i;

async function jogo(req, res, escrever = false) {
  if (!req.user.can(escrever ? 'games:edit' : 'games:view')) { res.status(403).json({ error: 'Sem permissão' }); return null; }
  if (!UUID.test(req.params.sessionId || '')) { res.status(404).json({ error: 'Jogo não encontrado' }); return null; }
  const r = await query(
    `SELECT s.id, s.workspace_id, s.match_duration, COALESCE(m.club_id, s.club_id) AS club_id
       FROM training_sessions s LEFT JOIN training_microcycles m ON m.id = s.microcycle_id
      WHERE s.id = $1 AND s.workspace_id = ANY($2) AND s.session_type = 'match'`,
    [req.params.sessionId, req.user.workspaceIds || []],
  );
  const j = r.rows[0];
  if (!j) { res.status(404).json({ error: 'Jogo não encontrado' }); return null; }
  if (escrever && !req.user.canWriteWorkspace(j.workspace_id)) { res.status(403).json({ error: 'Sem permissão de escrita' }); return null; }
  return j;
}

const COLUNAS = 'id, tag_nome, tag_cor, equipe, athlete_id, adv_numero, adv_nome, inicio_ms, fim_ms, observacao, lancado, created_at';

async function tagsDoClube(clubId) {
  if (!clubId) return [];
  const r = await query('SELECT nome, cor FROM video_tags WHERE club_id = $1 ORDER BY ordem, created_at', [clubId]);
  return r.rows;
}

router.get('/:sessionId', async (req, res) => {
  try {
    const j = await jogo(req, res);
    if (!j) return;
    const [meta, lances, tags, adv] = await Promise.all([
      query('SELECT arquivo_nome, duracao_ms, inicio1_ms, inicio2_ms FROM match_video_meta WHERE session_id = $1', [j.id]),
      query(`SELECT ${COLUNAS} FROM match_video_clips WHERE session_id = $1 ORDER BY inicio_ms, created_at`, [j.id]),
      tagsDoClube(j.club_id),
      query('SELECT data FROM opponent_analyses WHERE session_id = $1', [j.id]),
    ]);
    // jogadores do adversário: os da provável escalação da análise do adversário (se houver)
    const esc = analise.normalizar(adv.rows[0]?.data || {}).escalacao;
    const adversario = esc.jogadores.map((p) => ({ numero: p.numero, nome: p.nome, vaga: p.vaga }));
    res.set('Cache-Control', 'no-store').json({
      meta: meta.rows[0] || null,
      lances: lances.rows,
      tags: tags.length ? tags : AV.TAGS_PADRAO,
      tags_personalizadas: tags.length > 0,
      tags_padrao: AV.TAGS_PADRAO,
      adversario,
      adversario_formacao: esc.formacao || '',
      duracao: j.match_duration || 90,
    });
  } catch (err) {
    console.error('video-analise get:', err);
    res.status(500).json({ error: 'Não foi possível abrir a análise de vídeo.' });
  }
});

router.put('/:sessionId/meta', async (req, res) => {
  try {
    const j = await jogo(req, res, true);
    if (!j) return;
    const m = AV.normalizarMeta(req.body);
    const r = await query(
      `INSERT INTO match_video_meta (session_id, workspace_id, arquivo_nome, duracao_ms, inicio1_ms, inicio2_ms)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_id) DO UPDATE SET arquivo_nome = EXCLUDED.arquivo_nome, duracao_ms = EXCLUDED.duracao_ms,
         inicio1_ms = EXCLUDED.inicio1_ms, inicio2_ms = EXCLUDED.inicio2_ms, updated_at = NOW()
       RETURNING arquivo_nome, duracao_ms, inicio1_ms, inicio2_ms`,
      [j.id, j.workspace_id, m.arquivo_nome, m.duracao_ms, m.inicio1_ms, m.inicio2_ms],
    );
    res.json({ meta: r.rows[0] });
  } catch (err) {
    console.error('video-analise meta:', err);
    res.status(500).json({ error: 'Não foi possível salvar.' });
  }
});

// atleta do lance tem de ser do mesmo workspace
async function atletaValido(athleteId, workspaceId) {
  if (!athleteId) return true;
  const r = await query('SELECT 1 FROM athletes WHERE id = $1 AND workspace_id = $2', [athleteId, workspaceId]);
  return r.rows.length > 0;
}

router.post('/:sessionId/lances', async (req, res) => {
  try {
    const j = await jogo(req, res, true);
    if (!j) return;
    const l = AV.normalizarLance(req.body);
    if (l.erro) return res.status(400).json({ error: l.erro });
    if (!(await atletaValido(l.athlete_id, j.workspace_id))) return res.status(400).json({ error: 'Atleta inválido.' });
    const n = await query('SELECT count(*)::int AS n FROM match_video_clips WHERE session_id = $1', [j.id]);
    if (n.rows[0].n >= AV.MAX_LANCES) return res.status(400).json({ error: `Limite de ${AV.MAX_LANCES} lances por jogo.` });
    const r = await query(
      `INSERT INTO match_video_clips (session_id, workspace_id, tag_nome, tag_cor, equipe, athlete_id, adv_numero, adv_nome,
                                      inicio_ms, fim_ms, observacao, lancado, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${COLUNAS}`,
      [j.id, j.workspace_id, l.tag_nome, l.tag_cor, l.equipe, l.athlete_id, l.adv_numero, l.adv_nome,
        l.inicio_ms, l.fim_ms, l.observacao, l.lancado, req.user.id || null],
    );
    res.status(201).json({ lance: r.rows[0] });
  } catch (err) {
    console.error('video-analise lance novo:', err);
    res.status(500).json({ error: 'Não foi possível salvar o lance.' });
  }
});

router.patch('/:sessionId/lances/:id', async (req, res) => {
  try {
    const j = await jogo(req, res, true);
    if (!j) return;
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Lance não encontrado' });
    const l = AV.normalizarLance(req.body);
    if (l.erro) return res.status(400).json({ error: l.erro });
    if (!(await atletaValido(l.athlete_id, j.workspace_id))) return res.status(400).json({ error: 'Atleta inválido.' });
    const r = await query(
      `UPDATE match_video_clips SET tag_nome=$3, tag_cor=$4, equipe=$5, athlete_id=$6, adv_numero=$7, adv_nome=$8,
              inicio_ms=$9, fim_ms=$10, observacao=$11, lancado=$12, updated_at=NOW()
        WHERE id = $1 AND session_id = $2 RETURNING ${COLUNAS}`,
      [req.params.id, j.id, l.tag_nome, l.tag_cor, l.equipe, l.athlete_id, l.adv_numero, l.adv_nome,
        l.inicio_ms, l.fim_ms, l.observacao, l.lancado],
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Lance não encontrado' });
    res.json({ lance: r.rows[0] });
  } catch (err) {
    console.error('video-analise lance editar:', err);
    res.status(500).json({ error: 'Não foi possível salvar o lance.' });
  }
});

router.delete('/:sessionId/lances/:id', async (req, res) => {
  try {
    const j = await jogo(req, res, true);
    if (!j) return;
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Lance não encontrado' });
    const r = await query('DELETE FROM match_video_clips WHERE id = $1 AND session_id = $2', [req.params.id, j.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Lance não encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('video-analise lance apagar:', err);
    res.status(500).json({ error: 'Não foi possível apagar o lance.' });
  }
});

router.put('/:sessionId/tags', async (req, res) => {
  try {
    const j = await jogo(req, res, true);
    if (!j) return;
    if (!j.club_id) return res.status(400).json({ error: 'Jogo sem clube.' });
    const tags = AV.normalizarTags(req.body?.tags);
    await query('DELETE FROM video_tags WHERE club_id = $1 AND workspace_id = $2', [j.club_id, j.workspace_id]);
    for (const [i, t] of tags.entries()) {
      await query('INSERT INTO video_tags (workspace_id, club_id, nome, cor, ordem) VALUES ($1,$2,$3,$4,$5)', [j.workspace_id, j.club_id, t.nome, t.cor, i]);
    }
    res.json({ tags: tags.length ? tags : AV.TAGS_PADRAO, tags_personalizadas: tags.length > 0 });
  } catch (err) {
    console.error('video-analise tags:', err);
    res.status(500).json({ error: 'Não foi possível salvar as tags.' });
  }
});

module.exports = router;
