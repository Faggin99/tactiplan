// Análise do jogo em vídeo (migration 065): validação dos lances/tags, minuto do jogo e scout.
const test = require('node:test');
const assert = require('node:assert');
const AV = require('../src/services/analiseVideo');

test('lance: tag obrigatória, fim depois do início, atleta só do nosso time, adversário só número/nome', () => {
  assert.equal(AV.normalizarLance({}).erro, 'Escolha a tag do lance.');
  assert.ok(AV.normalizarLance({ tag_nome: 'Gol', inicio_ms: 5000, fim_ms: 5000 }).erro);
  assert.ok(AV.normalizarLance({ tag_nome: 'Gol', inicio_ms: 0, fim_ms: 11 * 60000 }).erro);
  const id = '11111111-1111-1111-1111-111111111111';
  const n = AV.normalizarLance({ tag_nome: '  Gol ', tag_cor: '#22c55e', equipe: 'nosso', athlete_id: id, adv_numero: 9, inicio_ms: 1000.4, fim_ms: 7000, observacao: ' de cabeça ' });
  assert.deepEqual(n, { tag_nome: 'Gol', tag_cor: '#22C55E', equipe: 'nosso', athlete_id: id, adv_numero: null, adv_nome: null,
    inicio_ms: 1000, fim_ms: 7000, observacao: 'de cabeça', lancado: false });
  const a = AV.normalizarLance({ tag_nome: 'Desarme', tag_cor: 'vermelho', equipe: 'adversario', athlete_id: id, adv_numero: 10, adv_nome: 'Arrascaeta', inicio_ms: 0, fim_ms: 1 });
  assert.equal(a.athlete_id, null);
  assert.equal(a.adv_numero, 10);
  assert.equal(a.tag_cor, '#64748B');
  assert.equal(AV.normalizarLance({ tag_nome: 'X', equipe: 'outro', inicio_ms: 0, fim_ms: 1 }).equipe, null);
});

test('tags: sem nome some, repetidas 1×, cor inválida vira cinza, até 20', () => {
  const t = AV.normalizarTags([{ nome: 'Gol', cor: '#22c55e' }, { nome: ' gol ' }, { nome: '' }, { nome: 'Falta', cor: 'x' }]);
  assert.deepEqual(t, [{ nome: 'Gol', cor: '#22C55E' }, { nome: 'Falta', cor: '#64748B' }]);
  assert.equal(AV.normalizarTags(Array.from({ length: 30 }, (_, i) => ({ nome: `T${i}` }))).length, 20);
  assert.ok(AV.TAGS_PADRAO.length <= 9, 'as padrão cabem nas teclas 1–9');
});

test('minuto do jogo: conta do início de cada tempo; antes do 1º tempo ou sem marco = null', () => {
  const meta = { inicio1_ms: 60000, inicio2_ms: 60000 + 60 * 60000 };
  assert.equal(AV.minutoDoJogo(30000, meta), null);
  assert.equal(AV.minutoDoJogo(60000, meta), 1);
  assert.equal(AV.minutoDoJogo(60000 + 44 * 60000 + 59000, meta), 45);
  assert.equal(AV.minutoDoJogo(meta.inicio2_ms, meta), 46);
  assert.equal(AV.minutoDoJogo(meta.inicio2_ms + 10 * 60000, meta), 56);
  assert.equal(AV.minutoDoJogo(meta.inicio2_ms, meta, 70), 36, 'futebol 7: 2º tempo começa no 36');
  assert.equal(AV.minutoDoJogo(5000, null), null);
});

test('scout: por tag (nosso × adversário), por atleta (atleta × tag), faixas de 15 min e sem atleta', () => {
  const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const meta = { inicio1_ms: 0, inicio2_ms: 50 * 60000 };
  const L = (tag, equipe, extra, ini) => ({ tag_nome: tag, tag_cor: '#000000', equipe, athlete_id: null, adv_numero: null, adv_nome: null,
    inicio_ms: ini, fim_ms: ini + 5000, ...extra });
  const lances = [
    L('Finalização', 'nosso', { athlete_id: A }, 2 * 60000),
    L('Finalização', 'nosso', { athlete_id: A }, 20 * 60000),
    L('Gol', 'nosso', { athlete_id: A }, 20 * 60000 + 6000),
    L('Desarme', 'adversario', { adv_numero: 5 }, 52 * 60000),
    L('Perda de bola', null, {}, 60 * 60000),
  ];
  const s = AV.scout(lances, { meta, atletas: new Map([[A, 'Pedro']]) });
  assert.equal(s.total, 5);
  assert.equal(s.tipos, 4);
  assert.equal(s.tempo_ms, 25000);
  assert.deepEqual(s.tags[0], { tag: 'Finalização', cor: '#000000', total: 2, nosso: 2, adversario: 0, tempo_ms: 10000 });
  assert.deepEqual(s.atletas[0], { chave: `a:${A}`, nome: 'Pedro', equipe: 'nosso', athlete_id: A, total: 3, tags: { Finalização: 2, Gol: 1 } });
  assert.equal(s.atletas[1].nome, '#5');
  assert.equal(s.sem_atleta, 1);
  assert.deepEqual(s.faixas.map((f) => f.total), [1, 2, 0, 2, 0, 0], '2º tempo começa no 46: 48 e 56 caem em 46–60');
  assert.equal(s.com_minuto, true);
});

test('paridade: lib/analiseVideo.js do web = minutoDoJogo e scout do servidor', async () => {
  const web = await import('../../frontend/src/lib/analiseVideo.js');
  const meta = { inicio1_ms: 30000, inicio2_ms: 3000000 };
  for (const ms of [0, 30000, 90000, 2999999, 3000000, 5000000]) assert.equal(web.minutoDoJogo(ms, meta, 90), AV.minutoDoJogo(ms, meta, 90), String(ms));
  const lances = [{ tag_nome: 'Gol', tag_cor: '#22C55E', equipe: 'nosso', athlete_id: 'x', inicio_ms: 40000, fim_ms: 45000 },
    { tag_nome: 'Desarme', tag_cor: '#EAB308', equipe: 'adversario', adv_numero: 4, inicio_ms: 3100000, fim_ms: 3105000 }];
  assert.deepEqual(web.scout(lances, { meta, atletas: new Map([['x', 'Ana']]) }), AV.scout(lances, { meta, atletas: new Map([['x', 'Ana']]) }));
});
