// Escalação no campo da Convocação: posição (x, y em %) de cada vaga.
// Fonte primária: as MESMAS coordenadas do editor (buildSlots, porte de
// frontend/src/lib/formation.js). O editor salva só o índice da vaga
// (match_players.slot); as coordenadas saem da formação.
// Fallback (seção 5b): se faltar a vaga no editor, deriva da formação com as
// linhas GOL → DEF → MEI → ATA em y = 88 / 68 / 42 / 17 % e x = (i+1)/(n+1).
const { buildSlots, rotulosDasLinhas } = require('../utils/formacao');

const Y_GOL = 88;
const Y_DEF = 68;
const Y_ATA = 17;

function deriveSlots(formation) {
  const ls = String(formation || '').split('-').map((n) => parseInt(n, 10) || 0).filter((n) => n > 0);
  const roles = rotulosDasLinhas(ls.length);
  const out = [{ index: 0, role: 'GOL', x: 50, y: Y_GOL }];
  // 3 linhas: 68 / 42 / 17 (meio fixo em 42, como a especificação);
  // 4+ linhas (4-2-3-1, 4-1-2-1-2…): divide 17–68 igualmente.
  const ys = ls.length === 1 ? [42]
    : ls.length === 3 ? [Y_DEF, 42, Y_ATA]
      : ls.map((_, i) => Y_DEF - (i * (Y_DEF - Y_ATA)) / (ls.length - 1));
  let idx = 1;
  ls.forEach((n, li) => {
    for (let i = 0; i < n; i++) {
      out.push({ index: idx++, role: roles[li], x: ((i + 1) / (n + 1)) * 100, y: ys[li] });
    }
  });
  return out;
}

// Vaga → { x, y, role, line, perLine, spacing, source } ou null (fora do campo).
function slotPosition(formation, slot) {
  if (slot === null || slot === undefined || !Number.isInteger(Number(slot))) return null;
  const i = Number(slot);
  const ed = buildSlots(formation)[i];
  if (ed) {
    const perLine = buildSlots(formation).filter((s) => s.line === ed.line).length;
    return { x: ed.x, y: ed.y, role: ed.role, line: ed.line, perLine, spacing: ed.spacing, source: 'editor' };
  }
  const dv = deriveSlots(formation)[i];
  if (!dv) return null;
  const perLine = deriveSlots(formation).filter((s) => s.y === dv.y).length;
  return { x: dv.x, y: dv.y, role: dv.role, line: null, perLine, spacing: Math.min(100 / (perLine + 1), 40), source: 'derivado' };
}

// Iniciais no círculo quando não há camisa (mesma regra do editor:
// lib/formation.js initials): "Pablo Thomaz" → "PT", "Kaike" → "KA".
function playerInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

module.exports = { deriveSlots, slotPosition, playerInitials };
