import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Tour guiado reutilizável.
 *
 * Props:
 * - steps: array de step objects, cada um com:
 *     selector?:        string CSS seletor do elemento alvo
 *     title:            string
 *     content:          string | ReactNode
 *     placement?:       'top'|'bottom'|'left'|'right'|'auto' (default 'auto')
 *     beforeEnter?:     () => void | Promise — executa antes do step (ex: abrir modal)
 *     afterLeave?:      () => void | Promise — executa ao sair do step (ex: fechar modal)
 *     waitForSelector?: string — espera o selector aparecer no DOM (útil após beforeEnter)
 *     waitMs?:          number — tempo extra de espera em ms após beforeEnter (default 0)
 * - isOpen, onClose, onFinish, storageKey: como antes
 */

function waitForElement(selector, timeout = 3000) {
  return new Promise((resolve) => {
    if (!selector) return resolve(null);
    const found = document.querySelector(selector);
    if (found) return resolve(found);
    const start = Date.now();
    const id = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) { clearInterval(id); resolve(el); return; }
      if (Date.now() - start > timeout) { clearInterval(id); resolve(null); }
    }, 80);
  });
}
export function TourGuide({ steps = [], isOpen, onClose, onFinish, storageKey }) {
  const { colors } = useTheme();
  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const tooltipRef = useRef(null);

  const step = steps[stepIdx];
  const previousStepRef = useRef(null);

  // Roda beforeEnter / afterLeave + posiciona spotlight
  useEffect(() => {
    if (!isOpen || !step) {
      setTargetRect(null);
      return;
    }
    let cancelled = false;
    let cleanupListeners = null;

    const run = async () => {
      // afterLeave do step anterior (se houver e for diferente)
      const prev = previousStepRef.current;
      if (prev && prev !== step && prev.afterLeave) {
        try { await prev.afterLeave(); } catch (e) { console.error('tour afterLeave', e); }
      }

      // beforeEnter do step atual
      if (step.beforeEnter) {
        try { await step.beforeEnter(); } catch (e) { console.error('tour beforeEnter', e); }
      }

      const selector = step.waitForSelector || step.selector;
      if (selector) {
        if (step.waitMs) await new Promise((r) => setTimeout(r, step.waitMs));
        const el = await waitForElement(selector, 3000);
        if (cancelled) return;
        if (!el) { setTargetRect(null); previousStepRef.current = step; return; }
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const update = () => {
          const r = el.getBoundingClientRect();
          setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        };
        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        const id = setInterval(update, 250);
        cleanupListeners = () => {
          window.removeEventListener('resize', update);
          window.removeEventListener('scroll', update, true);
          clearInterval(id);
        };
      } else {
        setTargetRect(null);
      }
      previousStepRef.current = step;
    };

    run();

    return () => {
      cancelled = true;
      if (cleanupListeners) cleanupListeners();
    };
  }, [isOpen, stepIdx, step]);

  // Reseta para o primeiro passo ao abrir
  useEffect(() => {
    if (isOpen) setStepIdx(0);
  }, [isOpen]);

  // Atalhos teclado
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') handleSkip();
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, stepIdx, steps.length]);

  if (!isOpen || !step) return null;

  function markSeen() {
    if (storageKey) {
      try { localStorage.setItem(storageKey, '1'); } catch (_) {}
    }
  }

  async function runAfterLeaveAndClose() {
    const current = steps[stepIdx];
    if (current?.afterLeave) {
      try { await current.afterLeave(); } catch (e) { console.error('tour afterLeave', e); }
    }
    previousStepRef.current = null;
  }

  async function handleSkip() {
    await runAfterLeaveAndClose();
    markSeen();
    onClose?.();
  }

  async function handleNext() {
    if (stepIdx >= steps.length - 1) {
      await runAfterLeaveAndClose();
      markSeen();
      onFinish?.();
      onClose?.();
    } else {
      setStepIdx((i) => i + 1);
    }
  }

  function handlePrev() {
    setStepIdx((i) => Math.max(0, i - 1));
  }

  // -- Layout --

  const PAD = 8;
  const VIEWPORT_MARGIN = 12;
  const TOOLTIP_OFFSET = 16;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const TOOLTIP_W = Math.min(360, vw - VIEWPORT_MARGIN * 2);
  const TOOLTIP_H_EST = 260; // estimativa pra placement automático

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  // Calcula posição do tooltip (sempre clampado dentro da viewport)
  let tooltipStyle = {};
  if (!targetRect) {
    // Modo center (intro / sem selector)
    tooltipStyle = {
      position: 'fixed',
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: `${TOOLTIP_W}px`,
    };
  } else {
    const placement = step.placement || 'auto';
    const spaceBelow = vh - targetRect.top - targetRect.height;
    const spaceAbove = targetRect.top;
    const choose = placement === 'auto'
      ? (spaceBelow > TOOLTIP_H_EST + TOOLTIP_OFFSET ? 'bottom'
        : spaceAbove > TOOLTIP_H_EST + TOOLTIP_OFFSET ? 'top'
        : 'bottom')
      : placement;

    let top, left;
    switch (choose) {
      case 'top':
        top = targetRect.top - TOOLTIP_OFFSET - TOOLTIP_H_EST;
        left = targetRect.left + targetRect.width / 2 - TOOLTIP_W / 2;
        break;
      case 'right':
        top = targetRect.top + targetRect.height / 2 - TOOLTIP_H_EST / 2;
        left = targetRect.left + targetRect.width + TOOLTIP_OFFSET;
        break;
      case 'left':
        top = targetRect.top + targetRect.height / 2 - TOOLTIP_H_EST / 2;
        left = targetRect.left - TOOLTIP_OFFSET - TOOLTIP_W;
        break;
      default: // bottom
        top = targetRect.top + targetRect.height + TOOLTIP_OFFSET;
        left = targetRect.left + targetRect.width / 2 - TOOLTIP_W / 2;
    }

    // Clampa pra não sair da viewport
    left = clamp(left, VIEWPORT_MARGIN, vw - TOOLTIP_W - VIEWPORT_MARGIN);
    top = clamp(top, VIEWPORT_MARGIN, vh - TOOLTIP_H_EST - VIEWPORT_MARGIN);

    tooltipStyle = {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${TOOLTIP_W}px`,
    };
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, pointerEvents: 'none' }}>
      {/* Overlay com spotlight */}
      <svg style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'auto' }} onClick={() => {}}>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - PAD}
                y={targetRect.top - PAD}
                width={targetRect.width + PAD * 2}
                height={targetRect.height + PAD * 2}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#tour-mask)"
        />
      </svg>

      {/* Borda do spotlight (highlight) */}
      {targetRect && (
        <div style={{
          position: 'fixed',
          top: targetRect.top - PAD,
          left: targetRect.left - PAD,
          width: targetRect.width + PAD * 2,
          height: targetRect.height + PAD * 2,
          borderRadius: 8,
          border: `2px solid ${colors.primary}`,
          boxShadow: `0 0 0 4px ${colors.primary}40`,
          pointerEvents: 'none',
          transition: 'all 0.25s ease',
        }} />
      )}

      {/* Tooltip */}
      <div ref={tooltipRef} style={{
        ...tooltipStyle,
        pointerEvents: 'auto',
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        padding: '1rem 1.25rem',
        color: colors.text,
        maxWidth: '92vw',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: '0.75rem', color: colors.textSecondary, fontWeight: 600 }}>
            Passo {stepIdx + 1} de {steps.length}
          </div>
          <button onClick={handleSkip} aria-label="Pular tutorial" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: colors.textSecondary, padding: 2, display: 'inline-flex',
          }}>
            <X size={18} />
          </button>
        </div>

        <h3 style={{ margin: 0, marginBottom: 8, fontSize: '1.05rem', fontWeight: 700, color: colors.text }}>{step.title}</h3>
        <div style={{ fontSize: '0.875rem', lineHeight: 1.55, color: colors.textSecondary, marginBottom: 16 }}>
          {typeof step.content === 'string' ? <p style={{ margin: 0 }}>{step.content}</p> : step.content}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={handleSkip} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: colors.textSecondary, fontSize: '0.8125rem', padding: 4,
          }}>
            Pular tutorial
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            {stepIdx > 0 && (
              <button onClick={handlePrev} style={{
                padding: '0.5rem 0.75rem',
                background: 'transparent',
                border: `1px solid ${colors.border}`,
                color: colors.text,
                borderRadius: 6,
                fontSize: '0.8125rem', fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <ChevronLeft size={14} /> Voltar
              </button>
            )}
            <button onClick={handleNext} style={{
              padding: '0.5rem 0.875rem',
              background: colors.primary, color: colors.primaryText,
              border: 'none', borderRadius: 6,
              fontSize: '0.8125rem', fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {stepIdx >= steps.length - 1 ? 'Concluir' : 'Próximo'}
              {stepIdx < steps.length - 1 && <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
