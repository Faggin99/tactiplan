// Clube ARQUIVADO (clubs.archived_at, migration 055) = só leitura.
// O histórico e os relatórios continuam disponíveis, mas o servidor recusa
// qualquer escrita em dados do clube com 409 CLUB_ARCHIVED.
//
// A trava roda no authMiddleware (depois do express.json, então req.body já
// existe). Ela descobre QUAIS clubes a escrita toca:
//   1) club_id no corpo ou na query (criação de atleta, categoria, jogada...);
//   2) o recurso apontado pela URL (atleta, sessão, atividade, anexo...).
// Upload multipart de anexo (POST /api/files/upload) é checado na própria rota,
// porque o corpo só existe depois do multer.

const { query } = require('../config/database');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Clube de uma sessão: a coluna da sessão ou, nas antigas, a do microciclo.
const SQL_SESSAO = `SELECT COALESCE(s.club_id, m.club_id) AS club_id
                      FROM training_sessions s
                      LEFT JOIN training_microcycles m ON m.id = s.microcycle_id
                     WHERE s.id = $1`;
const SQL_BLOCO = `SELECT COALESCE(s.club_id, m.club_id) AS club_id
                     FROM training_activity_blocks b
                     JOIN training_sessions s ON s.id = b.session_id
                     LEFT JOIN training_microcycles m ON m.id = s.microcycle_id
                    WHERE b.id = $1`;
const SQL_ATIVIDADE = `SELECT COALESCE(s.club_id, m.club_id) AS club_id
                         FROM training_activities a
                         JOIN training_activity_blocks b ON b.id = a.block_id
                         JOIN training_sessions s ON s.id = b.session_id
                         LEFT JOIN training_microcycles m ON m.id = s.microcycle_id
                        WHERE a.id = $1`;
const SQL_ANEXO = `SELECT COALESCE(s.club_id, m.club_id) AS club_id
                     FROM training_activity_files f
                     LEFT JOIN training_activities a ON a.id = f.activity_id
                     LEFT JOIN training_activity_blocks b ON b.id = a.block_id
                     JOIN training_sessions s ON s.id = COALESCE(f.session_id, b.session_id)
                     LEFT JOIN training_microcycles m ON m.id = s.microcycle_id
                    WHERE f.id = $1`;
const SQL_ATLETA = 'SELECT club_id FROM athletes WHERE id = $1';

// [métodos, regex do caminho (sem query string), SQL que devolve club_id a partir do 1º grupo]
const RECURSOS = [
  [['PUT', 'DELETE', 'POST'], /^\/api\/athletes\/([0-9a-f-]{36})(?:\/photo)?\/?$/i, SQL_ATLETA],
  [['POST'], /^\/api\/athletes\/([0-9a-f-]{36})\/injuries\/?$/i, SQL_ATLETA],
  [['PUT', 'DELETE'], /^\/api\/injuries\/([0-9a-f-]{36})\/?$/i,
    'SELECT a.club_id FROM athlete_injuries i JOIN athletes a ON a.id = i.athlete_id WHERE i.id = $1'],
  [['PUT', 'PATCH', 'DELETE'], /^\/api\/sessions\/([0-9a-f-]{36})(?:\/[a-z_-]+)?\/?$/i, SQL_SESSAO],
  [['POST', 'PUT', 'DELETE'], /^\/api\/games\/([0-9a-f-]{36})(?:\/.*)?$/i, SQL_SESSAO],
  [['PUT', 'DELETE'], /^\/api\/activities\/([0-9a-f-]{36})\/?$/i, SQL_ATIVIDADE],
  [['DELETE', 'PUT', 'POST'], /^\/api\/activities\/block\/([0-9a-f-]{36})\/?$/i, SQL_BLOCO],
  [['PATCH', 'DELETE', 'PUT'], /^\/api\/files\/([0-9a-f-]{36})\/?$/i, SQL_ANEXO],
  [['DELETE'], /^\/api\/themes\/([0-9a-f-]{36})\/?$/i, 'SELECT club_id FROM monthly_themes WHERE id = $1'],
  [['PUT', 'DELETE'], /^\/api\/competitions\/([0-9a-f-]{36})\/?$/i, 'SELECT club_id FROM competitions WHERE id = $1'],
  [['PUT', 'DELETE'], /^\/api\/categories\/([0-9a-f-]{36})\/?$/i, 'SELECT club_id FROM categories WHERE id = $1'],
  [['PUT', 'DELETE'], /^\/api\/plays\/([0-9a-f-]{36})\/?$/i, 'SELECT club_id FROM tactical_plays WHERE id = $1'],
  // O próprio clube: editar, personalizar, logo, migrar dados. (Arquivar/desarquivar
  // e excluir o clube ficam liberados: são a gestão do arquivo.)
  [['PUT', 'POST', 'DELETE'], /^\/api\/clubs\/([0-9a-f-]{36})\/(?:branding|logo|migrate-data)\/?$/i, 'SELECT id AS club_id FROM clubs WHERE id = $1'],
  [['PUT'], /^\/api\/clubs\/([0-9a-f-]{36})\/?$/i, 'SELECT id AS club_id FROM clubs WHERE id = $1'],
];

