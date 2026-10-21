import { useState, useEffect, useRef } from 'react';
import {
  User, Building2, SlidersHorizontal, Camera, Lock, Save,
  Plus, Trash2, Sun, Moon, Check, Target, Crown, Info, AlertTriangle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import { usePreference } from '../../hooks/usePreference';
import { usePlanFeatures } from '../../hooks/usePlanFeatures';
import { SideSheet } from '../common/SideSheet';
import { Button } from '../common/Button';
import { ChangePasswordModal } from './ChangePasswordModal';
import { PhotoCropModal } from './PhotoCropModal';
import { DeleteAccountModal } from './DeleteAccountModal';
import { userProfileService } from '../../services/userProfileService';
import { notify } from '../../lib/notify';
import { authService } from '../../services/authService';

const TABS = [
  { id: 'perfil', label: 'Perfil', icon: User },
  { id: 'clubes', label: 'Clube', icon: Building2 },
  { id: 'preferencias', label: 'Preferências', icon: SlidersHorizontal },
];

export function SettingsSheet({ isOpen, onClose, initialTab = 'perfil' }) {
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { if (isOpen) setTab(initialTab); }, [isOpen, initialTab]);

  return (
    <SideSheet isOpen={isOpen} onClose={onClose} title="Configurações" width={560}>
      <Tabs tab={tab} setTab={setTab} />
      <div style={{ marginTop: '1.25rem' }}>
        {tab === 'perfil' && <PerfilTab />}
        {tab === 'clubes' && <ClubesTab />}
        {tab === 'preferencias' && <PreferenciasTab />}
      </div>
    </SideSheet>
  );
}

