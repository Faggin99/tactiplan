// Campograma do PDF do plantel (12/11/2026): o elenco desenhado no campo EM PÉ (ataque para cima),
// cada atleta (foto, número, nome curto) empilhado no lugar da posição; zagueiros divididos pelo
// lado preferido (migration 067). Mesmas posições da aba Campograma do web
// (frontend/src/modules/training-management/components/plantel/Campograma.jsx). Função pura.

// Campo DEITADO em % (x = profundidade rumo ao ataque; y = 0 lado esquerdo do time, 100 o direito).
const LUGAR_F11 = {
  GOL: { x: 4, y: 50 },
  'ZAG-E': { x: 22, y: 30 }, 'ZAG-A': { x: 22, y: 50 }, 'ZAG-D': { x: 22, y: 70 },
  LE: { x: 31, y: 8 }, LD: { x: 31, y: 92 },
  VOL: { x: 44, y: 50 }, VOL2: { x: 55, y: 36 }, MEI: { x: 66, y: 58 },
  EE: { x: 78, y: 10 }, ED: { x: 78, y: 90 },
  CA: { x: 91, y: 50 },
};
const LUGAR_FUTSAL = {
  GOL: { x: 6, y: 50 }, FIX: { x: 30, y: 50 }, 'ALA-E': { x: 56, y: 15 }, 'ALA-D': { x: 56, y: 85 }, PIV: { x: 86, y: 50 },
};
const SINONIMO = { GR: 'GOL', DC: 'ZAG', Z: 'ZAG', DD: 'LD', DE: 'LE', MC: 'VOL', MD: 'MEI', ME: 'MEI', MOF: 'MEI', M: 'MEI', PL: 'CA', SA: 'CA', A: 'CA' };
const NOMES = {
  GOL: 'Goleiros', 'ZAG-E': 'Zagueiros · esquerda', 'ZAG-A': 'Zagueiros', 'ZAG-D': 'Zagueiros · direita',
  LE: 'Lateral esquerdo', LD: 'Lateral direito', VOL: '1º volante', VOL2: '2º volante', MEI: 'Meia',
  EE: 'Extremo esquerdo', ED: 'Extremo direito', CA: 'Centroavante',
  FIX: 'Fixo', 'ALA-E': 'Ala esquerdo', 'ALA-D': 'Ala direito', PIV: 'Pivô',
};

function chave(a, futsal) {
  const raw = String(a.position || '').trim().toUpperCase();
  const code = SINONIMO[raw] || raw;
  if (futsal) return LUGAR_FUTSAL[code] ? code : null;
  if (code === 'ZAG') return a.lado_preferido === 'direita' ? 'ZAG-D' : a.lado_preferido === 'esquerda' ? 'ZAG-E' : 'ZAG-A';
  return LUGAR_F11[code] ? code : null;
}

function nomeCurto(n) {
  const p = String(n || '').trim().split(/\s+/).filter(Boolean);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : (p[0] || '');
}

const noDm = (a) => a.status === 'injured' || String(a.group) === 'DM';
const emTransicao = (a) => !noDm(a) && String(a.group) === 'Transição';

// Campo EM PÉ: left = y; top = 100 - x. Perto da linha, o grupo encosta na borda (não corta).
function eixo(v) {
  if (v < 12) return { pos: 1.5, tr: '0%' };
  if (v > 88) return { pos: 98.5, tr: '-100%' };
  return { pos: v, tr: '-50%' };
}

/**
 * @param {Array} athletes  { id, name, position, jersey_number, lado_preferido, status, group, photoKey? }
 * @param {string} modality football_11 | football_7 | futsal
 * @returns {{ zonas: Array<{ key, nome, left, top, tx, ty, atletas }>, semLugar: Array }}
 */
function buildCampograma(athletes, modality) {
  const futsal = modality === 'futsal';
  const lugares = futsal ? LUGAR_FUTSAL : LUGAR_F11;
  const grupos = {};
  const semLugar = [];
  for (const a of athletes || []) {
    const k = chave(a, futsal);
    if (!k) { semLugar.push(a); continue; }
    (grupos[k] = grupos[k] || []).push(a);
  }
  const zonas = [];
  for (const [k, p] of Object.entries(lugares)) {
    const lista = grupos[k];
    if (!lista || !lista.length) continue;
    lista.sort((x, y) => (noDm(x) - noDm(y)) || ((x.jersey_number ?? 999) - (y.jersey_number ?? 999))
      || String(x.name).localeCompare(String(y.name), 'pt-BR'));
    const h = eixo(p.y);
    const v = eixo(100 - p.x);
    zonas.push({
      key: k, nome: NOMES[k] || k, left: h.pos, top: v.pos, tx: h.tr, ty: v.tr,
      atletas: lista.map((a) => ({ id: a.id, nome: nomeCurto(a.name), numero: a.jersey_number ?? null, dm: noDm(a), trans: emTransicao(a), photoKey: a.photoKey || null })),
    });
  }
  return { zonas, semLugar: semLugar.map((a) => ({ id: a.id, name: a.name, position: a.position || null })) };
}

module.exports = { buildCampograma, nomeCurto };
