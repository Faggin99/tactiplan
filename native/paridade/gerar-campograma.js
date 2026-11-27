#!/usr/bin/env node
// Gera native/paridade/campograma.json: o campograma (elenco no campo em pé) calculado pelo CÓDIGO DO SERVIDOR
// (backend-node/src/reports/campograma.js = aba Campograma do web). Os apps (Android/iOS) conferem o mesmo resultado.
//   node native/paridade/gerar-campograma.js          → regrava
//   node native/paridade/gerar-campograma.js --check  → falha se ficou velho
const fs = require('fs');
const path = require('path');
const { buildCampograma } = require('../../backend-node/src/reports/campograma');

const SAIDA = path.join(__dirname, 'campograma.json');
const a = (id, name, position, extra = {}) => ({ id, name, position, jersey_number: null, status: 'active', group: '1', ...extra });
const elenco = [
  a('1', 'Carlos Alberto Souza', 'GOL', { jersey_number: 1 }),
  a('2', 'Bruno', 'GR', { jersey_number: 12 }),
  a('3', 'Diego Lima', 'ZAG', { jersey_number: 4, lado_preferido: 'direita' }),
  a('4', 'Edu Costa', 'ZAG', { jersey_number: 3, lado_preferido: 'esquerda' }),
  a('5', 'Fábio Reis', 'ZAG', { jersey_number: 14 }),
  a('6', 'Gustavo', 'LD', { jersey_number: 2, group: 'DM' }),
  a('7', 'Hugo Alves', 'LD', { jersey_number: 22 }),
  a('8', 'Ivan Moura', 'VOL', { jersey_number: 5, status: 'injured' }),
  a('9', 'João Pedro Silva', 'VOL2', { jersey_number: 8 }),
  a('10', 'Kleber', 'MC', { jersey_number: 15, group: 'Transição' }),
  a('11', 'Lucas Neto', 'MEI', { jersey_number: 10 }),
  a('12', 'Marcos', 'EE', { jersey_number: 11 }),
  a('13', 'Nilo', 'ED', { jersey_number: 7 }),
  a('14', 'Otávio Ramos', 'CA', { jersey_number: 9 }),
  a('15', 'Paulo', 'PL', { jersey_number: 19 }),
  a('16', 'Quirino Sem Posição', null),
  a('17', 'Rafael', 'XYZ'),
  a('18', 'Abel', 'CA', { jersey_number: 9 }),
];
const futsal = [
  a('f1', 'Ari', 'GOL'), a('f2', 'Beto', 'FIX'), a('f3', 'Caio', 'ALA-E'), a('f4', 'Davi', 'ALA-D'), a('f5', 'Enzo', 'PIV'), a('f6', 'Fred', 'ZAG'),
];
const dados = {
  casos: [
    { modalidade: 'football_11', atletas: elenco, saida: buildCampograma(elenco, 'football_11') },
    { modalidade: 'futsal', atletas: futsal, saida: buildCampograma(futsal, 'futsal') },
  ],
};
const texto = `${JSON.stringify(dados, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if ((fs.existsSync(SAIDA) ? fs.readFileSync(SAIDA, 'utf8') : '') !== texto) { console.error('campograma.json desatualizado'); process.exit(1); }
  console.log('campograma.json em dia');
} else { fs.writeFileSync(SAIDA, texto); console.log('gravado native/paridade/campograma.json'); }
