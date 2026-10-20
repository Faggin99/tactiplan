// Setor (Goleiro / Defesa / Meio-campo / Ataque) de cada código de posição.
// ÚNICO lugar com esse mapa nos relatórios (docs/formato_relatorios, seção 5b).
//
// Os códigos do projeto seguem frontend/src/lib/sportConfig.js (POSITIONS):
//   Futebol 11: GR · DD/DC/DE = Defesa Direito/Central/Esquerdo · MD/MC/ME/MOF =
//               Médio · ED/EE = Extremo · PL = Ponta de Lança · SA = Segundo Avançado
//   Futebol 7:  GR · Z, LD, LE · M · A
//   Futsal:     GOL · FIX · ALA-D, ALA-E · PIV
// A tabela da especificação usa códigos "brasileiros" (ZAG, VOL, PD, CA…) e põe
// DD/DE no Ataque; AQUI DD/DE são laterais (Defesa Direito/Esquerdo), então
// ficam na Defesa. Os códigos da especificação também são aceitos.
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
  gol: ['GR', 'GOL', 'GK'],
  def: ['DD', 'DC', 'DE', 'Z', 'LD', 'LE', 'FIX', 'ZAG', 'DEF'],
  mei: ['MD', 'MC', 'ME', 'MOF', 'M', 'ALA-D', 'ALA-E', 'VOL', 'MEI'],
  ata: ['ED', 'EE', 'PL', 'SA', 'A', 'PIV', 'PD', 'PE', 'ATA', 'CA'],
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
