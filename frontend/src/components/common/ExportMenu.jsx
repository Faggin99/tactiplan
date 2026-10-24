import { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, ChevronDown, Loader2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useFeatureGuard } from './PlanGate';

/**
 * Dropdown unificado para exportação. Aceita callbacks pra PDF e Excel.
 *
 * Props:
 *  - onExportPDF(): callback ao clicar PDF
 *  - onExportExcel(): callback ao clicar Excel
 *  - disabled, size, variant: aspectos do botão
 *  - label: texto do botão (default "Exportar")
 *  - icon: ícone do botão (default Download)
 *  - pdfLabel: texto do item de PDF (default "Exportar PDF")
 *  - extraPdfItems: [{ label, onClick }] — outros PDFs, listados depois do principal
 */
export function ExportMenu({
  onExportPDF, onExportExcel,
  disabled = false, size = 'md',
  label = 'Exportar', icon,
  variant = 'primary',
  pdfLabel = 'Exportar PDF',
  extraPdfItems = [],
}) {
  const { colors, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  // Feedback de geração: PDFs/planilhas demoram alguns segundos e sem
  // indicador parecia que o clique não funcionou.
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  // Exportações (PDF/Excel) dependem de assinatura ativa — só leitura vê um aviso neutro.
  const guardFeature = useFeatureGuard();

  const run = async (fn) => {
    setOpen(false);
    if (!guardFeature('pdf_export')) return;
    setBusy(true);
    try {
      // deixa o spinner PINTAR antes de começar o trabalho pesado
      await new Promise((r) => setTimeout(r, 30));
      await fn?.();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const padding = size === 'sm' ? '0.35rem 0.65rem' : '0.45rem 0.8rem';
  const fontSize = size === 'sm' ? '0.75rem' : '0.8rem';

  const btnStyle = variant === 'primary' ? {
    backgroundColor: colors.primary, color: colors.primaryText,
    border: 'none',
  } : variant === 'floating' ? {
    // Pra usar sobre overlays/headers escuros: fundo branco semi-transparente
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    color: '#1f2937',
    border: '1px solid #dddddd',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  } : {
    backgroundColor: 'transparent', color: colors.text,
    border: `1px solid ${colors.border}`,
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <style>{'@keyframes tp-spin { to { transform: rotate(360deg); } }'}</style>
      <button
        type="button"
        onClick={() => !disabled && !busy && setOpen(v => !v)}
        disabled={disabled || busy}
        style={{
          ...btnStyle,
          display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
          padding, borderRadius: '0.375rem',
          fontSize, fontWeight: 600,
          cursor: (disabled || busy) ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {busy
          ? <Loader2 size={15} style={{ animation: 'tp-spin 0.9s linear infinite' }} />
          : (icon || <Download size={15} />)}
        <span>{busy ? 'Gerando…' : label}</span>
        {!busy && <ChevronDown size={13} style={{ opacity: 0.85, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} />}
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 0.3rem)',
          right: 0,
          backgroundColor: colors.background,
          border: `1px solid ${colors.border}`,
          borderRadius: '0.4rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          minWidth: '12rem',
          overflow: 'hidden',
          zIndex: 1000,
        }}>
          {onExportPDF && (
            <MenuItem
              icon={<FileText size={15} />}
              label={pdfLabel}
              onClick={() => run(onExportPDF)}
              colors={colors} isDark={isDark}
            />
          )}
          {extraPdfItems.map((it) => (
            <MenuItem
              key={it.label}
              icon={<FileText size={15} />}
              label={it.label}
              onClick={() => run(it.onClick)}
              colors={colors} isDark={isDark}
            />
          ))}
          {onExportExcel && (
            <MenuItem
              icon={<FileSpreadsheet size={15} />}
              label="Exportar Excel"
              onClick={() => run(onExportExcel)}
              colors={colors} isDark={isDark}
              divider={Boolean(onExportPDF) || extraPdfItems.length > 0}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, colors, isDark, divider }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        padding: '0.55rem 0.85rem',
        border: 'none',
        borderTop: divider ? `1px solid ${colors.border}` : 'none',
        backgroundColor: hover ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)') : 'transparent',
        color: colors.text,
        fontSize: '0.825rem',
        fontWeight: 500,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ color: colors.textSecondary, display: 'flex' }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
