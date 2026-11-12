import { LADOS_PREFERIDOS } from '../../../../lib/sportConfig';
import React, { useState } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { useTheme } from '../../../../contexts/ThemeContext';
import { useIsMobile } from '../../../../hooks/useIsMobile';
import { Button } from '../../../../components/common/Button';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativo' },
  { value: 'injured', label: 'Lesionado' },
  { value: 'suspended', label: 'Suspenso' },
  { value: 'inactive', label: 'Inativo' },
];

export default function PlayersTable({ players, onEdit, onDelete }) {
  const { colors } = useTheme();
  const isMobile = useIsMobile();
  const [hoveredObservation, setHoveredObservation] = useState(null);

  const containerStyle = {
    overflowX: 'auto',
    backgroundColor: colors.surface,
    borderRadius: '0.5rem',
    border: `1px solid ${colors.border}`,
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
  };

  const theadStyle = {
    backgroundColor: colors.background,
    borderBottom: `2px solid ${colors.border}`,
  };

  const thStyle = {
    padding: '0.75rem 1rem',
    textAlign: 'left',
    fontWeight: '600',
    color: colors.text,
    whiteSpace: 'nowrap',
  };

  const tdStyle = {
    padding: '0.75rem 1rem',
    borderBottom: `1px solid ${colors.border}`,
    color: colors.text,
  };

  const actionButtonsStyle = {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  };

  const getStatusLabel = (status) => {
    const option = STATUS_OPTIONS.find(s => s.value === status);
    return option ? option.label : status || '-';
  };

  const getGroupLabel = (group) => {
    return group ? `Grupo ${group}` : 'Sem grupo';
  };

  const truncateText = (text, maxLength = 30) => {
    if (!text || text.length <= maxLength) return text || '-';
    return text.substring(0, maxLength) + '...';
  };

  const observationCellStyle = {
    ...tdStyle,
    position: 'relative',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  };

  const tooltipStyle = {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: colors.background,
    color: colors.text,
    padding: '0.75rem',
    borderRadius: '0.375rem',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    border: `1px solid ${colors.border}`,
    zIndex: 1000,
    minWidth: '200px',
    maxWidth: '400px',
    marginBottom: '0.5rem',
    whiteSpace: 'normal',
    wordWrap: 'break-word',
    fontSize: '0.875rem',
    lineHeight: '1.5',
  };

  if (players.length === 0) {
    return (
      <div style={{ ...containerStyle, padding: '2rem', textAlign: 'center', color: colors.textMuted }}>
        Nenhum atleta cadastrado. Clique em "Novo Atleta" para adicionar.
      </div>
    );
  }

  return (
    <>
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {players.map(player => (
            <div key={player.id} style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: '0.75rem',
              padding: '1rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: '600', fontSize: '1rem', color: colors.text }}>{player.name}</div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button onClick={() => onEdit(player)} style={{ background: 'none', border: 'none', padding: '0.5rem', cursor: 'pointer', color: colors.primary }}>
                    <Edit2 size={18} />
                  </button>
                  <button onClick={() => onDelete(player.id)} style={{ background: 'none', border: 'none', padding: '0.5rem', cursor: 'pointer', color: colors.error || '#ef4444' }}>
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.85rem', color: colors.textSecondary }}>
                {player.position && <span style={{ backgroundColor: `${colors.primary}15`, padding: '0.2rem 0.6rem', borderRadius: '0.25rem', color: colors.primary, fontWeight: '500' }}>{rotuloPosicao(player)}</span>}
                <span>{getStatusLabel(player.status)}</span>
                <span>{getGroupLabel(player.group)}</span>
              </div>
              {player.observation && <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: colors.textMuted }}>{player.observation}</div>}
            </div>
          ))}
        </div>
      ) : (
        <div style={containerStyle}>
          <table style={tableStyle}>
            <thead style={theadStyle}>
              <tr>
                <th style={thStyle}>Nome</th>
                <th style={thStyle}>Posição</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Observação</th>
                <th style={thStyle}>Grupo</th>
                <th style={thStyle}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id}>
                  <td style={tdStyle}>{player.name}</td>
                  <td style={tdStyle}>{player.position ? rotuloPosicao(player) : '-'}</td>
                  <td style={tdStyle}>{getStatusLabel(player.status)}</td>
                  <td
                    style={observationCellStyle}
                    onMouseEnter={() => player.observation && player.observation.length > 30 && setHoveredObservation(player.id)}
                    onMouseLeave={() => setHoveredObservation(null)}
                  >
                    {truncateText(player.observation)}
                    {hoveredObservation === player.id && player.observation && (
                      <div style={tooltipStyle}>
                        {player.observation}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>{getGroupLabel(player.group)}</td>
                  <td style={tdStyle}>
                    <div style={actionButtonsStyle}>
                      <button
                        onClick={() => onEdit(player)}
                        title="Editar atleta"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '0.5rem',
                          cursor: 'pointer',
                          color: colors.text,
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'color 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = colors.primary}
                        onMouseLeave={(e) => e.currentTarget.style.color = colors.text}
                      >
                        <Edit2 size={24} strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={() => onDelete(player.id)}
                        title="Excluir atleta"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '0.5rem',
                          cursor: 'pointer',
                          color: colors.textMuted,
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'color 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = colors.error}
                        onMouseLeave={(e) => e.currentTarget.style.color = colors.textMuted}
                      >
                        <Trash2 size={24} strokeWidth={1.5} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// "ZAG · D" quando o zagueiro tem lado preferido
function rotuloPosicao(p) {
  const lado = p.position === 'ZAG' && LADOS_PREFERIDOS.find((l) => l.value === p.lado_preferido);
  return lado ? `${p.position} · ${lado.curto}` : p.position;
}
