// Personalização por clube: validação do branding, permissão e espelho light.primary → primary_color.
// Uso: node --test tests/club-branding.test.js  (banco e auth simulados)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'branding-test-'));
process.env.UPLOAD_DIR = TMP;

const { validateBranding, primaryMirror } = require('../src/utils/branding');

const WS = 'ws-1';
const CLUBE = 'club-1';

// ---------- banco simulado ----------
const db = { clubs: {}, log: [] };
async function query(sql, params = []) {
  db.log.push({ sql, params });
  if (/UPDATE clubs\s+SET branding = \$1::jsonb/.test(sql)) {
    const [branding, primary, id, wss] = params;
    const c = db.clubs[id];
    if (!c || !wss.includes(c.workspace_id)) return { rows: [] };
    Object.assign(c, { branding: JSON.parse(branding), primary_color: primary });
    return { rows: [{ ...c }] };
  }
  if (/SELECT (logo_path|logo_dark_path) AS antigo FROM clubs/.test(sql)) {
    const c = db.clubs[params[0]];
    const col = sql.includes('logo_dark_path') ? 'logo_dark_path' : 'logo_path';
    return { rows: c && params[1].includes(c.workspace_id) ? [{ antigo: c[col] || null }] : [] };
  }
  if (/UPDATE clubs SET (logo_path|logo_dark_path) = NULL/.test(sql)) {
    const c = db.clubs[params[0]];
    const col = sql.includes('logo_dark_path') ? 'logo_dark_path' : 'logo_path';
    c[col] = null;
    return { rows: [{ ...c }] };
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
const clubsRoutes = require('../src/routes/clubs');

const app = express();
app.use(express.json());
app.use('/api/clubs', clubsRoutes);

const perms = (lista) => ({ id: 'u1', workspaceIds: [WS], workspaceId: WS, can: (p) => lista.includes(p), canWriteWorkspace: () => true });
const DONO = perms(['club_settings:manage', 'training:edit']);
const TECNICO = perms(['training:edit', 'training:view']);

const TEMA = (primary) => ({ primary, background: '#ffffff', surface: '#f8fafc', border: '#e2e8f0', text: '#0f172a', textSecondary: '#64748b' });

function reset() {
  db.clubs = { [CLUBE]: { id: CLUBE, workspace_id: WS, name: 'Vila', primary_color: '#15803D', branding: null, logo_path: null, logo_dark_path: '/uploads/club-logos/escura.png' } };
  db.log = [];
}

test('validateBranding: aceita temas completos e normaliza para minúsculas', () => {
  const r = validateBranding({ light: TEMA('#FFD200'), dark: { ...TEMA('#111111'), background: '#0F172A' } });
  assert.ifError(r.error);
  assert.strictEqual(r.branding.light.primary, '#ffd200');
  assert.strictEqual(r.branding.dark.background, '#0f172a');
});

test('validateBranding: tema parcial, hex inválido e chave desconhecida → erro', () => {
  assert.match(validateBranding({ light: { primary: '#ff0000' } }).error, /6 cores completas/);
  assert.match(validateBranding({ light: { ...TEMA('#ff0000'), primary: 'red' } }).error, /cor inválida/);
  assert.match(validateBranding({ light: { ...TEMA('#ff0000'), primary: '#ff000080' } }).error, /cor inválida/);
  assert.match(validateBranding({ light: { ...TEMA('#ff0000'), logo: '/x' } }).error, /chave desconhecida/);
  assert.match(validateBranding({ medio: TEMA('#ff0000') }).error, /chave desconhecida/);
  assert.match(validateBranding([]).error, /objeto/);
});

test('validateBranding: vazio/nulo/seção nula = padrão ({})', () => {
  assert.deepStrictEqual(validateBranding(null).branding, {});
  assert.deepStrictEqual(validateBranding({}).branding, {});
  assert.deepStrictEqual(validateBranding({ light: null, dark: {} }).branding, {});
});

test('primaryMirror: light.primary ou null', () => {
  assert.strictEqual(primaryMirror({ light: TEMA('#ff0000') }), '#ff0000');
  assert.strictEqual(primaryMirror({ dark: TEMA('#ff0000') }), null);
  assert.strictEqual(primaryMirror({}), null);
});

test('PUT /branding: dono salva e light.primary vira primary_color', async () => {
  reset(); usuario = DONO;
  const res = await request(app).put(`/api/clubs/${CLUBE}/branding`).send({ branding: { light: TEMA('#FF0000'), dark: TEMA('#111111') } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.primary_color, '#ff0000');
  assert.strictEqual(db.clubs[CLUBE].branding.dark.primary, '#111111');
});

test('PUT /branding: restaurar o claro (seção omitida) zera primary_color', async () => {
  reset(); usuario = DONO;
  const res = await request(app).put(`/api/clubs/${CLUBE}/branding`).send({ branding: { dark: TEMA('#111111') } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(db.clubs[CLUBE].primary_color, null);
  assert.deepStrictEqual(Object.keys(db.clubs[CLUBE].branding), ['dark']);
});

test('PUT /branding: sem club_settings:manage → 403 e nada gravado', async () => {
  reset(); usuario = TECNICO;
  const res = await request(app).put(`/api/clubs/${CLUBE}/branding`).send({ branding: { light: TEMA('#ff0000') } });
  assert.strictEqual(res.status, 403);
  assert.strictEqual(db.clubs[CLUBE].primary_color, '#15803D');
  assert.strictEqual(db.log.length, 0);
});

test('PUT /branding: tema parcial → 400; clube de outra conta → 404', async () => {
  reset(); usuario = DONO;
  const parcial = await request(app).put(`/api/clubs/${CLUBE}/branding`).send({ branding: { light: { primary: '#ff0000' } } });
  assert.strictEqual(parcial.status, 400);
  assert.match(parcial.body.error, /6 cores/);
  const outro = await request(app).put('/api/clubs/club-x/branding').send({ branding: {} });
  assert.strictEqual(outro.status, 404);
});

test('DELETE /logo?variant=dark: remove só a logo escura; técnico não pode', async () => {
  reset(); usuario = TECNICO;
  assert.strictEqual((await request(app).delete(`/api/clubs/${CLUBE}/logo?variant=dark`)).status, 403);
  usuario = DONO;
  const res = await request(app).delete(`/api/clubs/${CLUBE}/logo?variant=dark`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(db.clubs[CLUBE].logo_dark_path, null);
});

test('POST /logo: arquivo que não é imagem → 400', async () => {
  reset(); usuario = DONO;
  const res = await request(app).post(`/api/clubs/${CLUBE}/logo?variant=dark`)
    .attach('logo', Buffer.from('%PDF-1.4'), { filename: 'x.pdf', contentType: 'application/pdf' });
  assert.strictEqual(res.status, 400);
  assert.match(res.body.error, /imagem/);
  assert.strictEqual(fs.readdirSync(path.join(TMP, 'club-logos')).length, 0);
});
