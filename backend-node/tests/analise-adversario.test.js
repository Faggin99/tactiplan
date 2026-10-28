// Análise do adversário (migration 062): normalizar, seções preenchidas, formação livre e o PDF.
const test = require('node:test');
const assert = require('node:assert');
const AA = require('../src/services/analiseAdversario');
const { vagasLivres, linhasDa } = require('../src/reports/formacaoLivre');
const { renderAnalise } = require('../src/reports/templates/analise');
const { montarDeck } = require('../src/reports/analiseDeck');
const { gerarPptx } = require('../src/reports/analisePptx');
const FLA = require('./fixtures/analise-flamengo.json');

test('normalizar: corta, tira vazios, ignora valores fora da lista e devolve o formato completo', () => {
  const vazio = AA.normalizar(null);
  assert.deepEqual(AA.secoesPreenchidas(vazio), []);
  assert.deepEqual(vazio.sistema.ofensivo, { formacao: '', descricao: '', itens: [] });
  const a = AA.normalizar({
    sistema: { formacao: ' 4-3-3 ', com_bola: ['  ataque rápido ', '', '   '], sem_bola: 'linha 1\n\nlinha 2' },
    defesa: { medio: { frequencia: 'qualquer', itens: ['x'] } },
    campanha: { vitorias: '7', posse: 250, ultimos: [{ resultado: 'X', adversario: 'Cruzeiro', placar: '1 × 1' }, { adversario: '' }] },
    escalacao: { jogadores: [{ vaga: 0, numero: 1, nome: 'Rossi' }, { vaga: 1, nome: '' }] },
    individuais: [{ nome: '' }, { nome: 'Pedro', numero: 9 }],
    fontes: { sistema: 'CONMEBOL', 'NAO VALE': 'x' },
    lixo: { qualquer: 1 },
  });
  // análise antiga (formacao/com_bola/sem_bola) migra para ofensivo/defensivo
  assert.equal(a.sistema.ofensivo.formacao, '4-3-3');
  assert.deepEqual(a.sistema.ofensivo.itens, ['ataque rápido']);
  assert.deepEqual(a.sistema.defensivo.itens, ['linha 1', 'linha 2']);
  const novo = AA.normalizar({ sistema: { ofensivo: { formacao: '4-3-3' }, defensivo: { formacao: '4-4-2', itens: ['bloco médio'] } } });
  assert.deepEqual(novo.sistema.defensivo, { formacao: '4-4-2', descricao: '', itens: ['bloco médio'] });
  assert.equal(a.defesa.medio.frequencia, '');
  assert.equal(a.campanha.vitorias, 7);
  assert.equal(a.campanha.posse, 100);
  assert.deepEqual(a.campanha.ultimos, [{ resultado: '', adversario: 'Cruzeiro', mando: '', placar: '1 × 1' }]);
  assert.deepEqual(a.escalacao.jogadores.map((j) => j.nome), ['Rossi']);
  assert.deepEqual(a.individuais.map((p) => p.nome), ['Pedro']);
  assert.deepEqual(a.fontes, { sistema: 'CONMEBOL' });
  assert.ok(!('lixo' in a));
  assert.deepEqual(AA.secoesPreenchidas(a), ['campanha', 'sistema', 'escalacao', 'individuais', 'defesa']);
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

function vmDe(a, extra = {}) {
  return { a, adversario: 'Flamengo', nossoNome: 'Clube Teste', subtitulo: 'Libertadores 2026', fatos: [{ l: 'Fase', v: 'Semifinal' }],
    capaRodape: 'Técnico: Jardim', fontes: a.fontes, imagens: {}, videos: [], ...extra };
}

test('deck: capa + um slide por seção preenchida, na ordem nova (individual logo após a escalação)', () => {
  const a = AA.normalizar(FLA);
  const deck = montarDeck(vmDe(a));
  // 12 seções; individuais (3 jogadores) em 2 slides; variações cabem em 1
  assert.equal(deck.slides.length, 1 + 12 + 1);
  const titulos = deck.slides.slice(1).map((s) => s.els[0].txt);
  assert.deepEqual(titulos.slice(0, 6), ['Campanha', 'Sistema inicial', 'Variações do sistema', 'Provável escalação', 'Análise individual (1/2)', 'Análise individual (2/2)']);
  assert.ok(titulos.includes('Organização ofensiva') && titulos.includes('Organização defensiva'));
  const html = renderAnalise(deck, { titulo: 'x', imagens: {} });
  assert.equal((html.match(/<section class="s"/g) || []).length, deck.slides.length);
  assert.match(html, /Rossi/);
  assert.match(html, /Ofensivo/);
  assert.match(html, /Defensivo/);
  assert.match(html, /MENSAGEM PRINCIPAL PARA O JOGO/);
  assert.match(html, /@page\{size:338.67mm 190.5mm/);
  // nome do adversário na capa e no topo de cada slide
  assert.ok((html.match(/Flamengo/g) || []).length >= deck.slides.length);
  // só o sistema preenchido: capa + 1 slide; nada de "Campanha"/"Transições"
  const so = AA.normalizar({ sistema: { ofensivo: { formacao: '4-4-2' } } });
  const h2 = renderAnalise(montarDeck(vmDe(so)), { titulo: 'x' });
  assert.equal((h2.match(/<section class="s"/g) || []).length, 2);
  assert.ok(!h2.includes('Campanha') && !h2.includes('Transições'));
});

test('vídeos: slide próprio só no PowerPoint; o PDF avisa na seção', () => {
  const a = AA.normalizar(FLA);
  const deck = montarDeck(vmDe(a, { videos: [{ id: 'v1', secao: 'ataque', titulo: 'Saída curta' }] }));
  const iv = deck.slides.findIndex((s) => s.so === 'pptx');
  assert.ok(iv > 0);
  assert.equal(deck.slides[iv - 1].els[0].txt, 'Organização ofensiva', 'vídeo logo depois da seção dele');
  assert.ok(deck.slides[iv].els.some((e) => e.t === 'video' && e.key === 'v1'));
  const html = renderAnalise(deck, { titulo: 'x' });
  assert.equal((html.match(/<section class="s"/g) || []).length, deck.slides.length - 1);
  assert.match(html, /1 vídeo na versão PowerPoint/);
});

test('vídeo em seção ainda vazia também vai para o PowerPoint', () => {
  const a = AA.normalizar({ sistema: { ofensivo: { formacao: '4-3-3' } } });
  const deck = montarDeck(vmDe(a, { videos: [{ id: 'v1', secao: 'ataque', titulo: 'x' }] }));
  assert.equal(deck.slides.length, 3, 'capa + sistema + vídeo');
  assert.equal(deck.slides[2].so, 'pptx');
});

test('PowerPoint: gera um .pptx válido (zip) com um slide por item do deck', async () => {
  const a = AA.normalizar(FLA);
  const deck = montarDeck(vmDe(a));
  const buf = await gerarPptx(deck, { titulo: 'Análise' });
  assert.equal(buf.slice(0, 2).toString(), 'PK');
  const nSlides = (buf.toString('latin1').match(/ppt\/slides\/slide\d+\.xml/g) || []).filter((v, i, l) => l.indexOf(v) === i).length;
  assert.equal(nSlides, deck.slides.length);
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
