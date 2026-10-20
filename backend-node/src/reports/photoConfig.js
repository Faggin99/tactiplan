// Configuração das fotos do relatório escolhida no modal "Fotos do relatório"
// (front). Funções PURAS: validam o que veio no body e montam a lista final.
//
// body.fotos = { ids: [ordem], layout, proporcao, legendas, agrupar, legendasCustom: { id: texto } }
//   - sem `fotos` → padrão de antes (limite 9/12, rodízio, "+N não exibidas")
//   - ids = []    → relatório sem a seção de fotos
//   - ids só dos candidatos (anexos de imagem do dia/semana do clube do usuário)
const MAX_FOTOS = 24;
const MAX_LEGENDA = 120;
const LAYOUTS = ['grande', 'medio', 'compacto', 'mosaico'];
const PROPORCOES = ['4:3', '1:1', 'original'];

class PhotoConfigError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

function cleanText(v) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LEGENDA);
}

// raw: body.fotos ; candidateIds: Set/array dos ids permitidos.
// Devolve null (usar o padrão) ou a configuração normalizada.
function parseFotosConfig(raw, candidateIds) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new PhotoConfigError('Configuração de fotos inválida');
  const allowed = candidateIds instanceof Set ? candidateIds : new Set(candidateIds || []);
  if (!Array.isArray(raw.ids)) throw new PhotoConfigError('fotos.ids deve ser uma lista');
  const ids = [];
  const seen = new Set();
  for (const v of raw.ids) {
    const id = String(v ?? '');
    if (seen.has(id)) continue;
    if (!allowed.has(id)) throw new PhotoConfigError('Uma das fotos não pertence a este relatório. Feche e abra de novo a escolha das fotos.');
    seen.add(id);
    ids.push(id);
  }
  if (ids.length > MAX_FOTOS) throw new PhotoConfigError(`No máximo ${MAX_FOTOS} fotos por relatório`);
  const layout = LAYOUTS.includes(raw.layout) ? raw.layout : 'medio';
  const proporcao = PROPORCOES.includes(raw.proporcao) ? raw.proporcao : '4:3';
  const legendasCustom = {};
  if (raw.legendasCustom && typeof raw.legendasCustom === 'object' && !Array.isArray(raw.legendasCustom)) {
    for (const [k, v] of Object.entries(raw.legendasCustom)) {
      if (!seen.has(k) || (typeof v !== 'string' && typeof v !== 'number')) continue;
      legendasCustom[k] = cleanText(v);
    }
  }
  return {
    ids,
    layout,
    proporcao,
    legendas: raw.legendas !== false,
    agrupar: raw.agrupar !== false,
    legendasCustom,
  };
}

// candidates: fotos com { id, caption } ; devolve as escolhidas na ordem do
// usuário, com a legenda trocada quando ele editou (só no relatório).
function applyFotosConfig(candidates, config) {
  const byId = new Map(candidates.map((c) => [String(c.id), c]));
  return config.ids.map((id) => {
    const c = byId.get(id);
    if (!Object.prototype.hasOwnProperty.call(config.legendasCustom, id)) return c;
    return { ...c, caption: { ...(c.caption || {}), title: config.legendasCustom[id] } };
  }).filter(Boolean);
}

// Layout aplicado (o mosaico precisa de 3+ fotos; com menos vira grande/médio).
function effectiveLayout(layout, count) {
  if (layout !== 'mosaico') return layout;
  if (count <= 1) return 'grande';
  if (count === 2) return 'medio';
  return 'mosaico';
}

// Opções da grade a partir do modo: padrão antigo (config null) ou escolhido.
function gridOptions(config, count) {
  if (!config) return { layout: count <= 4 ? 'medio' : 'compacto', proporcao: null, legendas: true };
  return { layout: effectiveLayout(config.layout, count), proporcao: config.proporcao, legendas: config.legendas };
}

module.exports = {
  MAX_FOTOS,
  MAX_LEGENDA,
  LAYOUTS,
  PROPORCOES,
  PhotoConfigError,
  parseFotosConfig,
  applyFotosConfig,
  effectiveLayout,
  gridOptions,
  cleanText,
};
