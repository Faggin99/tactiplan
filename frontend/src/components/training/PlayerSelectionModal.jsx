import { useState, useEffect } from 'react';
import { X, Check, User, Users } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { Button } from '../common/Button';

export function PlayerSelectionModal({ isOpen, onClose, athletes, selectedPlayers, onConfirm }) {
  const { colors } = useTheme();
  const [localSelection, setLocalSelection] = useState([]);

  useEffect(() => {
    if (isOpen) {
      // Inicializar com jogadores já selecionados
      setLocalSelection(selectedPlayers.map(p => ({
        athlete_id: p.athlete_id,
        status: p.status || 'starter',
        name: p.athlete?.name || p.name,
        jersey_number: p.athlete?.jersey_number || p.jersey_number,
      })));
    }
  }, [isOpen, selectedPlayers]);

  if (!isOpen) return null;

  const isSelected = (athleteId) => {
    return localSelection.some(p => p.athlete_id === athleteId);
  };

  const getPlayerStatus = (athleteId) => {
    const player = localSelection.find(p => p.athlete_id === athleteId);
    return player?.status || null;
  };

  const togglePlayer = (athlete) => {
    if (isSelected(athlete.id)) {
      setLocalSelection(localSelection.filter(p => p.athlete_id !== athlete.id));
    } else {
      setLocalSelection([...localSelection, {
        athlete_id: athlete.id,
        status: 'starter',
        name: athlete.name,
        jersey_number: athlete.jersey_number,
      }]);
    }
  };

  const setPlayerStatus = (athleteId, status) => {
    setLocalSelection(localSelection.map(p =>
      p.athlete_id === athleteId ? { ...p, status } : p
    ));
  };

  const handleConfirm = () => {
    onConfirm(localSelection);
  };

  const starters = localSelection.filter(p => p.status === 'starter');
  const substitutes = localSelection.filter(p => p.status === 'substitute');

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    padding: '1rem',
  };

  const modalStyle = {
    backgroundColor: colors.background,
    borderRadius: '0.75rem',
    width: '100%',
    maxWidth: '700px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    border: `1px solid ${colors.border}`,
  };

  const headerStyle = {
    padding: '1rem 1.5rem',
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const contentStyle = {
    flex: 1,
    overflowY: 'auto',
    padding: '1rem',
  };

  const footerStyle = {
    padding: '1rem 1.5rem',
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const playerCardStyle = (selected) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    border: `2px solid ${selected ? colors.primary : colors.border}`,
    backgroundColor: selected ? `${colors.primary}15` : colors.surface,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  });

  const statusBtnStyle = (isActive, type) => ({
    padding: '0.25rem 0.75rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: '500',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    backgroundColor: isActive
      ? (type === 'starter' ? '#22c55e' : '#f59e0b')
      : colors.border,
    color: isActive ? '#fff' : colors.textSecondary,
  });

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Users size={22} style={{ color: colors.primary }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: colors.text }}>
              Selecionar Jogadores
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              color: colors.textSecondary,
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {/* Resumo */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '1rem',
            padding: '0.75rem',
            backgroundColor: colors.surface,
            borderRadius: '0.5rem',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#22c55e20',
              borderRadius: '0.375rem',
            }}>
              <span style={{ fontSize: '0.875rem', color: '#22c55e', fontWeight: '600' }}>
                Titulares: {starters.length}
              </span>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#f59e0b20',
              borderRadius: '0.375rem',
            }}>
              <span style={{ fontSize: '0.875rem', color: '#f59e0b', fontWeight: '600' }}>
                Reservas: {substitutes.length}
              </span>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              backgroundColor: `${colors.primary}20`,
              borderRadius: '0.375rem',
            }}>
              <span style={{ fontSize: '0.875rem', color: colors.primary, fontWeight: '600' }}>
                Total: {localSelection.length}
              </span>
            </div>
          </div>

          {/* Grid de jogadores */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '0.75rem',
          }}>
            {athletes.map((athlete) => {
              const selected = isSelected(athlete.id);
              const status = getPlayerStatus(athlete.id);

              return (
                <div key={athlete.id} style={playerCardStyle(selected)}>
                  {/* Checkbox/Avatar */}
                  <div
                    onClick={() => togglePlayer(athlete)}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      backgroundColor: selected ? colors.primary : colors.border,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {selected ? (
                      <Check size={18} color={colors.primaryText} />
                    ) : (
                      <User size={18} color={colors.textSecondary} />
                    )}
                  </div>

                  {/* Info */}
                  <div
                    onClick={() => togglePlayer(athlete)}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <div style={{
                      fontSize: '0.9rem',
                      fontWeight: '500',
                      color: colors.text,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {athlete.jersey_number && (
                        <span style={{ color: colors.primary, marginRight: '0.5rem' }}>
                          #{athlete.jersey_number}
                        </span>
                      )}
                      {athlete.name}
                    </div>
                    {athlete.position && (
                      <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                        {athlete.position}
                      </div>
                    )}
                  </div>

                  {/* Status buttons */}
                  {selected && (
                    <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlayerStatus(athlete.id, 'starter');
                        }}
                        style={statusBtnStyle(status === 'starter', 'starter')}
                      >
                        Titular
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlayerStatus(athlete.id, 'substitute');
                        }}
                        style={statusBtnStyle(status === 'substitute', 'substitute')}
                      >
                        Reserva
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {athletes.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '2rem',
              color: colors.textSecondary,
            }}>
              Nenhum atleta cadastrado
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <span style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
            {localSelection.length} jogador(es) selecionado(s)
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm}>
              Confirmar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
