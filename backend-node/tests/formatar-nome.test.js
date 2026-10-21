// formatarNome (nomes de pessoas): regras + PARIDADE entre backend e frontend.
// Uso: node --test tests/formatar-nome.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { formatarNome } = require('../src/utils/formatarNome');

const CASOS = [
  ['alcindo de oliveira neto', 'Alcindo de Oliveira Neto'],
  ['Léo reis', 'Léo Reis'],
  ['JOÃO DA SILVA', 'João da Silva'],
  ['maria das dores', 'Maria das Dores'],
  ['josé dos santos e silva', 'José dos Santos e Silva'],
  ['ANA-MARIA souza', 'Ana-Maria Souza'],
  ["joana d'arc", "Joana D'Arc"],
  ["pedro d'avila santos", "Pedro d'Avila Santos"],
  ["o'neil", "O'Neil"],
  ['ludwig van beethoven', 'Ludwig van Beethoven'],
  ['  carlos   eduardo  ', 'Carlos Eduardo'],
  ['Fumaça', 'Fumaça'],
  ['ÉRICA ÁVILA', 'Érica Ávila'],
  ['joão silva ii', 'João Silva II'],
  ['de souza', 'De Souza'],           // partícula só fica minúscula no MEIO
  ['Da', 'Da'],
  ['Gustavo Martins Da Silva Machado', 'Gustavo Martins da Silva Machado'],
  ['ronald McDonald', 'Ronald McDonald'],    // CamelCase proposital fica
  ['isabella GomesBezerra', 'Isabella GomesBezerra'],
  ['', ''],
];

test('formatarNome: regras', () => {
  for (const [entrada, esperado] of CASOS) assert.strictEqual(formatarNome(entrada), esperado, entrada);
  assert.strictEqual(formatarNome(null), null);
  assert.strictEqual(formatarNome(undefined), undefined);
  // Idempotente
  for (const [, esperado] of CASOS) assert.strictEqual(formatarNome(esperado), esperado);
});

test('formatarNome: paridade backend × frontend', async () => {
  const front = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/lib/formatarNome.js')).href);
  const extras = ['ZÉ DO CAIXÃO', 'mc lovin', "D'ÁVILA", 'van der berg', 'ana-da-silva', 'XAVIER', 'luiz iv'];
  for (const [entrada] of CASOS.concat(extras.map((e) => [e]))) {
    assert.strictEqual(front.formatarNome(entrada), formatarNome(entrada), entrada);
  }
});
