// Anexos POR ATIVIDADE (bloco): upload exige activity_id válido da workspace,
// permissão/categoria, limite por atividade e listagem com activity_id/bloco.
// Uso: node --test tests/anexos-atividade.test.js  (banco e auth simulados)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'anexos-test-'));
process.env.UPLOAD_DIR = TMP;

const WS = 'ws-1';
const OUTRO_WS = 'ws-2';
const CAT = 'cat-sub15';
const ACT_A = '11111111-1111-4111-8111-111111111111';
const ACT_B = '22222222-2222-4222-8222-222222222222';
const ACT_OUTRO = '33333333-3333-4333-8333-333333333333';
const SESS = 'sess-1';

// ---------- banco simulado ----------
const db = { activities: {}, files: [], log: [] };
async function query(sql, params = []) {
  db.log.push({ sql, params });
  if (/FROM training_activities a\s+JOIN training_activity_blocks b/.test(sql)) {
    const a = db.activities[params[0]];
    return { rows: a && params[1].includes(a.workspace_id) ? [{ activity_id: params[0], ...a }] : [] };
  }
  if (/SELECT COUNT\(\*\)::int AS n FROM training_activity_files/.test(sql)) {
    return { rows: [{ n: db.files.filter((f) => f.activity_id === params[0]).length }] };
  }
  if (/INSERT INTO training_activity_files/.test(sql)) {
    const [session_id, activity_id, title, file_path, url, file_name, file_size, mime_type, workspace_id] = params;
    const row = { id: `f${db.files.length + 1}`, session_id, activity_id, title, file_path, url, file_name, file_size, mime_type, workspace_id, created_at: new Date() };
    db.files.push(row);
    return { rows: [row] };
  }
  if (/FROM training_activity_files f\s+LEFT JOIN training_activities a/.test(sql)) {
    const rows = db.files
      .filter((f) => f.session_id === params[0] && params[1].includes(f.workspace_id))
      .map((f) => ({ ...f, block_id: db.activities[f.activity_id]?.block_id, block_name: db.activities[f.activity_id]?.block_name }));
    return { rows };
  }
  return { rows: [] };
}
const dbPath = path.join(__dirname, '../src/config/database.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query, pool: {} } };

let usuario = null;
const authPath = path.join(__dirname, '../src/middleware/auth.js');
require.cache[authPath] = {
  id: authPath, filename: authPath, loaded: true,
  exports: (req, res, next) => { req.user = usuario; next(); },
};

const express = require('express');
const request = require('supertest');
const filesRoutes = require('../src/routes/files');

const app = express();
app.use(express.json());
app.use('/api/files', filesRoutes);

function criarUsuario({ perms = ['training:edit', 'training:view'], role = 'head_coach', categorias = null } = {}) {
  return {
    id: 'u1',
    workspaceIds: [WS],
    allowedCategoryIds: categorias,
    can: (p) => perms.includes(p),
    canWriteWorkspace: (w) => w === WS && role !== 'viewer',
    assertCanAccessCategory: (c) => categorias === null || categorias.includes(c),
  };
}
function cenario(opts) {
  db.activities = {
    [ACT_A]: { workspace_id: WS, session_id: SESS, block_id: 'blk-1', block_name: 'Atividade 1', category_id: CAT, club_id: 'club-1' },
    [ACT_B]: { workspace_id: WS, session_id: SESS, block_id: 'blk-2', block_name: 'Atividade 2', category_id: CAT, club_id: 'club-1' },
    [ACT_OUTRO]: { workspace_id: OUTRO_WS, session_id: 'sess-x', block_id: 'blk-x', block_name: 'Atividade 1', category_id: 'cat-x', club_id: 'club-x' },
  };
  db.files = [];
  db.log = [];
  usuario = criarUsuario(opts);
}
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c40000000049454e44ae426082', 'hex');
const enviar = (fields = {}) => {
  let r = request(app).post('/api/files/upload').attach('file', PNG, { filename: 'campo.png', contentType: 'image/png' });
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  return r;
};
const arquivosNoDisco = () => {
  const dir = path.join(TMP, 'session-files');
  return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
};
const houveInsert = () => db.log.some((l) => /INSERT INTO training_activity_files/.test(l.sql));

test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('upload sem activity_id → 400 e o arquivo gravado é descartado', async () => {
  cenario();
  const antes = arquivosNoDisco();
  const r = await enviar({ session_id: SESS, title: 'x' }); // formato antigo
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /activity_id/);
  assert.strictEqual(houveInsert(), false);
  assert.strictEqual(arquivosNoDisco(), antes);
});

