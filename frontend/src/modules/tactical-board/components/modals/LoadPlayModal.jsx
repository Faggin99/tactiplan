import { useEffect, useState } from 'react';
import Modal from 'react-modal';
import { X, Trash2, Calendar, Layout, AlertTriangle, RefreshCw } from 'lucide-react';
import { useTheme } from '../../../../contexts/ThemeContext';
import { notify } from '../../../../lib/notify';
import { FIELD_TYPES } from '../../utils/fieldDimensions';

const fieldTypeLabels = {
  [FIELD_TYPES.FOOTBALL_11]: 'Futebol 11',
  [FIELD_TYPES.FOOTBALL_7]: 'Futebol 7',
  [FIELD_TYPES.FUTSAL]: 'Futsal',
};

export default function LoadPlayModal({ isOpen, onClose, onLoad, onDelete, plays = [], loading, error, onFetch, isDirty = false }) {
  const { colors } = useTheme();
  // Jogada pendente de confirmação quando há alterações não salvas
  const [pendingPlay, setPendingPlay] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setPendingPlay(null);
      if (onFetch) onFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handlePlayClick = (play) => {
    if (isDirty) {
      setPendingPlay(play);
    } else {
      onLoad(play);
      onClose();
    }
  };

  const confirmLoad = () => {
    if (!pendingPlay) return;
    onLoad(pendingPlay);
    setPendingPlay(null);
    onClose();
  };

  const handleDelete = async (e, play) => {
    e.stopPropagation();
    const ok = await notify.confirm(`Excluir a jogada "${play.name}"?`, { confirmText: 'Excluir', cancelText: 'Cancelar' });
    if (ok) onDelete(play.id);
  };

  const modalStyle = {
    content: {
      maxWidth: '560px',
      width: '90%',
      maxHeight: '80vh',
      padding: '1.5rem',
      borderRadius: '0.75rem',
      border: `1px solid ${colors.border}`,
      backgroundColor: colors.surface,
      color: colors.text,
      position: 'fixed',
      top: '50%',
      left: '50%',
      right: 'auto',
      bottom: 'auto',
      transform: 'translate(-50%, -50%)',
      overflow: 'auto',
    },
    overlay: {
      backgroundColor: 'rgba(0,0,0,0.6)',
      zIndex: 9999,
      position: 'fixed',
      inset: 0,
    },
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <Modal isOpen={isOpen} onRequestClose={onClose} style={modalStyle} ariaHideApp={false}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>Carregar Jogada</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: colors.text, cursor: 'pointer' }}>
          <X size={20} />
        </button>
      </div>

      {pendingPlay && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
          padding: '0.65rem 0.85rem', marginBottom: '0.85rem',
          borderRadius: '0.5rem',
          backgroundColor: 'rgba(251,191,36,0.09)', border: '1px solid rgba(251,191,36,0.4)',
        }}>
          <AlertTriangle size={16} style={{ color: '#fbbf24', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: '0.82rem', color: colors.text, minWidth: 180 }}>
            Você tem alterações não salvas. Carregar "{pendingPlay.name}" mesmo assim?
          </span>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button onClick={confirmLoad}
              style={{ padding: '0.35rem 0.7rem', borderRadius: '0.35rem', border: 'none', backgroundColor: '#fbbf24', color: '#1a1a2e', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
              Carregar
            </button>
            <button onClick={() => setPendingPlay(null)}
              style={{ padding: '0.35rem 0.7rem', borderRadius: '0.35rem', border: `1px solid ${colors.border}`, backgroundColor: 'transparent', color: colors.text, fontSize: '0.78rem', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ textAlign: 'center', color: colors.textSecondary, padding: '2rem 0' }}>Carregando...</p>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <p style={{ color: colors.textSecondary, marginBottom: '0.75rem' }}>
            Não foi possível carregar as jogadas.
          </p>
          <button onClick={onFetch}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.5rem 0.9rem', borderRadius: '0.4rem',
              border: `1px solid ${colors.border}`, backgroundColor: 'transparent',
              color: colors.text, fontSize: '0.82rem', cursor: 'pointer',
            }}>
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      ) : plays.length === 0 ? (
        <p style={{ textAlign: 'center', color: colors.textSecondary, padding: '2rem 0' }}>
          Nenhuma jogada salva ainda.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {plays.map((play) => (
            <div
              key={play.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: `1px solid ${pendingPlay?.id === play.id ? '#fbbf24' : colors.border}`,
                backgroundColor: colors.background,
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onClick={() => handlePlayClick(play)}
              onMouseEnter={(e) => { if (pendingPlay?.id !== play.id) e.currentTarget.style.borderColor = colors.primary; }}
              onMouseLeave={(e) => { if (pendingPlay?.id !== play.id) e.currentTarget.style.borderColor = colors.border; }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{play.name}</div>
                {play.description && (
                  <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginTop: '0.125rem' }}>
                    {play.description}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.375rem', fontSize: '0.75rem', color: colors.textSecondary }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Layout size={12} />
                    {fieldTypeLabels[play.field_type] || play.field_type}
                  </span>
                  <span>{play.keyframes?.length || 0} frames</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Calendar size={12} />
                    {formatDate(play.updated_at)}
                  </span>
                  {play.club_name && (
                    <span title="A jogada é da conta e vale para todos os clubes" style={{ opacity: 0.8 }}>
                      criada em {play.club_name}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={(e) => handleDelete(e, play)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  padding: '0.375rem',
                  borderRadius: '0.25rem',
                }}
                title="Excluir jogada"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
