// Paridade do app nativo (27/11/2026): os arquivos que os testes do Android/iOS leem precisam estar
// em dia com o código do web/servidor — avaliacao.json (inclui treino de transição) e campograma.json.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');

for (const arq of ['gerar-avaliacao.mjs', 'gerar-campograma.js']) {
  test(`paridade do app: ${arq} --check`, () => {
    const out = execFileSync(process.execPath, [path.join(__dirname, '../../native/paridade', arq), '--check'], { encoding: 'utf8' });
    assert.match(out, /em dia/);
  });
}
