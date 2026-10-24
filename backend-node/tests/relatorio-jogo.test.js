// Relatório de UM jogo (POST /api/reports/jogo): lances em ordem, atletas com minutos/gols/cartões.
const test = require('node:test');
const assert = require('node:assert');
const B = require('../src/reports/builders');
const { renderJogo } = require('../src/reports/templates/jogo');
const { teamPalette } = require('../src/reports/theme');

const team = { name: 'Clube', short: 'CL', modality: 'football_11', modalityLabel: 'Futebol 11', palette: teamPalette('#1B8A3E'), logoUrl: null };

test('relatório do jogo: placar, lances por minuto e atletas', () => {
  const callUp = B.buildCallUp({
    session: { date: '2031-03-12', opponent_name: 'Rival', match_round: '3', match_location: 'home' },
    team,
    formation: '4-4-2',
    competitionName: 'Mineiro',
    players: [
      { athlete_id: 'a1', status: 'starter', slot: 0, name: 'Goleiro Um', position: 'GOL', jersey_number: 1 },
      { athlete_id: 'a2', status: 'starter', slot: 9, name: 'Atacante Dois', position: 'CA', jersey_number: 9 },
      { athlete_id: 'a3', status: 'substitute', slot: null, name: 'Reserva Três', position: 'MEI', jersey_number: 18 },
      { athlete_id: 'a4', status: 'substitute', slot: null, name: 'Reserva Quatro', position: 'ZAG', jersey_number: 20 },
    ],
  });
  const game = {
    matchesHistory: [{ goals_scored: 2, goals_conceded: 1, result: 'win', substitutions: [{ minute: 60 }] }],
    playerStats: [
      { athlete_id: 'a1', minutes: 90 },
      { athlete_id: 'a2', minutes: 60, goals: 2, yellow_cards: 1 },
      { athlete_id: 'a3', minutes: 30, assists: 1 },
    ],
  };
  const events = [
    { event_type: 'goal_scored', team: 'own', minute: 70, athlete_name: 'Atacante Dois', secondary_athlete_name: 'Reserva Três', goal_type: 'org_off' },
    { event_type: 'goal_conceded', team: 'opponent', minute: 10, goal_type: 'bp_def_corner' },
    { event_type: 'substitution', team: 'own', minute: 60, athlete_name: 'Reserva Três', secondary_athlete_name: 'Atacante Dois' },
    { event_type: 'yellow_card', team: 'own', minute: null, athlete_name: 'Atacante Dois' },
    { event_type: 'goal_scored', team: 'own', minute: 25, athlete_name: 'Atacante Dois', goal_type: 'trans_off' },
  ];
  const vm = B.buildGameSheet({ callUp, game, events, duration: 90, goalTypeLabel: (t) => `T:${t}` });
  assert.equal(vm.score, '2 × 1');
  assert.equal(vm.resultLabel, 'Vitória');
  assert.deepEqual(vm.lances.map((l) => [l.min, l.kind]), [[10, 'sofrido'], [25, 'gol'], [60, 'troca'], [70, 'gol'], [null, 'amarelo']]);
  assert.equal(vm.lances[3].sub, 'assist. Reserva Três · T:org_off');
  assert.deepEqual(vm.titulares.map((r) => [r.name, r.minutes, r.goals, r.yellow]), [['Goleiro Um', 90, 0, 0], ['Atacante Dois', 60, 2, 1]]);
  assert.deepEqual(vm.reservas.map((r) => [r.name, r.played]), [['Reserva Três', true], ['Reserva Quatro', false]]);
  assert.deepEqual(vm.kpis, { usados: 3, convocados: 4, subs: 1, yellow: 1, red: 0 });
  assert.ok(vm.meta.includes('Mineiro'));
  const html = renderJogo(vm, { now: new Date('2031-03-13T12:00:00Z') });
  assert.match(html, /Clube × Rival/);
  assert.match(html, /não entrou/);
});
