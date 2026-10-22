// Período de AVALIAÇÃO (session_type 'assessment', migration 059) — regras puras,
// microciclo do PDF de treino (etiqueta AVALIAÇÃO, barra fina por pilar, sem "125+0")
// e ficha do dia (card "Avaliação · tipos").
const test = require('node:test');
const assert = require('node:assert');
const P = require('../src/services/periodos');
const B = require('../src/reports/builders');
const { renderTraining } = require('../src/reports/templates/training');
const { renderSession } = require('../src/reports/templates/session');

const team = { name: 'Clube', short: 'CL', modalityLabel: 'Futebol', palette: {} };
const now = new Date('2026-10-22T12:00:00Z');

test('normalizarAvaliacao: lista fixa, ordem da lista, sem repetir, "Outra" com texto', () => {
  assert.deepEqual(P.normalizarAvaliacao({ tipos: ['tecnica', 'fisica', 'fisica'] }), { ok: true, tipos: ['fisica', 'tecnica'], outra: null });
  assert.deepEqual(P.normalizarAvaliacao({ tipos: [], outra: '  Yo-Yo   test ' }), { ok: true, tipos: ['outra'], outra: 'Yo-Yo test' });
  assert.equal(P.normalizarAvaliacao({ tipos: ['outra'] }).ok, false, '"Outra" sem texto');
  assert.equal(P.normalizarAvaliacao({ tipos: ['nutricional'] }).ok, false, 'tipo fora da lista');
  assert.equal(P.normalizarAvaliacao({ tipos: ['fisica'], outra: 'x'.repeat(61) }).ok, false, 'até 60 caracteres');
  assert.equal(P.normalizarAvaliacao({ tipos: ['fisica'], outra: 'x'.repeat(60) }).ok, true);
  assert.deepEqual(P.normalizarAvaliacao({}), { ok: true, tipos: [], outra: null }, 'sem tipo ainda vale (escolhe depois)');
});

test('rótulos: "Outra" vira o texto; Fisiológica/Médica', () => {
  const s = { session_type: 'assessment', assessment_types: ['fisica', 'fisiologica', 'outra'], assessment_other: 'Yo-Yo' };
  assert.deepEqual(P.rotulosAvaliacao(s), ['Física', 'Fisiológica/Médica', 'Yo-Yo']);
  assert.equal(P.textoAvaliacao({ session_type: 'assessment' }), '', 'dado sem tipos não quebra');
});

test('regras do dia: avaliação ao lado de treino ou jogo, ou sozinha; descanso continua do dia inteiro', () => {
  const dia = [
    { id: 'a', periodo: 'manha', session_type: 'assessment' },
    { id: 'b', periodo: 'tarde', session_type: 'match' },
  ];
  assert.equal(P.validarTipo(dia, 'a', 'assessment').ok, true);
  assert.equal(P.validarTipo(dia, 'a', 'match').ok, false, 'só 1 jogo por dia');
  assert.equal(P.validarTipo(dia, 'b', 'assessment').ok, true, 'jogo vira avaliação');
  assert.equal(P.validarTipo(dia, 'a', 'rest').ok, false, 'descanso é do dia inteiro');
  assert.equal(P.validarTipo(dia, 'a', 'xyz').status, 400);
  assert.equal(P.validarTipo([{ id: 'a', session_type: 'training' }], 'a', 'assessment').ok, true, 'sozinha no dia');
  // adicionar período de avaliação
  const unico = [{ id: 'a', periodo: null, session_type: 'training' }];
  const v = P.validarNovoPeriodo(unico, { novo: 'tarde', tipo: 'assessment' });
  assert.equal(v.ok, true);
  assert.equal(P.validarNovoPeriodo(unico, { novo: 'tarde', tipo: 'match' }).ok, false, 'período novo: treino ou avaliação');
  assert.equal(P.validarNovoPeriodo([{ id: 'a', periodo: null, session_type: 'assessment' }], { novo: 'tarde' }).ok, true, 'avaliação de manhã + treino à tarde');
  // período de avaliação mostra o período (Manhã é o padrão)
  assert.equal(P.periodoEfetivo({ session_type: 'assessment', periodo: null }), 'manha');
});

test('divisão de minutos: só com 2+ períodos com minutos (nunca "125+0")', () => {
  assert.equal(P.divisaoMinutos([{ minutes: 125 }, { minutes: 0 }]), null);
  assert.equal(P.divisaoMinutos([{ minutes: 90 }, { minutes: 60 }]), '90+60');
  assert.equal(P.divisaoMinutos([{ minutes: 90 }, { minutes: 0 }, { minutes: 30 }]), '90+30');
  assert.equal(P.divisaoMinutos([{ minutes: 90 }]), null);
});

function semana(sessions, sessionsByDate = []) {
  return B.buildTrainingReport({
    stats: { totals: { activities: 3, minutes: 185, sessions: 2, uniqueTemplates: 1 }, byDimension: [], byDimensionPresence: [], byContent: [], sessionsByDate },
    sessions,
    gamesById: new Map(),
    team,
    period: { start: '2026-10-19', end: '2026-10-25', days: 7, isSingleWeek: true, rangeShort: '19–25/10', year: 2026, label: 'Semana 43' },
  });
}