// ---------------- Tabs ----------------
function Tabs({ tab, setTab }) {
  const { colors } = useTheme();
  return (
    <div style={{ display: 'flex', gap: '0.25rem', borderBottom: `1px solid ${colors.border}` }}>
      {TABS.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.75rem 0.875rem',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${active ? colors.primary : 'transparent'}`,
              color: active ? colors.primary : colors.textSecondary,
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '-1px',
            }}
          >
            <t.icon size={16} strokeWidth={1.75} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------- Perfil ----------------
function PerfilTab() {
  const { colors } = useTheme();
  const { user: authUser, logout } = useAuth();
  const navigate = useNavigate();
  const [user, setUser] = useState(authUser || null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', bio: '' });
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showCrop, setShowCrop] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      const data = await userProfileService.getProfile();
      setUser(data);
      setForm({ name: data.name || '', email: data.email || '', phone: data.phone || '', bio: data.bio || '' });
    } catch (e) { console.error(e); }
  }

  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await userProfileService.updateProfile(form);
      await load();
      notify.success('Perfil atualizado!');
    } catch (e) { notify.error('Erro ao salvar'); }
    finally { setLoading(false); }
  }

  function onPickPhoto(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { notify.error('Selecione uma imagem'); return; }
    if (f.size > 5 * 1024 * 1024) { notify.error('Máx 5MB'); return; }
    setPhotoFile(f);
    setShowCrop(true);
    e.target.value = '';
  }

  async function uploadPhoto(file) {
    setLoading(true);
    try { await userProfileService.uploadPhoto(file); await load(); setShowCrop(false); setPhotoFile(null); }
    catch (e) { notify.error('Erro no upload'); }
    finally { setLoading(false); }
  }

  async function changePwd({ current_password, password }) {
    setLoading(true);
    try { await userProfileService.changePassword(current_password, password); notify.success('Senha alterada!'); setShowPwd(false); }
    catch (e) { notify.error(e.message || 'Erro ao alterar senha'); }
    finally { setLoading(false); }
  }

  async function handleDeleteAccount(password) {
    // Chamado pelo DeleteAccountModal após o usuário digitar 'EXCLUIR' + senha.
    // Erros aqui borbulham pro modal (que mostra o erro e reabilita o botão).
    setDeleting(true);
    try {
      await authService.deleteMe(password);
      // Sucesso — encerra sessão local, fecha o modal e manda pro login.
      setShowDelete(false);
      try { await logout(); } catch (e) { /* logout local: nunca falha */ }
      notify.success('Sua conta foi excluída.');
      navigate('/login', { replace: true });
    } catch (e) {
      // Rethrow pro modal capturar (evita fechar em caso de erro).
      throw e;
    } finally {
      setDeleting(false);
    }
  }

  const input = {
    width: '100%', padding: '0.625rem 0.75rem',
    borderRadius: '0.5rem', border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface, color: colors.text, fontSize: '0.9rem',
  };
  const label = { display: 'block', marginBottom: '0.375rem', fontSize: '0.8125rem', fontWeight: 500, color: colors.textSecondary };

  return (
    <div>
      {/* Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ position: 'relative', width: 72, height: 72 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: `2px solid ${colors.border}`, backgroundColor: colors.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {user?.profile_photo && userProfileService.getPhotoUrl(user.profile_photo)
              ? <img src={userProfileService.getPhotoUrl(user.profile_photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <User size={32} color={colors.textSecondary} />}
          </div>
          <label style={{ position: 'absolute', bottom: -2, right: -2, width: 28, height: 28, borderRadius: '50%', backgroundColor: colors.primary, color: colors.primaryText, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `2px solid ${colors.background}` }}>
            <Camera size={14} />
            <input type="file" accept="image/*" onChange={onPickPhoto} style={{ display: 'none' }} disabled={loading} />
          </label>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: colors.text }}>{user?.name || '—'}</div>
          <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>{user?.email}</div>
        </div>
      </div>

      <form onSubmit={save} style={{ display: 'grid', gap: '0.875rem' }}>
        <div><label style={label}>Nome *</label><input style={input} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label style={label}>Email</label><input style={{ ...input, opacity: 0.6, cursor: 'not-allowed' }} disabled value={form.email} /></div>
        <div><label style={label}>Telefone</label><input style={input} value={form.phone} placeholder="(00) 00000-0000" onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div>
          <label style={label}>Bio</label>
          <textarea style={{ ...input, minHeight: 80, resize: 'vertical' }} maxLength={500} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          <div style={{ textAlign: 'right', fontSize: '0.7rem', color: colors.textSecondary, marginTop: 4 }}>{form.bio.length}/500</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="submit" icon={<Save size={16} />} disabled={loading}>Salvar</Button>
        </div>
      </form>

      <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: `1px solid ${colors.border}` }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.text, marginBottom: '0.75rem' }}>Segurança</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '0.5rem' }}>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: colors.text }}>Senha</div>
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Altere sua senha de acesso</div>
          </div>
          <Button icon={<Lock size={14} />} variant="secondary" size="sm" onClick={() => setShowPwd(true)}>Alterar</Button>
        </div>
      </div>

      {/* Zona de perigo */}
      <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: `1px solid ${colors.border}` }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          fontSize: '0.875rem', fontWeight: 600, color: colors.error || '#ef4444',
          marginBottom: '0.75rem',
        }}>
          <AlertTriangle size={14} /> Zona de perigo
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
          padding: '0.75rem 1rem',
          backgroundColor: `${colors.error || '#ef4444'}08`,
          border: `1px solid ${colors.error || '#ef4444'}40`,
          borderRadius: '0.5rem',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: colors.text }}>Excluir minha conta</div>
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary, lineHeight: 1.45 }}>
              Apaga seus dados, cancela sua assinatura e encerra o acesso. Ação permanente.
            </div>
          </div>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={() => setShowDelete(true)}
            disabled={deleting}
          >
            Excluir
          </Button>
        </div>
      </div>

      <ChangePasswordModal isOpen={showPwd} onClose={() => setShowPwd(false)} onSave={changePwd} />
      {showCrop && photoFile && (
        <PhotoCropModal isOpen={showCrop} selectedFile={photoFile} onClose={() => { setShowCrop(false); setPhotoFile(null); }} onSave={uploadPhoto} />
      )}
      <DeleteAccountModal
        isOpen={showDelete}
        onClose={() => (deleting ? null : setShowDelete(false))}
        onConfirm={handleDeleteAccount}
        requiresPassword={!user?.requires_password}
        userEmail={user?.email}
      />
    </div>
  );
}

