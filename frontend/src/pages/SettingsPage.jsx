import { useState, useEffect } from 'react';
import { User, Camera, Save, Lock, Settings as SettingsIcon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { ChangePasswordModal } from '../components/settings/ChangePasswordModal';
import { PhotoCropModal } from '../components/settings/PhotoCropModal';
import { userProfileService } from '../services/userProfileService';

export function SettingsPage() {
  const { colors } = useTheme();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    bio: '',
  });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPhotoCropModal, setShowPhotoCropModal] = useState(false);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const data = await userProfileService.getProfile();
      console.log('Profile loaded:', data);
      setUser(data);
      setFormData({
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        bio: data.bio || '',
      });
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    try {
      await userProfileService.updateProfile(formData);
      alert('Perfil atualizado com sucesso!');
      await loadProfile();
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Erro ao atualizar perfil');
    } finally {
      setLoading(false);
    }
  }

  function handlePhotoSelect(e) {
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
    setShowPhotoCropModal(true);

    // Reset input
    e.target.value = '';
  }

  async function handlePhotoUpload(file) {
    setLoading(true);
    try {
      console.log('Uploading photo...');
      const result = await userProfileService.uploadPhoto(file);
      console.log('Photo uploaded, result:', result);
      await loadProfile();
      setShowPhotoCropModal(false);
      setSelectedPhotoFile(null);
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert('Erro ao fazer upload da foto: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordChange(passwords) {
    setLoading(true);
    try {
      await userProfileService.changePassword(passwords.current_password, passwords.password);
      alert('Senha alterada com sucesso!');
      setShowPasswordModal(false);
    } catch (error) {
      console.error('Error changing password:', error);
      alert(error.message || 'Erro ao alterar senha');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: '100%',
    padding: isMobile ? '0.6rem' : '0.75rem',
    borderRadius: '0.375rem',
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: '1rem',
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: '500',
    color: colors.text,
  };

  const photoSize = isMobile ? '100px' : '120px';

  const photoContainerStyle = {
    position: 'relative',
    width: photoSize,
    height: photoSize,
    margin: '0 auto 1.5rem',
  };

  const photoStyle = {
    width: photoSize,
    height: photoSize,
    borderRadius: '50%',
    backgroundColor: colors.surface,
    border: `3px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  const cameraButtonStyle = {
    position: 'absolute',
    bottom: '0',
    right: '0',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: colors.primary,
    border: `3px solid ${colors.background}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: isMobile ? '1rem' : '1.5rem 2rem 1rem',
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <h1 style={{
          fontSize: isMobile ? '1.2rem' : '1.5rem',
          fontWeight: '700',
          color: colors.text,
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          <SettingsIcon size={isMobile ? 22 : 28} strokeWidth={1.5} />
          Configurações do Usuário
        </h1>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: isMobile ? '1rem' : '1.5rem 2rem',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: '1.5rem',
          maxWidth: '1400px',
          margin: '0 auto',
        }}>
          {/* Coluna Esquerda - Perfil */}
          <div>
            <Card style={{ height: 'fit-content' }}>
              <div style={{ padding: '1.5rem' }}>
                <h2 style={{
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  color: colors.text,
                  marginBottom: '1.5rem',
                  textAlign: 'center'
                }}>
                  Perfil
                </h2>

                {/* Foto de Perfil */}
                <div style={photoContainerStyle}>
                  <div style={photoStyle}>
                    {user?.profile_photo && userProfileService.getPhotoUrl(user.profile_photo) ? (
                      <img
                        src={userProfileService.getPhotoUrl(user.profile_photo)}
                        alt="Profile"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <User size={48} color={colors.textSecondary} />
                    )}
                  </div>

                  <label style={cameraButtonStyle}>
                    <Camera size={20} color={colors.primaryText} />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoSelect}
                      style={{ display: 'none' }}
                      disabled={loading}
                    />
                  </label>
                </div>

                <p style={{
                  textAlign: 'center',
                  fontSize: '0.875rem',
                  color: colors.textSecondary,
                  marginBottom: '1.5rem'
                }}>
                  Clique no ícone da câmera para alterar sua foto
                </p>

                {/* Formulário */}
                <form onSubmit={handleSubmit}>
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    <div>
                      <label style={labelStyle}>Nome *</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        style={inputStyle}
                        required
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Email *</label>
                      <input
                        type="email"
                        value={formData.email}
                        style={{ ...inputStyle, backgroundColor: colors.surfaceHover, cursor: 'not-allowed' }}
                        disabled
                        title="O email não pode ser alterado"
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Telefone</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        style={inputStyle}
                        placeholder="(00) 00000-0000"
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Bio</label>
                      <textarea
                        value={formData.bio}
                        onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                        style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
                        maxLength={500}
                        placeholder="Conte um pouco sobre você..."
                      />
                      <div style={{
                        textAlign: 'right',
                        fontSize: '0.75rem',
                        color: colors.textSecondary,
                        marginTop: '0.25rem'
                      }}>
                        {formData.bio.length}/500
                      </div>
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      marginTop: '0.5rem'
                    }}>
                      <Button type="submit" icon={<Save size={18} />} disabled={loading}>
                        {loading ? 'Salvando...' : 'Salvar Alterações'}
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            </Card>
          </div>

          {/* Coluna Direita - Segurança */}
          <div>
            <Card style={{ height: 'fit-content' }}>
              <div style={{ padding: '1.5rem' }}>
                <h2 style={{
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  color: colors.text,
                  marginBottom: '1rem'
                }}>
                  Segurança
                </h2>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem',
                  backgroundColor: colors.surface,
                  borderRadius: '0.5rem',
                  border: `1px solid ${colors.border}`,
                }}>
                  <div>
                    <p style={{
                      fontSize: '0.9375rem',
                      fontWeight: '500',
                      color: colors.text,
                      marginBottom: '0.25rem'
                    }}>
                      Senha
                    </p>
                    <p style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                      Altere sua senha de acesso
                    </p>
                  </div>
                  <Button
                    icon={<Lock size={16} />}
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowPasswordModal(true)}
                    disabled={loading}
                  >
                    Alterar
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Modal de Senha */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSave={handlePasswordChange}
      />

      {/* Modal de Crop de Foto */}
      {showPhotoCropModal && selectedPhotoFile && (
        <PhotoCropModal
          isOpen={showPhotoCropModal}
          selectedFile={selectedPhotoFile}
          onClose={() => {
            setShowPhotoCropModal(false);
            setSelectedPhotoFile(null);
          }}
          onSave={handlePhotoUpload}
        />
      )}
    </div>
  );
}
