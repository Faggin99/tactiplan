#!/usr/bin/env node
// Nomes de PESSOAS com a primeira letra maiúscula (users.name e athletes.name) — DRY-RUN por padrão.
//
//   node scripts/formatar-nomes.js            # lista antes → depois (não grava nada)
//   node scripts/formatar-nomes.js --apply    # aplica numa transação
//
// Regra: src/utils/formatarNome.js (a mesma usada ao salvar). Faça backup antes do --apply:
//   sudo /usr/local/bin/tactiplan-db-backup.sh
// Contas removidas (users.deleted_at) não são tocadas.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const { formatarNome } = require('../src/utils/formatarNome');

async function main() {
  const apply = process.argv.includes('--apply');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    const users = await client.query('SELECT id, email, name FROM users WHERE deleted_at IS NULL AND name IS NOT NULL ORDER BY created_at');
    const athletes = await client.query(
      `SELECT a.id, a.name, a.workspace_id, w.name AS conta
         FROM athletes a LEFT JOIN workspaces w ON w.id = a.workspace_id
        WHERE a.name IS NOT NULL ORDER BY w.name, a.name`
    );
    const mudUsers = users.rows.map((u) => ({ ...u, novo: formatarNome(u.name) })).filter((u) => u.novo && u.novo !== u.name);
    const mudAtletas = athletes.rows.map((a) => ({ ...a, novo: formatarNome(a.name) })).filter((a) => a.novo && a.novo !== a.name);

    console.log(`USERS: ${mudUsers.length} de ${users.rows.length} mudam`);
    for (const u of mudUsers) console.log(`  [user] ${u.email}: "${u.name}" → "${u.novo}"`);
    console.log(`ATHLETES: ${mudAtletas.length} de ${athletes.rows.length} mudam`);
    for (const a of mudAtletas) console.log(`  [atleta] (${a.conta || a.workspace_id}) "${a.name}" → "${a.novo}"`);

    if (!apply) { console.log('\nDRY-RUN: nada foi gravado. Rode com --apply para aplicar.'); return; }

    await client.query('BEGIN');
    for (const u of mudUsers) await client.query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [u.novo, u.id]);
    for (const a of mudAtletas) await client.query('UPDATE athletes SET name = $1, updated_at = NOW() WHERE id = $2', [a.novo, a.id]);
    await client.query('COMMIT');
    console.log(`\nAPLICADO: ${mudUsers.length} users e ${mudAtletas.length} atletas.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('ERRO (nada gravado):', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