// ---------------- Clube ----------------
function ClubesTab() {
  const { colors } = useTheme();
  const { clubs, selectedClub, updateClub, uploadLogo, getLogoUrl } = useClub();
  const [editName, setEditName] = useState(selectedClub?.name || '');
  const [editDesc, setEditDesc] = useState(selectedClub?.description || '');
  const [editModality, setEditModality] = useState(selectedClub?.modality || 'football_11');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    setEditName(selectedClub?.name || '');
    setEditDesc(selectedClub?.description || '');
    setEditModality(selectedClub?.modality || 'football_11');
  }, [selectedClub?.id]);

  if (!selectedClub) {
    return (
      <div style={{ padding: '2rem 1rem', textAlign: 'center', color: colors.textSecondary, fontSize: '0.875rem' }}>
        Nenhum clube selecionado.
      </div>
    );
  }

  const url = selectedClub.logo_path && getLogoUrl?.(selectedClub.logo_path);
  const modalityChanged = editModality !== (selectedClub.modality || 'football_11');
  const dirty = editName.trim() !== (selectedClub.name || '')
    || (editDesc || '') !== (selectedClub.description || '')
    || modalityChanged;

  async function handleSave() {
    if (!editName.trim() || saving) return;
    if (modalityChanged) {
      const ok = await notify.confirm(
        'Mudar a modalidade vai LIMPAR as posições atuais dos atletas deste clube. ' +
        'Você precisará recadastrar a posição de cada atleta usando as opções da nova modalidade.\n\n' +
        'Estatísticas históricas e templates seguem preservados. Deseja continuar?',
        { confirmText: 'Continuar', cancelText: 'Cancelar' }
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      await updateClub(selectedClub.id, {
        name: editName.trim(),
        description: editDesc.trim() || null,
        modality: editModality,
      });
      notify.success('Clube atualizado.');
    } catch (e) {
      notify.error(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogo(file) {
    if (!file) return;
    setSaving(true);
    try { await uploadLogo(selectedClub.id, file); }
    catch (e) { notify.error(e.message || 'Erro ao enviar logo'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      <div>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: colors.text }}>Edite os dados do seu clube</div>
        <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: 2 }}>
          Precisa de mais de um clube? Adicione um <strong>clube extra</strong> (R$20/mês) na sua <strong>Assinatura</strong>, ou crie outra conta se preferir cobrança separada.
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.875rem', alignItems: 'center', padding: '0.875rem', backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '0.5rem' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '0.5rem',
          background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.4rem', fontWeight: 700, flexShrink: 0, overflow: 'hidden',
        }}>
          {url ? <img src={url} alt={selectedClub.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (selectedClub.name?.[0]?.toUpperCase() || '?')}
        </div>
        <Button size="sm" variant="secondary" icon={<Camera size={14} />} onClick={() => fileRef.current?.click()}>
          {url ? 'Trocar logo' : 'Enviar logo'}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleLogo(e.target.files?.[0])} />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: colors.text, marginBottom: '0.3rem' }}>Nome do clube *</label>
        <input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: `1px solid ${colors.border}`, backgroundColor: colors.surface, color: colors.text, fontSize: '0.9rem' }}
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: colors.text, marginBottom: '0.3rem' }}>Descrição (opcional)</label>
        <input
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          placeholder="Ex.: Sub-15 — Tarde"
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: `1px solid ${colors.border}`, backgroundColor: colors.surface, color: colors.text, fontSize: '0.9rem' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: colors.text, marginBottom: '0.3rem' }}>Modalidade *</label>
        <select
          value={editModality}
          onChange={(e) => setEditModality(e.target.value)}
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: `1px solid ${colors.border}`, backgroundColor: colors.surface, color: colors.text, fontSize: '0.9rem' }}
        >
          <option value="football_11">Futebol 11 (11 jogadores · 2x45 min)</option>
          <option value="football_7">Futebol 7 (7 jogadores · 2x25 min)</option>
          <option value="futsal">Futsal (5 jogadores · 2x20 min)</option>
        </select>
        {modalityChanged && (
          <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: '0.3rem' }}>
            ⚠ Ao salvar, as posições dos atletas deste clube serão limpas (você re-cadastra com as posições da nova modalidade).
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="sm" icon={<Save size={14} />} onClick={handleSave} disabled={!dirty || saving || !editName.trim()}>
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </Button>
      </div>

      {clubs.length > 1 && (
        <div style={{ marginTop: '0.5rem', padding: '0.625rem 0.75rem', backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '0.5rem', fontSize: '0.78rem', color: colors.textSecondary }}>
          Você gerencia <strong style={{ color: colors.text }}>{clubs.length} clubes</strong> nesta conta. Use o seletor de clube no topo pra alternar entre eles.
        </div>
      )}

    </div>
  );
}

