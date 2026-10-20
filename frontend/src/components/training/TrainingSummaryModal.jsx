import { X } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { newWorkbook, addSheet, saveWorkbook, addMetaSheet, formatMinutes } from '../../utils/excelTheme';
import { ExportMenu } from '../common/ExportMenu';
import { downloadReport } from '../../services/reportsService';
import { notify } from '../../lib/notify';
import { formatKm, toKm } from '../../utils/distancia';

export function TrainingSummaryModal({ isOpen, onClose, session }) {
  const { colors } = useTheme();

  if (!isOpen || !session) return null;

  const getTotalDuration = () => {
    if (!session?.blocks) return 0;
    return session.blocks.reduce((total, block) => {
      const duration = block.activity?.duration_minutes || 0;
      return total + parseInt(duration || 0);
    }, 0);
  };

  // Info do dia: distância média por jogador (só dia de treino, como no modal)
  const distanciaKm = (session.session_type || 'training') === 'training' ? toKm(session.avg_distance_km) : null;

  // Filter blocks with activities
  const activeBlocks = session.blocks?.filter(block => block.activity) || [];

  const handleDownloadExcel = () => {
    if (activeBlocks.length === 0) {
      notify.info('Nenhuma atividade pra exportar.');
      return;
    }
    const wb = newWorkbook({ title: `Treino - ${session.day_name}` });
    const dateStr = session.date || '';
    const total = getTotalDuration();
    addMetaSheet(wb, {
      title: `Treino - ${session.day_name}`,
      period: dateStr,
      totals: [
        ['Atividades', activeBlocks.length],
        ['Tempo total', formatMinutes(total)],
        ...(distanciaKm !== null ? [['Distância ideal', `${formatKm(distanciaKm)} km`]] : []),
      ],
    });
    const rows = [['Bloco', 'Atividade', 'Conteúdos', 'Submomentos', 'Grupos', 'Tempo (min)', 'Descrição']];
    activeBlocks.forEach((b) => {
      const a = b.activity;
      rows.push([
        b.name || '',
        a?.title?.title || '',
        (a?.contents || []).map(c => c.name).join(', '),
        (a?.stages || []).map(s => s.stage_name).join(', '),
        (a?.groups || []).join(', '),
        a?.duration_minutes || '',
        a?.description || '',
      ]);
    });
    addSheet(wb, 'Atividades', rows, { widths: [18, 30, 30, 30, 14, 12, 50], freezeHeader: true });
    saveWorkbook(wb, `treino-${session.day_name}-${dateStr}.xlsx`);
  };

  // Ficha de sessão em PDF, gerada no servidor (layout novo + registro fotográfico
  // com os anexos de imagem do dia). Nome do arquivo igual ao de antes.
  const handleDownloadPDF = async () => {
    if (!session.id) {
      notify.info('Nenhuma atividade pra exportar.');
      return;
    }
    const filename = `treino-${session.day_name}-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;
    try {
      await downloadReport('sessao', { session_id: session.id }, filename);
    } catch (error) {
      console.error('Error generating PDF:', error);
      notify.error(error.message || 'Erro ao gerar PDF. Por favor, tente novamente.');
    }
  };

  // Styles
  // Telas estreitas (qualquer celular): a "folha A4" vira fluida e as duas
  // colunas empilham — em mm fixo o conteúdo estourava a largura e cortava.
  const isNarrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
  const dvhOk = typeof CSS !== 'undefined' && CSS.supports?.('height', '100dvh');

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '1rem',
  };

  const modalStyle = {
    backgroundColor: '#f5f5f5',
    borderRadius: '0.5rem',
    width: 'min(210mm, 100%)',
    height: dvhOk ? '92dvh' : '88vh',
    maxWidth: '95vw',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
    position: 'relative',
    overflow: 'hidden',
  };

  const headerStyle = {
    position: 'absolute',
    top: '0.75rem',
    right: '0.75rem',
    display: 'flex',
    gap: '0.5rem',
    zIndex: 10,
  };

  const buttonStyle = {
    padding: '0.5rem',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    border: '1px solid #ddd',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#333',
    transition: 'all 0.2s',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  };

  const scrollContainerStyle = {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    display: 'flex',
    justifyContent: 'center',
    padding: '1rem',
  };

  const pageStyle = {
    width: '100%',
    maxWidth: '180mm', // "Folha A4" no desktop; fluida no celular
    boxSizing: 'border-box',
    backgroundColor: '#ffffff',
    color: '#000000',
    padding: isNarrow ? '14px 14px 18px' : '10mm 15mm 15mm 15mm',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  };

  const titleStyle = {
    fontSize: '24px',
    fontWeight: '700',
    marginBottom: '4px',
    color: '#0f172a',
    textAlign: 'left',
    paddingBottom: '4px',
  };

  const subtitleStyle = {
    fontSize: '13px',
    fontWeight: '500',
    color: '#64748b',
    textAlign: 'left',
    marginBottom: '14px',
  };

  const blockContainerStyle = {
    marginBottom: '8px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  };

  const blockTitleRowStyle = {
    fontSize: '13px',
    fontWeight: '700',
    color: '#ffffff',
    backgroundColor: '#1f2937',
    padding: '7px 12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const durationBadgeStyle = {
    backgroundColor: 'rgba(255,255,255,0.15)',
    color: '#ffffff',
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
  };

  const twoColumnsStyle = {
    display: 'flex',
    flexDirection: isNarrow ? 'column' : 'row',
    gap: isNarrow ? '8px' : '12px',
    padding: '10px 12px',
    backgroundColor: '#f9fafb',
  };

  const leftColumnStyle = isNarrow ? {
    borderBottom: '2px solid #d1d5db',
    paddingBottom: '8px',
  } : {
    flex: 1,
    paddingRight: '12px',
    borderRight: '2px solid #d1d5db',
  };

  const rightColumnStyle = isNarrow ? {} : {
    flex: 1,
    paddingLeft: '12px',
  };

  const singleColumnStyle = {
    flex: 1,
  };

  const fieldRowStyle = {
    marginBottom: '6px',
    fontSize: '11px',
    color: '#374151',
    lineHeight: '1.6',
    wordWrap: 'break-word',
  };

  const labelStyle = {
    fontWeight: '700',
    color: '#1f2937',
    display: 'inline-block',
    minWidth: '75px',
  };

  const valueStyle = {
    color: '#4b5563',
  };

  const observationsStyle = {
    fontSize: '11px',
    color: '#374151',
    whiteSpace: 'pre-wrap',
    lineHeight: '1.6',
    wordWrap: 'break-word',
  };

  const observationsTitleStyle = {
    fontWeight: '700',
    marginBottom: '6px',
    color: '#1f2937',
    fontSize: '11px',
  };

  const totalDurationBoxStyle = {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    padding: '10px',
    textAlign: 'center',
    marginTop: '15px',
    fontSize: '14px',
    fontWeight: '700',
    color: '#0f172a',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Action Buttons */}
        <div style={headerStyle} className="no-print">
          <ExportMenu
            size="sm"
            variant="floating"
            onExportPDF={handleDownloadPDF}
            onExportExcel={handleDownloadExcel}
          />
          <button
            onClick={onClose}
            style={buttonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#fee2e2';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title="Fechar"
          >
            <X size={22} strokeWidth={1.5} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={scrollContainerStyle}>
          <div>
            {/* Single Page: Training Summary */}
            <div style={pageStyle}>
              {/* Brand discreto + linha fina azul (acento único) */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '6px', fontSize: '9px', fontWeight: 600,
                color: '#64748b', letterSpacing: '0.05em',
              }}>
                <span>TACTIPLAN</span>
                <span style={{ fontWeight: 400 }}>
                  Gerado em {new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <div style={{ height: '2px', backgroundColor: '#1d4ed8', marginBottom: '10px' }} />
              <h1 style={titleStyle}>Treino - {session.day_name}</h1>
              <p style={subtitleStyle}>
                {(() => { const [y,m,d] = (session.date||'').split('-'); return d ? new Date(+y, +m-1, +d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : ''; })()}
              </p>

              {/* Blocks */}
              {activeBlocks.length > 0 ? (
                activeBlocks.map((block) => {
                  const activity = block.activity;

                  return (
                    <div key={block.id} style={blockContainerStyle} className="avoid-break">
                      {/* Block Title - Header com fundo azul */}
                      <div style={blockTitleRowStyle}>
                        <span>{block.name}</span>
                        {activity.duration_minutes > 0 && (
                          <span style={durationBadgeStyle}>
                            {activity.duration_minutes} min
                          </span>
                        )}
                      </div>

                      {/* Two Columns Below Title (conditional based on description) */}
                      <div style={twoColumnsStyle}>
                        {/* Left Column: Info */}
                        <div style={activity.description ? leftColumnStyle : singleColumnStyle}>
                          {/* CONTEÚDOS PRIMEIRO */}
                          {activity.contents && activity.contents.length > 0 && (
                            <div style={fieldRowStyle}>
                              <span style={labelStyle}>Conteúdos:</span>
                              <span style={valueStyle}>{activity.contents.map(c => c.name).join(', ')}</span>
                            </div>
                          )}

                          {/* Atividade */}
                          {activity.title?.title && (
                            <div style={fieldRowStyle}>
                              <span style={labelStyle}>Atividade:</span>
                              <span style={valueStyle}>{activity.title.title}</span>
                            </div>
                          )}

                          {activity.stages && activity.stages.length > 0 && (
                            <div style={fieldRowStyle}>
                              <span style={labelStyle}>Submomentos:</span>
                              <span style={valueStyle}>{activity.stages.map(s => s.stage_name).join(', ')}</span>
                            </div>
                          )}

                          {activity.groups && activity.groups.length > 0 && (
                            <div style={fieldRowStyle}>
                              <span style={labelStyle}>Grupos:</span>
                              <span style={valueStyle}>{activity.groups.join(', ')}</span>
                            </div>
                          )}
                        </div>

                        {/* Right Column: Description - Only show if description exists */}
                        {activity.description && (
                          <div style={rightColumnStyle}>
                            <div style={observationsTitleStyle}>Descrição:</div>
                            <div style={observationsStyle}>
                              {activity.description}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '14px' }}>
                  Nenhuma atividade cadastrada para este dia.
                </div>
              )}

              {/* Total Duration - MOVED TO BOTTOM */}
              <div style={totalDurationBoxStyle}>
                ⏱ Duração Total: {getTotalDuration()} minutos
                {distanciaKm !== null && (
                  <span style={{ marginLeft: '16px' }}>
                    📍 Distância ideal: {formatKm(distanciaKm)} km
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
