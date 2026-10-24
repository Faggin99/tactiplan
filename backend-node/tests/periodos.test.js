// Períodos do dia (Manhã/Tarde/Noite): regras puras (services/periodos.js) e
// o que os relatórios montam (buildDays / buildDaySheet / ficha). Sem Postgres.
// O caminho completo no banco está em tests/periodos-db.test.js.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../src/services/periodos');
const B = require('../src/reports/builders');
const { renderSession } = require('../src/reports/templates/session');
const { teamPalette } = require('../src/reports/theme');

const WS = 'ws';
const CL = 'club';
const linha = (id, periodo, extra = {}) => ({ id, periodo, session_type: 'training', workspace_id: WS, club_id: CL, date: '2031-03-11', ...extra });

test('ordem e rótulos: único, Manhã, Tarde, Noite', () => {
  assert.deepEqual(['noite', null, 'tarde', 'manha'].map((p) => ({ periodo: p })).sort(P.compararPeriodos).map((x) => x.periodo), [null, 'manha', 'tarde', 'noite']);
  assert.equal(P.rotuloPeriodo('manha'), 'Manhã');
  assert.equal(P.rotuloPeriodo(null), null);
  assert.match(P.ordemSql('s'), /CASE s\.periodo WHEN 'manha'/);
});

test('montarDias: 1 por dia em `sessions`, períodos no campo novo, sem ciclo', () => {
  const dias = P.montarDias([
    { id: 'seg', date: '2031-03-10', periodo: null },
    { id: 't2', date: '2031-03-11', periodo: 'tarde' },
    { id: 't1', date: '2031-03-11', periodo: 'manha' },
  ]);
  assert.equal(dias.length, 2);
  assert.equal(dias[0].periodos, undefined);
  assert.equal(dias[1].id, 't1');
  assert.deepEqual(dias[1].periodos.map((p) => p.id), ['t1', 't2']);
  assert.equal(dias[1].periodos[0].periodos, undefined);
  JSON.stringify(dias);
});

test('mapaDoDia e distância: o dia soma os períodos de treino', () => {
  const rows = [
    linha('a', 'manha', { avg_distance_km: '5.00' }),
    linha('b', 'tarde', { avg_distance_km: 3.5 }),
    linha('c', 'noite', { session_type: 'match', avg_distance_km: 9 }),
    linha('d', null, { date: '2031-03-12' }),
  ];
  const mapa = P.mapaDoDia(rows);
  assert.equal(mapa.get('b'), 'a');
  assert.equal(mapa.get('c'), 'a');
  assert.equal(mapa.get('d'), 'd');
  assert.deepEqual(P.distanciaPorDia(rows), [{ id: 'a', date: '2031-03-11', session_type: 'training', avg_distance_km: 8.5 }]);
});

test('validarNovoPeriodo: nome do atual, repetido, máximo, descanso', () => {
  // dia único sem nome: o atual é Manhã por padrão (NULL = Manhã)
  assert.deepEqual(P.validarNovoPeriodo([linha('a', null)], { novo: 'tarde' }), { ok: true, renomearAtual: 'manha', novo: 'tarde' });
  assert.equal(P.validarNovoPeriodo([linha('a', null)], { novo: 'manha' }).status, 400);
  // dia único com nome (Tarde): o novo não pode repetir; o atual só muda se pedirem
  assert.deepEqual(P.validarNovoPeriodo([linha('a', 'tarde')], { novo: 'manha' }), { ok: true, renomearAtual: null, novo: 'manha' });
  assert.deepEqual(P.validarNovoPeriodo([linha('a', 'tarde')], { atual: 'noite', novo: 'manha' }), { ok: true, renomearAtual: 'noite', novo: 'manha' });
  assert.equal(P.validarNovoPeriodo([linha('a', 'tarde')], { novo: 'tarde' }).status, 400);
  assert.deepEqual(P.validarNovoPeriodo([linha('a', null)], { atual: 'manha', novo: 'tarde' }), { ok: true, renomearAtual: 'manha', novo: 'tarde' });
  assert.equal(P.validarNovoPeriodo([linha('a', null)], { atual: 'tarde', novo: 'tarde' }).ok, false);
  assert.equal(P.validarNovoPeriodo([linha('a', 'manha'), linha('b', 'tarde')], { novo: 'tarde' }).status, 409);
  assert.deepEqual(P.validarNovoPeriodo([linha('a', 'manha'), linha('b', 'tarde')], { novo: 'noite' }), { ok: true, renomearAtual: null, novo: 'noite' });
  assert.equal(P.validarNovoPeriodo([linha('a', 'manha'), linha('b', 'tarde'), linha('c', 'noite')], { novo: 'noite' }).status, 409);
  assert.equal(P.validarNovoPeriodo([linha('a', null, { session_type: 'rest' })], { atual: 'manha', novo: 'tarde' }).status, 409);
  assert.equal(P.validarNovoPeriodo([linha('a', null)], { atual: 'manha', novo: 'madrugada' }).status, 400);
});

