// Análise do adversário (migration 062): normalizar, seções preenchidas, formação livre e o PDF.
const test = require('node:test');
const assert = require('node:assert');
const AA = require('../src/services/analiseAdversario');
const { vagasLivres, linhasDa } = require('../src/reports/formacaoLivre');
const { renderAnalise } = require('../src/reports/templates/analise');
const { teamPalette } = require('../src/reports/theme');
const FLA = require('./fixtures/analise-flamengo.json');

test('normalizar: corta, tira vazios, ignora valores fora da lista e devolve o formato completo', () => {
  const vazio = AA.normalizar(null);
  assert.deepEqual(AA.secoesPreenchidas(vazio), []);
  assert.deepEqual(vazio.sistema.com_bola, []);
  const a = AA.normalizar({
    sistema: { formacao: ' 4-3-3 ', com_bola: ['  ataque rápido ', '', '   '], sem_bola: 'linha 1\n\nlinha 2' },
    defesa: { medio: { frequencia: 'qualquer', itens: ['x'] } },
    campanha: { vitorias: '7', posse: 250, ultimos: [{ resultado: 'X', adversario: 'Cruzeiro', placar: '1 × 1' }, { adversario: '' }] },
    escalacao: { jogadores: [{ vaga: 0, numero: 1, nome: 'Rossi' }, { vaga: 1, nome: '' }] },
    individuais: [{ nome: '' }, { nome: 'Pedro', numero: 9 }],
    fontes: { sistema: 'CONMEBOL', 'NAO VALE': 'x' },
    lixo: { qualquer: 1 },
  });
  assert.equal(a.sistema.formacao, '4-3-3');
  assert.deepEqual(a.sistema.com_bola, ['ataque rápido']);
  assert.deepEqual(a.sistema.sem_bola, ['linha 1', 'linha 2']);
  assert.equal(a.defesa.medio.frequencia, '');
  assert.equal(a.campanha.vitorias, 7);
  assert.equal(a.campanha.posse, 100);
  assert.deepEqual(a.campanha.ultimos, [{ resultado: '', adversario: 'Cruzeiro', mando: '', placar: '1 × 1' }]);
  assert.deepEqual(a.escalacao.jogadores.map((j) => j.nome), ['Rossi']);
  assert.deepEqual(a.individuais.map((p) => p.nome), ['Pedro']);
  assert.deepEqual(a.fontes, { sistema: 'CONMEBOL' });
  assert.ok(!('lixo' in a));
  assert.deepEqual(AA.secoesPreenchidas(a), ['campanha', 'sistema', 'escalacao', 'defesa', 'individuais']);
});

test('formação livre: goleiro + linhas da defesa ao ataque, esquerda → direita', () => {
  assert.deepEqual(linhasDa('4-3-3'), [4, 3, 3]);
  assert.equal(linhasDa('11'), null);
  assert.equal(linhasDa('5-5-5'), null);
  const v = vagasLivres('4-2-3-1');
  assert.equal(v.length, 11);
  assert.deepEqual(v.map((x) => x.papel), ['GOL', 'DEF', 'DEF', 'DEF', 'DEF', 'MEI', 'MEI', 'MEI', 'MEI', 'MEI', 'ATA']);
  assert.ok(v[1].x < v[4].x && v[1].y === v[4].y, 'defesa da esquerda para a direita, mesma altura');
  assert.ok(v[10].y < v[5].y, 'ataque mais alto que o meio');
  assert.deepEqual(vagasLivres(''), [{ vaga: 0, papel: 'GOL', x: 50, y: 91 }]);
});

test('PDF: capa + uma página por seção preenchida (individuais 2 por página); o vazio não aparece', () => {
  const team = { name: 'Clube', short: 'CL', modality: 'football_11', palette: teamPalette('#1B8A3E'), logoUrl: null };
  const a = AA.normalizar(FLA);
  const vm = { team, a, adversario: 'Flamengo', subtitulo: 'Libertadores 2026', fatos: [{ l: 'Fase', v: 'Semifinal' }], capaRodape: 'Técnico: Jardim',
    secoes: AA.secoesPreenchidas(a), fontes: a.fontes, right: 'vs Flamengo' };
  const html = renderAnalise(vm, { now: new Date('2026-10-27T12:00:00Z') });
  const paginas = (html.match(/<section class="page" data-subtitle/g) || []).length;
  assert.equal(paginas, 1 + 11 + 2, 'capa + 11 seções + análise individual em 2 páginas (3 jogadores)');
  assert.match(html, /Provável escalação/);
  assert.match(html, /Rossi/);
  assert.match(html, /Predominante/);
  assert.match(html, /Mensagem principal para o jogo/);
  // só a seção de sistema preenchida: capa + 1 página; nada de "Campanha"/"Transições"
  const so = AA.normalizar({ sistema: { formacao: '4-4-2' } });
  const h2 = renderAnalise({ ...vm, a: so, secoes: AA.secoesPreenchidas(so), fontes: {} }, { now: new Date() });
  assert.equal((h2.match(/<section class="page" data-subtitle/g) || []).length, 2);
  assert.ok(!h2.includes('Campanha') && !h2.includes('Transições'));
});

test('paridade: lib/formacaoLivre.js do web = a do servidor', async () => {
  const web = await import('../../frontend/src/lib/formacaoLivre.js');
  for (const f of ['4-3-3', '2-3-5', '4-1-4-1', '3-1-4-2', '4-2-3-1', '1-2-1', '', '11', 'abc']) {
    assert.deepEqual(web.vagasLivres(f), vagasLivres(f), f);
  }
});

test('paridade do app: native/paridade/analise.json atualizado (gerar-analise.js --check)', () => {
  const r = require('child_process').spawnSync('node', [require('path').join(__dirname, '../../native/paridade/gerar-analise.js'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
