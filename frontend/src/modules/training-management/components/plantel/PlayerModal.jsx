import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HeartPulse, Plus, X, Check, Trash2, User, Upload } from 'lucide-react';
import { Modal } from '../../../../components/common/Modal';
import { Input } from '../../../../components/common/Input';
import { Select } from '../../../../components/common/Select';
import { Textarea } from '../../../../components/common/Textarea';
import { Button } from '../../../../components/common/Button';
import { useTheme } from '../../../../contexts/ThemeContext';
import { useClub } from '../../../../contexts/ClubContext';
import { useSportConfig } from '../../../../hooks/useSportConfig';
import { injuryService } from '../../../../services/injuryService';
import { categoryService } from '../../../../services/categoryService';
import { athleteService } from '../../services/athleteService';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativo' },
  { value: 'injured', label: 'Lesionado' },
  { value: 'suspended', label: 'Suspenso' },
  { value: 'inactive', label: 'Inativo' },
];

const GROUP_OPTIONS = [
  { value: '', label: 'Sem grupo' },
  { value: '1', label: 'Grupo 1' },
  { value: '2', label: 'Grupo 2' },
  { value: '3', label: 'Grupo 3' },
  { value: 'Transição', label: 'Transição' },
  { value: 'DM', label: 'DM' },
];

const SEVERITY_OPTIONS = [
  { value: 'light',  label: 'Leve' },
  { value: 'medium', label: 'Moderada' },
  { value: 'severe', label: 'Grave' },
];

const SEVERITY_COLORS = {
  light:  '#f59e0b',
  medium: '#ef4444',
  severe: '#b91c1c',
};

