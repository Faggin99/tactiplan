import { useEffect, useRef, useState } from 'react';
import { Palette, Sun, Moon, Check } from 'lucide-react';
import { useTheme, resolveThemeColors } from '../../contexts/ThemeContext';
import { ESTILOS, LISTA_ESTILOS } from '../../lib/estilos';

// Menu "Aparência" do topo (11/11/2026): claro/escuro + estilo do app. Substitui o botão
// de lua/sol. A escolha vale para este aparelho.
export default function MenuAparencia({ compacto = false }) {
  const { colors, theme, setTheme, estilo, setEstilo, clubBranding } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('touchstart', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('touchstart', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const botao = compacto
    ? { width: 36, height: 36, borderRadius: '0.6rem', border: 'none', background: 'transparent' }
    : { width: 38, height: 38, borderRadius: '0.7rem', border: `1px solid ${colors.border}`, backgroundColor: colors.surface };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} title="Aparência" aria-label="Aparência" aria-expanded={open} aria-haspopup="dialog"
        style={{ ...botao, flexShrink: 0, color: colors.textSecondary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Palette size={compacto ? 19 : 18} />
      </button>
      {open && (
        <div role="dialog" aria-label="Aparência"
          style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 'min(19rem, calc(100vw - 1.5rem))', backgroundColor: colors.background, border: `1px solid ${colors.border}`, borderRadius: '0.7rem', boxShadow: '0 14px 34px rgba(0,0,0,0.24)', zIndex: 999, padding: '0.85rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: colors.text, marginBottom: '0.6rem' }}>Aparência</div>

          <div role="radiogroup" aria-label="Claro ou escuro" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 3, borderRadius: '0.55rem', backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}>
            {[{ id: 'light', label: 'Claro', Icon: Sun }, { id: 'dark', label: 'Escuro', Icon: Moon }].map(({ id, label, Icon }) => {
              const on = theme === id;
              return (
                <button key={id} type="button" role="radio" aria-checked={on} onClick={() => setTheme(id)}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0.45rem', borderRadius: '0.4rem', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit', backgroundColor: on ? colors.primary : 'transparent', color: on ? colors.primaryText : colors.textSecondary }}>
                  <Icon size={15} />{label}
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: colors.textSecondary, margin: '0.85rem 0 0.45rem' }}>Estilo</div>
          <div role="radiogroup" aria-label="Estilo" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {LISTA_ESTILOS.map((id) => {
              const e = ESTILOS[id];
              const on = estilo === id;
              const p = resolveThemeColors(theme, clubBranding, id);
              return (
                <button key={id} type="button" role="radio" aria-checked={on} onClick={() => setEstilo(id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.5rem 0.6rem', borderRadius: '0.55rem', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', backgroundColor: on ? colors.surface : 'transparent', border: `1px solid ${on ? colors.primary : colors.border}` }}>
                  <Amostra id={id} p={p} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: e.tokens.fonteTitulo, fontWeight: e.tokens.pesoTitulo, textTransform: e.tokens.caixaTitulo, fontSize: id === 'prancheta' ? '1.05rem' : '0.9rem', lineHeight: 1.15, color: colors.text }}>{e.nome}</span>
                    <span style={{ display: 'block', fontSize: '0.74rem', color: colors.textSecondary, marginTop: 2, lineHeight: 1.3 }}>{e.descricao}</span>
                  </span>
                  {on && <Check size={16} color={colors.primary} style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
          <p style={{ margin: '0.7rem 0 0', fontSize: '0.72rem', color: colors.textMuted, lineHeight: 1.4 }}>Vale para este aparelho. A cor do clube continua em todos os estilos.</p>
        </div>
      )}
    </div>
  );
}

// Miniatura do estilo: fundo, uma "folha" e a primária (ímã no Quadro tático).
function Amostra({ id, p }) {
  const raio = ESTILOS[id].tokens.raio;
  return (
    <span aria-hidden="true" style={{ width: 46, height: 34, flexShrink: 0, borderRadius: Math.min(raio, 8), backgroundColor: p.background, border: `${id === 'prancheta' ? 3 : 1}px solid ${p.border}`, position: 'relative', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', left: 5, right: 5, top: 5, height: 9, borderRadius: Math.min(raio, 4), backgroundColor: id === 'placar' ? '#0b0b0c' : p.surface, border: `1px solid ${p.border}` }} />
      {id === 'prancheta'
        ? <span style={{ position: 'absolute', left: 6, bottom: 4, width: 9, height: 9, borderRadius: '50%', backgroundColor: p.primary, boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.25)' }} />
        : <span style={{ position: 'absolute', left: 5, right: 18, bottom: 5, height: 6, borderRadius: Math.min(raio, 3), backgroundColor: id === 'gramado' ? '#2c8a4a' : p.primary }} />}
    </span>
  );
}
