// Personalização visual POR CLUBE (clubs.branding JSONB) — mesmo contrato do Gestsport
// (escola/backend/src/utils/branding.js), sem imagem de fundo e sem trava de plano.
//
// Modelo: { light: { primary, background, surface, border, text, textSecondary },
//           dark:  { mesmo shape } }
// - Cores só em #rrggbb (normalizadas para minúsculas).
// - Tema presente com QUALQUER cor exige as 6 (400 se parcial). Tema omitido = padrão do app.
// - A logo do tema escuro NÃO mora aqui: é a coluna clubs.logo_dark_path (upload próprio).
//
// Espelho legado: ao salvar, light.primary → clubs.primary_color (os PDFs usam essa coluna).
// Leitura sem branding: o front usa primary_color como primária dos dois temas (efeito
// que já existia antes da Personalização).

const HEX_RE = /^#[0-9a-f]{6}$/;
const THEME_KEYS = ['light', 'dark'];
const COLOR_KEYS = ['primary', 'background', 'surface', 'border', 'text', 'textSecondary'];

// Retorna { branding } (objeto limpo, sem seções vazias) ou { error }.
function validateBranding(input) {
  if (input === null || input === undefined) return { branding: {} };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'branding deve ser um objeto.' };
  }
  const out = {};
  for (const key of Object.keys(input)) {
    if (!THEME_KEYS.includes(key)) return { error: `branding: chave desconhecida "${key}".` };
    const section = input[key];
    if (section === null || section === undefined) continue;
    if (typeof section !== 'object' || Array.isArray(section)) {
      return { error: `branding.${key} deve ser um objeto.` };
    }
    const clean = {};
    for (const ck of Object.keys(section)) {
      const v = section[ck];
      if (v === null || v === undefined || v === '') continue;
      if (!COLOR_KEYS.includes(ck)) return { error: `branding.${key}: chave desconhecida "${ck}".` };
      const hex = String(v).trim().toLowerCase();
      if (!HEX_RE.test(hex)) {
        return { error: `branding.${key}.${ck}: cor inválida — use o formato #rrggbb.` };
      }
      clean[ck] = hex;
    }
    const present = COLOR_KEYS.filter((c) => clean[c]);
    if (present.length > 0 && present.length < COLOR_KEYS.length) {
      const faltando = COLOR_KEYS.filter((c) => !clean[c]).join(', ');
      return {
        error: `branding.${key}: personalização por tema exige as 6 cores completas — faltando: ${faltando}. ` +
          `Para voltar ao padrão do tema, omita a seção "${key}" inteira.`,
      };
    }
    if (present.length > 0) out[key] = clean;
  }
  return { branding: out };
}

// Cor que vai para clubs.primary_color ao salvar o branding (null = padrão do app).
function primaryMirror(branding) {
  return (branding && branding.light && branding.light.primary) || null;
}

module.exports = { validateBranding, primaryMirror, COLOR_KEYS, THEME_KEYS, HEX_RE };
