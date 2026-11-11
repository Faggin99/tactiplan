import { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react';
import { normalizeHex, darkenHex, lightenHex, relativeLuminance, bestTextOn, contrastRatio } from '../lib/color';
import { ESTILOS, estiloValido } from '../lib/estilos';

const ThemeContext = createContext();

export const themes = {
  light: {
    name: 'light',
    colors: {
      primary: '#2563eb',
      primaryHover: '#1d4ed8',
      secondary: '#64748b',
      background: '#ffffff',
      surface: '#f8fafc',
      surfaceHover: '#f1f5f9',
      border: '#e2e8f0',
      text: '#0f172a',
      textSecondary: '#64748b',
      textMuted: '#94a3b8',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
    }
  },
  dark: {
    name: 'dark',
    colors: {
      primary: '#3b82f6',
      primaryHover: '#2563eb',
      secondary: '#64748b',
      background: '#0f172a',
      surface: '#1e293b',
      surfaceHover: '#334155',
      border: '#334155',
      text: '#f8fafc',
      textSecondary: '#cbd5e1',
      textMuted: '#94a3b8',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
    }
  }
};

// Personalização por clube (out/2026, padrão do Gestsport): o clube ativo pode trocar as
// 6 cores de cada tema (clubs.branding = { light?: {...}, dark?: {...} }). A paleta efetiva é
// a base do tema + overrides do clube, com as derivadas calculadas aqui (hover, texto sobre a
// primária com contraste AA, superfície ao passar o mouse, texto apagado). Cores de estado
// (success/warning/error) e as de resultado V/E/D ficam fixas.
export const BRANDING_COLOR_KEYS = ['primary', 'background', 'surface', 'border', 'text', 'textSecondary'];

// Limpa um branding vindo do servidor (só #rrggbb nas 6 chaves; seção vazia some).
export function sanitizeBranding(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out = {};
  for (const t of ['light', 'dark']) {
    const sec = input[t];
    if (!sec || typeof sec !== 'object') continue;
    const clean = {};
    for (const k of BRANDING_COLOR_KEYS) {
      const hex = normalizeHex(sec[k]);
      if (hex) clean[k] = hex;
    }
    if (Object.keys(clean).length > 0) out[t] = clean;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// Branding EFETIVO do clube: o salvo na Personalização; sem ele, a primary_color legada
// (cor escolhida no cadastro do clube) vale como primária dos dois temas — o efeito que já
// existia antes da Personalização. Aceita #rrggbbaa antigo (descarta o alfa).
export function effectiveClubBranding(club) {
  if (!club) return null;
  const b = sanitizeBranding(club.branding);
  if (b) return b;
  const legado = normalizeHex(typeof club.primary_color === 'string' ? club.primary_color.slice(0, 7) : null);
  if (!legado || legado === themes.light.colors.primary) return null;
  return { light: { primary: legado }, dark: { primary: legado } };
}

// Paleta efetiva de um tema com os overrides do branding (exportada pra prévia da
// Personalização montar amostras sem mexer no tema global). Mesma lógica do Gestsport.
export function resolveThemeColors(themeName, branding, estilo = 'classico') {
  const est = ESTILOS[estiloValido(estilo)];
  const base = { ...themes[themeName].colors, ...(est[themeName] || {}) };
  const cheio = (branding && branding[themeName]) || {};
  // Fora do Clássico, o estilo manda nas superfícies; do clube vale só a primária.
  const o = estiloValido(estilo) === 'classico' ? cheio : (cheio.primary ? { primary: cheio.primary } : {});
  const out = { ...base };
  if (o.background) out.background = o.background;
  if (o.surface) {
    out.surface = o.surface;
    // Hover derivado: superfícies claras escurecem, escuras clareiam.
    out.surfaceHover = relativeLuminance(o.surface) > 0.5 ? darkenHex(o.surface, 0.07) : lightenHex(o.surface, 0.12);
  }
  if (o.border) out.border = o.border;
  if (o.text) out.text = o.text;
  if (o.textSecondary) {
    out.textSecondary = o.textSecondary;
    // textMuted derivado: um passo do textSecondary em direção ao fundo.
    out.textMuted = relativeLuminance(out.background) > 0.5 ? lightenHex(o.textSecondary, 0.3) : darkenHex(o.textSecondary, 0.3);
  }
  if (o.primary) {
    out.primary = o.primary;
    // Primária muito escura (ex.: preto) escurecida some: no hover ela clareia.
    out.primaryHover = relativeLuminance(o.primary) < 0.03 ? lightenHex(o.primary, 0.18) : darkenHex(o.primary, 0.2);
    out.info = o.primary; // links/info acompanham a cor do clube
  }
  // Primária ilegível sobre o fundo (ex.: verde-neon #24eb45 no claro, contraste 1,6:1): escurece
  // (no claro) ou clareia (no escuro) até 3:1 com o fundo e a superfície — títulos, links e ímãs
  // ficam legíveis e perto da cor real. O que o clube salvou não muda; só a cor usada na tela.
  out.primary = legivelSobre(out.primary, [out.background, out.surface]);
  out.primaryHover = relativeLuminance(out.primary) < 0.03 ? lightenHex(out.primary, 0.18) : darkenHex(out.primary, 0.2);
  if (o.primary) out.info = out.primary;
  // Texto sobre a primária SEMPRE automático (contraste AA): amarelo pede texto escuro.
  out.primaryText = bestTextOn(out.primary);
  return out;
}

function legivelSobre(cor, fundos) {
  const claro = relativeLuminance(fundos[0]) > 0.5;
  let c = cor;
  for (let i = 0; i < 20; i++) {
    if (fundos.every((f) => contrastRatio(c, f) >= 3)) break;
    c = claro ? darkenHex(c, 0.06) : lightenHex(c, 0.06);
  }
  return c;
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved || 'light';
  });
  // Estilo (Clássico, Quadro tático, Gramado, Placar) — por aparelho.
  const [estilo, setEstiloState] = useState(() => {
    try { return estiloValido(localStorage.getItem('estilo')); } catch { return 'classico'; }
  });
  const setEstilo = useCallback((id) => setEstiloState(estiloValido(id)), []);
  // Branding do clube ativo — o ClubProvider injeta via setClubBranding.
  const [clubBranding, setClubBranding] = useState(null);
  // Rascunho da página Personalização (prévia ao vivo no app inteiro). null = sem prévia.
  const [brandingDraft, setBrandingDraft] = useState(null);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Estilo: atributo no <html> (regras em index.css) + variáveis de tipografia/forma.
  const estiloTokens = ESTILOS[estilo].tokens;
  useEffect(() => {
    try { localStorage.setItem('estilo', estilo); } catch { /* sem storage */ }
    const el = document.documentElement;
    el.setAttribute('data-estilo', estilo);
    el.style.setProperty('--fonte-titulo', estiloTokens.fonteTitulo);
    el.style.setProperty('--peso-titulo', String(estiloTokens.pesoTitulo));
    el.style.setProperty('--caixa-titulo', estiloTokens.caixaTitulo);
    el.style.setProperty('--fonte-texto', estiloTokens.fonteTexto);
    el.style.setProperty('--raio', `${estiloTokens.raio}px`);
  }, [estilo, estiloTokens]);



  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Compat: quem ainda injeta só uma cor primária (modelo antigo).
  const setClubPrimary = useCallback((hex) => {
    const h = normalizeHex(hex);
    setClubBranding(h ? { light: { primary: h }, dark: { primary: h } } : null);
  }, []);

  const activeBranding = brandingDraft || clubBranding;
  const colors = useMemo(() => resolveThemeColors(theme, activeBranding, estilo), [theme, activeBranding, estilo]);
  // primária para CSS (seleção de texto, foco)
  useEffect(() => { document.documentElement.style.setProperty('--cor-primaria', colors.primary); }, [colors.primary]);

  const value = {
    theme,
    setTheme,
    toggleTheme,
    colors,
    isDark: theme === 'dark',
    estilo,
    setEstilo,
    estiloTokens,
    clubBranding,
    setClubBranding,
    brandingDraft,
    setBrandingDraft,
    setClubPrimary,
    clubPrimary: activeBranding?.[theme]?.primary || null,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
