// Gera native/paridade/analise.json a partir do servidor (src/services/analiseAdversario.js):
// o formato vazio e o exemplo (Flamengo) normalizados. O app confere o esquema do formulário
// (cada campo aponta para uma chave que existe) contra este arquivo.
//   node native/paridade/gerar-analise.js           # regrava
//   node native/paridade/gerar-analise.js --check   # falha se estiver desatualizado
const fs = require('fs');
const path = require('path');
const AA = require('../../backend-node/src/services/analiseAdversario');
const FLA = require('../../backend-node/tests/fixtures/analise-flamengo.json');
const { vagasLivres } = require('../../backend-node/src/reports/formacaoLivre');
const FORMACOES = ['4-3-3', '2-3-5', '4-1-4-1', '4-2-3-1', '3-1-4-2', '1-2-1', '', '11'];

const arq = path.join(__dirname, 'analise.json');
const out = JSON.stringify({ vazio: AA.normalizar({}), exemplo: AA.normalizar(FLA), secoesExemplo: AA.secoesPreenchidas(AA.normalizar(FLA)),
  ordem: AA.SECOES, titulos: AA.TITULOS,
  vagas: Object.fromEntries(FORMACOES.map((f) => [f, vagasLivres(f)])) }, null, 1) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(arq, 'utf8') !== out) { console.error('analise.json desatualizado: rode node native/paridade/gerar-analise.js'); process.exit(1); }
  console.log('analise.json ok');
} else {
  fs.writeFileSync(arq, out);
  console.log('analise.json gravado');
}
