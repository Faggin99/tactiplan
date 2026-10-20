// Minutagem pelas substituições/expulsão + validação da substituição.
// Roda os MESMOS casos no backend (src/utils/minutagem.js) e no front (lib/minutagem.js).
// Uso: node --test tests/minutagem.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const back = require('../src/utils/minutagem');

function frontMinutagem() {
  const src = fs.readFileSync(path.join(__dirname, '../../frontend/src/lib/minutagem.js'), 'utf8').replace(/^export /gm, '');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}\nreturn { computeMinutagem, emCampo, reservasDisponiveis, validarSubstituicao };`)();
}
const IMPLS = [['backend', back], ['frontend', frontMinutagem()]];

const P = [
  { athlete_id: 'a', name: 'Titular A', status: 'starter' },
  { athlete_id: 'b', name: 'Titular B', status: 'starter' },
  { athlete_id: 'c', name: 'Titular C', status: 'starter' },
  { athlete_id: 'r1', name: 'Reserva 1', status: 'substitute' },
  { athlete_id: 'r2', name: 'Reserva 2', status: 'substitute' },
  { athlete_id: 'r3', name: 'Reserva 3', status: 'substitute' },
];
const sub = (minute, entra, sai, extra = {}) => ({ event_type: 'substitution', team: 'own', minute, player_id: entra, secondary_player_id: sai, ...extra });

for (const [nome, M] of IMPLS) {
  test(`[${nome}] sem eventos: titular joga a duração, reserva 0`, () => {
    const r = M.computeMinutagem({ players: P, events: [], duration: 93 });
    assert.strictEqual(r.a.minutes, 93);
    assert.strictEqual(r.r1.minutes, 0);
    assert.strictEqual(r.r1.played, false);
    assert.strictEqual(r.a.started, true);
  });

  test(`[${nome}] titular sai aos 32 → 32; reserva entra aos 32 → 61`, () => {
    const r = M.computeMinutagem({ players: P, events: [sub(32, 'r1', 'a')], duration: 93 });
    assert.strictEqual(r.a.minutes, 32);
    assert.strictEqual(r.a.leftAt, 32);
    assert.strictEqual(r.r1.minutes, 61);
    assert.strictEqual(r.r1.entered, true);
    assert.strictEqual(r.r1.enteredAt, 32);
    assert.strictEqual(r.b.minutes, 93);
  });

  test(`[${nome}] reserva entra e sai: joga a diferença`, () => {
    const r = M.computeMinutagem({ players: P, events: [sub(70, 'r2', 'r1'), sub(30, 'r1', 'b')], duration: 90 });
    assert.strictEqual(r.b.minutes, 30);
    assert.strictEqual(r.r1.minutes, 40, 'entrou 30, saiu 70');
    assert.strictEqual(r.r2.minutes, 20);
  });

  test(`[${nome}] expulsão: titular expulso aos 55 joga 55; reserva expulso conta a partir da entrada`, () => {
    const ev = [
      { event_type: 'red_card', team: 'own', minute: 55, player_id: 'c' },
      sub(60, 'r1', 'a'),
      { event_type: 'red_card', team: 'own', minute: 80, player_id: 'r1' },
      { event_type: 'red_card', team: 'opponent', minute: 10, player_id: null },
    ];
    const r = M.computeMinutagem({ players: P, events: ev, duration: 90 });
    assert.strictEqual(r.c.minutes, 55);
    assert.strictEqual(r.c.sentOffAt, 55);
    assert.strictEqual(r.r1.minutes, 20);
    assert.strictEqual(r.a.minutes, 60);
  });

  test(`[${nome}] ajuste manual não é sobrescrito; acréscimo é limitado à duração`, () => {
    const players = P.map((p) => (p.athlete_id === 'b' ? { ...p, minutes_manual: true, minutes_played: 70 } : p));
    const r = M.computeMinutagem({ players, events: [sub(95, 'r1', 'a')], duration: 90 });
    assert.strictEqual(r.b.minutes, 70);
    assert.strictEqual(r.b.auto, 90);
    assert.strictEqual(r.b.manual, true);
    assert.strictEqual(r.a.minutes, 90, 'sub no acréscimo (95) = fim do jogo');
    assert.strictEqual(r.r1.minutes, 0);
    assert.strictEqual(r.r1.played, true, 'entrou, mesmo com 0 min');
  });

  test(`[${nome}] eventos sem time ou do adversário`, () => {
    const r = M.computeMinutagem({ players: P, events: [{ ...sub(40, 'r1', 'a'), team: null }, { ...sub(50, 'r2', 'b'), team: 'opponent' }], duration: 90 });
    assert.strictEqual(r.a.minutes, 40, 'sem time conta como nosso');
    assert.strictEqual(r.b.minutes, 90, 'do adversário não conta');
  });

  test(`[${nome}] validação da substituição`, () => {
    const events = [sub(32, 'r1', 'a', { id: 'e1' }), { id: 'e2', event_type: 'red_card', team: 'own', minute: 50, player_id: 'c' }];
    const v = (s, ign = null) => M.validarSubstituicao({ players: P, events, duration: 90, sub: s, ignore: ign });
    assert.deepStrictEqual(v({ minute: 60, player_id: 'r2', secondary_player_id: 'b' }), { ok: true });
    assert.match(v({ minute: 60, player_id: 'r2', secondary_player_id: 'a' }).error, /já saiu/);
    assert.match(v({ minute: 60, player_id: 'r1', secondary_player_id: 'b' }).error, /já entrou/);
    assert.match(v({ minute: 60, player_id: 'b', secondary_player_id: 'r1' }).error, /precisa ser reserva/);
    assert.match(v({ minute: 60, player_id: 'r2', secondary_player_id: 'c' }).error, /expulso/);
    assert.match(v({ minute: 20, player_id: 'r2', secondary_player_id: 'r1' }).error, /só entra aos 32/);
    assert.match(v({ minute: 60, player_id: 'r3', secondary_player_id: 'r2' }).error, /não está em campo/);
    assert.match(v({ minute: 60, player_id: 'r2', secondary_player_id: 'r2' }).error, /diferentes/);
    assert.match(v({ minute: 60, player_id: '', secondary_player_id: 'b' }).error, /quem entra/);
    assert.match(v({ minute: 60, player_id: 'x', secondary_player_id: 'b' }).error, /não está relacionado/);
    assert.deepStrictEqual(v({ minute: 70, player_id: 'r2', secondary_player_id: 'r1' }), { ok: true }, 'quem entrou pode sair depois');
    // editando a própria substituição (ignore) não acusa "já entrou/saiu"
    assert.deepStrictEqual(v({ minute: 35, player_id: 'r1', secondary_player_id: 'a' }, events[0]), { ok: true });
  });

  test(`[${nome}] opções do formulário: em campo no minuto e reservas não usados`, () => {
    const events = [sub(32, 'r1', 'a')];
    const campo = M.emCampo({ players: P, events, duration: 90, minute: 40 }).map((p) => p.athlete_id);
    assert.deepStrictEqual(campo, ['b', 'c', 'r1']);
    const antes = M.emCampo({ players: P, events, duration: 90, minute: 10 }).map((p) => p.athlete_id);
    assert.deepStrictEqual(antes, ['a', 'b', 'c']);
    assert.deepStrictEqual(M.reservasDisponiveis({ players: P, events }).map((p) => p.athlete_id), ['r2', 'r3']);
  });
}

test('[backend] checagem ao salvar: titular como "quem entrou" é recusado', () => {
  const ok = back.checarSubstituicoes({ players: P, events: [sub(32, 'r1', 'a'), sub(70, 'r2', 'r1')] });
  assert.deepStrictEqual(ok, { ok: true });
  const tit = back.checarSubstituicoes({ players: P, events: [sub(32, 'b', 'a')] });
  assert.strictEqual(tit.ok, false);
  assert.match(tit.error, /Titular B é titular\. Quem entra numa substituição precisa ser reserva/);
  assert.match(back.checarSubstituicoes({ players: P, events: [sub(32, 'r1', 'a'), sub(50, 'r1', 'b')] }).error, /já entrou/);
  assert.match(back.checarSubstituicoes({ players: P, events: [sub(32, 'r1', 'r1')] }).error, /mesmo atleta/);
  assert.match(back.checarSubstituicoes({ players: P, events: [sub(32, 'zz', 'a')] }).error, /não está relacionado/);
  assert.deepStrictEqual(back.checarSubstituicoes({ players: P, events: [{ ...sub(32, 'b', 'a'), team: 'opponent' }] }), { ok: true }, 'só o nosso time');
});

for (const [nome, M] of IMPLS) {
  test(`[${nome}] substituição incompleta (legado) não conta na minutagem`, () => {
    const r = M.computeMinutagem({ players: P, events: [sub(32, 'r1', null), sub(50, null, 'a')], duration: 90 });
    assert.strictEqual(r.r1.minutes, 0);
    assert.strictEqual(r.a.minutes, 90);
  });
}

test('[backend] checagem ao salvar: incompleta passa', () => {
  assert.deepStrictEqual(back.checarSubstituicoes({ players: P, events: [sub(32, 'b', null), sub(88, null, 'a')] }), { ok: true });
});
