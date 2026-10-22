// Paridade da fase T5 do app nativo (native/paridade/quadro.json): campo, formações, interpolação,
// editor (useTacticalBoard executado), desenho, catálogos, ritmo do vídeo e a jogada real, gerados
// do código ATUAL do quadro do web. Mudou o web, este teste falha até regerar
// (node native/paridade/gerar-quadro.mjs) e rodar os testes do app (Kit e Android).
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');

test('paridade T5 quadro tático (app nativo × web) atualizada', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, '../../native/paridade/gerar-quadro.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /quadro\.json em dia/);
});
