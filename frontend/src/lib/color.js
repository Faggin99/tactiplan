// Utilitários de cor da Personalização por clube (copiado do Gestsport, escola/frontend/src/lib/color.js).
// JS puro: deriva hover e cor de texto legível sobre a cor primária do clube (contraste AA — WCAG 2.x).

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHex(hex) {
  return typeof hex === 'string' && HEX_RE.test(hex.trim());
}

export function normalizeHex(hex) {
  return isValidHex(hex) ? hex.trim().toLowerCase() : null;
}

function clamp8(v) { return Math.max(0, Math.min(255, Math.round(v))); }

export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const h = hex.replace('#', '');
  if (h.length < 6) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function darkenHex(hex, ratio) {
  const rgb = hexToRgb(hex); if (!rgb) return hex;
  const [r, g, b] = rgb;
  return '#' + [r * (1 - ratio), g * (1 - ratio), b * (1 - ratio)]
    .map((x) => clamp8(x).toString(16).padStart(2, '0')).join('');
}

// Clareia em direção ao branco (ratio 0..1) — par do darkenHex, usado pra
// derivar hover de superfícies personalizadas escuras no white-label.
export function lightenHex(hex, ratio) {
  const rgb = hexToRgb(hex); if (!rgb) return hex;
  const [r, g, b] = rgb;
  return '#' + [r + (255 - r) * ratio, g + (255 - g) * ratio, b + (255 - b) * ratio]
    .map((x) => clamp8(x).toString(16).padStart(2, '0')).join('');
}

// Luminância relativa (WCAG): 0 = preto, 1 = branco.
export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex); if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Razão de contraste WCAG entre duas cores (1:1 a 21:1).
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const DARK_TEXT = '#0f172a'; // navy do ecossistema

// Cor de texto legível sobre `bg`: branco quando atinge AA (4.5:1); senão o
// navy escuro se ele atingir AA; senão o que tiver mais contraste.
// Ex.: #c8ff00 (lime claro) → texto escuro; #2563eb (azul padrão) → branco.
export function bestTextOn(bg) {
  if (!isValidHex(bg)) return '#ffffff';
  const white = contrastRatio(bg, '#ffffff');
  const dark = contrastRatio(bg, DARK_TEXT);
  if (white >= 4.5) return '#ffffff';
  if (dark >= 4.5) return DARK_TEXT;
  return white >= dark ? '#ffffff' : DARK_TEXT;
}
