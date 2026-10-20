// Paleta do relatório derivada da cor do time (docs/formato_relatorios, seção 2.3).
// A cor do clube é arbitrária (vermelho, amarelo, preto…): daqui saem as
// variantes com contraste garantido para texto, fundos suaves e o texto que
// vai SOBRE a cor do time.

const DEFAULT_TEAM_COLOR = '#1B8A3E';

function normalizeHex(input) {
  let h = String(input || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return '#' + h.toUpperCase();
}

function hexToRgb(hex) {
  const h = normalizeHex(hex).slice(1);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b]
    .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

function luminance(hex) {
  return hexToRgb(hex)
    .map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
}

function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function teamPalette(input) {
  const hex = normalizeHex(input) || DEFAULT_TEAM_COLOR;
  const onTeam = contrast(hex, '#FFFFFF') >= contrast(hex, '#0F172A') ? '#FFFFFF' : '#0F172A';
  let ink = hex;
  for (let i = 0; i < 20 && contrast(ink, '#FFFFFF') < 4.5; i++) ink = mix(ink, '#000000', 0.08);
  return {
    team: hex,
    teamInk: ink,
    teamSoft: mix(hex, '#FFFFFF', 0.86),
    teamSofter: mix(hex, '#FFFFFF', 0.94),
    onTeam,
    // time muito claro (ex.: amarelo): barras e pilar tático usam a versão escurecida
    pTat: contrast(hex, '#FFFFFF') < 2 ? ink : hex,
  };
}

// Variáveis CSS a injetar no :root do template.
function paletteCssVars(p) {
  return [
    `--team:${p.team}`,
    `--team-ink:${p.teamInk}`,
    `--team-soft:${p.teamSoft}`,
    `--team-softer:${p.teamSofter}`,
    `--on-team:${p.onTeam}`,
    `--team-bar:${p.pTat}`,
    `--p-tat:${p.pTat}`,
  ].join(';');
}

module.exports = {
  DEFAULT_TEAM_COLOR,
  normalizeHex,
  hexToRgb,
  rgbToHex,
  mix,
  contrast,
  teamPalette,
  paletteCssVars,
};