test('remoção e tipo: sobra 1 com o nome dele, descanso só no dia de 1 período, 1 jogo por dia', () => {
  const dia = [linha('a', 'manha'), linha('b', 'tarde', { session_type: 'match' })];
  assert.deepEqual(P.validarRemocao(dia, 'b'), { ok: true });
  assert.equal(P.validarRemocao([linha('a', null)], 'a').status, 409);
  assert.equal(P.validarRemocao(dia, 'zz').status, 404);
  assert.equal(P.validarTipo(dia, 'a', 'rest').ok, false);
  assert.equal(P.validarTipo(dia, 'a', 'match').ok, false);
  assert.equal(P.validarTipo(dia, 'b', 'match').ok, true);
  assert.equal(P.validarTipo([linha('a', null)], 'a', 'rest').ok, true);
  assert.equal(P.divisaoMinutos([{ minutes: 90 }, { minutes: 60 }]), '90+60');
  assert.equal(P.divisaoMinutos([{ minutes: 90 }]), null);
});

const period = B.buildPeriod({ start: '2031-03-10', end: '2031-03-16', filterType: '1-micro' });

test('relatório de treino (semana): soma do dia + divisão; jogo com período de treino', () => {
  const sessions = [
    { id: 'seg', date: '2031-03-10', session_type: 'training', periodo: null, minutes: 30 },
    { id: 't2', date: '2031-03-11', session_type: 'training', periodo: 'tarde', minutes: 60, avg_distance_km: 3 },
    { id: 't1', date: '2031-03-11', session_type: 'training', periodo: 'manha', minutes: 90, avg_distance_km: 5 },
    { id: 'q1', date: '2031-03-12', session_type: 'training', periodo: 'manha', minutes: 70 },
    { id: 'q2', date: '2031-03-12', session_type: 'match', periodo: 'tarde', minutes: 20, opponent_name: 'Rival' },
  ];
  const days = B.buildDays({ period, sessions, sessionsByDate: [{
    session_id: 't1',
    contents: [{ name: 'Organização Ofensiva', minutes: 90, count: 1 }, { name: 'Força', minutes: 60, count: 1 }],
    contentsByPeriod: { t1: [{ name: 'Organização Ofensiva', minutes: 90, count: 1 }], t2: [{ name: 'Força', minutes: 60, count: 1 }] },
  }], gamesById: new Map() });
  assert.equal(days[0].split, null, 'dia de período único: igual a antes');
  assert.equal(days[0].note, null);
  assert.equal(days[1].minutes, 150);
  assert.equal(days[1].split, '90+60');
  assert.equal(days[1].distanceKm, 8);
  // a célula mostra cada período com o seu conteúdo e tempo (sem nota de rodapé)
  assert.equal(days[1].note, null);
  assert.deepEqual(days[1].periods.map((p) => [p.label, p.focus, p.minutes]), [['Manhã', 'Org Of', 90], ['Tarde', 'Força', 60]]);
  assert.equal(days[2].kind, 'jogo');
  assert.match(days[2].note, /Manhã 70' de treino \+ 20' com os não relacionados \(Tarde\)/);
});

const team = { name: 'Clube', short: 'CL', modalityLabel: 'Futebol 11', palette: teamPalette('#1B8A3E'), logoUrl: null };
const sessao = (id, periodo, minutos, extra = {}) => ({
  id, periodo, date: '2031-03-11', session_type: 'training', day_name: 'Terça',
  blocks: [{ name: 'Aquecimento', order: 1, activity: { id: `a-${id}`, duration_minutes: minutos, contents: [{ name: 'Resistência', dimension: 'fisico' }], stages: [], groups: [] } }],
  ...extra,
});