test('upload com activity_id inexistente, inválido ou de outra workspace → 404', async () => {
  for (const id of ['44444444-4444-4444-8444-444444444444', 'nao-e-uuid', ACT_OUTRO]) {
    cenario();
    const r = await enviar({ activity_id: id });
    assert.strictEqual(r.status, 404, `id ${id}`);
    assert.strictEqual(houveInsert(), false);
  }
});

test('upload válido grava activity_id e session_id DERIVADO da atividade', async () => {
  cenario();
  const r = await enviar({ activity_id: ACT_A, session_id: 'sessao-forjada', title: '  Desenho do exercício ' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.activity_id, ACT_A);
  assert.strictEqual(r.body.session_id, SESS);
  assert.strictEqual(r.body.workspace_id, WS);
  assert.strictEqual(r.body.title, 'Desenho do exercício');
  assert.match(r.body.file_path, /^\/uploads\/session-files\/.+\.png$/);
  assert.ok(fs.existsSync(path.join(TMP, r.body.file_path.replace('/uploads/', ''))));
});

test('permissão: sem training:edit → 403 antes de gravar', async () => {
  cenario({ perms: ['training:view'] });
  const r = await enviar({ activity_id: ACT_A });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(houveInsert(), false);
});

test('permissão: viewer da workspace → 403 e arquivo descartado', async () => {
  cenario({ role: 'viewer' });
  const antes = arquivosNoDisco();
  const r = await enviar({ activity_id: ACT_A });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(houveInsert(), false);
  assert.strictEqual(arquivosNoDisco(), antes);
});

test('permissão: membro sem acesso à categoria da atividade → 403', async () => {
  cenario({ categorias: ['cat-sub17'] });
  const r = await enviar({ activity_id: ACT_A });
  assert.strictEqual(r.status, 403);
  cenario({ categorias: [CAT] });
  assert.strictEqual((await enviar({ activity_id: ACT_A })).status, 201);
});

test('limite: 5 anexos POR ATIVIDADE (a 6ª é recusada; outra atividade continua livre)', async () => {
  cenario();
  for (let i = 0; i < 5; i++) assert.strictEqual((await enviar({ activity_id: ACT_A })).status, 201);
  const sexta = await enviar({ activity_id: ACT_A });
  assert.strictEqual(sexta.status, 409);
  assert.match(sexta.body.error, /5 anexos por atividade/);
  assert.strictEqual((await enviar({ activity_id: ACT_B })).status, 201);
});

test('lista da sessão devolve cada anexo com activity_id e bloco', async () => {
  cenario();
  await enviar({ activity_id: ACT_A, title: 'A1' });
  await enviar({ activity_id: ACT_B, title: 'B1' });
  await enviar({ activity_id: ACT_B, title: 'B2' });
  const r = await request(app).get(`/api/files/session/${SESS}`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.length, 3);
  const porAtividade = {};
  for (const f of r.body) (porAtividade[f.activity_id] ||= []).push(f.title);
  assert.deepStrictEqual(porAtividade[ACT_A], ['A1']);
  assert.deepStrictEqual(porAtividade[ACT_B].sort(), ['B1', 'B2']);
  assert.ok(r.body.every((f) => f.block_id && f.block_name && f.url));
});

test('removeStoredFile não sai do UPLOAD_DIR', () => {
  const { diskPathFor } = require('../src/utils/sessionFiles');
  assert.strictEqual(diskPathFor('/uploads/../../etc/passwd'), null);
  assert.strictEqual(diskPathFor('/uploads/session-files/a.png'), path.join(TMP, 'session-files/a.png'));
});
