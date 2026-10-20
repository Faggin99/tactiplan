// Formação tática do jogo e vagas (slots) no campo.
// Fonte das formações: shared/formacoes.json (a mesma que o backend valida).
// Slot 0 = goleiro; depois cada linha da formação, da defesa para o ataque,
// da esquerda para a direita. A POSIÇÃO CADASTRADA DO ATLETA NÃO DECIDE ONDE
// ELE APARECE: quem decide é a vaga escolhida pelo usuário.
// Coordenadas em %: y=0 é a meta adversária (topo), y=100 é a nossa (base).

import formacoes from '../../../shared/formacoes.json';

const MODALIDADE_PADRAO = 'football_11';

function cfg(modality) {
  return formacoes[modality] || formacoes[MODALIDADE_PADRAO];
}

export function formationsFor(modality) {
  return cfg(modality).opcoes;
}

export function defaultFormation(modality) {
  return cfg(modality).padrao;
}

// Formação efetiva: a salva se for válida para a modalidade, senão a padrão.
export function resolveFormation(modality, formation) {
  return formationsFor(modality).includes(formation) ? formation : defaultFormation(modality);
}

function linhas(formation) {
  return String(formation).split('-').map((n) => parseInt(n, 10) || 0).filter((n) => n > 0);
}

// Rótulo de cada linha de jogadores de linha, da defesa para o ataque.
function rotulosDasLinhas(qtd) {
  if (qtd <= 1) return ['LIN'];
  if (qtd === 2) return ['DEF', 'ATA'];
  return ['DEF', ...Array(qtd - 2).fill('MEI'), 'ATA'];
}

export const ROLE_ORDER = ['GOL', 'DEF', 'MEI', 'ATA', 'LIN'];

/**
 * Vagas da formação: [{ index, role, line, x, y, spacing }].
 * spacing = largura (em %) disponível pra cada vaga na sua linha — usada pra
 * limitar o nome embaixo do círculo e evitar sobreposição.
 */
export function buildSlots(formation) {
  const ls = linhas(formation);
  const roles = rotulosDasLinhas(ls.length);
  const slots = [{ index: 0, role: 'GOL', line: 0, x: 50, y: 90, spacing: 40 }];
  // Linhas distribuídas uniformemente entre a defesa (y=72) e o ataque (y=18).
  const yDef = 72;
  const yAta = 18;
  let idx = 1;
  ls.forEach((n, li) => {
    const y = ls.length === 1 ? 50 : yDef - (li * (yDef - yAta)) / (ls.length - 1);
    // Margem lateral de 8% e espaçamento uniforme dentro da linha.
    const spacing = 84 / Math.max(n, 1);
    for (let i = 0; i < n; i++) {
      slots.push({
        index: idx++,
        role: roles[li],
        line: li + 1,
        x: n === 1 ? 50 : 8 + spacing * (i + 0.5),
        y,
        spacing: Math.min(spacing, 40),
      });
    }
  });
  return slots;
}

export function slotCount(formation) {
  return 1 + linhas(formation).reduce((s, n) => s + n, 0);
}

export function slotRole(formation, slot) {
  if (slot == null) return null;
  return buildSlots(formation)[slot]?.role || null;
}

/**
 * Troca de formação mantendo os atletas por ordem de vaga, linha a linha
 * (por papel: GOL, DEF, MEI, ATA). Quem não couber volta pra "sem vaga".
 * @returns {{ players, displaced: Array }} players com slot recalculado
 */
export function remapFormation(players, fromFormation, toFormation) {
  const from = buildSlots(fromFormation);
  const to = buildSlots(toFormation);
  const livres = to.map((s) => s.index); // em ordem de vaga
  // "LIN" (formação de uma linha só, ex. futsal 4-0) aceita qualquer jogador de linha.
  const casa = (papelDe, papelPara) => papelDe === papelPara
    || (papelDe !== 'GOL' && papelPara !== 'GOL' && (papelDe === 'LIN' || papelPara === 'LIN'));

  const novoSlot = new Map();
  const displaced = [];
  players
    .filter((p) => p.status === 'starter' && p.slot != null)
    .sort((a, b) => a.slot - b.slot)
    .forEach((p) => {
      const papel = from[p.slot]?.role;
      const i = papel ? livres.findIndex((idx) => casa(papel, to[idx].role)) : -1;
      if (i >= 0) novoSlot.set(p.athlete_id, livres.splice(i, 1)[0]);
      else { novoSlot.set(p.athlete_id, null); displaced.push(p); }
    });

  return {
    players: players.map((p) => (novoSlot.has(p.athlete_id) ? { ...p, slot: novoSlot.get(p.athlete_id) } : p)),
    displaced,
  };
}

// Papel sugerido pela posição cadastrada — usado SÓ no botão "Encaixar
// sugestão" (o usuário pede). Nunca posiciona ninguém sozinho.
const PAPEL_POR_POSICAO = {
  // Futebol 11/7 (nomenclatura atual)
  GOL: 'GOL',
  ZAG: 'DEF', LD: 'DEF', LE: 'DEF',
  VOL: 'MEI', MEI: 'MEI',
  ED: 'ATA', EE: 'ATA', CA: 'ATA',
  // Futsal
  FIX: 'DEF', 'ALA-D': 'MEI', 'ALA-E': 'MEI', PIV: 'ATA',
  // Códigos antigos (dado legado, antes da migration 051)
  GR: 'GOL', DD: 'DEF', DC: 'DEF', DE: 'DEF', Z: 'DEF',
  MD: 'MEI', MC: 'MEI', ME: 'MEI', MOF: 'MEI', M: 'MEI',
  PL: 'ATA', SA: 'ATA', A: 'ATA',
};

/**
 * Encaixa os titulares sem vaga nas vagas livres: primeiro onde o papel bate
 * com a posição cadastrada, depois em qualquer vaga livre (em ordem).
 */
export function suggestSlots(players, formation) {
  const slots = buildSlots(formation);
  const ocupadas = new Set(players.filter((p) => p.status === 'starter' && p.slot != null).map((p) => p.slot));
  const livres = slots.filter((s) => !ocupadas.has(s.index));
  const semVaga = players.filter((p) => p.status === 'starter' && p.slot == null);
  const escolha = new Map();

  semVaga.forEach((p) => {
    const papel = PAPEL_POR_POSICAO[p.athlete?.position || p.position];
    const i = papel ? livres.findIndex((s) => s.role === papel) : -1;
    if (i >= 0) escolha.set(p.athlete_id, livres.splice(i, 1)[0].index);
  });
  semVaga.forEach((p) => {
    if (escolha.has(p.athlete_id) || !livres.length) return;
    // Goleiro só por indicação da posição: sem goleiro cadastrado, deixa a vaga do gol livre.
    const i = livres.findIndex((s) => s.role !== 'GOL');
    if (i >= 0) escolha.set(p.athlete_id, livres.splice(i, 1)[0].index);
  });

  return players.map((p) => (escolha.has(p.athlete_id) ? { ...p, slot: escolha.get(p.athlete_id) } : p));
}

// Iniciais pra quando o atleta não tem número de camisa.
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Nome curto embaixo do círculo: último nome (como antes no campo e no PDF).
export function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || name || '';
}
