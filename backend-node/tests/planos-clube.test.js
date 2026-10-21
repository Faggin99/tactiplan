// Só o plano Clube à venda (21/10/2026): R$ 120/mês e R$ 1.200/ano; Essencial (pro/pro_annual) fora da venda.
// Lê a tabela `plans` REAL (DATABASE_URL) e confere que um checkout NOVO no Mercado Pago nasce com
// 12000 / 120000 centavos. O Mercado Pago e as escritas no banco são simulados (nada é gravado).
// Uso: DATABASE_URL=... node --test tests/planos-clube.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { Pool } = require('pg');

const temBanco = !!process.env.DATABASE_URL;
const pool = temBanco ? new Pool({ connectionString: process.env.DATABASE_URL, max: 1 }) : null;

// Banco: leituras de `plans` vão pro Postgres real; o resto (INSERT/UPDATE) é simulado.
const escritas = [];
const dbPath = path.join(__dirname, '../src/config/database.js');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    query: async (sql, params) => {
      if (/FROM plans WHERE id = \$1 AND is_active = true/.test(sql)) return pool.query(sql, params);
      escritas.push({ sql, params });
      return { rows: [{ id: 'sub-teste' }] };
    },
  },
};

// Mercado Pago simulado: captura o corpo do preapproval_plan.
const criados = [];
const mpPath = require.resolve('mercadopago', { paths: [path.join(__dirname, '../src/services')] });
require.cache[mpPath] = {
  id: mpPath, filename: mpPath, loaded: true,
  exports: {
    MercadoPagoConfig: function MercadoPagoConfig() {},
    PreApproval: function PreApproval() {},
    Payment: function Payment() {},
    PreApprovalPlan: function PreApprovalPlan() {
      this.create = async ({ body }) => { criados.push(body); return { id: `pap-${criados.length}`, status: 'active', init_point: 'https://mp.test/checkout' }; };
    },
  },
};
process.env.MP_ACCESS_TOKEN = 'TEST-fake';

const billing = require('../src/services/billing');
const USER = '11111111-2222-4333-8444-555555555555';

test.after(() => pool?.end());

test('tabela plans: Clube R$ 120/mês e R$ 1.200/ano; Essencial inativo; limites do Clube iguais', { skip: !temBanco }, async () => {
  const r = await pool.query("SELECT id, price_cents, interval, is_active, features FROM plans WHERE id IN ('pro','pro_annual','clube','clube_annual')");
  const p = Object.fromEntries(r.rows.map((x) => [x.id, x]));
  assert.strictEqual(p.clube.price_cents, 12000);
  assert.strictEqual(p.clube.interval, 'monthly');
  assert.strictEqual(p.clube_annual.price_cents, 120000);
  assert.strictEqual(p.clube_annual.interval, 'yearly');
  assert.strictEqual(p.clube.is_active, true);
  assert.strictEqual(p.clube_annual.is_active, true);
  assert.strictEqual(p.pro.is_active, false, 'Essencial mensal fora da venda (linha mantida)');
  assert.strictEqual(p.pro_annual.is_active, false, 'Essencial anual fora da venda (linha mantida)');
  for (const id of ['clube', 'clube_annual']) {
    assert.strictEqual(p[id].features.max_convidados, 5);
    assert.strictEqual(p[id].features.max_categories, 5);
  }
});

test('checkout NOVO do Clube mensal nasce com R$ 120,00 (1 mês)', { skip: !temBanco }, async () => {
  criados.length = 0;
  const r = await billing.createCheckout({ userId: USER, planId: 'clube', workspaceId: null });
  assert.strictEqual(r.init_point, 'https://mp.test/checkout');
  assert.strictEqual(criados[0].auto_recurring.transaction_amount * 100, 12000);
  assert.strictEqual(criados[0].auto_recurring.frequency, 1);
  assert.match(criados[0].reason, /^Clube Mensal/);
});

test('checkout NOVO do Clube anual nasce com R$ 1.200,00 (12 meses)', { skip: !temBanco }, async () => {
  criados.length = 0;
  await billing.createCheckout({ userId: USER, planId: 'clube_annual', workspaceId: null });
  assert.strictEqual(criados[0].auto_recurring.transaction_amount * 100, 120000);
  assert.strictEqual(criados[0].auto_recurring.frequency, 12);
  assert.match(criados[0].reason, /^Clube Anual/);
});

test('checkout do Essencial (pro / pro_annual) é recusado com 400 e não chama o Mercado Pago', { skip: !temBanco }, async () => {
  for (const planId of ['pro', 'pro_annual']) {
    criados.length = 0;
    escritas.length = 0;
    await assert.rejects(billing.createCheckout({ userId: USER, planId }), (e) => e.statusCode === 400 && /Clube/.test(e.message));
    assert.strictEqual(criados.length, 0);
    assert.ok(!escritas.some((w) => /INSERT INTO subscriptions/.test(w.sql)));
  }
});

test('shared/planos.json: só o Clube marcado como vendido; nomes antigos preservados', () => {
  const cfg = require('../src/config/planos');
  assert.strictEqual(cfg.config.clube.vendido, true);
  assert.strictEqual(cfg.config.entrada.vendido, false);
  assert.strictEqual(cfg.nomePlano('pro_annual'), 'Essencial Anual', 'assinaturas antigas continuam com nome');
  assert.strictEqual(cfg.nomePlano('clube'), 'Clube Mensal');
});
