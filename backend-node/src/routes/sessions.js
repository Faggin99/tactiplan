const express = require('express');
const { query, pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { parseDistanciaKm } = require('../utils/distancia');
const { getSessionDetail } = require('../services/sessionData');
const { removeStoredFile } = require('../utils/sessionFiles');
const P = require('../services/periodos');

const router = express.Router();

router.use(authMiddleware);

// GET /api/sessions/:id
router.get('/:id', async (req, res) => {
  try {
    if (!req.user.can('training:view')) return res.status(403).json({ error: 'Sem permissão' });
    const session = await getSessionDetail(req.params.id, req.user.workspaceIds || []);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    console.error('Get session error:', err);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Linhas do DIA da sessão (todos os períodos): mesma chave do índice único
// (workspace, data, clube). `db` = query ou client da transação; `lock` trava as linhas.
async function linhasDoDia(db, sessionId, workspaceIds, { lock = false } = {}) {
  if (!UUID_RE.test(String(sessionId || ''))) return null;
  const base = await db.query(
    `SELECT s.id, s.workspace_id, s.date, s.club_id, s.microcycle_id, m.category_id
       FROM training_sessions s
       LEFT JOIN training_microcycles m ON m.id = s.microcycle_id
      WHERE s.id = $1 AND s.workspace_id = ANY($2)`,
    [sessionId, workspaceIds || []]
  );
  if (!base.rows.length) return null;
  const b = base.rows[0];
  const dia = await db.query(
    `SELECT id, periodo, session_type, microcycle_id, date, day_name, day_of_week, workspace_id, club_id
       FROM training_sessions
      WHERE workspace_id = $1 AND date = $2 AND club_id IS NOT DISTINCT FROM $3
      ORDER BY ${P.ordemSql()} ASC${lock ? ' FOR UPDATE' : ''}`,
    [b.workspace_id, b.date, b.club_id]
  );
  return { sessao: b, dia: dia.rows };
}

// Escrita no dia: workspace gravável + categoria do membro.
function podeEscrever(req, sessao) {
  if (!req.user.canWriteWorkspace(sessao.workspace_id)) return 'Sem permissão de escrita nesse clube';
  if (sessao.category_id && !req.user.assertCanAccessCategory(sessao.category_id)) return 'Sem acesso a essa categoria';
  return null;
}

// Resposta comum: o dia com cada período detalhado (blocos + atividade).
async function periodosDetalhados(dia, workspaceIds) {
  const out = [];
  for (const s of dia) {
    const d = await getSessionDetail(s.id, workspaceIds);
    if (d) out.push(d);
  }
  return out;
}

// POST /api/sessions/:id/periodos — adiciona um período ao dia da sessão.
// Body: { novo: 'manha'|'tarde'|'noite', atual?: idem (obrigatório quando o dia
// ainda tem 1 período só: dá nome ao treino que já existe) }
router.post('/:id/periodos', async (req, res) => {
  if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
  const workspaceIds = req.user.workspaceIds || [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await linhasDoDia(client, req.params.id, workspaceIds, { lock: true });
    if (!r) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Session not found' }); }
    const proibido = podeEscrever(req, r.sessao);
    if (proibido) { await client.query('ROLLBACK'); return res.status(403).json({ error: proibido }); }
    const tipoNovo = req.body?.tipo || 'training';
    const v = P.validarNovoPeriodo(r.dia, { atual: req.body?.atual || null, novo: req.body?.novo, tipo: tipoNovo });
    if (!v.ok) { await client.query('ROLLBACK'); return res.status(v.status).json({ error: v.erro, code: 'PERIODO_INVALIDO' }); }
    // período de avaliação: a única informação é o tipo de avaliação
    let av = { tipos: null, outra: null };
    if (tipoNovo === 'assessment') {
      const n = P.normalizarAvaliacao({ tipos: req.body?.assessment_types, outra: req.body?.assessment_other });
      if (!n.ok) { await client.query('ROLLBACK'); return res.status(400).json({ error: n.erro, code: 'AVALIACAO_INVALIDA' }); }
      av = { tipos: n.tipos, outra: n.outra };
    }

    if (v.renomearAtual) {
      await client.query('UPDATE training_sessions SET periodo = $1, updated_at = NOW() WHERE id = $2', [v.renomearAtual, r.dia[0].id]);
    }
    const ref = r.dia[0];
    const ins = await client.query(
      `INSERT INTO training_sessions (microcycle_id, date, day_name, day_of_week, workspace_id, club_id, session_type, periodo,
                                      assessment_types, assessment_other)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [ref.microcycle_id, ref.date, ref.day_name, ref.day_of_week, ref.workspace_id, ref.club_id,
        tipoNovo === 'assessment' ? 'assessment' : 'training', v.novo, av.tipos, av.outra]
    );
    const novoId = ins.rows[0].id;
    const { BLOCK_NAMES } = require('./microcycles');
    for (let j = 0; j < BLOCK_NAMES.length; j++) {
      await client.query(
        'INSERT INTO training_activity_blocks (session_id, name, "order") VALUES ($1, $2, $3)',
        [novoId, BLOCK_NAMES[j], j + 1]
      );
    }
    await client.query('COMMIT');

    const depois = await linhasDoDia({ query }, novoId, workspaceIds);
    res.status(201).json({ id: novoId, periodo: v.novo, periodos: await periodosDetalhados(depois.dia, workspaceIds) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ error: 'Esse período já existe no dia.', code: 'PERIODO_INVALIDO' });
    console.error('Add period error:', err);
    res.status(500).json({ error: 'Falha ao adicionar o período' });
  } finally {
    client.release();
  }
});

// PUT /api/sessions/:id/periodo — troca o horário de um período. Body: { periodo }
router.put('/:id/periodo', async (req, res) => {
  try {
    if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
    const workspaceIds = req.user.workspaceIds || [];
    const r = await linhasDoDia({ query }, req.params.id, workspaceIds);
    if (!r) return res.status(404).json({ error: 'Session not found' });
    const proibido = podeEscrever(req, r.sessao);
    if (proibido) return res.status(403).json({ error: proibido });
    const v = P.validarRenomear(r.dia, req.params.id, req.body?.periodo);
    if (!v.ok) return res.status(v.status).json({ error: v.erro, code: 'PERIODO_INVALIDO' });
    await query('UPDATE training_sessions SET periodo = $1, updated_at = NOW() WHERE id = $2', [req.body.periodo, req.params.id]);
    const depois = await linhasDoDia({ query }, req.params.id, workspaceIds);
    res.json({ id: req.params.id, periodo: req.body.periodo, periodos: await periodosDetalhados(depois.dia, workspaceIds) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Esse período já existe no dia.', code: 'PERIODO_INVALIDO' });
    console.error('Rename period error:', err);
    res.status(500).json({ error: 'Falha ao trocar o período' });
  }
});

// DELETE /api/sessions/:id/periodo — remove o período (atividades, anexos e, se
// for o período do jogo, o jogo). Sobrando 1 período, o dia volta a ser único.
router.delete('/:id/periodo', async (req, res) => {
  if (!req.user.can('training:delete')) return res.status(403).json({ error: 'Sem permissão pra apagar treinos' });
  const workspaceIds = req.user.workspaceIds || [];
  const client = await pool.connect();
  let arquivos = [];
  try {
    await client.query('BEGIN');
    const r = await linhasDoDia(client, req.params.id, workspaceIds, { lock: true });
    if (!r) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Session not found' }); }
    const proibido = podeEscrever(req, r.sessao);
    if (proibido) { await client.query('ROLLBACK'); return res.status(403).json({ error: proibido }); }
    const v = P.validarRemocao(r.dia, req.params.id);
    if (!v.ok) { await client.query('ROLLBACK'); return res.status(v.status).json({ error: v.erro, code: 'PERIODO_INVALIDO' }); }

    const f = await client.query(
      `SELECT f.file_path FROM training_activity_files f
        WHERE f.session_id = $1
           OR f.activity_id IN (SELECT a.id FROM training_activities a
                                  JOIN training_activity_blocks b ON b.id = a.block_id
                                 WHERE b.session_id = $1)`,
      [req.params.id]
    );
    arquivos = f.rows.map((x) => x.file_path).filter(Boolean);
    // anexos ligados só pela atividade caem pelo CASCADE da atividade; os do dia, pelo da sessão
    await client.query('DELETE FROM training_activities WHERE block_id IN (SELECT id FROM training_activity_blocks WHERE session_id = $1)', [req.params.id]);
    await client.query('DELETE FROM training_sessions WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    for (const fp of arquivos) removeStoredFile(fp);

    const restante = r.dia.find((s) => s.id !== req.params.id);
    const depois = await linhasDoDia({ query }, restante.id, workspaceIds);
    res.json({ removido: req.params.id, anexos_apagados: arquivos.length, periodos: await periodosDetalhados(depois.dia, workspaceIds) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Remove period error:', err);
    res.status(500).json({ error: 'Falha ao remover o período' });
  } finally {
    client.release();
  }
});

// PUT /api/sessions/:id/type
router.put('/:id/type', async (req, res) => {
  try {
    if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
    const { session_type, opponent_name } = req.body;
    // Avaliação: guarda os tipos (lista fixa + "Outra"); os outros tipos zeram esses campos.
    let av = { tipos: null, outra: null };
    if (session_type === 'assessment') {
      const n = P.normalizarAvaliacao({ tipos: req.body.assessment_types, outra: req.body.assessment_other });
      if (!n.ok) return res.status(400).json({ error: n.erro, code: 'AVALIACAO_INVALIDA' });
      av = { tipos: n.tipos, outra: n.outra };
    }

    // Dia com períodos: descanso é do dia inteiro e só 1 período de jogo por dia.
    const r = await linhasDoDia({ query }, req.params.id, req.user.workspaceIds || []);
    if (r) {
      const v = P.validarTipo(r.dia, req.params.id, session_type || 'training');
      if (!v.ok) return res.status(v.status).json({ error: v.erro, code: 'PERIODO_INVALIDO' });
    }

    const result = await query(
      `UPDATE training_sessions SET session_type = $1, opponent_name = $2,
              assessment_types = $5, assessment_other = $6, updated_at = NOW()
       WHERE id = $3 AND workspace_id = ANY($4)
       RETURNING *`,
      [session_type || null, session_type === 'assessment' ? null : (opponent_name || null), req.params.id, req.user.workspaceIds || [], av.tipos, av.outra]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update session type error:', err);
    res.status(500).json({ error: 'Failed to update session type' });
  }
});

// PUT /api/sessions/:id/distance — distância média por jogador no dia (km)
// Body: { avg_distance_km: number | string ("5,2") | null }
router.put('/:id/distance', async (req, res) => {
  try {
    if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
    const parsed = parseDistanciaKm(req.body?.avg_distance_km);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    const found = await query(
      `SELECT s.id, s.workspace_id, m.category_id
       FROM training_sessions s
       LEFT JOIN training_microcycles m ON m.id = s.microcycle_id
       WHERE s.id = $1 AND s.workspace_id = ANY($2)`,
      [req.params.id, req.user.workspaceIds || []]
    );
    if (found.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    const sess = found.rows[0];
    if (!req.user.canWriteWorkspace(sess.workspace_id)) {
      return res.status(403).json({ error: 'Sem permissão de escrita nesse clube' });
    }
    if (sess.category_id && !req.user.assertCanAccessCategory(sess.category_id)) {
      return res.status(403).json({ error: 'Sem acesso a essa categoria' });
    }

    const result = await query(
      `UPDATE training_sessions SET avg_distance_km = $1, updated_at = NOW()
       WHERE id = $2 AND workspace_id = ANY($3)
       RETURNING id, avg_distance_km`,
      [parsed.value, sess.id, req.user.workspaceIds || []]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    const row = result.rows[0];
    res.json({ id: row.id, avg_distance_km: row.avg_distance_km === null ? null : Number(row.avg_distance_km) });
  } catch (err) {
    console.error('Update session distance error:', err);
    res.status(500).json({ error: 'Failed to update session distance' });
  }
});

module.exports = router;
module.exports.linhasDoDia = linhasDoDia;
