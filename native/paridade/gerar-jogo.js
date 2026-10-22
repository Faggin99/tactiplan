#!/usr/bin/env node
// Gera native/paridade/jogo.json: casos de JOGO calculados pelo CÓDIGO DO WEB
// (frontend/src/lib/formation.js, posicaoEmCampo.js, minutagem.js; helpers do EventModal/GameModal;
// backend-node/src/utils/minutagem.js#checarSubstituicoes). Os testes do app (TactiPlanKit e
// Android) leem este arquivo e conferem que dão o MESMO resultado.
//   node native/paridade/gerar-jogo.js          → regrava o arquivo
//   node native/paridade/gerar-jogo.js --check  → falha se o web mudou e o arquivo não (npm test)
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '../..');
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');

function carregarFront() {
  const formacoes = JSON.parse(ler('shared/formacoes.json'));
  const pos = ler('frontend/src/lib/posicaoEmCampo.js').replace(/^export .*$/gm, '');
  const form = ler('frontend/src/lib/formation.js')
    .replace(/^import .*$/gm, '')
    .replace(/^export \{[^}]*\} from .*$/gm, '')
    .replace(/^export /gm, '');
  const min = ler('frontend/src/lib/minutagem.js').replace(/^export /gm, '');
  // eslint-disable-next-line no-new-func
  return new Function('formacoes', `${pos}\n${form}\n${min}\nreturn { posicaoEmCampo, formationsFor, defaultFormation, resolveFormation, buildSlots, slotCount, slotRole, remapFormation, suggestSlots, initials, shortName, computeMinutagem, emCampo, reservasDisponiveis, validarSubstituicao };`)(formacoes);
}

// Funções de topo do EventModal (parseGoalType / serializeGoalType), lidas do próprio arquivo.
function carregarEventModal() {
  const src = ler('frontend/src/components/training/EventModal.jsx');
  const pega = (nome) => {
    const i = src.indexOf(`function ${nome}(`);
    if (i < 0) throw new Error(`EventModal sem ${nome}`);
    let n = 0; let j = src.indexOf('{', i);
    for (; j < src.length; j++) { if (src[j] === '{') n++; else if (src[j] === '}') { n--; if (n === 0) break; } }
    return src.slice(i, j + 1);
  };
  // eslint-disable-next-line no-new-func
  return new Function(`${pega('parseGoalType')}\n${pega('serializeGoalType')}\nreturn { parseGoalType, serializeGoalType };`)();
}

// Contas de minuto do EventModal (dentro do componente): mesmo código, como funções.
function minutoTotal(half, minuteInHalf, stoppageTime, matchDuration) {
  const half1Max = Math.floor(matchDuration / 2);
  if (half === 1) return stoppageTime > 0 ? half1Max + stoppageTime : minuteInHalf;
  return stoppageTime > 0 ? matchDuration + stoppageTime : half1Max + minuteInHalf;
}
function lerMinuto(totalMin, matchDuration) {
  const half1Max = Math.floor(matchDuration / 2);
  const half2Max = matchDuration - half1Max;
  if (totalMin <= half1Max) return { half: 1, minuteInHalf: totalMin, stoppageTime: 0 };
  if (totalMin <= half1Max + 7) return { half: 1, minuteInHalf: half1Max, stoppageTime: totalMin - half1Max };
  if (totalMin <= matchDuration) return { half: 2, minuteInHalf: totalMin - half1Max, stoppageTime: 0 };
  return { half: 2, minuteInHalf: half2Max, stoppageTime: totalMin - matchDuration };
}
function textoMinuto(half, minuteInHalf, stoppageTime, matchDuration) {
  const half1Max = Math.floor(matchDuration / 2);
  if (half === 1) return stoppageTime > 0 ? `${half1Max}+${stoppageTime}'` : `${minuteInHalf}'`;
  return stoppageTime > 0 ? `${matchDuration}+${stoppageTime}'` : `${half1Max + minuteInHalf}'`;
}
// getGoalTypeLabel do GameModal (closure do componente), mesmo código.
function rotuloTipoGol(goalType) {
  if (!goalType) return '';
  const legacy = { offensive_org: 'Org. ofensiva', offensive_transition: 'Transição of.', free_kick: 'Falta', corner: 'Escanteio', penalty: 'Pênalti' };
  if (legacy[goalType]) return legacy[goalType];
  const m = String(goalType).match(/^(org|trans|bp)_(off|def)(?:_(.+))?$/);
  if (!m) return '';
  const of = m[2] === 'off';
  if (m[1] === 'org') return of ? 'Org. ofensiva' : 'Org. defensiva';
  if (m[1] === 'trans') return of ? 'Transição of.' : 'Transição def.';
  const bp = {
    falta: 'Falta', falta_frontal: 'Falta frontal', falta_lateral: 'Falta lateral', corner: 'Escanteio', lateral: 'Lateral',
    penalty: 'Pênalti', shootout: 'Shootout', tiro_livre: 'Tiro livre', falta_acumulada: 'Falta acumulada',
  };
  return `Bola parada${m[3] && bp[m[3]] ? ` · ${bp[m[3]]}` : ''}`;
}

