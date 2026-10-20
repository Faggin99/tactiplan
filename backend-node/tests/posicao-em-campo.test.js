// Posição EM CAMPO pela vaga da formação (Convocação + lista de titulares do jogo).
// Roda os MESMOS casos no backend (src/utils/posicaoEmCampo.js) e no front (lib/posicaoEmCampo.js).
// Uso: node --test tests/posicao-em-campo.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const back = require('../src/utils/posicaoEmCampo');
const { buildSlots, totalVagas } = require('../src/utils/formacao');

function frontImpl() {
  const src = fs.readFileSync(path.join(__dirname, '../../frontend/src/lib/posicaoEmCampo.js'), 'utf8').replace(/^export .*$/gm, '');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}\nreturn { posicaoEmCampo };`)();
}
const IMPLS = [['backend', back], ['frontend', frontImpl()]];

const all = (M, f, mod = 'football_11') => Array.from({ length: totalVagas(f) }, (_, i) => M.posicaoEmCampo(f, i, mod));

const CASOS = [
  ['4-4-2', 'football_11', ['GOL', 'LE', 'ZAG', 'ZAG', 'LD', 'MEI', 'MEI', 'MEI', 'MEI', 'CA', 'CA']],
  ['4-3-3', 'football_11', ['GOL', 'LE', 'ZAG', 'ZAG', 'LD', 'MEI', 'MEI', 'MEI', 'EE', 'CA', 'ED']],
  ['4-2-3-1', 'football_11', ['GOL', 'LE', 'ZAG', 'ZAG', 'LD', 'VOL', 'VOL', 'MEI', 'MEI', 'MEI', 'CA']],
  ['4-1-4-1', 'football_11', ['GOL', 'LE', 'ZAG', 'ZAG', 'LD', 'VOL', 'MEI', 'MEI', 'MEI', 'MEI', 'CA']],
  ['3-5-2', 'football_11', ['GOL', 'ZAG', 'ZAG', 'ZAG', 'MEI', 'MEI', 'MEI', 'MEI', 'MEI', 'CA', 'CA']],
  ['3-4-3', 'football_11', ['GOL', 'ZAG', 'ZAG', 'ZAG', 'MEI', 'MEI', 'MEI', 'MEI', 'EE', 'CA', 'ED']],
  ['5-3-2', 'football_11', ['GOL', 'LE', 'ZAG', 'ZAG', 'ZAG', 'LD', 'MEI', 'MEI', 'MEI', 'CA', 'CA']],
  ['4-5-1', 'football_11', ['GOL', 'LE', 'ZAG', 'ZAG', 'LD', 'MEI', 'MEI', 'MEI', 'MEI', 'MEI', 'CA']],
  ['2-3-1', 'football_7', ['GOL', 'ZAG', 'ZAG', 'MEI', 'MEI', 'MEI', 'CA']],
  ['3-2-1', 'football_7', ['GOL', 'ZAG', 'ZAG', 'ZAG', 'MEI', 'MEI', 'CA']],
  ['3-1-2', 'football_7', ['GOL', 'ZAG', 'ZAG', 'ZAG', 'MEI', 'CA', 'CA']],
  ['2-2-2', 'football_7', ['GOL', 'ZAG', 'ZAG', 'MEI', 'MEI', 'CA', 'CA']],
  ['2-2', 'futsal', ['GOL', 'FIX', 'FIX', 'PIV', 'PIV']],
  ['3-1', 'futsal', ['GOL', 'ALA-E', 'FIX', 'ALA-D', 'PIV']],
  ['1-2-1', 'futsal', ['GOL', 'FIX', 'ALA-E', 'ALA-D', 'PIV']],
  ['4-0', 'futsal', ['GOL', null, null, null, null]],
];

for (const [nome, M] of IMPLS) {
  for (const [f, mod, esperado] of CASOS) {
    test(`[${nome}] ${mod} ${f}`, () => assert.deepStrictEqual(all(M, f, mod), esperado));
  }
  test(`[${nome}] sem vaga / vaga fora da formação → null`, () => {
    for (const s of [null, undefined, '', -1, 1.5, 11, 'x']) assert.strictEqual(M.posicaoEmCampo('4-4-2', s, 'football_11'), null);
  });
}

test('orientação: LE é a vaga mais à ESQUERDA da tela (x menor) e LD a mais à direita', () => {
  const slots = buildSlots('4-4-2');
  const le = slots[1];
  const ld = slots[4];
  assert.strictEqual(back.posicaoEmCampo('4-4-2', 1, 'football_11'), 'LE');
  assert.strictEqual(back.posicaoEmCampo('4-4-2', 4, 'football_11'), 'LD');
  assert.ok(le.x < 50 && ld.x > 50, 'ataque para cima: direita da tela = lado direito do time');
  assert.ok(buildSlots('4-3-3')[8].x < buildSlots('4-3-3')[10].x);
});
