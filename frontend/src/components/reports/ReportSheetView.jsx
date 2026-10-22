import { useEffect, useRef, useState } from 'react';
import { fetchSessionSheetView } from '../../services/reportsService';

const A4_W = 794; // 210mm a 96dpi
const A4_H = 1123;

// Mostra a ficha de sessão NOVA (mesmo template do PDF) dentro de um iframe
// isolado, escalado para caber na largura. Se falhar, chama onFallback para a
// tela antiga continuar funcionando.
export function ReportSheetView({ sessionId, onFallback, refreshKey, soPeriodo = false }) {
  const [html, setHtml] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | erro
  const [height, setHeight] = useState(A4_H);
  const iframeRef = useRef(null);
  const boxRef = useRef(null);
  const [boxW, setBoxW] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setState('loading');
    fetchSessionSheetView(sessionId, { signal: ctrl.signal, soPeriodo })
      .then((r) => {
        if (ctrl.signal.aborted) return;
        if (!r?.html) { setState('erro'); onFallback?.(); return; }
        setHtml(r.html); setState('ok');
      })
      .catch((err) => {
        if (ctrl.signal.aborted || err.name === 'AbortError') return;
        setState('erro'); onFallback?.();
      });
    return () => ctrl.abort();
  }, [sessionId, refreshKey, soPeriodo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onMsg = (e) => {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const d = e.data;
      if (d && d.type === 'tp-report-preview') setHeight(Number(d.height) || A4_H);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const scale = boxW ? Math.min(1, boxW / A4_W) : 0.6;

  return (
    <div ref={boxRef} style={{ width: '100%', maxWidth: A4_W }}>
      {state === 'loading' && (
        <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
          Montando a ficha do dia…
        </div>
      )}
      {state === 'ok' && html && (
        <div style={{ width: A4_W * scale, height: height * scale, margin: '0 auto', overflow: 'hidden' }}>
          <iframe
            ref={iframeRef}
            title="Ficha do dia"
            sandbox="allow-scripts"
            srcDoc={html}
            style={{ width: A4_W, height, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0', display: 'block', background: 'transparent' }}
          />
        </div>
      )}
    </div>
  );
}
