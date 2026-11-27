#!/usr/bin/env node
// Gera native/paridade/avaliacao.json: casos do período de AVALIAÇÃO (session_type
// 'assessment', migration 059) calculados pelo CÓDIGO DO WEB (frontend/src/lib/periodos.js):
//   - normalizarAvaliacao  (lista fixa, ordem, "Outra" com texto até 60)
//   - rotulosAvaliacao     ("Outra" vira o texto)
//   - rotuloLinhaPeriodo   ("Manhã · Avaliação", "Tarde · Jogo", "Manhã · Tático")
//   - divisaoMinutos       ("90+60" só com 2+ períodos com minutos; nunca "125+0")
//   - minutosDaSessao      (avaliação = 0)
// Os testes do app (TactiPlanKit e Android) leem este arquivo e conferem o MESMO resultado.
//   node native/paridade/gerar-avaliacao.mjs          → regrava o arquivo
//   node native/paridade/gerar-avaliacao.mjs --check  → falha se o web mudou e o arquivo não
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
const SAIDA = path.join(AQUI, 'avaliacao.json');
const L = await import(path.join(RAIZ, 'frontend/src/lib/periodos.js'));

const bloco = (min, ordem = 1) => ({ id: `b${ordem}`, name: `Bloco ${ordem}`, order: ordem, activity: { id: `a${ordem}`, duration_minutes: min } });
const sessao = (id, tipo, periodo, extra = {}) => ({
  id, date: '2026-10-19', day_name: 'Segunda', day_of_week: 1, session_type: tipo, periodo, blocks: [], ...extra,
});

const entradasNormalizar = [
  { tipos: ['tecnica', 'fisica', 'fisica'] },
  { tipos: [], outra: '  Yo-Yo   test ' },
  { tipos: ['outra'] },
  { tipos: ['nutricional'] },
  { tipos: ['fisica'], outra: 'x'.repeat(61) },
  { tipos: ['psicologica', 'antropometrica', 'fisiologica', 'tatica'], outra: 'x'.repeat(60) },
  { tipos: null, outra: null },
  {},
];

const sessoesRotulo = [
  sessao('r1', 'assessment', 'manha', { assessment_types: ['fisica', 'fisiologica', 'outra'], assessment_other: 'Yo-Yo' }),
  sessao('r2', 'assessment', null, { assessment_types: ['outra'], assessment_other: '' }),
  sessao('r3', 'assessment', null, { assessment_types: null }),
  sessao('r4', 'assessment', 'tarde', { assessment_types: ['tatica', 'tecnica'] }),
];

const casosLinha = [
  [sessao('l1', 'assessment', null), []],
  [sessao('l2', 'assessment', 'tarde', { assessment_types: ['fisica'] }), ['Tático']],
  [sessao('l3', 'match', 'tarde'), []],
  [sessao('l4', 'training', null), ['Tático']],
  [sessao('l5', 'training', 'noite'), ['Tático', 'Físico']],
  [sessao('l6', 'training', 'manha'), []],
  // treino de transição (migration 068): a linha diz "Transição" no lugar dos pilares
  [sessao('l7', 'training', 'tarde', { treino_transicao: true }), ['Tático']],
  [sessao('l8', 'training', null, { treino_transicao: true }), []],
];

const casosDivisao = [
  [sessao('d1', 'training', 'manha', { blocks: [bloco(100, 1), bloco(25, 2)] }), sessao('d2', 'assessment', 'tarde', { blocks: [bloco(40, 1)] })],
  [sessao('d3', 'training', 'manha', { blocks: [bloco(90)] }), sessao('d4', 'training', 'tarde', { blocks: [bloco(60)] })],
  [sessao('d5', 'training', 'manha', { blocks: [bloco(125)] }), sessao('d6', 'match', 'tarde')],
  [sessao('d7', 'training', 'manha', { blocks: [bloco(90)] }), sessao('d8', 'assessment', 'tarde'), sessao('d9', 'training', 'noite', { blocks: [bloco(30)] })],
  // transição não soma: "90" sozinho não vira divisão
  [sessao('d10', 'training', 'manha', { blocks: [bloco(90)] }), sessao('d11', 'training', 'tarde', { treino_transicao: true, blocks: [bloco(45)] })],
];

const casosMinutos = [
  sessao('m1', 'assessment', 'manha', { blocks: [bloco(40)] }),
  sessao('m2', 'training', 'manha', { blocks: [bloco(40), bloco(20, 2)] }),
  sessao('m3', 'match', null, { blocks: [bloco(15)] }),
  // treino de goleiro é paralelo: não soma no dia
  sessao('m4', 'training', 'tarde', { blocks: [bloco(30), { id: 'b6', name: 'Treino de goleiro', order: 6, activity: { id: 'a6', duration_minutes: 25 } }] }),
  // treino de transição: fora do total do dia (e o goleiro dele também)
  sessao('m5', 'training', 'manha', { treino_transicao: true, blocks: [bloco(50), { id: 'b6', name: 'Treino de goleiro', order: 6, activity: { id: 'a6', duration_minutes: 20 } }] }),
  // treino_transicao só vale em treino
  sessao('m6', 'match', null, { treino_transicao: true, blocks: [bloco(15)] }),
];

const dados = {
  tipos: L.TIPOS_AVALIACAO.map((t) => ({ tipo: t, rotulo: L.ROTULO_AVALIACAO[t] })),
  maxOutra: L.MAX_OUTRA,
  normalizar: entradasNormalizar.map((entrada) => ({ entrada, saida: L.normalizarAvaliacao(entrada) })),
  rotulos: sessoesRotulo.map((s) => ({ sessao: s, rotulos: L.rotulosAvaliacao(s), texto: L.textoAvaliacao(s) })),
  linha: casosLinha.map(([s, pilares]) => ({ sessao: s, pilares, texto: L.rotuloLinhaPeriodo(s, pilares) })),
  divisao: casosDivisao.map((periodos) => ({ periodos, divisao: L.divisaoMinutos(periodos) })),
  minutos: casosMinutos.map((s) => ({ sessao: s, minutos: L.minutosDaSessao(s), goleiro: L.minutosGoleiro(s), transicao: L.ehTransicao(s) })),
};

const texto = `${JSON.stringify(dados, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const atual = fs.existsSync(SAIDA) ? fs.readFileSync(SAIDA, 'utf8') : '';
  if (atual !== texto) {
    console.error('native/paridade/avaliacao.json desatualizado: rode node native/paridade/gerar-avaliacao.mjs');
    process.exit(1);
  }
  console.log('avaliacao.json em dia');
} else {
  fs.writeFileSync(SAIDA, texto);
  console.log(`gravado ${path.relative(RAIZ, SAIDA)}`);
}
