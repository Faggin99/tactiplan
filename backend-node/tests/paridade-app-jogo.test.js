// O arquivo de paridade do app nativo (native/paridade/jogo.json) foi gerado do código ATUAL do web
// (formation, posicaoEmCampo, minutagem, EventModal). Se o web mudar, este teste falha até que o
// arquivo seja regerado (node native/paridade/gerar-jogo.js) e os testes do app rodem de novo.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');

test('paridade do jogo (app nativo × web) atualizada', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, '../../native/paridade/gerar-jogo.js'), '--check'], { encoding: 'utf8' });
  assert.match(out, /paridade do jogo: ok/);
});
