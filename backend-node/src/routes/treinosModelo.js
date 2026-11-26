// SESSÕES SALVAS / modelos de treino (21/11/2026, migration 070): o treino inteiro de um dia (os 6 blocos com a
// atividade de cada um) guardado no catálogo para reaplicar em outro dia. Da CONTA (workspace ativa), como o
// resto da biblioteca. Anexos (fotos/arquivos) não vão para o modelo.
//   GET    /api/treinos-modelo                 lista (training:view)
//   POST   /api/treinos-modelo {nome, session_id}            salva o treino desse período (training:edit)
//   PATCH  /api/treinos-modelo/:id {nome, descricao?}         renomear (training:edit)
//   DELETE /api/treinos-modelo/:id                            (training:edit)
//   POST   /api/treinos-modelo/:id/aplicar {session_id, substituir?}
//          preenche o treino do período; se ele já tem atividades e substituir != true → 409 TEM_ATIVIDADES
const express = require('express');
const { query, pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { createActivity, updateActivity } = require('./activities');
const { ehBlocoGoleiro, ehBlocoAtivacao } = require('../services/periodos');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MAX_FILES_PER_ACTIVITY, removeStoredFile } = require('../utils/sessionFiles');

// MÍDIAS (23/11/2026): a sessão salva guarda uma CÓPIA dos anexos de cada atividade (foto, vídeo, PDF), para não
// depender do treino de origem (apagar o anexo lá não quebra o modelo). Ao usar, cada anexo é copiado de novo para a
// atividade do dia (até MAX_FILES_PER_ACTIVITY). Excluir a sessão salva apaga as cópias dela.
function uploadRoot() { return path.resolve(process.env.UPLOAD_DIR || '../uploads'); }
function copiarArquivo(filePath) {
  const rel = String(filePath || '').replace(/^\/?uploads\//, '');
  const root = uploadRoot();
  const origem = path.resolve(root, rel);
  if (!origem.startsWith(root + path.sep) || !fs.existsSync(origem)) return null;
  const nome = `${crypto.randomUUID()}${path.extname(origem).toLowerCase()}`;
  fs.mkdirSync(path.join(root, 'session-files'), { recursive: true });
  fs.copyFileSync(origem, path.join(root, 'session-files', nome));
  return `/uploads/session-files/${nome}`;
}
const anexosDoModelo = (blocos) => (blocos || []).flatMap((b) => b.atividade?.anexos || []);

const router = express.Router();
router.use(authMiddleware);

const UUID = /^[0-9a-f-]{36}$/i;

// Período (sessão) da conta ativa, com os blocos e a atividade de cada um
async function carregarSessao(client, sessionId, workspaceIds) {
  const s = await client.query(
    `SELECT s.id, s.session_type, s.workspace_id, s.date, s.periodo FROM training_sessions s WHERE s.id = $1 AND s.workspace_id = ANY($2)`,
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

// GET — modelos da conta (com as mídias de cada bloco: url, tipo image|video|application, nome), com o resumo de cada bloco (título/conteúdo/minutos) para a lista
router.get('/', async (req, res) => {
  try {
    if (!req.user.can('training:view')) return res.status(403).json({ error: 'Sem permissão' });
    const ws = req.user.workspaceId;
    if (!ws) return res.json({ data: [] });
    const r = await query(
      `SELECT m.id, m.nome, m.descricao, m.blocos, m.created_at, to_char(m.origem_data, 'YYYY-MM-DD') AS origem_data, m.origem_periodo, u.name AS criado_por
         FROM treinos_modelo m LEFT JOIN users u ON u.id = m.created_by
        WHERE m.workspace_id = $1 ORDER BY COALESCE(m.origem_data, m.created_at::date) DESC, m.origem_periodo DESC NULLS LAST, m.created_at DESC`, [ws]); // pelo dia do treino (26/11)
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
          midias: (b.atividade?.anexos || []).map((a) => ({ url: a.file_path, tipo: String(a.mime_type || '').split('/')[0], nome: a.title || a.file_name })),
        }));
        return {
          id: m.id, nome: m.nome, descricao: m.descricao, criado_por: m.criado_por, created_at: m.created_at,
          origem_data: m.origem_data || null, origem_periodo: m.origem_periodo || null, // treino de onde a sessão foi salva
          // atividades = Atividade 1–4 (ativação e treino de goleiro não entram, igual às Estatísticas)
          midias: blocos.reduce((t, b) => t + b.midias.length, 0),
          blocos, atividades: blocos.filter((b) => (b.titulo || b.conteudo || b.minutos || b.descricao) && !ehBlocoGoleiro(b.nome) && !ehBlocoAtivacao(b.nome)).length,
          // treino de goleiro é paralelo: fora do total (como na Programação)
          minutos: blocos.reduce((t, b) => t + (ehBlocoGoleiro(b.nome) ? 0 : b.minutos), 0),
          goleiro: blocos.reduce((t, b) => t + (ehBlocoGoleiro(b.nome) ? b.minutos : 0), 0),
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
    // mídias de cada atividade (cópia própria do modelo)
    const ids = s.blocos.filter((b) => b.activity_id).map((b) => b.activity_id);
    const arqs = ids.length ? (await client.query(
      `SELECT activity_id, title, file_path, file_name, file_size, mime_type FROM training_activity_files
        WHERE activity_id = ANY($1) ORDER BY created_at`, [ids])).rows : [];
    for (const b of blocos) {
      if (!b.atividade) continue;
      const origem = s.blocos.find((x) => x.order === b.ordem)?.activity_id;
      const anexos = [];
      for (const f of arqs.filter((x) => x.activity_id === origem)) {
        const copia = copiarArquivo(f.file_path);
        if (copia) anexos.push({ file_path: copia, file_name: f.file_name, file_size: Number(f.file_size) || null, mime_type: f.mime_type, title: f.title });
      }
      if (anexos.length) b.atividade.anexos = anexos;
    }
    const r = await client.query(
      `INSERT INTO treinos_modelo (workspace_id, nome, descricao, blocos, created_by, origem_session_id, origem_data, origem_periodo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, nome`,
      [s.workspace_id, nome, String(req.body?.descricao || '').trim().slice(0, 500) || null, JSON.stringify(blocos), req.user.id,
        s.id, s.date, s.periodo || null]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('Treinos modelo save error:', err);
    res.status(500).json({ error: 'Falha ao salvar o modelo' });
  } finally {
    client.release();
  }
});

// PATCH — renomear (e descrição)
router.patch('/:id', async (req, res) => {
  try {
    if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'id inválido' });
    const nome = String(req.body?.nome || '').trim().slice(0, 80);
    if (!nome) return res.status(400).json({ error: 'Dê um nome à sessão' });
    const temDesc = Object.prototype.hasOwnProperty.call(req.body || {}, 'descricao');
    const desc = String(req.body?.descricao || '').trim().slice(0, 500) || null;
    const r = await query(
      `UPDATE treinos_modelo SET nome = $1, descricao = CASE WHEN $4 THEN $2 ELSE descricao END
        WHERE id = $3 AND workspace_id = ANY($5) RETURNING id, nome, descricao`,
      [nome, desc, req.params.id, temDesc, req.user.workspaceIds || []]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Sessão não encontrada' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Treinos modelo rename error:', err);
    res.status(500).json({ error: 'Falha ao renomear' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!req.user.can('training:edit')) return res.status(403).json({ error: 'Sem permissão pra editar treinos' });
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'id inválido' });
    const r = await query('DELETE FROM treinos_modelo WHERE id = $1 AND workspace_id = ANY($2) RETURNING id, blocos', [req.params.id, req.user.workspaceIds || []]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Modelo não encontrado' });
    for (const a of anexosDoModelo(r.rows[0].blocos)) removeStoredFile(a.file_path);
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
  const copiados = []; // arquivos copiados nesta aplicação (desfeitos se der erro)
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
        const at = alvo.activity_id
          ? await updateActivity(client, alvo.activity_id, dados, s.workspace_id)
          : await createActivity(client, dados, s.workspace_id);
        const atId = at?.id || alvo.activity_id;
        const anexos = b.atividade.anexos || [];
        if (atId && anexos.length) {
          const ja = (await client.query('SELECT count(*)::int AS n FROM training_activity_files WHERE activity_id = $1', [atId])).rows[0].n;
          for (const f of anexos.slice(0, Math.max(0, MAX_FILES_PER_ACTIVITY - ja))) {
            const copia = copiarArquivo(f.file_path);
            if (!copia) continue;
            copiados.push(copia);
            await client.query(
              `INSERT INTO training_activity_files (session_id, activity_id, title, file_path, url, file_name, file_size, mime_type, workspace_id)
               VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8)`,
              [s.id, atId, f.title || f.file_name, copia, f.file_name, f.file_size, f.mime_type, s.workspace_id]);
          }
        }
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
    for (const c of copiados) removeStoredFile(c);
    console.error('Treinos modelo apply error:', err);
    res.status(500).json({ error: 'Falha ao aplicar o modelo' });
  } finally {
    client.release();
  }
});

module.exports = router;
