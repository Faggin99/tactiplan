// Posição EM CAMPO de uma vaga da formação (convocação e lista de titulares).
// MESMA lógica de backend-node/src/utils/posicaoEmCampo.js (o teste
// backend-node/tests/posicao-em-campo.test.js roda os dois com os mesmos casos).
// Se mudar aqui, mude lá.
//
// Vagas: 0 = goleiro; depois as linhas da formação, da defesa para o ataque,
// e dentro da linha da ESQUERDA para a DIREITA da tela (buildSlots). Como o
// ataque fica para cima, a esquerda da tela é o lado esquerdo do time
// (1ª vaga da linha = LE/EE/ALA-E; última = LD/ED/ALA-D).
//
// Futebol 11 e 7:
//   goleiro → GOL
//   defesa (1ª linha): 4+ → pontas LE/LD, resto ZAG; até 3 → todos ZAG
//   meio: 2+ linhas → a mais recuada VOL, as outras MEI; 1 linha → MEI
//   ataque (última linha): 3+ → pontas EE/ED, centro CA; 1 ou 2 → CA
// Futsal:
//   goleiro → GOL
//   última linha (a mais recuada) → FIX; com 3+ nela (3-1), as pontas são ALA-E/ALA-D
//   meio (1-2-1) → pontas ALA-E/ALA-D (centro, se houver, FIX)
//   mais avançada → PIV
//   4-0 (uma linha só, rodízio) → null: quem chama usa a posição cadastrada

function linhasDe(formation) {
  return String(formation || '').split('-').map((n) => parseInt(n, 10) || 0).filter((n) => n > 0);
}

function pontas(i, n, esq, dir, centro) {
  if (i === 0) return esq;
  if (i === n - 1) return dir;
  return centro;
}

/**
 * @param {string} formation  ex. "4-2-3-1"
 * @param {number|null} slot  índice da vaga (0 = goleiro)
 * @param {string} modality   football_11 | football_7 | futsal
 * @returns {string|null} código da posição em campo, ou null (sem vaga / não define)
 */
function posicaoEmCampo(formation, slot, modality) {
  if (slot === null || slot === undefined || slot === '') return null;
  const s = Number(slot);
  if (!Number.isInteger(s) || s < 0) return null;
  if (s === 0) return 'GOL';
  const ls = linhasDe(formation);
  let li = -1;
  let i = s - 1;
  for (let k = 0; k < ls.length; k++) {
    if (i < ls[k]) { li = k; break; }
    i -= ls[k];
  }
  if (li < 0) return null;
  const n = ls[li];
  const ultima = ls.length - 1;

  if (modality === 'futsal') {
    if (ls.length === 1) return null;
    if (li === 0) return n >= 3 ? pontas(i, n, 'ALA-E', 'ALA-D', 'FIX') : 'FIX';
    if (li === ultima) return 'PIV';
    return n >= 2 ? pontas(i, n, 'ALA-E', 'ALA-D', 'FIX') : 'FIX';
  }

  if (ls.length === 1) return null;
  if (li === 0) return n >= 4 ? pontas(i, n, 'LE', 'LD', 'ZAG') : 'ZAG';
  if (li === ultima) return n >= 3 ? pontas(i, n, 'EE', 'ED', 'CA') : 'CA';
  const linhasDeMeio = ls.length - 2;
  return linhasDeMeio >= 2 && li === 1 ? 'VOL' : 'MEI';
}

export { posicaoEmCampo };
