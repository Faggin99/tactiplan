import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Building2, X, Check, Camera, Lock, Crown } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useClub } from '../contexts/ClubContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { PhotoCropModal } from '../components/settings/PhotoCropModal';
import { NOME_CLUBE } from '../config/planos';

// ATENÇÃO: tela antiga, NÃO está nas rotas (a tela de clubes é ClubsConfigPage, em Cadastros › Clubes).

export function ClubConfigPage() {
  const { colors } = useTheme();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const plan = usePlanFeatures();
  const { clubs, createClub, updateClub, deleteClub, uploadLogo, getLogoUrl } = useClub();

  // Plano Clube = 1 clube ATIVO (arquivados não contam); admin/vitalício = sem limite.
  const clubLimit = (plan.isAdmin || plan.isLifetime) ? null : 1;
  const canCreateClub = clubLimit === null || clubs.length < clubLimit;
  const [showModal, setShowModal] = useState(false);
  const [editingClub, setEditingClub] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    modality: 'football_11',
  });
  const [loading, setLoading] = useState(false);
  const [showPhotoCropModal, setShowPhotoCropModal] = useState(false);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
  const [photoUploadClubId, setPhotoUploadClubId] = useState(null);

  function handleOpenModal(club = null) {
    if (club) {
      setEditingClub(club);
      setFormData({
        name: club.name,
        description: club.description || '',
        modality: club.modality || 'football_11',
      });
    } else {
      setEditingClub(null);
      setFormData({ name: '', description: '', modality: 'football_11' });
    }
    setShowModal(true);
  }

  function handleCloseModal() {
    setShowModal(false);
    setEditingClub(null);
    setFormData({ name: '', description: '', modality: 'football_11' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.name.trim()) return;

    // Aviso: ao trocar a modalidade, posições dos atletas serão limpas (backend faz o reset)
    if (editingClub && editingClub.modality && editingClub.modality !== formData.modality) {
      const ok = window.confirm(
        'Mudar a modalidade vai LIMPAR as posições atuais dos atletas deste clube. ' +
        'Você precisará recadastrar a posição de cada atleta usando as opções da nova modalidade.\n\n' +
        'Deseja continuar?'
      );
      if (!ok) return;
    }

    try {
      setLoading(true);
      if (editingClub) {
        await updateClub(editingClub.id, formData);
      } else {
        await createClub(formData);
      }
      handleCloseModal();
    } catch (error) {
      console.error('Error saving club:', error);
      alert(error.message || 'Erro ao salvar clube');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(clubId) {
    if (!confirm('Tem certeza que deseja excluir este clube? Todos os dados associados serão perdidos.')) {
      return;
    }

    try {
      await deleteClub(clubId);
    } catch (error) {
      console.error('Error deleting club:', error);
      alert(error.message || 'Erro ao excluir clube');
    }
  }

  function handlePhotoSelect(e, clubId) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione um arquivo de imagem');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 5MB');
      return;
    }

    setSelectedPhotoFile(file);
    setPhotoUploadClubId(clubId);
    setShowPhotoCropModal(true);

    // Reset input
    e.target.value = '';
  }

  async function handlePhotoUpload(file) {
    if (!photoUploadClubId) return;

    setLoading(true);
    try {
      await uploadLogo(photoUploadClubId, file);
      setShowPhotoCropModal(false);
      setSelectedPhotoFile(null);
      setPhotoUploadClubId(null);
    } catch (error) {
      console.error('Error uploading logo:', error);
      alert('Erro ao fazer upload do logo');
    } finally {
      setLoading(false);
    }
  }

  const pageStyle = {
    padding: isMobile ? '1rem' : '2rem',
    maxWidth: '1200px',
    margin: '0 auto',
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: isMobile ? '1.25rem' : '2rem',
  };

  const titleStyle = {
    fontSize: isMobile ? '1.25rem' : '1.875rem',
    fontWeight: '700',
    color: colors.text,
  };

  const addButtonStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.625rem 1rem',
    backgroundColor: colors.primary,
    color: colors.primaryText,
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: isMobile ? '1rem' : '1.5rem',
  };

  const cardStyle = {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.5rem',
    padding: isMobile ? '1rem' : '1.5rem',
    transition: 'all 0.2s',
  };

  const clubHeaderStyle = {
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    alignItems: isMobile ? 'center' : 'flex-start',
    gap: '1rem',
    marginBottom: '1rem',
  };

  const logoSize = isMobile ? '60px' : '80px';

  const logoContainerStyle = {
    position: 'relative',
    width: logoSize,
    height: logoSize,
    flexShrink: 0,
  };

  const logoStyle = {
    width: logoSize,
    height: logoSize,
    borderRadius: '50%',
    objectFit: 'cover',
    backgroundColor: colors.primary + '20',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `2px solid ${colors.border}`,
  };

  const cameraButtonStyle = {
    position: 'absolute',
    bottom: '0',
    right: '0',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: colors.primary,
    border: `2px solid ${colors.surface}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
  };

  const clubInfoStyle = {
    flex: 1,
  };

  const clubNameStyle = {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: colors.text,
    marginBottom: '0.25rem',
  };

  const clubDescStyle = {
    fontSize: '0.875rem',
    color: colors.textSecondary,
    lineHeight: '1.4',
  };

  const actionsStyle = {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: `1px solid ${colors.border}`,
  };

  const actionButtonStyle = (isDanger = false) => ({
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.5rem',
    backgroundColor: 'transparent',
    border: `1px solid ${isDanger ? colors.danger : colors.border}`,
    borderRadius: '0.375rem',
    color: isDanger ? colors.danger : colors.text,
    fontSize: isMobile ? '0.8rem' : '0.875rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
  });

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: isMobile ? 'stretch' : 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: isMobile ? 0 : '1rem',
  };

  const modalStyle = {
    backgroundColor: colors.background,
    borderRadius: isMobile ? 0 : '0.5rem',
    width: '100%',
    maxWidth: isMobile ? '100vw' : '500px',
    height: isMobile ? '100vh' : 'auto',
    padding: isMobile ? '1rem' : '1.5rem',
    display: 'flex',
    flexDirection: 'column',
  };

  const modalHeaderStyle = {
    fontSize: '1.25rem',
    fontWeight: '700',
    color: colors.text,
    marginBottom: '1.5rem',
  };

  const formGroupStyle = {
    marginBottom: '1rem',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: colors.text,
    marginBottom: '0.5rem',
  };

  const inputStyle = {
    width: '100%',
    padding: '0.625rem',
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.375rem',
    color: colors.text,
    fontSize: '0.875rem',
  };

  const textareaStyle = {
    ...inputStyle,
    minHeight: '80px',
    resize: 'vertical',
    fontFamily: 'inherit',
  };

  const modalActionsStyle = {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '1.5rem',
  };

  const cancelButtonStyle = {
    flex: 1,
    padding: '0.625rem',
    backgroundColor: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '0.375rem',
    color: colors.text,
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
  };

  const submitButtonStyle = {
    flex: 1,
    padding: '0.625rem',
    backgroundColor: colors.primary,
    border: 'none',
    borderRadius: '0.375rem',
    color: colors.primaryText,
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Clubes</h1>
        <button
          style={{ ...addButtonStyle, backgroundColor: canCreateClub ? addButtonStyle.backgroundColor : '#f59e0b' }}
          onClick={() => {
            if (!canCreateClub) {
              navigate('/billing?reason=max_clubs');
              return;
            }
            handleOpenModal();
          }}
          title={!canCreateClub ? 'Limite de clubes ativos atingido' : undefined}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          {canCreateClub ? <Plus size={18} /> : <Lock size={16} />}
          {canCreateClub ? 'Novo Clube' : 'Adicionar clube (limite)'}
        </button>
      </div>

      {!canCreateClub && (
        <div style={{
          marginBottom: '1rem',
          padding: '0.875rem 1rem',
          backgroundColor: '#f59e0b15',
          border: '1px solid #f59e0b40',
          borderRadius: '0.5rem',
          display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
        }}>
          <Crown size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, fontSize: '0.85rem', color: colors.text }}>
            <strong>O plano {NOME_CLUBE} inclui 1 clube ativo.</strong> Arquive um clube para ativar outro, ou fale com a gente para liberar um clube extra (R$20/mês por clube).
            <div style={{ marginTop: '0.5rem' }}>
              <button
                onClick={() => navigate('/billing')}
                style={{
                  padding: '0.4rem 0.875rem', backgroundColor: '#f59e0b',
                  color: '#fff', border: 'none', borderRadius: '0.375rem',
                  fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Ver assinatura
              </button>
            </div>
          </div>
        </div>
      )}

      {clubs.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          backgroundColor: colors.surface,
          borderRadius: '0.5rem',
          border: `1px solid ${colors.border}`,
        }}>
          <Building2 size={48} color={colors.textSecondary} style={{ margin: '0 auto 1rem' }} />
          <p style={{ color: colors.textSecondary, fontSize: '0.875rem' }}>
            Nenhum clube cadastrado. Clique em "Novo Clube" para começar.
          </p>
        </div>
      ) : (
        <div style={gridStyle}>
          {clubs.map((club) => (
            <div
              key={club.id}
              style={cardStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 4px 12px ${colors.primary}20`;
                e.currentTarget.style.borderColor = colors.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = colors.border;
              }}
            >
              <div style={clubHeaderStyle}>
                <div style={logoContainerStyle}>
                  {club.logo_path && getLogoUrl(club.logo_path) ? (
                    <img
                      src={getLogoUrl(club.logo_path)}
                      alt={club.name}
                      style={logoStyle}
                    />
                  ) : (
                    <div style={logoStyle}>
                      <Building2 size={32} color={colors.primary} />
                    </div>
                  )}
                  <label style={cameraButtonStyle}>
                    <Camera size={16} color={colors.primaryText} />
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => handlePhotoSelect(e, club.id)}
                    />
                  </label>
                </div>
                <div style={clubInfoStyle}>
                  <h3 style={clubNameStyle}>{club.name}</h3>
                  {club.description && (
                    <p style={clubDescStyle}>{club.description}</p>
                  )}
                </div>
              </div>

              <div style={actionsStyle}>
                <button
                  style={actionButtonStyle(false)}
                  onClick={() => handleOpenModal(club)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.surfaceHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Edit2 size={16} />
                  Editar
                </button>
                <button
                  style={actionButtonStyle(true)}
                  onClick={() => handleDelete(club.id)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = colors.danger + '10';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <Trash2 size={16} />
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={overlayStyle} onClick={handleCloseModal}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalHeaderStyle}>
              {editingClub ? 'Editar Clube' : 'Novo Clube'}
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={formGroupStyle}>
                <label style={labelStyle}>Nome *</label>
                <input
                  type="text"
                  style={inputStyle}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nome do clube"
                  required
                />
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Descrição</label>
                <textarea
                  style={textareaStyle}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição do clube"
                />
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Modalidade *</label>
                <select
                  style={inputStyle}
                  value={formData.modality}
                  onChange={(e) => setFormData({ ...formData, modality: e.target.value })}
                  required
                >
                  <option value="football_11">Futebol 11 (11 jogadores · 2x45 min)</option>
                  <option value="football_7">Futebol 7 (7 jogadores · 2x25 min)</option>
                  <option value="futsal">Futsal (5 jogadores · 2x20 min)</option>
                </select>
                {editingClub && editingClub.modality && editingClub.modality !== formData.modality && (
                  <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: '0.3rem' }}>
                    ⚠ Ao salvar, as posições dos atletas deste clube serão limpas.
                  </div>
                )}
              </div>

              <div style={modalActionsStyle}>
                <button
                  type="button"
                  style={cancelButtonStyle}
                  onClick={handleCloseModal}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.surfaceHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X size={16} />
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={submitButtonStyle}
                  disabled={loading}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  <Check size={16} />
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPhotoCropModal && selectedPhotoFile && (
        <PhotoCropModal
          isOpen={showPhotoCropModal}
          selectedFile={selectedPhotoFile}
          onClose={() => {
            setShowPhotoCropModal(false);
            setSelectedPhotoFile(null);
            setPhotoUploadClubId(null);
          }}
          onSave={handlePhotoUpload}
        />
      )}
    </div>
  );
}
