import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronUp, ChevronDown, GripVertical, Loader2, FileText, ImageOff, RotateCcw } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { notify } from '../../lib/notify';
import { downloadReport, fetchReportPreview } from '../../services/reportsService';

// Modal "Fotos do relatório": antes de gerar a ficha do dia / relatório da
// semana, o usuário escolhe quais fotos entram, a ordem, legendas e o layout.
// A prévia à direita é o MESMO template do PDF (HTML vindo do servidor,
// paginado dentro do iframe), então o que se vê é o que sai.

const MAX_LEGENDA = 120;
const A4_W = 794; // 210mm a 96dpi
const A4_H = 1123;
const PREVIEW_DEBOUNCE_MS = 400;

const LAYOUTS = [
  { id: 'grande', label: 'Grande', hint: '1 por linha' },
  { id: 'medio', label: 'Médio', hint: '2 por linha' },
  { id: 'compacto', label: 'Compacto', hint: '3 por linha' },
  { id: 'mosaico', label: 'Mosaico', hint: '1 destaque + menores' },
];
const PROPORCOES = [
  { id: '4:3', label: 'Paisagem 4:3' },
  { id: '1:1', label: 'Quadrada 1:1' },
  { id: 'original', label: 'Original' },
];

// Última escolha de layout/proporção/legendas por usuário, neste aparelho.
const prefsKey = (userId) => `tp.relatorio.fotos.v1.${userId || 'anon'}`;
function readPrefs(userId) {
  try {
    const v = JSON.parse(localStorage.getItem(prefsKey(userId)) || 'null');
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}
function writePrefs(userId, prefs) {
  try { localStorage.setItem(prefsKey(userId), JSON.stringify(prefs)); } catch { /* sem storage */ }
}

// Mini desenho de cada layout (cards clicáveis)
function LayoutGlyph({ id, color }) {
  const r = (x, y, w, h, k) => <rect key={k} x={x} y={y} width={w} height={h} rx="1.5" fill={color} />;
  let shapes;
  if (id === 'grande') shapes = [r(10, 3, 36, 15, 1), r(10, 22, 36, 15, 2)];
  else if (id === 'medio') shapes = [r(4, 3, 23, 15, 1), r(29, 3, 23, 15, 2), r(4, 22, 23, 15, 3), r(29, 22, 23, 15, 4)];
  else if (id === 'compacto') shapes = [0, 1, 2].flatMap((c) => [r(4 + c * 16.5, 3, 15, 15, `a${c}`), r(4 + c * 16.5, 22, 15, 15, `b${c}`)]);
  else shapes = [r(4, 3, 31.5, 22, 1), r(37.5, 3, 14.5, 10, 2), r(37.5, 15, 14.5, 10, 3), r(4, 27, 15, 10, 4), r(20.5, 27, 15, 10, 5), r(37, 27, 15, 10, 6)];
  return <svg width="56" height="40" viewBox="0 0 56 40" aria-hidden="true">{shapes}</svg>;
}

function RatioGlyph({ id, color }) {
  if (id === '1:1') return <svg width="20" height="16" viewBox="0 0 20 16" aria-hidden="true"><rect x="4" y="1" width="12" height="12" rx="1.5" fill="none" stroke={color} strokeWidth="1.6" /></svg>;
  if (id === 'original') return <svg width="20" height="16" viewBox="0 0 20 16" aria-hidden="true"><rect x="1" y="1" width="18" height="13" rx="1.5" fill="none" stroke={color} strokeWidth="1.2" strokeDasharray="2 1.5" /><rect x="6" y="3" width="8" height="9" rx="1" fill={color} /></svg>;
  return <svg width="20" height="16" viewBox="0 0 20 16" aria-hidden="true"><rect x="1.5" y="1.5" width="17" height="12.75" rx="1.5" fill="none" stroke={color} strokeWidth="1.6" /></svg>;
}

export function ReportPhotosModal({ tipo, body, filename, list, onClose }) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const fotos = list.fotos;
  const semana = !!list.semana;
  const limite = list.limite || 24;
  const padrao = list.padrao || {};

  const initial = useMemo(() => {
    const p = readPrefs(user?.id) || {};
    return {
      layout: LAYOUTS.some((l) => l.id === p.layout) ? p.layout : (padrao.layout || 'medio'),
      proporcao: PROPORCOES.some((x) => x.id === p.proporcao) ? p.proporcao : (padrao.proporcao || '4:3'),
      legendas: typeof p.legendas === 'boolean' ? p.legendas : true,
      agrupar: typeof p.agrupar === 'boolean' ? p.agrupar : true,
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [layout, setLayout] = useState(initial.layout);
  const [proporcao, setProporcao] = useState(initial.proporcao);
  const [legendas, setLegendas] = useState(initial.legendas);
  const [agrupar, setAgrupar] = useState(initial.agrupar);
  const [order, setOrder] = useState(() => fotos.map((f) => f.id));
  const [selected, setSelected] = useState(() => new Set(padrao.ids || []));
  const [custom, setCustom] = useState({});
  const [tab, setTab] = useState('ajustes'); // celular: ajustes | previa
  const [exporting, setExporting] = useState(null); // 'config' | 'padrao' | 'sem'
  const [dragId, setDragId] = useState(null);

  const byId = useMemo(() => new Map(fotos.map((f) => [f.id, f])), [fotos]);
  const grouped = semana && agrupar;

  useEffect(() => {
    writePrefs(user?.id, { layout, proporcao, legendas, agrupar });
  }, [user?.id, layout, proporcao, legendas, agrupar]);

  // Escape fecha; trava o scroll da página por baixo
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape' && !exporting) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, exporting]);

  // Ordem exibida: agrupada por dia (semana) ou corrida
  const groups = useMemo(() => {
    if (!grouped) return [{ key: 'all', label: null, ids: order }];
    const map = new Map();
    for (const id of order) {
      const f = byId.get(id);
      const k = f?.date || 'sem-data';
      if (!map.has(k)) map.set(k, { key: k, label: f?.dia ? `${f.dia} · ${f.dd}` : 'Sem data', ids: [] });
      map.get(k).ids.push(id);
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [grouped, order, byId]);
  const displayOrder = useMemo(() => groups.flatMap((g) => g.ids), [groups]);

  const config = useMemo(() => {
    const ids = displayOrder.filter((id) => selected.has(id));
    const legendasCustom = {};
    for (const id of ids) {
      if (custom[id] !== undefined && custom[id] !== (byId.get(id)?.titulo || '')) legendasCustom[id] = custom[id].slice(0, MAX_LEGENDA);
    }
    return { ids, layout, proporcao, legendas, agrupar, legendasCustom };
  }, [displayOrder, selected, custom, layout, proporcao, legendas, agrupar, byId]);

  // ------------------------------------------------------------ prévia
  const [preview, setPreview] = useState({ html: null, loading: true, error: null });
  const [pageInfo, setPageInfo] = useState({ pages: 0, height: A4_H });
  const iframeRef = useRef(null);
  const configKey = JSON.stringify(config);

  useEffect(() => {
    if (!config.ids.length) {
      setPreview({ html: null, loading: false, error: null });
      setPageInfo({ pages: 0, height: A4_H });
      return undefined;
    }
    const ctrl = new AbortController();
    setPreview((p) => ({ ...p, loading: true, error: null }));
    const t = setTimeout(async () => {
      try {
        const r = await fetchReportPreview(tipo, { ...body, fotos: config }, { signal: ctrl.signal });
        if (!ctrl.signal.aborted) setPreview({ html: r.html, loading: false, error: null });
      } catch (err) {
        if (ctrl.signal.aborted || err.name === 'AbortError') return;
        setPreview({ html: null, loading: false, error: err.message || 'Não foi possível montar a prévia.' });
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [configKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onMsg = (e) => {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const d = e.data;
      if (d && d.type === 'tp-report-preview') setPageInfo({ pages: Number(d.pages) || 0, height: Number(d.height) || A4_H });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // escala da "folha" para caber na largura da coluna
  const boxRef = useRef(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, [tab, isMobile]);
  const scale = boxW ? Math.min(1, (boxW - 24) / A4_W) : 0.5;

  // ------------------------------------------------------------ ações na lista
  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= limite) {
          notify.info(`No máximo ${limite} fotos por relatório.`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };
  const selectAll = () => {
    const ids = displayOrder.slice(0, limite);
    if (displayOrder.length > limite) notify.info(`Selecionadas as primeiras ${limite} (máximo por relatório).`);
    setSelected(new Set(ids));
  };
  const selectNone = () => setSelected(new Set());

  // move dentro do mesmo grupo (dia) quando agrupado; livre na lista corrida
  const groupOf = useCallback((id) => (grouped ? (byId.get(id)?.date || 'sem-data') : 'all'), [grouped, byId]);
  const move = (id, dir) => {
    const seq = displayOrder;
    const i = seq.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= seq.length || groupOf(seq[j]) !== groupOf(id)) return;
    const next = seq.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  const dropOn = (targetId) => {
    if (!dragId || dragId === targetId || groupOf(dragId) !== groupOf(targetId)) return;
    const seq = displayOrder.filter((x) => x !== dragId);
    const from = displayOrder.indexOf(dragId);
    const to = displayOrder.indexOf(targetId);
    const at = seq.indexOf(targetId) + (from < to ? 1 : 0);
    seq.splice(at, 0, dragId);
    setOrder(seq);
  };

  // ------------------------------------------------------------ exportar
  const doExport = async (mode) => {
    if (exporting) return;
    if (mode === 'config' && !config.ids.length) mode = 'sem';
    setExporting(mode);
    try {
      const b = mode === 'padrao' ? body : { ...body, fotos: mode === 'sem' ? { ids: [] } : config };
      await downloadReport(tipo, b, filename);
      onClose();
    } catch (err) {
      notify.error(err.message || 'Não foi possível gerar o PDF.');
    } finally {
      setExporting(null);
    }
  };

  // ------------------------------------------------------------ estilos
  const sub = colors.textSecondary;
  const card = (active) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem',
    padding: '0.5rem 0.25rem', borderRadius: '0.5rem', cursor: 'pointer',
    border: `2px solid ${active ? colors.primary : colors.border}`,
    background: active ? (isDark ? 'rgba(59,130,246,0.12)' : 'rgba(37,99,235,0.06)') : colors.surface,
    color: colors.text, fontSize: '0.75rem', fontWeight: 600, minWidth: 0,
  });
  const chipBtn = (active) => ({
    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
    padding: '0.4rem 0.6rem', borderRadius: '999px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
    border: `1.5px solid ${active ? colors.primary : colors.border}`,
    background: active ? (isDark ? 'rgba(59,130,246,0.12)' : 'rgba(37,99,235,0.06)') : 'transparent',
    color: active ? colors.primary : colors.text,
  });
  const label = { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: sub, margin: '0 0 0.5rem' };
  const linkBtn = { background: 'none', border: 'none', color: colors.primary, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, padding: '0.2rem 0.3rem' };
  const iconBtn = (disabled) => ({
    width: 30, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: `1px solid ${colors.border}`, borderRadius: '0.35rem', background: colors.background,
    color: disabled ? colors.textMuted : colors.text, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, padding: 0,
  });
  const btn = (kind) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
    padding: '0.55rem 0.9rem', borderRadius: '0.45rem', fontSize: '0.85rem', fontWeight: 600,
    cursor: exporting ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
    ...(kind === 'primary'
      ? { background: colors.primary, color: '#fff', border: 'none' }
      : { background: 'transparent', color: colors.text, border: `1px solid ${colors.border}` }),
    opacity: exporting && exporting !== kind ? 0.6 : 1,
  });
  const spin = <Loader2 size={15} style={{ animation: 'tp-spin 0.9s linear infinite' }} />;

  const selCount = config.ids.length;
  const pagesLabel = !selCount ? 'Sem fotos' : (pageInfo.pages ? `Fotos: ${pageInfo.pages} ${pageInfo.pages === 1 ? 'página' : 'páginas'}` : 'Fotos: …');

  // ------------------------------------------------------------ partes
  const controls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      <section>
        <p style={label}>Layout</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.45rem' }}>
          {LAYOUTS.map((l) => (
            <button key={l.id} type="button" style={card(layout === l.id)} onClick={() => setLayout(l.id)} aria-pressed={layout === l.id} title={l.hint}>
              <LayoutGlyph id={l.id} color={layout === l.id ? colors.primary : colors.textMuted} />
              <span>{l.label}</span>
              <span style={{ fontSize: '0.65rem', fontWeight: 500, color: sub, textAlign: 'center', lineHeight: 1.2 }}>{l.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <p style={label}>Proporção</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {PROPORCOES.map((p) => (
            <button key={p.id} type="button" style={chipBtn(proporcao === p.id)} onClick={() => setProporcao(p.id)} aria-pressed={proporcao === p.id}>
              <RatioGlyph id={p.id} color={proporcao === p.id ? colors.primary : colors.textMuted} />{p.label}
            </button>
          ))}
        </div>
        {proporcao === 'original' && <p style={{ fontSize: '0.72rem', color: sub, margin: '0.35rem 0 0' }}>A foto aparece inteira, sem corte.</p>}
      </section>

      <section style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        <button type="button" style={chipBtn(legendas)} onClick={() => setLegendas((v) => !v)} aria-pressed={legendas}>
          {legendas ? '✓ ' : ''}Mostrar legendas
        </button>
        {semana && (
          <>
            <button type="button" style={chipBtn(agrupar)} onClick={() => setAgrupar(true)} aria-pressed={agrupar}>Agrupar por dia</button>
            <button type="button" style={chipBtn(!agrupar)} onClick={() => setAgrupar(false)} aria-pressed={!agrupar}>Lista corrida</button>
          </>
        )}
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <p style={{ ...label, margin: 0 }}>Fotos · {selCount} de {fotos.length}{fotos.length > limite ? ` (máx. ${limite})` : ''}</p>
          <div>
            <button type="button" style={linkBtn} onClick={selectAll}>Selecionar todas</button>
            <button type="button" style={linkBtn} onClick={selectNone}>Nenhuma</button>
          </div>
        </div>
        {list.total > fotos.length && (
          <p style={{ fontSize: '0.72rem', color: sub, margin: '0 0 0.4rem' }}>Mostrando as {fotos.length} primeiras de {list.total} fotos.</p>
        )}
        {groups.map((g) => (
          <div key={g.key} style={{ marginBottom: '0.6rem' }}>
            {g.label && <div style={{ fontSize: '0.8rem', fontWeight: 700, color: colors.text, margin: '0.5rem 0 0.35rem' }}>{g.label}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {g.ids.map((id, idx) => {
                const f = byId.get(id);
                const on = selected.has(id);
                const value = custom[id] !== undefined ? custom[id] : (f.titulo || '');
                return (
                  <div
                    key={id}
                    draggable={!isMobile}
                    onDragStart={(e) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => { if (dragId && groupOf(dragId) === groupOf(id)) e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); dropOn(id); setDragId(null); }}
                    data-testid="foto-item"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem',
                      borderRadius: '0.5rem', border: `1px solid ${dragId === id ? colors.primary : colors.border}`,
                      background: on ? colors.surface : 'transparent', opacity: on ? 1 : 0.6,
                    }}
                  >
                    {!isMobile && <GripVertical size={16} color={colors.textMuted} style={{ cursor: 'grab', flexShrink: 0 }} />}
                    <input
                      type="checkbox" checked={on} onChange={() => toggle(id)}
                      aria-label={`Incluir ${f.titulo || 'foto'}`}
                      style={{ width: 18, height: 18, accentColor: colors.primary, flexShrink: 0, cursor: 'pointer' }}
                    />
                    <img src={f.thumb} alt="" onClick={() => toggle(id)} style={{ width: 56, height: 42, objectFit: 'cover', borderRadius: '0.3rem', flexShrink: 0, cursor: 'pointer', background: colors.surfaceHover }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input
                        type="text" value={value} maxLength={MAX_LEGENDA}
                        onChange={(e) => setCustom((c) => ({ ...c, [id]: e.target.value }))}
                        placeholder="Sem legenda"
                        aria-label="Legenda no relatório"
                        style={{
                          width: '100%', boxSizing: 'border-box', fontSize: isMobile ? '16px' : '0.8rem', // 16px: iOS não dá zoom no foco
                           padding: '0.3rem 0.45rem',
                          border: `1px solid ${colors.border}`, borderRadius: '0.35rem', background: colors.background, color: colors.text,
                        }}
                      />
                      <div style={{ fontSize: '0.7rem', color: sub, marginTop: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {f.origem || 'Anexo do dia'}
                        {custom[id] !== undefined && custom[id] !== (f.titulo || '') && (
                          <button type="button" onClick={() => setCustom((c) => { const n = { ...c }; delete n[id]; return n; })}
                            style={{ ...linkBtn, fontSize: '0.68rem', padding: '0 0.3rem' }} title="Voltar à legenda do anexo">
                            <RotateCcw size={10} /> original
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flexShrink: 0 }}>
                      <button type="button" style={iconBtn(idx === 0)} disabled={idx === 0} onClick={() => move(id, -1)} aria-label="Subir"><ChevronUp size={15} /></button>
                      <button type="button" style={iconBtn(idx === g.ids.length - 1)} disabled={idx === g.ids.length - 1} onClick={() => move(id, 1)} aria-label="Descer"><ChevronDown size={15} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );

  const previewPane = (
    <div ref={boxRef} style={{ position: 'relative', minHeight: 200 }}>
      {!selCount ? (
        <div style={{ textAlign: 'center', color: sub, padding: '3rem 1rem', fontSize: '0.9rem' }}>
          <ImageOff size={28} style={{ marginBottom: '0.5rem' }} />
          <div>Nenhuma foto selecionada.</div>
          <div style={{ fontSize: '0.8rem' }}>O relatório sai sem a seção de fotos.</div>
        </div>
      ) : preview.error ? (
        <div style={{ textAlign: 'center', color: colors.error, padding: '3rem 1rem', fontSize: '0.9rem' }}>{preview.error}</div>
      ) : (
        <>
          {preview.html && (
            <div style={{ width: A4_W * scale, height: pageInfo.height * scale, margin: '0 auto', overflow: 'hidden' }}>
              <iframe
                ref={iframeRef}
                title="Prévia das fotos do relatório"
                sandbox="allow-scripts"
                srcDoc={preview.html}
                scrolling="no"
                style={{ width: A4_W, height: pageInfo.height, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0', display: 'block', background: 'transparent' }}
              />
            </div>
          )}
          {preview.loading && (
            <div style={{ position: 'absolute', top: 8, right: 12, display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: sub, background: colors.background, padding: '0.2rem 0.5rem', borderRadius: '999px', border: `1px solid ${colors.border}` }}>
              {spin} Atualizando…
            </div>
          )}
        </>
      )}
    </div>
  );

  const footer = (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center',
      padding: isMobile ? '0.6rem 0.75rem calc(0.6rem + env(safe-area-inset-bottom))' : '0.75rem 1.25rem',
      borderTop: `1px solid ${colors.border}`, background: colors.background, flexShrink: 0,
    }}>
      <button type="button" style={{ ...btn('sem'), flex: isMobile ? '1 1 40%' : undefined }} disabled={!!exporting} onClick={() => doExport('sem')}>
        {exporting === 'sem' ? spin : <ImageOff size={15} />} Exportar sem fotos
      </button>
      <button type="button" style={{ ...btn('padrao'), flex: isMobile ? '1 1 40%' : undefined }} disabled={!!exporting} onClick={() => doExport('padrao')} title="Gera com a seleção automática (como antes)">
        {exporting === 'padrao' ? spin : null} Usar padrão
      </button>
      <button type="button" style={{ ...btn('primary'), flex: isMobile ? '1 1 100%' : undefined, opacity: exporting && exporting !== 'config' ? 0.6 : 1 }} disabled={!!exporting} onClick={() => doExport('config')} data-testid="exportar-fotos">
        {exporting === 'config' ? spin : <FileText size={15} />} {exporting === 'config' ? 'Gerando…' : 'Exportar PDF'}
      </button>
    </div>
  );

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: isMobile ? '0.75rem 0.9rem' : '0.9rem 1.25rem', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: colors.text }}>Fotos do relatório</h2>
        <div style={{ fontSize: '0.78rem', color: sub }}>{semana ? 'Fotos da semana' : 'Registro fotográfico do dia'} · {pagesLabel}</div>
      </div>
      <button type="button" onClick={() => !exporting && onClose()} aria-label="Fechar" style={{ background: 'none', border: 'none', color: colors.text, cursor: 'pointer', padding: '0.3rem', display: 'inline-flex' }}>
        <X size={20} />
      </button>
    </div>
  );

  const previewBg = isDark ? '#0b1220' : '#e5e7eb';

  const content = isMobile ? (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10050, background: colors.background, display: 'flex', flexDirection: 'column' }} role="dialog" aria-modal="true" aria-label="Fotos do relatório">
      {header}
      <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
        {[['ajustes', 'Ajustes'], ['previa', `Prévia${selCount && pageInfo.pages ? ` (${pageInfo.pages} pág.)` : ''}`]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{
            flex: 1, padding: '0.65rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600,
            color: tab === k ? colors.primary : sub, borderBottom: `2px solid ${tab === k ? colors.primary : 'transparent'}`,
          }}>{l}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: tab === 'previa' ? '0.75rem 0' : '0.9rem', background: tab === 'previa' ? previewBg : colors.background }}>
        {tab === 'ajustes' ? controls : previewPane}
      </div>
      {footer}
    </div>
  ) : (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !exporting) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Fotos do relatório" style={{
        width: 'min(1200px, 100%)', height: 'min(92vh, 900px)', background: colors.background, borderRadius: '0.75rem',
        border: `1px solid ${colors.border}`, boxShadow: '0 25px 50px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {header}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ width: 430, flexShrink: 0, overflowY: 'auto', padding: '1rem 1.1rem', borderRight: `1px solid ${colors.border}` }}>{controls}</div>
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '1rem 0', background: previewBg }}>{previewPane}</div>
        </div>
        {footer}
      </div>
    </div>
  );

  return createPortal(
    <>
      <style>{'@keyframes tp-spin { to { transform: rotate(360deg); } }'}</style>
      {content}
    </>,
    document.body,
  );
}