test('ficha do dia: 1 período = ficha de antes; 2 períodos = em sequência com a soma', () => {
  const uma = B.buildDaySheet({ sessions: [sessao('x', null, 40)], team, weekNumber: 11 });
  assert.equal(uma.type, 'training');
  assert.equal(uma.periodos, undefined);

  const vm = B.buildDaySheet({ sessions: [sessao('t', 'tarde', 60), sessao('m', 'manha', 90, { avg_distance_km: 5 })], team, weekNumber: 11 });
  assert.equal(vm.type, 'periodos');
  assert.deepEqual(vm.periodos.map((p) => p.label), ['Manhã', 'Tarde']);
  assert.equal(vm.total, 150);
  assert.equal(vm.split, '90+60');
  assert.equal(vm.badgeTop, '150 min');
  assert.match(vm.badgeSub, /2 períodos · 90\+60/);
  const html = renderSession(vm, { now: new Date('2031-03-11T12:00:00Z') });
  assert.ok(html.indexOf('Linha do tempo · Manhã') > 0);
  assert.ok(html.indexOf('Linha do tempo · Manhã') < html.indexOf('Linha do tempo · Tarde'));
});

test('proximasPorDia (Início): dia com 2 períodos vira 1 linha, jogo prevalece no rótulo', () => {
  const rows = [
    linha('a1', 'manha', { date: '2031-03-11' }),
    linha('a2', 'tarde', { date: '2031-03-11', session_type: 'match', opponent_name: 'Rival' }),
    linha('b', null, { date: '2031-03-12' }),
    linha('c2', 'tarde', { date: '2031-03-13' }),
    linha('c1', 'manha', { date: '2031-03-13' }),
  ];
  const dias = P.proximasPorDia(rows, 5);
  assert.equal(dias.length, 3);
  assert.equal(dias[0].id, 'a1');
  assert.equal(dias[0].session_type, 'match');
  assert.equal(dias[0].opponent_name, 'Rival');
  assert.deepEqual(dias[0].periodos.map((p) => p.periodo), ['manha', 'tarde']);
  assert.equal(dias[1].periodos, undefined);
  assert.deepEqual(dias[2].periodos.map((p) => p.id), ['c1', 'c2']);
  assert.equal(P.proximasPorDia(rows, 2).length, 2);
});

test('período único: NULL vale Manhã; trocar horário vale no dia de 1 período (não no descanso)', () => {
  assert.equal(P.periodoEfetivo(linha('a', null)), 'manha');
  assert.equal(P.periodoEfetivo(linha('a', 'noite')), 'noite');
  assert.equal(P.periodoEfetivo(linha('a', null, { session_type: 'rest' })), null);
  assert.deepEqual(P.validarRenomear([linha('a', null)], 'a', 'tarde'), { ok: true });
  assert.deepEqual(P.validarRenomear([linha('a', 'tarde')], 'a', 'noite'), { ok: true });
  assert.equal(P.validarRenomear([linha('a', null, { session_type: 'rest' })], 'a', 'tarde').status, 409);
  assert.equal(P.validarRenomear([linha('a', 'manha'), linha('b', 'tarde')], 'a', 'tarde').status, 409);
});

test('ficha do dia de período único: título com o período discreto (Manhã padrão); jogo não', () => {
  const team = { name: 'X', short: 'X', palette: teamPalette(null), modality: 'football_11' };
  const s = { id: 's1', date: '2031-03-11', day_name: 'Terça', session_type: 'training', periodo: null, blocks: [] };
  const vm = B.buildDaySheet({ sessions: [s], team });
  assert.notEqual(vm.type, 'periodos');
  assert.match(vm.title, / · Manhã$/);
  const vt = B.buildDaySheet({ sessions: [{ ...s, periodo: 'tarde' }], team });
  assert.match(vt.title, / · Tarde$/);
  const vj = B.buildDaySheet({ sessions: [{ ...s, session_type: 'match', opponent_name: 'Y' }], team });
  assert.doesNotMatch(vj.title, /Manhã/);
});
