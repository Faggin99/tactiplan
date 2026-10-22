// PDF do plantel (app nativo): agrupamento e ordem iguais ao PDF do web (jsPDF).
const test = require('node:test');
const assert = require('node:assert');
const { buildPlantel, PERMISSION, BUILDERS } = require('../src/reports');
const { renderPlantel } = require('../src/reports/templates/plantel');
const { teamPalette } = require('../src/reports/theme');

const a = (id, name, group, extra = {}) => ({ id, name, group, position: 'MEI', ...extra });

test('buildPlantel: Grupo 1, 2, 3, Transição, DM, Sem grupo; nomes A–Z; grupo vazio some', () => {
  const vm = buildPlantel([
    a('1', 'Zé', '1'), a('2', 'Ana', '1'), a('3', 'Bia', 'DM'), a('4', 'Caio', null), a('5', 'Davi', 'Transição'), a('6', 'Edu', 'xyz'),
  ]);
  assert.deepEqual(vm.groups.map((g) => g.label), ['Grupo 1', 'Transição', 'DM', 'Sem grupo']);
  assert.deepEqual(vm.groups[0].players.map((p) => p.name), ['Ana', 'Zé']);
  assert.deepEqual(vm.groups[3].players.map((p) => p.name), ['Caio', 'Edu'], 'grupo desconhecido cai em Sem grupo');
  assert.equal(vm.total, 6);
});

test('plantel: tipo novo com athletes:view e HTML com pé/altura/nascimento', () => {
  assert.equal(PERMISSION.plantel, 'athletes:view');
  assert.equal(typeof BUILDERS.plantel, 'function');
  const vm = buildPlantel([a('1', 'Ana', '2', { preferred_foot: 'left', height_cm: 172, birthdate: '2010-05-03', jersey_number: 7 })]);
  const html = renderPlantel({ ...vm, team: { name: 'Clube X', short: 'CX', palette: teamPalette(null) }, meta: 'Futebol 11', right: '' }, { now: new Date('2026-10-22T12:00:00Z') });
  assert.match(html, /Grupo 2/);
  assert.match(html, /Esquerdo/);
  assert.match(html, /172 cm/);
  assert.match(html, /03\/05\/2010/);
});