// Escritas que não criam conteúdo do usuário (mesma lógica do modo só leitura).
const ISENTAS = [
  /^\/api\/microcycles\/ensure\/?$/,           // get-or-create da semana ao abrir o planejamento
  /^\/api\/reports\//,                         // gerar PDF não grava nada
  /^\/api\/clubs\/[0-9a-f-]{36}\/(?:archive|unarchive)\/?$/i,
  /^\/api\/auth\//, /^\/api\/billing\//, /^\/api\/admin\//, /^\/api\/conta\//,
  /^\/api\/workspaces/, /^\/api\/invites\//, /^\/api\/announcements\//,
  // Biblioteca (conteúdos, submomentos, títulos) é da CONTA, não do clube.
  /^\/api\/(?:contents|stages|titles)(?:\/|$)/,
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function caminho(req) {
  return String(req.originalUrl || req.url || '').split('?')[0];
}

// Lista de club_ids que a escrita toca (pode repetir/vir vazia).
async function clubesDaEscrita(req) {
  const metodo = String(req.method || '').toUpperCase();
  if (!WRITE_METHODS.has(metodo)) return [];
  const path = caminho(req);
  if (ISENTAS.some((re) => re.test(path))) return [];

  const ids = [];
  const corpo = req.body && typeof req.body === 'object' ? req.body : {};
  if (corpo.club_id) ids.push(corpo.club_id);
  if (req.query && req.query.club_id) ids.push(req.query.club_id);

  // Atividade: o bloco vem no corpo (POST /api/activities e /upsert).
  if (/^\/api\/activities(?:\/upsert)?\/?$/.test(path) && corpo.block_id && UUID_RE.test(String(corpo.block_id))) {
    const r = await query(SQL_BLOCO, [corpo.block_id]);
    if (r.rows[0]?.club_id) ids.push(r.rows[0].club_id);
  }
  // Grupos em lote: atletas no corpo.
  if (/^\/api\/athletes\/batch-groups\/?$/.test(path) && Array.isArray(corpo.athletes)) {
    const atletas = corpo.athletes.map((a) => a && a.id).filter((id) => UUID_RE.test(String(id || '')));
    if (atletas.length) {
      const r = await query('SELECT DISTINCT club_id FROM athletes WHERE id = ANY($1::uuid[])', [atletas]);
      for (const row of r.rows) if (row.club_id) ids.push(row.club_id);
    }
  }

  for (const [metodos, re, sql] of RECURSOS) {
    if (!metodos.includes(metodo)) continue;
    const m = path.match(re);
    if (!m || !UUID_RE.test(m[1])) continue;
    const r = await query(sql, [m[1]]);
    if (r.rows[0]?.club_id) ids.push(r.rows[0].club_id);
    break;
  }
  return [...new Set(ids.map(String).filter((id) => UUID_RE.test(id)))];
}

// Dos clubes informados, quais estão arquivados? → [{ id, name }]
async function clubesArquivados(clubIds) {
  const ids = (clubIds || []).filter((id) => UUID_RE.test(String(id || '')));
  if (ids.length === 0) return [];
  const r = await query(
    'SELECT id, name FROM clubs WHERE id = ANY($1::uuid[]) AND archived_at IS NOT NULL',
    [ids]
  );
  return r.rows;
}

function mensagemArquivado(nome) {
  return `O clube ${nome ? `"${nome}" ` : ''}está arquivado: os dados podem ser consultados, mas não editados. `
    + 'Para voltar a editar, desarquive o clube em Cadastros › Clubes.';
}

function respostaArquivado(res, clube) {
  return res.status(409).json({
    error: mensagemArquivado(clube?.name),
    code: 'CLUB_ARCHIVED',
    club_id: clube?.id || null,
  });
}

// Middleware (chamado no fim do authMiddleware). Roda uma vez por requisição,
// mesmo com vários routers montados em /api. Falha aberta: erro nosso não derruba o app.
async function travaClubeArquivado(req, res, next) {
  if (req._travaClubeArquivado) return next();
  req._travaClubeArquivado = true;
  let bloqueio = null;
  try {
    const ids = await clubesDaEscrita(req);
    if (ids.length) bloqueio = (await clubesArquivados(ids))[0] || null;
  } catch (err) {
    console.error('travaClubeArquivado error:', err.message);
  }
  if (bloqueio) return respostaArquivado(res, bloqueio);
  return next();
}

module.exports = {
  travaClubeArquivado,
  clubesDaEscrita,
  clubesArquivados,
  mensagemArquivado,
  respostaArquivado,
};
