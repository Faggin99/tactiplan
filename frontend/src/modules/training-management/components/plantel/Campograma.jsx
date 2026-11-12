import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../../../contexts/ThemeContext';
import { useIsMobile } from '../../../../hooks/useIsMobile';
import { useSportConfig } from '../../../../hooks/useSportConfig';
import { LADOS_PREFERIDOS } from '../../../../lib/sportConfig';

// Campograma do plantel (12/11/2026, pedido do treinador): o elenco desenhado no campo, cada
// atleta (foto/iniciais, número e nome) empilhado no lugar da sua posição. Zagueiros se dividem
// pelo lado preferido (direita / esquerda; "os dois lados" fica no meio). No computador o campo é
// deitado (ataque para a direita); no celular, em pé (ataque para cima).
// Clicar num atleta abre a ficha dele.

// Coordenadas no campo DEITADO, em % (x = profundidade 0 → 100 rumo ao ataque; y = 0 lado esquerdo
// do time, 100 lado direito). Códigos antigos (dado legado) caem no lugar do novo.
const LUGAR_F11 = {
  GOL: { x: 4, y: 50 },
  'ZAG-E': { x: 26, y: 34 }, 'ZAG-A': { x: 26, y: 50 }, 'ZAG-D': { x: 26, y: 66 },
  LE: { x: 33, y: 9 }, LD: { x: 33, y: 91 },
  VOL: { x: 45, y: 50 }, VOL2: { x: 56, y: 38 }, MEI: { x: 66, y: 54 },
  EE: { x: 77, y: 12 }, ED: { x: 77, y: 88 },
  CA: { x: 89, y: 50 },
};
const LUGAR_FUTSAL = {
  GOL: { x: 8, y: 50 }, FIX: { x: 32, y: 50 }, 'ALA-E': { x: 56, y: 18 }, 'ALA-D': { x: 56, y: 82 }, PIV: { x: 84, y: 50 },
};
const SINONIMO = { GR: 'GOL', DC: 'ZAG', Z: 'ZAG', DD: 'LD', DE: 'LE', MC: 'VOL', MD: 'MEI', ME: 'MEI', MOF: 'MEI', M: 'MEI', PL: 'CA', SA: 'CA', A: 'CA' };

function chaveDoAtleta(a, futsal) {
  const code = SINONIMO[String(a.position || '').toUpperCase()] || String(a.position || '').toUpperCase();
  if (futsal) return LUGAR_FUTSAL[code] ? code : null;
  if (code === 'ZAG') return a.lado_preferido === 'direita' ? 'ZAG-D' : a.lado_preferido === 'esquerda' ? 'ZAG-E' : 'ZAG-A';
  return LUGAR_F11[code] ? code : null;
}

const iniciais = (n) => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
// computador: primeiro e último nome ("Pedro Alves"); celular: "Pedro A."
const nomeCurto = (n) => {
  const p = String(n || '').trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0] || '';
};
const primeiroNome = (n) => {
  const p = String(n || '').trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0] || '';
};
const noDm = (a) => a.status === 'injured' || String(a.group) === 'DM';

