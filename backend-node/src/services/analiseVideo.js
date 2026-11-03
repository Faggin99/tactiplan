// Análise do jogo em VÍDEO (migration 065). O vídeo fica no computador do treinador; o servidor guarda só os
// lances (tag, equipe, atleta, início/fim em ms, observação), as tags do clube e os marcos do vídeo (onde
// começa cada tempo, para converter o tempo do vídeo em minuto do jogo). `normalizarLance` e `normalizarTags`
// são as portas de entrada; `scout` resume os lances (tela, CSV e, na Fase 2, as Estatísticas).

const TAGS_PADRAO = [
  { nome: 'Gol', cor: '#22C55E' },
  { nome: 'Finalização', cor: '#EF4444' },
  { nome: 'Passe-chave', cor: '#A855F7' },
  { nome: 'Desarme', cor: '#EAB308' },
  { nome: 'Perda de bola', cor: '#3B82F6' },
  { nome: 'Recuperação', cor: '#14B8A6' },
  { nome: 'Escanteio', cor: '#F97316' },
  { nome: 'Falta', cor: '#64748B' },
  { nome: 'Cartão', cor: '#FACC15' },
];
const MAX_TAGS = 20;
const MAX_LANCES = 600;
const COR = /^#[0-9A-Fa-f]{6}$/;

const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const inteiro = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
};

/** Tags do clube vindas da tela: nome (até 40) e cor #RRGGBB; sem nome some; nomes repetidos ficam 1×. */
function normalizarTags(lista) {
  const vistos = new Set();
  const out = [];
  for (const t of Array.isArray(lista) ? lista : []) {
    const nome = texto(t?.nome, 40);
    const chave = nome.toLowerCase();
    if (!nome || vistos.has(chave)) continue;
    vistos.add(chave);
    out.push({ nome, cor: COR.test(String(t?.cor || '')) ? String(t.cor).toUpperCase() : '#64748B' });
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** Lance vindo da tela. Devolve { erro } ou o lance limpo. */
function normalizarLance(b) {
  const o = b && typeof b === 'object' ? b : {};
  const tag_nome = texto(o.tag_nome, 40);
  if (!tag_nome) return { erro: 'Escolha a tag do lance.' };
  const inicio_ms = inteiro(o.inicio_ms);
  const fim_ms = inteiro(o.fim_ms);
  if (inicio_ms === null || inicio_ms < 0 || fim_ms === null || fim_ms <= inicio_ms) return { erro: 'Início e fim do lance inválidos.' };
  if (fim_ms - inicio_ms > 10 * 60 * 1000) return { erro: 'Um lance pode ter no máximo 10 minutos.' };
  const equipe = ['nosso', 'adversario'].includes(o.equipe) ? o.equipe : null;
  const athlete_id = equipe === 'nosso' && /^[0-9a-f-]{36}$/i.test(String(o.athlete_id || '')) ? String(o.athlete_id) : null;
  const n = inteiro(o.adv_numero);
  return {
    tag_nome,
    tag_cor: COR.test(String(o.tag_cor || '')) ? String(o.tag_cor).toUpperCase() : '#64748B',
    equipe,
    athlete_id,
    adv_numero: equipe === 'adversario' && n !== null && n >= 0 && n <= 99 ? n : null,
    adv_nome: equipe === 'adversario' ? (texto(o.adv_nome, 80) || null) : null,
    inicio_ms,
    fim_ms,
    observacao: texto(o.observacao, 300) || null,
    lancado: !!o.lancado,
  };
}

/** Marcos do vídeo: ms ≥ 0 ou null. */
function normalizarMeta(b) {
  const o = b && typeof b === 'object' ? b : {};
  const ms = (v) => { const n = inteiro(v); return n !== null && n >= 0 ? n : null; };
  return { arquivo_nome: texto(o.arquivo_nome, 200) || null, duracao_ms: ms(o.duracao_ms), inicio1_ms: ms(o.inicio1_ms), inicio2_ms: ms(o.inicio2_ms) };
}

/**
 * Minuto do jogo de um instante do vídeo (1º tempo conta de 1; 2º tempo de metade+1). null sem o marco.
 * duracao = duração do jogo em minutos (90 no futebol 11).
 */
function minutoDoJogo(ms, meta, duracao = 90) {
  const metade = Math.round(duracao / 2);
  if (meta?.inicio2_ms != null && ms >= meta.inicio2_ms) return metade + Math.floor((ms - meta.inicio2_ms) / 60000) + 1;
  if (meta?.inicio1_ms != null && ms >= meta.inicio1_ms) return Math.floor((ms - meta.inicio1_ms) / 60000) + 1;
  return null;
}

/**
 * Scout dos lances: totais, por tag, por equipe e por atleta (atleta × tag) e por faixa de 15 min do jogo.
 * atletas: Map id → nome (para o rótulo).
 */
function scout(lances, { meta = null, duracao = 90, atletas = new Map() } = {}) {
  const porTag = new Map();
  const porAtleta = new Map();
  const faixas = new Map();
  let tempo = 0;
  for (const l of lances) {
    const dur = l.fim_ms - l.inicio_ms;
    tempo += dur;
    const t = porTag.get(l.tag_nome) || { tag: l.tag_nome, cor: l.tag_cor, total: 0, nosso: 0, adversario: 0, tempo_ms: 0 };
    t.total += 1;
    t.tempo_ms += dur;
    if (l.equipe === 'nosso') t.nosso += 1;
    if (l.equipe === 'adversario') t.adversario += 1;
    porTag.set(l.tag_nome, t);
    const chave = l.equipe === 'nosso' && l.athlete_id ? `a:${l.athlete_id}`
      : l.equipe === 'adversario' && (l.adv_numero != null || l.adv_nome) ? `x:${l.adv_numero ?? ''}:${l.adv_nome ?? ''}` : null;
    if (chave) {
      const nome = chave.startsWith('a:') ? (atletas.get(l.athlete_id) || 'Atleta') : [l.adv_numero != null ? `#${l.adv_numero}` : null, l.adv_nome].filter(Boolean).join(' ');
      const a = porAtleta.get(chave) || { chave, nome, equipe: l.equipe, athlete_id: l.athlete_id || null, total: 0, tags: {} };
      a.total += 1;
      a.tags[l.tag_nome] = (a.tags[l.tag_nome] || 0) + 1;
      porAtleta.set(chave, a);
    }
    const min = minutoDoJogo(l.inicio_ms, meta, duracao);
    const faixa = min === null ? null : Math.min(Math.floor((min - 1) / 15), Math.ceil(duracao / 15) - 1);
    if (faixa !== null) faixas.set(faixa, (faixas.get(faixa) || 0) + 1);
  }
  const tags = [...porTag.values()].sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag));
  return {
    total: lances.length,
    tipos: tags.length,
    tempo_ms: tempo,
    media_ms: lances.length ? Math.round(tempo / lances.length) : 0,
    tags,
    atletas: [...porAtleta.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome)),
    sem_atleta: lances.filter((l) => !(l.equipe === 'nosso' && l.athlete_id) && !(l.equipe === 'adversario' && (l.adv_numero != null || l.adv_nome))).length,
    faixas: Array.from({ length: Math.ceil(duracao / 15) }, (_, i) => ({ de: i * 15 + 1, ate: Math.min((i + 1) * 15, duracao), total: faixas.get(i) || 0 })),
    com_minuto: meta?.inicio1_ms != null,
  };
}

module.exports = { TAGS_PADRAO, MAX_TAGS, MAX_LANCES, normalizarTags, normalizarLance, normalizarMeta, minutoDoJogo, scout };