test('microciclo do PDF: dia só de avaliação, dia misto, barra por pilar e sem "+0"', () => {
  const sessions = [
    // seg: manhã treino 125 + tarde avaliação (sem minutos)
    { id: 's1', date: '2026-10-19', session_type: 'training', periodo: 'manha', minutes: 125 },
    { id: 's2', date: '2026-10-19', session_type: 'assessment', periodo: 'tarde', minutes: 0, assessment_types: ['fisica', 'tecnica'] },
    // ter: só avaliação
    { id: 's3', date: '2026-10-20', session_type: 'assessment', periodo: null, minutes: 0, assessment_types: ['antropometrica'] },
    // qua: treino 60
    { id: 's4', date: '2026-10-21', session_type: 'training', periodo: null, minutes: 60 },
  ];
  const sessionsByDate = [
    { session_id: 's1', date: '2026-10-19', contents: [{ name: 'Organização Ofensiva', dimension: 'tatico', count: 2, minutes: 100 }], pillarMinutes: { tatico: 100, fisico: 25 } },
    { session_id: 's4', date: '2026-10-21', contents: [{ name: 'Resistência', dimension: 'fisico', count: 1, minutes: 60 }], pillarMinutes: { fisico: 60 } },
  ];
  const vm = semana(sessions, sessionsByDate);
  const [seg, ter, qua] = vm.days;
  assert.equal(seg.kind, 'treino');
  assert.equal(seg.minutes, 125);
  assert.equal(seg.split, null, 'só um período com minutos: sem divisão');
  assert.equal(seg.note, null);
  assert.equal(seg.assessment.text, 'Física, Técnica');
  assert.deepEqual(seg.pillars.map((g) => [g.key, g.minutes]), [['tatico', 100], ['fisico', 25]]);
  assert.equal(ter.kind, 'avaliacao');
  assert.equal(ter.minutes, 0);
  assert.equal(ter.assessment.text, 'Antropométrica');
  assert.equal(qua.kind, 'treino');
  assert.equal(vm.dayMax, 125);

  const html = renderTraining(vm, { now });
  assert.doesNotMatch(html, /125\+0/);
  assert.match(html, /class="day assess"/);
  assert.match(html, /Avaliação<\/div><div class="fx av-tipos"><span>Antropométrica<\/span>/);
  assert.match(html, /Treino \+ Avaliação/);
  assert.match(html, /class="pbar"/, 'barra fina por pilar no lugar da coluna sólida');
  assert.doesNotMatch(html, /<div class="col"><i style="height/, 'nada de coluna sólida');
  // dia sem minutos: sem barra, só "—"
  const vazioHtml = html.split('class="day').find((c) => c.includes('Sem registro'));
  assert.ok(vazioHtml && !vazioHtml.includes('pbar'));
});

test('semanas (período longo): coluna empilhada pelos pilares, avaliação fora', () => {
  const weeks = B.buildWeeks({
    period: { start: '2026-10-05', end: '2026-10-25' },
    sessions: [
      { date: '2026-10-06', session_type: 'training', minutes: 90 },
      { date: '2026-10-07', session_type: 'assessment', minutes: 40 },
    ],
    sessionsByDate: [{ date: '2026-10-06', pillarMinutes: { tatico: 60, none: 30 } }],
  });
  assert.equal(weeks[0].minutes, 90);
  assert.deepEqual(weeks[0].pillars.map((g) => g.key), ['tatico', 'none']);
  assert.equal(weeks[1].minutes, 0);
});

test('ficha do dia: período de avaliação é um card "Avaliação · tipos", sem blocos', () => {
  const av = {
    id: 'a', date: '2026-10-19', session_type: 'assessment', periodo: 'manha', assessment_types: ['fisica', 'tecnica'],
    // atividade antiga de quando era treino: não aparece
    blocks: [{ name: 'Aquecimento', activity: { id: 'x', duration_minutes: 20, contents: [{ name: 'Resistência', dimension: 'fisico' }] } }],
  };
  const tr = {
    id: 't', date: '2026-10-19', session_type: 'training', periodo: 'tarde',
    blocks: [{ name: 'Principal', activity: { id: 'y', duration_minutes: 60, contents: [{ name: 'Organização Ofensiva', dimension: 'tatico' }] } }],
  };
  const so = B.buildDaySheet({ sessions: [av], team });
  assert.equal(so.type, 'assessment');
  assert.equal(so.blocks.length, 0);
  assert.equal(so.badgeTop, 'Avaliação');
  assert.match(so.title, /· Manhã$/);
  const htmlSo = renderSession(so, { now });
  assert.match(htmlSo, /Avaliação · Física, Técnica/);

  const dia = B.buildDaySheet({ sessions: [tr, av], team });
  assert.equal(dia.total, 60, 'avaliação não soma minutos');
  assert.equal(dia.split, null, 'sem "60+0"');
  const html = renderSession(dia, { now });
  assert.match(html, /Avaliação · Física, Técnica/);
  assert.match(html, /Linha do tempo · Tarde/);
  assert.ok(html.indexOf('Avaliação · Física') < html.indexOf('Linha do tempo · Tarde'), 'Manhã antes da Tarde');
});
