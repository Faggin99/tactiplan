import { useState } from 'react';
import { Building2, ArrowRight } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { MODALITIES, MODALITY_LABELS, MODALITY_DESCRIPTIONS } from '../../lib/sportConfig';
import { useWorkspace } from '../../contexts/WorkspaceContext';

export function ClubOnboardingModal({ onCreateClub }) {
  const { colors } = useTheme();
  const comissao = useWorkspace()?.activeWorkspace?.tipo === 'comissao';
  const [clubName, setClubName] = useState('');
  const [modality, setModality] = useState('football_11');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();

    if (!clubName.trim()) {
      setError('Por favor, insira o nome do clube');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onCreateClub({ name: clubName.trim(), modality });
    } catch (err) {
      setError(err.message || 'Erro ao criar clube');
      setLoading(false);
    }
  }

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
    zIndex: 9999,
    padding: '1rem',
    // Overlay pode rolar em telas pequenas se o modal for mais alto que a viewport
    overflowY: 'auto',
  };

  const modalStyle = {
    backgroundColor: colors.background,
    borderRadius: '0.75rem',
    width: '100%',
    maxWidth: '500px',
    // Limita altura em ~90vh e rola conteúdo interno em vez de vazar
    maxHeight: 'calc(100vh - 2rem)',
    overflowY: 'auto',
    padding: '1.75rem',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
  };

  const headerStyle = {
    textAlign: 'center',
    marginBottom: '1.25rem',
  };

  const iconContainerStyle = {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    backgroundColor: colors.primary + '20',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 0.85rem',
  };

  const titleStyle = {
    fontSize: '1.4rem',
    fontWeight: '700',
    color: colors.text,
    marginBottom: '0.35rem',
  };

  const subtitleStyle = {
    fontSize: '0.88rem',
    color: colors.textSecondary,
    lineHeight: '1.4',
  };

  const formStyle = {
    marginTop: '1rem',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: '600',
    color: colors.text,
    marginBottom: '0.5rem',
  };

  const inputStyle = {
    width: '100%',
    padding: '0.875rem',
    backgroundColor: colors.surface,
    border: `2px solid ${error ? colors.danger : colors.border}`,
    borderRadius: '0.5rem',
    color: colors.text,
    fontSize: '1rem',
    transition: 'border-color 0.2s',
  };

  const errorStyle = {
    color: colors.danger,
    fontSize: '0.875rem',
    marginTop: '0.5rem',
  };

  const buttonStyle = {
    width: '100%',
    padding: '0.875rem',
    backgroundColor: colors.primary,
    color: colors.primaryText,
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: loading ? 'not-allowed' : 'pointer',
    marginTop: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'opacity 0.2s',
    opacity: loading ? 0.6 : 1,
  };

  const infoBoxStyle = {
    backgroundColor: colors.primary + '10',
    border: `1px solid ${colors.primary}30`,
    borderRadius: '0.5rem',
    padding: '1rem',
    marginTop: '1.5rem',
  };

  const infoTextStyle = {
    fontSize: '0.875rem',
    color: colors.text,
    lineHeight: '1.5',
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <div style={iconContainerStyle}>
            <Building2 size={40} color={colors.primary} />
          </div>
          <h2 style={titleStyle}>Bem-vindo!</h2>
          <p style={subtitleStyle}>
            {comissao
              ? 'Para começar, cadastre o time em que sua comissão trabalha. Treinos, atletas e jogos ficam organizados por clube.'
              : 'Para começar, vamos criar seu clube. Todos os seus treinos e atletas serão organizados por clube.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={formStyle}>
          <div>
            <label style={labelStyle}>Nome do Clube *</label>
            <input
              type="text"
              value={clubName}
              onChange={(e) => {
                setClubName(e.target.value);
                setError('');
              }}
              placeholder="Ex: Atlético Bola Pra Frente"
              style={inputStyle}
              autoFocus
              disabled={loading}
              required
            />
            {error && <div style={errorStyle}>{error}</div>}
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <label style={labelStyle}>Modalidade *</label>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {MODALITIES.map((m) => {
                const active = modality === m;
                return (
                  <label
                    key={m}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                      padding: '0.75rem 0.875rem',
                      backgroundColor: active ? `${colors.primary}15` : colors.surface,
                      border: `2px solid ${active ? colors.primary : colors.border}`,
                      borderRadius: '0.5rem',
                      cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="modality"
                      value={m}
                      checked={active}
                      onChange={() => setModality(m)}
                      disabled={loading}
                      style={{ marginTop: 3 }}
                    />
                    <div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: colors.text }}>{MODALITY_LABELS[m]}</div>
                      <div style={{ fontSize: '0.78rem', color: colors.textSecondary, marginTop: 2 }}>{MODALITY_DESCRIPTIONS[m]}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            style={buttonStyle}
            disabled={loading}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => !loading && (e.currentTarget.style.opacity = '1')}
          >
            {loading ? 'Criando...' : 'Criar Clube e Começar'}
            {!loading && <ArrowRight size={20} />}
          </button>
        </form>

        <div style={infoBoxStyle}>
          <p style={infoTextStyle}>
            💡 <strong>Dica:</strong> {comissao
              ? 'Mudou de time? Em Cadastros › Clubes você arquiva o anterior (o histórico fica guardado) e cadastra o novo.'
              : 'Conteúdos e atividades valem para a conta toda. Em Cadastros › Clubes você arquiva um clube antigo sem perder o histórico.'}
          </p>
        </div>
      </div>
    </div>
  );
}
