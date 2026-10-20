// Setor (Goleiro / Defesa / Meio-campo / Ataque) de cada código de posição.
// ÚNICO lugar com esse mapa nos relatórios (docs/formato_relatorios, seção 5b).
//
// Os códigos do projeto seguem frontend/src/lib/sportConfig.js (POSITIONS),
// nomenclatura brasileira (migration 051_posicoes_br.sql):
//   Futebol 11 e 7: GOL · ZAG, LD, LE · VOL, MEI · ED, EE, CA
//   Futsal:         GOL · FIX · ALA-D, ALA-E · PIV
// Códigos antigos (GR, DD/DC/DE, MD/MC/ME/MOF, PL/SA, Z, M, A) e os da
// especificação (GK, PD/PE, ATA…) continuam aceitos como sinônimo — dado legado.
// Alas do futsal ficam no Meio, como no "Encaixar sugestão" do editor
// (PAPEL_POR_POSICAO em frontend/src/lib/formation.js).

const SECTORS = {
  gol: { key: 'gol', label: 'Goleiro', color: 'var(--s-gol)' },
  def: { key: 'def', label: 'Defesa', color: 'var(--s-def)' },
  mei: { key: 'mei', label: 'Meio-campo', color: 'var(--s-mei)' },
  ata: { key: 'ata', label: 'Ataque', color: 'var(--s-ata)' },
  outros: { key: 'outros', label: 'Outros', color: 'var(--faint)' },
};
const SECTOR_ORDER = ['gol', 'def', 'mei', 'ata', 'outros'];

const BY_CODE = {
  gol: ['GOL', /* legado */ 'GR', 'GK'],
  def: ['ZAG', 'LD', 'LE', 'FIX', /* legado */ 'DD', 'DC', 'DE', 'Z', 'DEF'],
  mei: ['VOL', 'MEI', 'ALA-D', 'ALA-E', /* legado */ 'MD', 'MC', 'ME', 'MOF', 'M'],
  ata: ['ED', 'EE', 'CA', 'PIV', /* legado */ 'PL', 'SA', 'A', 'PD', 'PE', 'ATA'],
};
const CODE_TO_SECTOR = new Map();
for (const [sector, codes] of Object.entries(BY_CODE)) for (const c of codes) CODE_TO_SECTOR.set(c, sector);

// Papel da LINHA da vaga (buildSlots) → setor. 'LIN' (futsal 4-0, uma linha só)
// não diz o setor: quem chama usa a posição cadastrada.
const ROLE_TO_SECTOR = { GOL: 'gol', DEF: 'def', MEI: 'mei', ATA: 'ata' };

function normCode(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

// Código desconhecido/vazio → null (cor --faint).
function positionSector(code) {
  return CODE_TO_SECTOR.get(normCode(code)) || null;
}

function roleSector(role) {
  return ROLE_TO_SECTOR[role] || null;
}

function sectorInfo(key) {
  return SECTORS[key] || SECTORS.outros;
}

module.exports = { SECTORS, SECTOR_ORDER, positionSector, roleSector, sectorInfo, normCode };
