// Análise do jogo em vídeo: minuto do jogo e scout dos lances — CÓPIA de backend-node/src/services/analiseVideo.js
// (minutoDoJogo e scout; teste de paridade em backend-node/tests/analise-video.test.js). Mexeu lá → copie aqui.

export function minutoDoJogo(ms, meta, duracao = 90) {
  const metade = Math.round(duracao / 2);
  if (meta?.inicio2_ms != null && ms >= meta.inicio2_ms) return metade + Math.floor((ms - meta.inicio2_ms) / 60000) + 1;
  if (meta?.inicio1_ms != null && ms >= meta.inicio1_ms) return Math.floor((ms - meta.inicio1_ms) / 60000) + 1;
  return null;
}

/**
 * Scout dos lances: totais, por tag, por equipe e por atleta (atleta × tag) e por faixa de 15 min do jogo.
 * atletas: Map id → nome (para o rótulo).
 */
export function scout(lances, { meta = null, duracao = 90, atletas = new Map() } = {}) {
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
