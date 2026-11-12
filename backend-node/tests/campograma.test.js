// Campograma do PDF do plantel (src/reports/campograma.js).
const test = require('node:test');
const assert = require('node:assert');
const { buildCampograma, nomeCurto } = require('../src/reports/campograma');

test('campograma: zagueiros por lado, sinônimo antigo, DM por último e sem posição à parte', () => {
  const cg = buildCampograma([
    { id: 1, name: 'Pedro Henrique Alves', position: 'ZAG', lado_preferido: 'direita', jersey_number: 3 },
    { id: 2, name: 'João Santana', position: 'ZAG', lado_preferido: 'esquerda', jersey_number: 4 },
    { id: 3, name: 'Rafael Moura', position: 'ZAG', jersey_number: 14 },
    { id: 4, name: 'Thiago Ferreira', position: 'MC', jersey_number: 5, group: 'DM' },
    { id: 5, name: 'Felipe Andrade', position: 'VOL', jersey_number: 8 },
    { id: 6, name: 'Sem Posição', position: null },
    { id: 7, name: 'Caio Martins', position: 'VOL', jersey_number: 20, group: 'Transição' },
  ], 'football_11');
  const zona = (k) => cg.zonas.find((z) => z.key === k);
  assert.deepStrictEqual(zona('ZAG-D').atletas.map((a) => a.id), [1]);
  assert.deepStrictEqual(zona('ZAG-E').atletas.map((a) => a.id), [2]);
  assert.deepStrictEqual(zona('ZAG-A').atletas.map((a) => a.id), [3]);
  assert.deepStrictEqual(zona('VOL').atletas.map((a) => [a.id, a.dm, a.trans]), [[5, false, false], [7, false, true], [4, true, false]]);
  assert.deepStrictEqual(cg.semLugar.map((a) => a.id), [6]);
  // campo em pé: ataque para cima, goleiro embaixo encostado na linha
  assert.ok(zona('ZAG-D').left > 50 && zona('ZAG-E').left < 50);
  assert.strictEqual(nomeCurto('Pedro Henrique Alves'), 'Pedro A.');
});

test('campograma: futsal usa as posições da quadra', () => {
  const cg = buildCampograma([{ id: 1, name: 'A', position: 'PIV' }, { id: 2, name: 'B', position: 'ZAG' }], 'futsal');
  assert.deepStrictEqual(cg.zonas.map((z) => z.key), ['PIV']);
  assert.strictEqual(cg.semLugar.length, 1);
});
