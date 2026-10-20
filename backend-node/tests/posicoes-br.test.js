// Posições com nomenclatura brasileira (migration 051_posicoes_br.sql).
// Uso: node --test tests/posicoes-br.test.js
// O teste da migration usa o Postgres de DATABASE_URL dentro de uma transação
// com ROLLBACK (nada fica gravado); sem DATABASE_URL ele é pulado.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { positionSector } = require('../src/reports/positionSector');

const NOVOS = { GOL: 'gol', ZAG: 'def', LD: 'def', LE: 'def', VOL: 'mei', MEI: 'mei', ED: 'ata', EE: 'ata', CA: 'ata' };
const FUTSAL = { GOL: 'gol', FIX: 'def', 'ALA-D': 'mei', 'ALA-E': 'mei', PIV: 'ata' };
// Mapa da migration: antigo → novo
const MAPA = {
  GR: 'GOL', DC: 'ZAG', Z: 'ZAG', DD: 'LD', DE: 'LE', MC: 'VOL',
  MD: 'MEI', ME: 'MEI', MOF: 'MEI', M: 'MEI', PL: 'CA', SA: 'CA', A: 'CA',
};

test('setor: códigos novos, futsal e minúsculas/espaços', () => {
  for (const [c, s] of Object.entries({ ...NOVOS, ...FUTSAL })) assert.strictEqual(positionSector(c), s, c);
  assert.strictEqual(positionSector(' zag '), 'def');
  assert.strictEqual(positionSector('ala-d'), 'mei');
  assert.strictEqual(positionSector('XYZ'), null);
  assert.strictEqual(positionSector(null), null);
});

test('setor: código antigo continua com o mesmo setor do novo (dado legado)', () => {
  for (const [antigo, novo] of Object.entries(MAPA)) {
    assert.strictEqual(positionSector(antigo), positionSector(novo), `${antigo} → ${novo}`);
  }
});

test('sportConfig: Futebol 11 e 7 com a lista brasileira; futsal intacto', async () => {
  const cfg = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/lib/sportConfig.js')).href);
  const codes = (m) => cfg.POSITIONS[m].map((p) => p.code);
  const lista = ['GOL', 'ZAG', 'LD', 'LE', 'VOL', 'MEI', 'ED', 'EE', 'CA'];
  assert.deepStrictEqual(codes('football_11'), lista);
  assert.deepStrictEqual(codes('football_7'), lista);
  assert.deepStrictEqual(codes('futsal'), ['GOL', 'FIX', 'ALA-D', 'ALA-E', 'PIV']);
  for (const m of ['football_11', 'football_7', 'futsal']) {
    for (const c of codes(m)) assert.ok(positionSector(c), `${m}/${c} sem setor`);
  }
});

test('migration 051: aplica o mapa só fora do futsal', { skip: !process.env.DATABASE_URL && 'sem DATABASE_URL' }, async () => {
  const { Client } = require('pg');
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/051_posicoes_br.sql'), 'utf8')
    .replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    const clube = async (modality) => (await client.query(
      "INSERT INTO clubs (name, modality) VALUES ('__teste_posicoes__', $1) RETURNING id", [modality],
    )).rows[0].id;
    const f11 = await clube('football_11');
    const f7 = await clube('football_7');
    const fs5 = await clube('futsal');
    const ins = async (clubId, position) => (await client.query(
      "INSERT INTO athletes (name, position, club_id) VALUES ('__teste__', $1, $2) RETURNING id", [position, clubId],
    )).rows[0].id;

    const casos = [];
    for (const [antigo, novo] of Object.entries(MAPA)) {
      casos.push({ id: await ins(f11, antigo), esperado: novo });
      casos.push({ id: await ins(f7, antigo.toLowerCase()), esperado: novo });
      casos.push({ id: await ins(fs5, antigo), esperado: antigo }); // futsal não muda
    }
    for (const c of ['LD', 'LE', 'ED', 'EE', 'GOL', 'ZAG', 'CA']) casos.push({ id: await ins(f11, c), esperado: c });
    for (const c of Object.keys(FUTSAL)) casos.push({ id: await ins(fs5, c), esperado: c });
    casos.push({ id: await ins(f11, null), esperado: null });

    await client.query(sql);
    for (const c of casos) {
      const r = await client.query('SELECT position FROM athletes WHERE id = $1', [c.id]);
      assert.strictEqual(r.rows[0].position, c.esperado);
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
});
