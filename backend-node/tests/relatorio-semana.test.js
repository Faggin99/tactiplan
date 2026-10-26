// Programação da semana (POST /api/reports/semana): resumo da tela, não as estatísticas.
const test = require('node:test');
const assert = require('node:assert');
const B = require('../src/reports/builders');
const { renderWeekProgram } = require('../src/reports/templates/semana');
const { teamPalette } = require('../src/reports/theme');

const team = { name: 'Clube', short: 'CL', modality: 'football_11', modalityLabel: 'Futebol 11', palette: teamPalette('#1B8A3E'), logoUrl: null };
const period = B.buildPeriod({ start: '2031-03-10', end: '2031-03-16', filterType: '1-micro' });
const bloco = (name, min, conteudo, dim, titulo) => ({
  name, activity: { id: `a-${name}-${min}`, duration_minutes: min, title: titulo ? { title: titulo } : null, contents: [{ name: conteudo, dimension: dim }], stages: [], groups: [] },
});

test('programação da semana: períodos, pilar predominante, jogo, descanso, avaliação e vazio', () => {
  const details = [
    { id: 's1', date: '2031-03-10', session_type: 'training', periodo: null, avg_distance_km: 6,
      blocks: [bloco('Aquecimento', 10, 'Aeróbio', 'fisico'), bloco('Atividade 1', 30, 'Organização Ofensiva', 'tatico', '11x0')] },
    { id: 't2', date: '2031-03-11', session_type: 'training', periodo: 'tarde', blocks: [bloco('Atividade 1', 45, 'Organização Defensiva', 'tatico')] },
    { id: 't1', date: '2031-03-11', session_type: 'training', periodo: 'manha', blocks: [bloco('Atividade 1', 40, 'Força', 'fisico')] },
    { id: 'j', date: '2031-03-12', session_type: 'match', opponent_name: 'Rival', match_round: '2', match_location: 'away',
      blocks: [bloco('Não relacionados', 15, 'Coordenação', 'fisico')] },
    { id: 'd', date: '2031-03-13', session_type: 'rest', blocks: [] },
    { id: 'av', date: '2031-03-14', session_type: 'assessment', periodo: 'manha', assessment_types: ['fisica'], blocks: [] },
  ];
  const vm = B.buildWeekProgram({ team, period, details, weekNumber: 11, gamesById: new Map([['j', { goals_scored: 2, goals_conceded: 1, result: 'win' }]]) });
  const [seg, ter, qua, qui, sex, sab, dom] = vm.days;
  assert.equal(seg.periodos[0].label, 'Manhã');
  assert.equal(seg.periodos[0].pillar, 'Tático');
  assert.deepEqual(seg.periodos[0].blocks.map((b) => [b.phase, b.content, b.title]), [['Aquecimento', 'Aeróbio', ''], ['Atividade 1', 'Organização Ofensiva', '11x0']]);
  assert.equal(seg.minutes, 40);
  assert.equal(seg.km, 6);
  assert.deepEqual(ter.periodos.map((p) => [p.label, p.pillar, p.total]), [['Manhã', 'Físico', 40], ['Tarde', 'Tático', 45]]);
  assert.equal(ter.split, '40+45');
  assert.equal(qua.periodos[0].type, 'match');
  assert.equal(qua.periodos[0].game.score, '2 × 1');
  assert.equal(qui.kind, 'descanso');
  assert.equal(sex.periodos[0].type, 'assessment');
  assert.equal(sex.minutes, 0);
  assert.equal(sab.kind, 'vazio');
  assert.equal(dom.kind, 'vazio');
  assert.equal(vm.badgeSub, '2 treinos · 1 jogo');
  // faixas: só a Terça tem 2 períodos → Manhã e Tarde; Seg (Manhã) entra na faixa dela;
  // jogo de período único, descanso e dia vazio ocupam a coluna inteira
  assert.deepEqual(vm.bandas, ['Manhã', 'Tarde']);
  assert.deepEqual(vm.days.map((d) => d.span), [false, false, true, true, false, true, true]);
  const html = renderWeekProgram(vm, { now: new Date('2031-03-17T12:00:00Z') });
  assert.match(html, /Programação da semana/);
  assert.match(html, /grid-row:2 \/ span 2/);
  assert.match(html, /class="bd"[^>]*>Tarde</);
  assert.match(html, /vs Rival/);
  assert.match(html, /AVALIAÇÃO/);
});
