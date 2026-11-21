// SESSÕES SALVAS / modelos de treino (21/11/2026, migration 070): o treino inteiro de um dia (os 6 blocos com a
// atividade de cada um) guardado no catálogo para reaplicar em outro dia. Da CONTA (workspace ativa), como o
// resto da biblioteca. Anexos (fotos/arquivos) não vão para o modelo.
//   GET    /api/treinos-modelo                 lista (training:view)
//   POST   /api/treinos-modelo {nome, session_id}            salva o treino desse período (training:edit)
//   DELETE /api/treinos-modelo/:id                            (training:edit)
//   POST   /api/treinos-modelo/:id/aplicar {session_id, substituir?}
//          preenche o treino do período; se ele já tem atividades e substituir != true → 409 TEM_ATIVIDADES
const express = require('express');
const { query, pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { createActivity, updateActivity } = require('./activities');

const router = express.Router();
router.use(authMiddleware);

const UUID = /^[0-9a-f-]{36}$/i;

// Período (sessão) da conta ativa, com os blocos e a atividade de cada um
async function carregarSessao(client, sessionId, workspaceIds) {
  const s = await client.query(
    `SELECT s.id, s.session_type, s.workspace_id FROM training_sessions s WHERE s.id = $1 AND s.workspace_id = ANY($2)`,
    [sessionId, workspaceIds || []]);
  if (!s.rows[0]) return null;
  const b = await client.query(
    `SELECT b.id AS block_id, b.name, b."order", a.id AS activity_id, a.title_id, a.description, a.duration_minutes, a.groups, a.is_rest,
            (SELECT tc.content_id FROM training_activity_contents tc WHERE tc.activity_id = a.id LIMIT 1) AS content_id,
            (SELECT COALESCE(json_agg(st.stage_id ORDER BY st."order") FILTER (WHERE st.stage_id IS NOT NULL), '[]')
               FROM training_activity_stages st WHERE st.activity_id = a.id) AS stages
       FROM training_activity_blocks b
       LEFT JOIN training_activities a ON a.block_id = b.id
      WHERE b.session_id = $1
      ORDER BY b."order"`, [sessionId]);
  return { ...s.rows[0], blocos: b.rows };
}

const vazia = (a) => !a.title_id && !a.content_id && !(Number(a.duration_minutes) > 0) && !String(a.description || '').trim();

// GET — modelos da conta, com o resumo de cada bloco (título/conteúdo/minutos) para a lista
router.get('/', async (req, res) => {
  try {
    if (!req.user.can('training:view')) return res.status(403).json({ error: 'Sem permissão' });
    const ws = req.user.workspaceId;
    if (!ws) return res.json({ data: [] });
    const r = await query(
      `SELECT m.id, m.nome, m.descricao, m.blocos, m.created_at, u.name AS criado_por
         FROM treinos_modelo m LEFT JOIN users u ON u.id = m.created_by
        WHERE m.workspace_id = $1 ORDER BY m.nome`, [ws]);
    // nomes dos títulos e conteúdos para o resumo
    const titulos = new Set();
    const conteudos = new Set();
    for (const m of r.rows) for (const b of m.blocos || []) {
      if (b.atividade?.title_id) titulos.add(b.atividade.title_id);
      if (b.atividade?.content_id) conteudos.add(b.atividade.content_id);
    }
    const nomesT = new Map(titulos.size ? (await query('SELECT id, title FROM activity_titles WHERE id = ANY($1)', [[...titulos]])).rows.map((x) => [x.id, x.title]) : []);
    const nomesC = new Map(conteudos.size ? (await query('SELECT id, name, dimension FROM contents WHERE id = ANY($1)', [[...conteudos]])).rows.map((x) => [x.id, x]) : []);
    res.json({
      data: r.rows.map((m) => {
        const blocos = (m.blocos || []).map((b) => ({
          ordem: b.ordem,
          nome: b.nome,
          titulo: b.atividade ? (nomesT.get(b.atividade.title_id) || null) : null,
          conteudo: b.atividade?.content_id ? (nomesC.get(b.atividade.content_id)?.name || null) : null,
          pilar: b.atividade?.content_id ? (nomesC.get(b.atividade.content_id)?.dimension || null) : null,
          minutos: Number(b.atividade?.duration_minutes) || 0,
          descricao: b.atividade?.description || null,
        }));
        return {
          id: m.id, nome: m.nome, descricao: m.descricao, criado_por: m.criado_por, created_at: m.created_at,
          blocos, atividades: blocos.filter((b) => b.titulo || b.conteudo || b.minutos || b.descricao).length,
          minutos: blocos.reduce((t, b) => t + b.minutos, 0),
        };
      }),
    });
  } catch (err) {
    console.error('Treinos modelo list error:', err);
    res.status(500).json({ error: 'Falha ao carregar as sessões salvas' });
  }
});

// POST — salva o treino de um período como modelo
router.post('/', async (req, res) => {
  if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
  const nome = String(req.body?.nome || '').trim().slice(0, 80);
  const sessionId = String(req.body?.session_id || '');
  if (!nome) return res.status(400).json({ error: 'Dê um nome ao modelo' });
  if (!UUID.test(sessionId)) return res.status(400).json({ error: 'session_id inválido' });
  const client = await pool.connect();
  try {
    const s = await carregarSessao(client, sessionId, req.user.workspaceIds);
    if (!s) return res.status(404).json({ error: 'Treino não encontrado' });
    if ((s.session_type || 'training') !== 'training') return res.status(400).json({ error: 'Só treino vira modelo' });
    const blocos = s.blocos.map((b) => ({
      ordem: b.order,
      nome: b.name,
      atividade: b.activity_id && !vazia(b) ? {
        title_id: b.title_id || null,
        description: b.description || null,
        duration_minutes: b.duration_minutes || null,
        groups: Array.isArray(b.groups) ? b.groups : [],
        is_rest: !!b.is_rest,
        content_id: b.content_id || null,
        selectedStages: Array.isArray(b.stages) ? b.stages : [],
      } : null,
    }));
    if (!blocos.some((b) => b.atividade)) return res.status(400).json({ error: 'Esse treino ainda não tem atividades' });
    const r = await client.query(
      `INSERT INTO treinos_modelo (workspace_id, nome, descricao, blocos, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, nome`,
      [s.workspace_id, nome, String(req.body?.descricao || '').trim().slice(0, 500) || null, JSON.stringify(blocos), req.user.id]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('Treinos modelo save error:', err);
    res.status(500).json({ error: 'Falha ao salvar o modelo' });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'id inválido' });
    const r = await query('DELETE FROM treinos_modelo WHERE id = $1 AND workspace_id = ANY($2) RETURNING id', [req.params.id, req.user.workspaceIds || []]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Modelo não encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Treinos modelo delete error:', err);
    res.status(500).json({ error: 'Falha ao excluir o modelo' });
  }
});

// POST /:id/aplicar — preenche o treino do período com o modelo (bloco a bloco, pela posição)
router.post('/:id/aplicar', async (req, res) => {
  if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
  const sessionId = String(req.body?.session_id || '');
  if (!UUID.test(req.params.id) || !UUID.test(sessionId)) return res.status(400).json({ error: 'Dados inválidos' });
  const client = await pool.connect();
  try {
    const m = await client.query('SELECT blocos FROM treinos_modelo WHERE id = $1 AND workspace_id = ANY($2)', [req.params.id, req.user.workspaceIds || []]);
    if (!m.rows[0]) return res.status(404).json({ error: 'Modelo não encontrado' });
    const s = await carregarSessao(client, sessionId, req.user.workspaceIds);
    if (!s) return res.status(404).json({ error: 'Treino não encontrado' });
    if ((s.session_type || 'training') !== 'training') return res.status(400).json({ error: 'O modelo só entra em dia de treino' });
    const comAtividade = s.blocos.filter((b) => b.activity_id && !vazia(b)).length;
    if (comAtividade && req.body?.substituir !== true) {
      return res.status(409).json({ error: `Esse treino já tem ${comAtividade} ${comAtividade === 1 ? 'atividade' : 'atividades'}.`, code: 'TEM_ATIVIDADES', atividades: comAtividade });
    }
    await client.query('BEGIN');
    const modelo = m.rows[0].blocos || [];
    for (const alvo of s.blocos) {
      const b = modelo.find((x) => Number(x.ordem) === Number(alvo.order));
      const dados = b?.atividade ? { ...b.atividade, block_id: alvo.block_id } : null;
      if (dados) {
        if (alvo.activity_id) await updateActivity(client, alvo.activity_id, dados, s.workspace_id);
        else await createActivity(client, dados, s.workspace_id);
      } else if (alvo.activity_id) {
        // o modelo não tem esse bloco: a atividade que estava some — só se não tiver anexo
        const anexos = await client.query('SELECT 1 FROM training_activity_files WHERE activity_id = $1 LIMIT 1', [alvo.activity_id]);
        if (!anexos.rows.length) await client.query('DELETE FROM training_activities WHERE id = $1', [alvo.activity_id]);
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Treinos modelo apply error:', err);
    res.status(500).json({ error: 'Falha ao aplicar o modelo' });
  } finally {
    client.release();
  }
});

module.exports = router;
