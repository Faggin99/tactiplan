// Paridade da fase T3 do app nativo (native/paridade/t3.json): formatarNome, posições, papéis e
// permissões, períodos e cards das estatísticas, gerados do código ATUAL do web. Mudou o web,
// este teste falha até regerar (node native/paridade/gerar-t3.mjs) e rodar os testes do app.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');

test('paridade T3 (app nativo × web) atualizada', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, '../../native/paridade/gerar-t3.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /t3\.json em dia/);
});