function gerar() {
  const F = carregarFront();
  const EM = carregarEventModal();
  const back = require(path.join(RAIZ, 'backend-node/src/utils/minutagem.js'));
  const formacoes = JSON.parse(ler('shared/formacoes.json'));
  const out = { gerado_de: 'frontend/src/lib (formation, posicaoEmCampo, minutagem) + EventModal/GameModal + backend utils/minutagem', formacoes };

  // ---------- formação ----------
  out.vagas = [];
  for (const [mod, cfg] of Object.entries(formacoes)) {
    for (const f of cfg.opcoes) {
      const slots = F.buildSlots(f);
      out.vagas.push({
        modalidade: mod, formacao: f, total: F.slotCount(f),
        vagas: slots.map((s) => ({ indice: s.index, papel: s.role, linha: s.line, x: s.x, y: s.y, espaco: s.spacing })),
        posicoes: slots.map((s) => F.posicaoEmCampo(f, s.index, mod)),
      });
    }
  }
  out.posicao_extra = [
    ['4-4-2', null, 'football_11'], ['4-4-2', -1, 'football_11'], ['4-4-2', 11, 'football_11'], ['4-4-2', 0, 'futsal'],
    ['', 1, 'football_11'], ['9', 1, 'football_11'], ['4-0', 2, 'futsal'], ['3-1', 4, 'futsal'],
  ].map(([f, s, m]) => ({ formacao: f, vaga: s, modalidade: m, posicao: F.posicaoEmCampo(f, s, m) }));
  out.resolver = [
    ['football_11', '4-3-3'], ['football_11', null], ['football_11', '2-2'], ['futsal', '4-0'], ['futsal', '4-4-2'],
    ['football_7', ''], ['xyz', '4-3-3'], [null, null],
  ].map(([m, f]) => ({ modalidade: m, formacao: f, resultado: F.resolveFormation(m, f) }));

  const J = (id, status, slot, position, name) => ({ athlete_id: id, status, slot, name: name || id.toUpperCase(), athlete: { id, name: name || id.toUpperCase(), position } });
  const base11 = [
    J('g', 'starter', 0, 'GOL'), J('d1', 'starter', 1, 'LE'), J('d2', 'starter', 2, 'ZAG'), J('d3', 'starter', 3, 'ZAG'), J('d4', 'starter', 4, 'LD'),
    J('m1', 'starter', 5, 'MEI'), J('m2', 'starter', 6, 'VOL'), J('m3', 'starter', 7, 'MEI'), J('m4', 'starter', 8, 'MEI'),
    J('a1', 'starter', 9, 'CA'), J('a2', 'starter', 10, 'CA'), J('r1', 'substitute', null, 'MEI'), J('s1', 'starter', null, 'CA'),
  ];
  const strip = (ps) => ps.map((p) => ({ athlete_id: p.athlete_id, status: p.status, slot: p.slot ?? null }));
  out.remapear = [
    ['4-4-2', '4-3-3', base11], ['4-4-2', '3-5-2', base11], ['4-4-2', '5-3-2', base11], ['4-3-3', '4-4-2', base11],
    ['2-2', '4-0', [J('g', 'starter', 0), J('f1', 'starter', 1), J('f2', 'starter', 2), J('p1', 'starter', 3), J('p2', 'starter', 4)]],
    ['4-0', '3-1', [J('g', 'starter', 0), J('f1', 'starter', 1), J('f2', 'starter', 2), J('p1', 'starter', 3), J('p2', 'starter', 4)]],
    ['2-3-1', '3-2-1', [J('g', 'starter', 0), J('z1', 'starter', 1), J('z2', 'starter', 2), J('m1', 'starter', 3), J('m2', 'starter', 4), J('m3', 'starter', 5), J('c', 'starter', 6), J('x', 'starter', 9)]],
  ].map(([de, para, ps]) => {
    const r = F.remapFormation(ps, de, para);
    return { de, para, entrada: strip(ps).map((p, i) => ({ ...p, posicao: ps[i].athlete.position || null })), saida: strip(r.players), deslocados: r.displaced.map((p) => p.athlete_id) };
  });
  const sug = [
    ['4-4-2', [J('x1', 'starter', null, 'GOL'), J('x2', 'starter', null, 'ZAG'), J('x3', 'starter', null, 'CA'), J('x4', 'starter', null, 'MOF'), J('x5', 'starter', null, null), J('x6', 'substitute', null, 'GOL')]],
    ['4-4-2', [J('g', 'starter', 0, 'GOL'), J('x1', 'starter', null, 'GOL'), J('x2', 'starter', null, 'LD'), J('x3', 'starter', null)]],
    ['2-2', [J('y1', 'starter', null, 'PIV'), J('y2', 'starter', null, 'FIX'), J('y3', 'starter', null, 'ALA-D'), J('y4', 'starter', null, 'ALA-E'), J('y5', 'starter', null, 'XX'), J('y6', 'starter', null, 'GOL')]],
    ['4-3-3', [J('a', 'starter', null), J('b', 'starter', null), J('c', 'starter', null), J('d', 'starter', null), J('e', 'starter', null), J('f', 'starter', null), J('g2', 'starter', null), J('h', 'starter', null), J('i', 'starter', null), J('j', 'starter', null), J('k', 'starter', null), J('l', 'starter', null)]],
  ];
  out.sugerir = sug.map(([f, ps]) => ({ formacao: f, entrada: strip(ps).map((p, i) => ({ ...p, posicao: ps[i].athlete.position || null })), saida: strip(F.suggestSlots(ps, f)) }));
  out.nomes = ['Lucas Martins', 'Pelé', '  Ana  Maria  Souza ', '', 'joão'].map((n) => ({ nome: n, iniciais: F.initials(n), curto: F.shortName(n) }));

  // ---------- minutagem ----------
  const P = [
    { athlete_id: 'a', name: 'Titular A', status: 'starter' },
    { athlete_id: 'b', name: 'Titular B', status: 'starter' },
    { athlete_id: 'c', name: 'Titular C', status: 'starter' },
    { athlete_id: 'r1', name: 'Reserva 1', status: 'substitute' },
    { athlete_id: 'r2', name: 'Reserva 2', status: 'substitute' },
    { athlete_id: 'r3', name: 'Reserva 3', status: 'substitute' },
  ];
  const sub = (id, minute, entra, sai, extra = {}) => ({ id, event_type: 'substitution', team: 'own', minute, player_id: entra, secondary_player_id: sai, ...extra });
  const red = (id, minute, quem, team = 'own') => ({ id, event_type: 'red_card', team, minute, player_id: quem });
  const cenarios = [
    { nome: 'sem eventos', players: P, events: [], duration: 93 },
    { nome: 'titular sai aos 32', players: P, events: [sub('e1', 32, 'r1', 'a')], duration: 93 },
    { nome: 'reserva entra e sai (fora de ordem)', players: P, events: [sub('e1', 70, 'r2', 'r1'), sub('e2', 30, 'r1', 'b')], duration: 90 },
    { nome: 'expulsões', players: P, events: [red('e1', 55, 'c'), sub('e2', 60, 'r1', 'a'), red('e3', 80, 'r1'), red('e4', 10, null, 'opponent')], duration: 90 },
    { nome: 'manual e acréscimo', players: P.map((p) => (p.athlete_id === 'b' ? { ...p, minutes_manual: true, minutes_played: 70 } : p)), events: [sub('e1', 95, 'r1', 'a')], duration: 90 },
    { nome: 'sem time e adversário', players: P, events: [{ ...sub('e1', 40, 'r1', 'a'), team: null }, { ...sub('e2', 50, 'r2', 'b'), team: 'opponent' }], duration: 90 },
    { nome: 'incompletas', players: P, events: [sub('e1', 32, 'r1', null), sub('e2', 50, null, 'a')], duration: 90 },
    { nome: 'titular como quem entra', players: P, events: [sub('e1', 20, 'b', 'a')], duration: 90 },
    { nome: 'mesmo minuto', players: P, events: [sub('e1', 45, 'r1', 'a'), sub('e2', 45, 'r2', 'r1')], duration: 90 },
    { nome: 'minuto nulo', players: P, events: [sub('e1', null, 'r1', 'a')], duration: 90 },
    { nome: 'vermelho antes de entrar', players: P, events: [red('e1', 10, 'r1'), sub('e2', 30, 'r1', 'a')], duration: 90 },
    { nome: 'futebol 7', players: P, events: [sub('e1', 25, 'r1', 'a'), sub('e2', 40, 'r2', 'b'), sub('e3', 45, 'r3', 'r1')], duration: 50 },
  ];
  out.minutagem = cenarios.map((c) => {
    const r = F.computeMinutagem(c);
    const rb = back.computeMinutagem(c);
    if (JSON.stringify(r) !== JSON.stringify(rb)) throw new Error(`front ≠ back em ${c.nome}`);
    const minutos = [0, 1, 10, 31, 32, 40, 45, 55, 60, 70, 80, 95];
    return {
      ...c,
      resultado: r,
      em_campo: minutos.map((m) => ({ minuto: m, ids: F.emCampo({ ...c, minute: m }).map((p) => p.athlete_id) })),
      em_campo_ignorando: c.events.length ? { ignorar: c.events[0].id, minuto: 40, ids: F.emCampo({ ...c, minute: 40, ignore: c.events[0] }).map((p) => p.athlete_id) } : null,
      reservas: F.reservasDisponiveis(c).map((p) => p.athlete_id),
      reservas_ignorando: c.events.length ? { ignorar: c.events[0].id, ids: F.reservasDisponiveis({ ...c, ignore: c.events[0] }).map((p) => p.athlete_id) } : null,
      checar: back.checarSubstituicoes(c),
    };
  });
  const evVal = [sub('e1', 32, 'r1', 'a'), { id: 'e2', event_type: 'red_card', team: 'own', minute: 50, player_id: 'c' }];
  out.validar = [
    [60, 'r2', 'b', null], [60, 'r2', 'a', null], [60, 'r1', 'b', null], [60, 'b', 'r1', null], [60, 'r2', 'c', null],
    [20, 'r2', 'r1', null], [60, 'r3', 'r2', null], [60, 'r2', 'r2', null], [60, '', 'b', null], [60, 'r2', '', null],
    [60, 'x', 'b', null], [60, 'r2', 'x', null], [70, 'r2', 'r1', null], [35, 'r1', 'a', 'e1'], [0, 'r2', 'b', null],
    [null, 'r2', 'b', null], [50, 'r2', 'c', null], [49, 'r2', 'c', null], [32, 'r2', 'r1', null], [32, 'r2', 'a', 'e1'],
  ].map(([minute, entra, sai, ign]) => {
    const r = F.validarSubstituicao({ players: P, events: evVal, duration: 90, sub: { minute, player_id: entra, secondary_player_id: sai }, ignore: ign ? evVal.find((e) => e.id === ign) : null });
    return { minuto: minute, entra, sai, ignorar: ign, erro: r.ok ? null : r.error };
  });
  out.validar_eventos = evVal;
  out.validar_jogadores = P;
  out.checar = [
    [sub('e1', 32, 'r1', 'a'), sub('e2', 70, 'r2', 'r1')],
    [sub('e1', 32, 'b', 'a')],
    [sub('e1', 32, 'r1', 'a'), sub('e2', 50, 'r1', 'b')],
    [sub('e1', 32, 'r1', 'r1')],
    [sub('e1', 32, 'zz', 'a')],
    [{ ...sub('e1', 32, 'b', 'a'), team: 'opponent' }],
    [sub('e1', 32, 'b', null), sub('e2', 88, null, 'a')],
    [sub('e1', null, 'b', 'a')],
  ].map((events) => ({ events, erro: (() => { const r = back.checarSubstituicoes({ players: P, events }); return r.ok ? null : r.error; })() }));

  // ---------- EventModal / GameModal ----------
  const tipos = [null, '', 'org_off', 'trans_def', 'bp_off_corner', 'bp_def_falta_frontal', 'bp_off', 'bp_off_', 'offensive_org',
    'offensive_transition', 'free_kick', 'corner', 'penalty', 'org_offx', 'xyz', 'bp_off_penalty', 'bp_def_tiro_livre', 'bp_off_inexistente', 'org_def_extra'];
  out.tipo_gol = tipos.map((gt) => ({ valor: gt, lido: EM.parseGoalType(gt), rotulo: rotuloTipoGol(gt) }));
  out.gravar_tipo_gol = [];
  for (const ev of ['goal_scored', 'goal_conceded']) {
    for (const [mom, bp] of [['org', 'falta'], ['trans', 'falta'], ['bp', 'corner'], ['bp', ''], ['bp', 'falta_lateral'], ['xx', 'falta']]) {
      out.gravar_tipo_gol.push({ evento: ev, momento: mom, subtipo: bp, resultado: EM.serializeGoalType(mom, bp, ev) });
    }
  }
  out.minutos = [];
  for (const dur of [90, 50, 40, 25, 93, 1]) {
    for (const total of [0, 1, 20, 25, 45, 46, 47, 52, 53, 60, 90, 91, 95, 105]) {
      const p = lerMinuto(total, dur);
      out.minutos.push({ duracao: dur, total, lido: p, de_volta: minutoTotal(p.half, p.minuteInHalf, p.stoppageTime, dur), texto: textoMinuto(p.half, p.minuteInHalf, p.stoppageTime, dur) });
    }
  }
  return out;
}

const DESTINO = path.join(__dirname, 'jogo.json');
const texto = `${JSON.stringify(gerar(), null, 1)}\n`;
if (process.argv.includes('--check')) {
  const atual = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, 'utf8') : '';
  if (atual !== texto) {
    console.error('native/paridade/jogo.json está desatualizado: o web mudou. Rode `node native/paridade/gerar-jogo.js` e os testes do app.');
    process.exit(1);
  }
  console.log('paridade do jogo: ok');
} else {
  fs.writeFileSync(DESTINO, texto);
  console.log(`gravado ${path.relative(RAIZ, DESTINO)} (${texto.length} bytes)`);
}