// ---------------- Preferências ----------------
function PreferenciasTab() {
  const { colors, isDark, toggleTheme } = useTheme();
  // Default agora é 'disabled' — o usuário liga conscientemente quando quiser
  const [monthlyTheme, setMonthlyTheme] = usePreference('pref_monthly_theme', 'disabled');
  const plan = usePlanFeatures();
  const navigate = useNavigate();
  const [showExplain, setShowExplain] = useState(false);

  const canUseTheme = plan.monthly_theme;

  async function handleToggle(v) {
    if (v && !canUseTheme) {
      // Tenta ativar sem plano → leva pro upgrade
      const ok = await notify.confirm('Tema do Mês está disponível no plano Clube. Ver a assinatura?', {
        confirmText: 'Ver assinatura',
        cancelText: 'Agora não',
      });
      if (ok) navigate('/billing');
      return;
    }
    if (v) {
      // Ao ativar pela primeira vez, mostra explicação
      setShowExplain(true);
    }
    setMonthlyTheme(v ? 'enabled' : 'disabled');
  }

  const rowStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.875rem 1rem',
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.5rem',
  };

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={rowStyle}>
        <div>
          <div style={{ fontSize: '0.9375rem', fontWeight: 500, color: colors.text }}>Tema</div>
          <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Alternar entre claro e escuro</div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={toggleTheme}
          icon={isDark ? <Sun size={14} /> : <Moon size={14} />}
        >
          {isDark ? 'Claro' : 'Escuro'}
        </Button>
      </div>

      <div style={rowStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1 }}>
          <Target size={18} color={canUseTheme ? colors.primary : colors.textSecondary} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.9375rem', fontWeight: 500, color: colors.text, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              Tema do mês
              {!canUseTheme && (
                <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', backgroundColor: '#f59e0b15', color: '#f59e0b', borderRadius: 999, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                  <Crown size={9} /> Clube
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
              Define um foco tático/conteúdo para cada mês e calcula automaticamente o quanto seus treinos respeitam esse foco (% de aderência).
              <button
                onClick={() => setShowExplain(true)}
                style={{ marginLeft: '0.3rem', background: 'transparent', border: 'none', color: colors.primary, cursor: 'pointer', padding: 0, fontSize: '0.75rem', textDecoration: 'underline' }}
              >
                Saiba mais
              </button>
            </div>
          </div>
        </div>
        <ToggleSwitch
          checked={monthlyTheme === 'enabled'}
          onChange={handleToggle}
        />
      </div>

      {showExplain && (
        <div style={{
          padding: '0.875rem 1rem',
          backgroundColor: `${colors.primary}10`,
          border: `1px solid ${colors.primary}40`,
          borderRadius: '0.5rem',
          fontSize: '0.85rem', color: colors.text,
          display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
        }}>
          <Info size={18} color={colors.primary} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <strong>Para que serve o Tema do Mês?</strong>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', lineHeight: 1.5 }}>
              Você escolhe um <strong>conteúdo principal</strong> (e opcionalmente um secundário) como foco do mês —
              por exemplo: <em>"Maio será mês de Transição Defensiva e Bola Parada"</em>.
              O sistema acompanha quantos % das suas atividades de treino estão alinhadas com esse foco
              e mostra um <strong>banner com aderência</strong> no topo da Programação.
              É ótimo pra coordenadores que querem garantir consistência metodológica ao longo da temporada.
            </p>
            <button onClick={() => setShowExplain(false)}
              style={{ marginTop: '0.5rem', background: 'transparent', border: 'none', color: colors.primary, cursor: 'pointer', padding: 0, fontSize: '0.75rem', fontWeight: 600 }}>
              Entendi
            </button>
          </div>
        </div>
      )}
      <div style={rowStyle}>
        <div>
          <div style={{ fontSize: '0.9375rem', fontWeight: 500, color: colors.text }}>Idioma</div>
          <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Português (Brasil)</div>
        </div>
        <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Em breve</span>
      </div>

    </div>
  );
}

function ToggleSwitch({ checked, onChange }) {
  const { colors } = useTheme();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 24,
        borderRadius: 999,
        border: 'none',
        backgroundColor: checked ? colors.primary : colors.border,
        position: 'relative',
        cursor: 'pointer',
        transition: 'background-color 0.2s',
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 22 : 2,
          width: 20, height: 20,
          borderRadius: '50%',
          backgroundColor: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  );
}