const formatDateBR = (dateStr) => {
  if (!dateStr) return '';
  const d = String(dateStr).split('T')[0];
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

export default function PlayerModal({ isOpen, onClose, onSave, player = null }) {
  const { colors } = useTheme();
  const { selectedClub } = useClub();
  const sport = useSportConfig();
  const POSITIONS = sport.positions.map(p => ({ value: p.code, label: `${p.name} (${p.code})` }));
  const [tab, setTab] = useState('dados'); // 'dados' | 'lesoes'
  const [formData, setFormData] = useState({
    name: '', position: '', jersey_number: '', status: 'active', observation: '', group: '', category_id: '',
    birthdate: '', height_cm: '', preferred_foot: '', previous_club: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef(null);

  // Lesões
  const [injuries, setInjuries] = useState([]);
  const [loadingInjuries, setLoadingInjuries] = useState(false);
  const [showInjuryForm, setShowInjuryForm] = useState(false);
  const [injuryForm, setInjuryForm] = useState({
    injury_type: '', body_part: '', severity: 'medium',
    started_at: new Date().toISOString().split('T')[0],
    expected_return: '', notes: '',
  });
  const [savingInjury, setSavingInjury] = useState(false);

  useEffect(() => {
    if (player) {
      setFormData({
        name: player.name || '',
        position: player.position || '',
        jersey_number: player.jersey_number ?? '',
        status: player.status || 'active',
        observation: player.observation || '',
        group: player.group || '',
        category_id: player.category_id || '',
        birthdate: player.birthdate ? String(player.birthdate).split('T')[0] : '',
        height_cm: player.height_cm || '',
        preferred_foot: player.preferred_foot || '',
        previous_club: player.previous_club || '',
      });
      setPhotoUrl(player.photo_url || '');
    } else {
      setFormData({
        name: '', position: '', jersey_number: '', status: 'active', observation: '', group: '', category_id: '',
        birthdate: '', height_cm: '', preferred_foot: '', previous_club: '',
      });
      setPhotoUrl('');
    }
    setErrors({});
    setTab('dados');
    setShowInjuryForm(false);
  }, [player, isOpen]);

  // Carrega categorias do clube selecionado
  useEffect(() => {
    if (!isOpen || !selectedClub?.id) { setCategories([]); return; }
    categoryService.listByClub(selectedClub.id).then(setCategories).catch(() => setCategories([]));
  }, [isOpen, selectedClub?.id]);

  const loadInjuries = useCallback(async () => {
    if (!player?.id) return;
    setLoadingInjuries(true);
    try {
      const list = await injuryService.listByAthlete(player.id);
      setInjuries(list);
    } catch (err) {
      console.error('Load injuries error', err);
    } finally {
      setLoadingInjuries(false);
    }
  }, [player?.id]);

  useEffect(() => {
    if (isOpen && tab === 'lesoes' && player?.id) loadInjuries();
  }, [isOpen, tab, player?.id, loadInjuries]);

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Nome é obrigatório';
    if (!formData.position) newErrors.position = 'Posição é obrigatória';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      // Em edição já temos id — manda photo_url só nesse caso (criação faz upload depois do save)
      const payload = player?.id ? { ...formData, photo_url: photoUrl || null } : formData;
      await onSave(payload);
      onClose();
    } catch (error) {
      console.error('Erro ao salvar atleta:', error);
      setErrors({ submit: error.response?.data?.message || error.message || 'Erro ao salvar atleta.' });
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-selecionar o mesmo arquivo
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Selecione um arquivo de imagem.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 8 MB.');
      return;
    }
    // Atleta novo: ainda não tem id. Mostra preview local e avisa que ele será salvo após a criação.
    if (!player?.id) {
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoUrl(ev.target.result);
      reader.readAsDataURL(file);
      alert('A foto será carregada após salvar o cadastro do atleta. Salve agora e reabra para enviar.');
      return;
    }
    setUploadingPhoto(true);
    try {
      const updated = await athleteService.uploadPhoto(player.id, file);
      setPhotoUrl(updated.photo_url || '');
    } catch (err) {
      console.error('Upload de foto falhou:', err);
      alert('Não foi possível enviar a foto: ' + (err?.message || 'erro desconhecido'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!photoUrl) return;
    if (!player?.id) {
      setPhotoUrl('');
      return;
    }
    if (!confirm('Remover a foto deste atleta?')) return;
    setUploadingPhoto(true);
    try {
      const updated = await athleteService.deletePhoto(player.id);
      setPhotoUrl(updated.photo_url || '');
    } catch (err) {
      alert('Falha ao remover foto: ' + (err?.message || ''));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  const handleAddInjury = async () => {
    if (!injuryForm.injury_type.trim()) {
      alert('Informe o tipo da lesão.');
      return;
    }
    setSavingInjury(true);
    try {
      await injuryService.create(player.id, injuryForm);
      setShowInjuryForm(false);
      setInjuryForm({ injury_type: '', body_part: '', severity: 'medium', started_at: new Date().toISOString().split('T')[0], expected_return: '', notes: '' });
      await loadInjuries();
    } catch (err) {
      alert('Erro ao registrar lesão: ' + (err?.message || ''));
    } finally {
      setSavingInjury(false);
    }
  };

  const handleResolveInjury = async (id) => {
    try {
      await injuryService.resolve(id);
      await loadInjuries();
    } catch (err) {
      alert('Erro ao marcar como resolvida: ' + (err?.message || ''));
    }
  };

  const handleDeleteInjury = async (id) => {
    if (!confirm('Remover registro de lesão? Esta ação não pode ser desfeita.')) return;
    try {
      await injuryService.remove(id);
      await loadInjuries();
    } catch (err) {
      alert('Erro ao remover: ' + (err?.message || ''));
    }
  };

  const formStyle = { display: 'flex', flexDirection: 'column', gap: '1rem' };
  const errorMessageStyle = { color: colors.error, fontSize: '0.875rem', marginTop: '0.5rem' };

  const tabBtn = (active) => ({
    padding: '0.5rem 0.875rem',
    border: 'none',
    background: 'transparent',
    color: active ? colors.text : colors.textSecondary,
    fontSize: '0.875rem',
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    borderBottom: `2px solid ${active ? colors.primary : 'transparent'}`,
    marginBottom: '-1px',
  });

  const activeInjuries = injuries.filter(i => !i.resolved_at);
  const resolvedInjuries = injuries.filter(i => i.resolved_at);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={player ? 'Editar Atleta' : 'Novo Atleta'}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          {tab === 'dados' && (
            <Button onClick={handleSubmit} disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
          )}
        </>
      }
    >
      {player && (
        <div style={{ display: 'flex', gap: '0.25rem', borderBottom: `1px solid ${colors.border}`, marginBottom: '1rem' }}>
          <button style={tabBtn(tab === 'dados')} onClick={() => setTab('dados')}>Dados</button>
          <button style={tabBtn(tab === 'lesoes')} onClick={() => setTab('lesoes')}>
            <HeartPulse size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            Lesões{activeInjuries.length > 0 ? ` (${activeInjuries.length})` : ''}
          </button>
        </div>
      )}

      {tab === 'dados' && (
        <form onSubmit={handleSubmit} style={formStyle}>
          {/* Foto do atleta — círculo com upload */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: 76, height: 76, borderRadius: '50%',
              backgroundColor: colors.surface,
              border: `2px solid ${colors.border}`,
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={formData.name || 'Atleta'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <User size={36} strokeWidth={1.4} style={{ color: colors.textSecondary }} />
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.text }}>
                Foto do atleta
              </div>
              <div style={{ fontSize: '0.72rem', color: colors.textSecondary }}>
                Aparece nos PDFs de plantel e convocação. JPG/PNG, até 8 MB.
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  style={{ display: 'none' }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={uploadingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  icon={<Upload size={13} />}
                >
                  {uploadingPhoto ? 'Enviando...' : (photoUrl ? 'Trocar' : 'Enviar foto')}
                </Button>
                {photoUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={uploadingPhoto}
                    icon={<X size={13} />}
                  >
                    Remover
                  </Button>
                )}
              </div>
            </div>
          </div>

          <Input label="Nome do Atleta" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} error={errors.name} placeholder="Digite o nome completo" fullWidth required />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
            <Select label="Posição" value={formData.position} onChange={(e) => handleChange('position', e.target.value)} options={POSITIONS} placeholder="Selecione a posição" fullWidth required />
            <Input
              label="Camisa"
              type="number"
              min="1"
              max="99"
              value={formData.jersey_number}
              onChange={(e) => handleChange('jersey_number', e.target.value)}
              placeholder="Nº"
              fullWidth
            />
          </div>
          <Select label="Status" value={formData.status} onChange={(e) => handleChange('status', e.target.value)} options={STATUS_OPTIONS} fullWidth />
          <Select label="Grupo" value={formData.group} onChange={(e) => handleChange('group', e.target.value)} options={GROUP_OPTIONS} placeholder="Selecione o grupo" fullWidth />
          {categories.length > 0 && (
            <Select
              label="Categoria"
              value={formData.category_id}
              onChange={(e) => handleChange('category_id', e.target.value)}
              options={[
                { value: '', label: 'Sem categoria (clube todo)' },
                ...categories.map(c => ({ value: c.id, label: c.name + (c.age_group ? ` · ${c.age_group}` : '') })),
              ]}
              fullWidth
            />
          )}

          {/* Dados pessoais — usados em cards individuais / apresentação do plantel */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Input
              label="Data de Nascimento"
              type="date"
              value={formData.birthdate}
              onChange={(e) => handleChange('birthdate', e.target.value)}
              fullWidth
            />
            <Input
              label="Altura (cm)"
              type="number"
              min="100"
              max="240"
              value={formData.height_cm}
              onChange={(e) => handleChange('height_cm', e.target.value)}
              placeholder="Ex.: 180"
              fullWidth
            />
            <Select
              label="Pé Preferencial"
              value={formData.preferred_foot}
              onChange={(e) => handleChange('preferred_foot', e.target.value)}
              options={[
                { value: '',      label: '—' },
                { value: 'right', label: 'Direito' },
                { value: 'left',  label: 'Esquerdo' },
                { value: 'both',  label: 'Ambidestro' },
              ]}
              fullWidth
            />
            <Input
              label="Último Clube"
              value={formData.previous_club}
              onChange={(e) => handleChange('previous_club', e.target.value)}
              placeholder="De onde veio"
              fullWidth
            />
          </div>

          <Textarea label="Observação" value={formData.observation} onChange={(e) => handleChange('observation', e.target.value)} placeholder="Adicione observações sobre o atleta" fullWidth rows={3} />
          {errors.submit && <div style={errorMessageStyle}>{errors.submit}</div>}
        </form>
      )}

      {tab === 'lesoes' && player && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {!showInjuryForm && (
            <button
              type="button"
              onClick={() => setShowInjuryForm(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.5rem 0.85rem', backgroundColor: colors.primary, color: colors.primaryText,
                border: 'none', borderRadius: '0.375rem', fontSize: '0.85rem', fontWeight: 500,
                cursor: 'pointer', alignSelf: 'flex-start',
              }}
            >
              <Plus size={14} /> Registrar lesão
            </button>
          )}

          {showInjuryForm && (
            <div style={{ padding: '0.85rem', backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '0.9rem', color: colors.text }}>Nova lesão</strong>
                <button onClick={() => setShowInjuryForm(false)} style={{ background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer' }}>
                  <X size={16} />
                </button>
              </div>
              <Input label="Tipo *" value={injuryForm.injury_type} onChange={(e) => setInjuryForm({ ...injuryForm, injury_type: e.target.value })} placeholder="Ex.: Distensão muscular" fullWidth required />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <Input label="Local" value={injuryForm.body_part} onChange={(e) => setInjuryForm({ ...injuryForm, body_part: e.target.value })} placeholder="Ex.: Coxa direita" fullWidth />
                <Select label="Gravidade" value={injuryForm.severity} onChange={(e) => setInjuryForm({ ...injuryForm, severity: e.target.value })} options={SEVERITY_OPTIONS} fullWidth />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <Input label="Início" type="date" value={injuryForm.started_at} onChange={(e) => setInjuryForm({ ...injuryForm, started_at: e.target.value })} fullWidth />
                <Input label="Retorno previsto" type="date" value={injuryForm.expected_return} onChange={(e) => setInjuryForm({ ...injuryForm, expected_return: e.target.value })} fullWidth />
              </div>
              <Textarea label="Observações" value={injuryForm.notes} onChange={(e) => setInjuryForm({ ...injuryForm, notes: e.target.value })} fullWidth rows={2} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                <Button variant="outline" onClick={() => setShowInjuryForm(false)} disabled={savingInjury}>Cancelar</Button>
                <Button onClick={handleAddInjury} disabled={savingInjury}>{savingInjury ? 'Salvando...' : 'Registrar'}</Button>
              </div>
            </div>
          )}

          {loadingInjuries && (
            <div style={{ padding: '1rem', color: colors.textSecondary, fontSize: '0.85rem', textAlign: 'center' }}>Carregando…</div>
          )}

          {!loadingInjuries && injuries.length === 0 && !showInjuryForm && (
            <div style={{ padding: '1.5rem 1rem', color: colors.textSecondary, fontSize: '0.85rem', textAlign: 'center', backgroundColor: colors.surface, border: `1px dashed ${colors.border}`, borderRadius: '0.5rem', fontStyle: 'italic' }}>
              Nenhuma lesão registrada.
            </div>
          )}

          {activeInjuries.length > 0 && (
            <div>
              <div style={{ fontSize: '0.7rem', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, marginBottom: '0.4rem' }}>Ativas</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {activeInjuries.map((inj) => (
                  <InjuryRow key={inj.id} injury={inj} colors={colors} onResolve={() => handleResolveInjury(inj.id)} onDelete={() => handleDeleteInjury(inj.id)} />
                ))}
              </div>
            </div>
          )}

          {resolvedInjuries.length > 0 && (
            <div>
              <div style={{ fontSize: '0.7rem', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, marginBottom: '0.4rem' }}>
                Histórico ({resolvedInjuries.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {resolvedInjuries.map((inj) => (
                  <InjuryRow key={inj.id} injury={inj} colors={colors} onDelete={() => handleDeleteInjury(inj.id)} resolved />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function InjuryRow({ injury, colors, onResolve, onDelete, resolved = false }) {
  const sevColor = SEVERITY_COLORS[injury.severity] || colors.textSecondary;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.6rem',
      padding: '0.55rem 0.7rem',
      backgroundColor: resolved ? colors.background : colors.surface,
      border: `1px solid ${resolved ? colors.border : `${sevColor}40`}`,
      borderLeft: `3px solid ${sevColor}`,
      borderRadius: '0.4rem',
      opacity: resolved ? 0.75 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.text }}>
          {injury.injury_type}{injury.body_part ? ` · ${injury.body_part}` : ''}
        </div>
        <div style={{ fontSize: '0.72rem', color: colors.textSecondary, marginTop: 2 }}>
          {formatDateBR(injury.started_at)}
          {injury.expected_return && !resolved ? ` · retorno previsto ${formatDateBR(injury.expected_return)}` : ''}
          {resolved && injury.resolved_at ? ` → resolvida em ${formatDateBR(injury.resolved_at)}` : ''}
        </div>
        {injury.notes && (
          <div style={{ fontSize: '0.72rem', color: colors.textSecondary, marginTop: 3, fontStyle: 'italic' }}>{injury.notes}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.2rem' }}>
        {!resolved && onResolve && (
          <button title="Marcar como resolvida" onClick={onResolve} style={{ padding: '0.3rem', background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer', display: 'flex' }}>
            <Check size={14} />
          </button>
        )}
        <button title="Remover" onClick={onDelete} style={{ padding: '0.3rem', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex' }}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