export default function Campograma({ athletes, onSelect }) {
  const { colors, estilo, isDark } = useTheme();
  const isMobile = useIsMobile();
  const sport = useSportConfig();
  const futsal = sport?.modality === 'futsal';
  const [mostrarDm, setMostrarDm] = useState(true);
  const lugares = futsal ? LUGAR_FUTSAL : LUGAR_F11;
  const nomes = useMemo(() => Object.fromEntries((sport?.positions || []).map((p) => [p.code, p.name])), [sport]);

  const { grupos, semLugar } = useMemo(() => {
    const g = {};
    const fora = [];
    for (const a of athletes) {
      if (!mostrarDm && noDm(a)) continue;
      const k = chaveDoAtleta(a, futsal);
      if (!k) { fora.push(a); continue; }
      (g[k] = g[k] || []).push(a);
    }
    for (const k of Object.keys(g)) g[k].sort((x, y) => (noDm(x) - noDm(y)) || ((x.jersey_number ?? 999) - (y.jersey_number ?? 999)) || String(x.name).localeCompare(String(y.name)));
    return { grupos: g, semLugar: fora };
  }, [athletes, futsal, mostrarDm]);

  const quadro = estilo === 'prancheta';
  const placar = estilo === 'placar';
  const linha = quadro ? colors.primary : '#ffffff';
  const linhaOp = quadro ? 0.5 : 0.75;
  const vertical = isMobile;
  // Largura real do campo: estreito (tela pequena, menu aberto) = fichas compactas, para os grupos
  // do goleiro, zagueiros e volantes não se encostarem.
  const campoRef = useRef(null);
  const [largura, setLargura] = useState(1200);
  useEffect(() => {
    const el = campoRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const compacto = vertical || largura < 1050;
  const W = vertical ? 68 : 105;
  const H = vertical ? 125 : 68;

  const rotulo = (k) => {
    if (k.startsWith('ZAG-')) {
      const l = { 'ZAG-D': 'Zagueiros · direita', 'ZAG-E': 'Zagueiros · esquerda', 'ZAG-A': 'Zagueiros' }[k];
      return l;
    }
    return nomes[k] || k;
  };
  // Grupo perto da linha do campo encosta na borda (não corta): ancora pelo lado em vez do centro.
  const eixo = (v) => (v < 14 ? { pos: '1.5%', tr: '0%' } : v > 86 ? { pos: '98.5%', tr: '-100%' } : { pos: `${v}%`, tr: '-50%' });
  const pos = (p) => {
    const h = eixo(vertical ? p.y : p.x);
    const v = eixo(vertical ? 100 - p.x : p.y);
    return { left: h.pos, top: v.pos, transform: `translate(${h.tr}, ${v.tr})` };
  };

  const fundoCampo = quadro
    ? colors.surface
    : placar
      ? '#0b0b0c'
      : 'repeating-linear-gradient(' + (vertical ? '0deg' : '90deg') + ', #2f8f4e 0 9.09%, #2a8447 9.09% 18.18%)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.82rem', color: colors.textSecondary }}>
        <span>{athletes.length} atletas · clique num atleta para abrir a ficha</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={mostrarDm} onChange={(e) => setMostrarDm(e.target.checked)} />
          Mostrar quem está no DM
        </label>
      </div>

      <div ref={campoRef} style={{ position: 'relative', width: '100%', maxWidth: vertical ? 520 : `calc((100vh - 250px) * ${W / H})`, margin: '0 auto', aspectRatio: `${W} / ${H}`, borderRadius: quadro ? 6 : 10, overflow: 'hidden', background: fundoCampo, border: quadro ? `7px solid ${colors.border}` : placar ? `1px solid #26262b` : 'none', boxShadow: '0 12px 26px -18px rgba(0,0,0,.6)' }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <g fill="none" stroke={placar ? colors.primary : linha} strokeOpacity={placar ? 0.55 : linhaOp} strokeWidth="0.35" strokeDasharray={quadro ? '1.6 1.2' : undefined}>
            <rect x="1.5" y="1.5" width={W - 3} height={H - 3} />
            {vertical ? (
              <>
                <path d={`M1.5 ${H / 2}H${W - 1.5}`} /><circle cx={W / 2} cy={H / 2} r="9.15" />
                <rect x={W / 2 - 20.15} y="1.5" width="40.3" height="16.5" /><rect x={W / 2 - 9.16} y="1.5" width="18.32" height="5.5" />
                <rect x={W / 2 - 20.15} y={H - 18} width="40.3" height="16.5" /><rect x={W / 2 - 9.16} y={H - 7} width="18.32" height="5.5" />
              </>
            ) : (
              <>
                <path d={`M${W / 2} 1.5V${H - 1.5}`} /><circle cx={W / 2} cy={H / 2} r="9.15" />
                <rect x="1.5" y={H / 2 - 20.15} width="16.5" height="40.3" /><rect x="1.5" y={H / 2 - 9.16} width="5.5" height="18.32" />
                <rect x={W - 18} y={H / 2 - 20.15} width="16.5" height="40.3" /><rect x={W - 7} y={H / 2 - 9.16} width="5.5" height="18.32" />
              </>
            )}
          </g>
        </svg>

        {Object.entries(lugares).map(([k, p]) => {
          const lista = grupos[k] || [];
          if (!lista.length) return null;
          return (
            <div key={k} style={{ position: 'absolute', ...pos(p), display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 3, width: compacto ? 'max-content' : '17%', maxWidth: 200, minWidth: compacto ? 0 : 132, zIndex: 1 }}>
              <span style={{ alignSelf: 'center', fontSize: vertical ? '0.6rem' : '0.66rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: quadro ? colors.textSecondary : '#ffffffd9', textShadow: quadro ? 'none' : '0 1px 2px rgba(0,0,0,.5)', whiteSpace: 'nowrap' }}>
                {rotulo(k)} · {lista.length}
              </span>
              {lista.map((a) => <Ficha key={a.id} a={a} onSelect={onSelect} colors={colors} quadro={quadro} placar={placar} compacto={compacto} isDark={isDark} />)}
            </div>
          );
        })}
      </div>

      {semLugar.length > 0 && (
        <div style={{ fontSize: '0.8rem', color: colors.textSecondary }}>
          <b style={{ color: colors.text }}>Sem posição no campo ({semLugar.length}):</b>{' '}
          {semLugar.map((a, i) => (
            <button key={a.id} type="button" onClick={() => onSelect?.(a)} style={{ background: 'none', border: 'none', padding: 0, color: colors.primary, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>
              {a.name}{a.position ? ` (${a.position})` : ''}{i < semLugar.length - 1 ? ',' : ''}
            </button>
          ))}
          {' '}— cadastre a posição para aparecer no campo.
        </div>
      )}
      <p style={{ margin: 0, fontSize: '0.75rem', color: colors.textMuted }}>
        Zagueiros se dividem pelo lado em que preferem jogar ({LADOS_PREFERIDOS.map((l) => l.label.toLowerCase()).join(', ')}); edite o atleta para escolher.
      </p>
    </div>
  );
}

function Ficha({ a, onSelect, colors, quadro, placar, compacto }) {
  const dm = noDm(a);
  const [falhou, setFalhou] = useState(false);
  const fundo = dm ? '#7f1d1d' : quadro ? '#ffffff' : placar ? '#151517' : 'rgba(15,23,42,.88)';
  const texto = quadro && !dm ? '#222' : '#fff';
  return (
    <button type="button" onClick={() => onSelect?.(a)} title={`${a.name}${a.position ? ` · ${a.position}` : ''}${dm ? ' · no DM' : ''}`}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: compacto ? '2px 6px 2px 2px' : '2px 8px 2px 2px', borderRadius: 999, border: quadro ? `1.5px solid ${dm ? '#7f1d1d' : '#222'}` : 'none', backgroundColor: fundo, color: texto, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', minWidth: 0, boxShadow: '0 2px 5px -2px rgba(0,0,0,.5)' }}>
      {a.photo_url && !falhou
        ? <img src={a.photo_url} alt="" onError={() => setFalhou(true)} style={{ width: compacto ? 20 : 24, height: compacto ? 20 : 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, backgroundColor: '#e2e8f0' }} />
        : <span aria-hidden="true" style={{ width: compacto ? 20 : 24, height: compacto ? 20 : 24, borderRadius: '50%', flexShrink: 0, backgroundColor: colors.primary, color: colors.primaryText, fontSize: compacto ? '0.55rem' : '0.62rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{iniciais(a.name)}</span>}
      {a.jersey_number != null && <span style={{ fontSize: compacto ? '0.62rem' : '0.7rem', fontWeight: 800, opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}>{a.jersey_number}</span>}
      <span style={{ fontSize: compacto ? '0.66rem' : '0.74rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {compacto ? primeiroNome(a.name) : nomeCurto(a.name)}
      </span>
    </button>
  );
}
