// Gestão de clubes dentro da mesma conta (workspace).
// Plano Clube vem com 3 clubes inclusos (migration 037). Quem precisa de mais
// recebe orientação pra abrir slot extra (extra_club_slots) via contato.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import notify from '../lib/notify';
import { Plus, Building2, Edit2, Trash2, Check, AlertCircle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { useClub } from '../contexts/ClubContext';
import { Modal } from '../components/common/Modal';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Button } from '../components/common/Button';
import { MODALITIES, MODALITY_LABELS } from '../lib/sportConfig';
import { NOME_ENTRADA, NOME_CLUBE } from '../config/planos';

export function ClubsConfigPage() {
  const { colors } = useTheme();
  const isMobile = useIsMobile();
  const { clubs, selectedClub, selectClub, createClub, updateClub, deleteClub } = useClub();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState('');

  function openCreate() { setEditing(null); setError(''); setShowForm(true); }
  function openEdit(c) { setEditing(c); setError(''); setShowForm(true); }

  async function handleSave(form) {
    setError('');
    try {
      if (editing) {
        await updateClub(editing.id, form);
      } else {
        await createClub(form);
      }
      setShowForm(false);
      setEditing(null);
    } catch (err) {
      // Backend devolve 402 com code PLAN_REQUIRED quando estoura limite
      const payload = err?.response?.data || err?.data || {};
      if (payload.code === 'PLAN_REQUIRED') {
        setError(payload.error || 'Limite do plano atingido');
      } else {
        setError(err?.message || 'Erro ao salvar clube');
      }
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteClub(confirmDelete.id);
      setConfirmDelete(null);
    } catch (err) {
      notify.error('Erro ao remover clube: ' + (err?.message || ''));
    }
  }

  const pageStyle = { padding: isMobile ? '1rem' : '1.5rem 2rem', width: '100%' };

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.875rem', fontWeight: 700, color: colors.text, margin: 0 }}>Clubes</h1>
          <p style={{ color: colors.textSecondary, fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Gerencie os clubes da sua conta. Cada clube tem seu próprio plantel, treinos e estatísticas.
          </p>
        </div>
        <Button onClick={openCreate} icon={<Plus size={18} />}>Novo Clube</Button>
      </div>

      {/* Aviso quando bater no teto */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
          padding: '0.75rem 1rem', marginBottom: '1rem',
          backgroundColor: '#f59e0b15', color: '#92400e',
          border: '1px solid #f59e0b40', borderRadius: '0.5rem',
          fontSize: '0.85rem',
        }}>
          <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
          <div>{error}</div>
        </div>
      )}

      {clubs.length === 0 ? (
        <div style={{
          padding: '2.5rem 1.5rem', textAlign: 'center',
          backgroundColor: colors.surface, border: `1px dashed ${colors.border}`,
          borderRadius: '0.5rem', color: colors.textSecondary,
        }}>
          <Building2 size={32} style={{ opacity: 0.6, marginBottom: '0.5rem' }} />
          <div style={{ fontSize: '0.95rem' }}>Nenhum clube cadastrado.</div>
        </div>
      ) : (
        <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '0.5rem', overflow: 'hidden' }}>
          {clubs.map((c, i) => (
            <ClubRow
              key={c.id}
              club={c}
              isLast={i === clubs.length - 1}
              colors={colors}
              isSelected={selectedClub?.id === c.id}
              onSelect={() => selectClub(c)}
              onEdit={() => openEdit(c)}
              onDelete={() => setConfirmDelete(c)}
            />
          ))}
        </div>
      )}

      <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: colors.textSecondary, textAlign: 'center' }}>
        {NOME_ENTRADA} e {NOME_CLUBE}: 1 clube incluso. Clubes extras podem ser adicionados na Assinatura (plano mensal).
      </p>

      <ClubFormModal
        isOpen={showForm}
        editing={editing}
        onClose={() => { setShowForm(false); setEditing(null); setError(''); }}
        onSave={handleSave}
      />

      <Modal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Remover clube"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button variant="danger" onClick={handleDelete}>Remover</Button>
          </div>
        }
      >
        <p style={{ color: colors.text }}>
          Remover <strong>{confirmDelete?.name}</strong>? Esta ação remove permanentemente atletas,
          treinos e estatísticas do clube. Não pode ser desfeita.
        </p>
      </Modal>
    </div>
  );
}

function ClubRow({ club, isLast, colors, isSelected, onSelect, onEdit, onDelete }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '0.85rem 1rem',
        borderBottom: isLast ? 'none' : `1px solid ${colors.border}`,
        backgroundColor: hover ? colors.background : 'transparent',
        display: 'flex', alignItems: 'center', gap: '0.7rem',
      }}
    >
      <Building2 size={20} color={isSelected ? colors.primary : colors.textSecondary} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 600, color: colors.text }}>{club.name}</span>
          {isSelected && (
            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', backgroundColor: `${colors.primary}20`, color: colors.primary, borderRadius: 999, fontWeight: 700, textTransform: 'uppercase' }}>
              Ativo
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.72rem', color: colors.textSecondary, marginTop: 2 }}>
          {MODALITY_LABELS[club.modality] || 'Futebol 11'}
          {club.description ? ` · ${club.description}` : ''}
        </div>
      </div>
      {!isSelected && (
        <Button size="sm" variant="outline" onClick={onSelect}>Ativar</Button>
      )}
      <button onClick={onEdit} title="Editar"
        style={{ padding: '0.3rem', background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer', display: 'flex', opacity: hover ? 1 : 0.5 }}>
        <Edit2 size={14} />
      </button>
      <button onClick={onDelete} title="Remover"
        style={{ padding: '0.3rem', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', opacity: hover ? 1 : 0.5 }}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// Paleta padrão de clubes brasileiros — atalho pra o coach não precisar
// abrir color picker se a cor dele já está aqui.
const CLUB_COLOR_PRESETS = [
  { name: 'TactiPlan',  hex: '#2563eb' },
  { name: 'Vermelho',   hex: '#e11d48' },
  { name: 'Verde',      hex: '#15803d' },
  { name: 'Preto',      hex: '#111827' },
  { name: 'Amarelo',    hex: '#facc15' },
  { name: 'Roxo',       hex: '#7c3aed' },
  { name: 'Laranja',    hex: '#ea580c' },
  { name: 'Tricolor',   hex: '#0e7490' },
];

function ClubFormModal({ isOpen, editing, onClose, onSave }) {
  const { colors } = useTheme();
  const [form, setForm] = useState({ name: '', description: '', modality: 'football_11', primary_color: '', secondary_color: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      name: editing?.name || '',
      description: editing?.description || '',
      modality: editing?.modality || 'football_11',
      primary_color: editing?.primary_color || '',
      secondary_color: editing?.secondary_color || '',
    });
    setError('');
  }, [isOpen, editing?.id]);

  async function handleSubmit() {
    if (!form.name.trim()) { setError('Informe o nome do clube'); return; }
    // Valida formato HEX se informado
    const HEX_RE = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
    if (form.primary_color && !HEX_RE.test(form.primary_color)) {
      setError('Cor primária em formato inválido (use #RRGGBB)'); return;
    }
    if (form.secondary_color && !HEX_RE.test(form.secondary_color)) {
      setError('Cor secundária em formato inválido (use #RRGGBB)'); return;
    }
    setSaving(true); setError('');
    try {
      await onSave({
        name: form.name.trim(),
        description: form.description.trim(),
        modality: form.modality,
        primary_color: form.primary_color || null,
        secondary_color: form.secondary_color || null,
      });
    } catch (err) {
      setError(err?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  const modalityOptions = MODALITIES.map((m) => ({ value: m, label: MODALITY_LABELS[m] }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Editar clube' : 'Novo clube'}
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving} icon={<Check size={14} />}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <Input
          label="Nome do clube"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Ex.: Uberlândia E.C., Time da Escolinha..."
          fullWidth
          required
        />
        <Select
          label="Modalidade"
          value={form.modality}
          onChange={(e) => setForm({ ...form, modality: e.target.value })}
          options={modalityOptions}
          fullWidth
        />
        <Input
          label="Descrição (opcional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Sub-15 masculino · Profissional · etc."
          fullWidth
        />

        {/* Cores do clube (tema da UI + PDFs). Com Personalização salva, as cores ficam lá. */}
        {editing?.branding && Object.keys(editing.branding).length > 0 ? (
          <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textSecondary }}>
            As cores deste clube são definidas em{' '}
            <Link to="/settings/personalizacao" onClick={onClose} style={{ color: colors.primary, fontWeight: 600 }}>Personalização</Link>.
          </p>
        ) : (
        <div>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: colors.text, marginBottom: '0.4rem' }}>
            Cor primária
          </label>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', color: colors.textSecondary }}>
            Pinta botões, abas e os PDFs gerados. Deixe vazio pra usar a cor padrão TactiPlan.
          </p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            {CLUB_COLOR_PRESETS.map((p) => (
              <button
                key={p.hex}
                type="button"
                onClick={() => setForm({ ...form, primary_color: p.hex })}
                title={`${p.name} · ${p.hex}`}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  backgroundColor: p.hex,
                  border: form.primary_color?.toLowerCase() === p.hex.toLowerCase()
                    ? `3px solid ${colors.text}`
                    : `2px solid ${colors.border}`,
                  cursor: 'pointer', padding: 0,
                }}
              />
            ))}
            <button
              type="button"
              onClick={() => setForm({ ...form, primary_color: '' })}
              title="Limpar (usar padrão)"
              style={{
                width: 28, height: 28, borderRadius: '50%',
                backgroundColor: 'transparent',
                border: `2px dashed ${colors.border}`,
                cursor: 'pointer', padding: 0, color: colors.textSecondary,
                fontSize: '0.7rem', fontWeight: 700,
              }}
            >×</button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="color"
              value={form.primary_color || '#2563eb'}
              onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              style={{ width: 40, height: 32, border: `1px solid ${colors.border}`, borderRadius: '0.3rem', cursor: 'pointer', padding: 2 }}
            />
            <Input
              value={form.primary_color}
              onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              placeholder="#2563eb"
              fullWidth
            />
          </div>
        </div>
        )}

        {error && (
          <div style={{ color: '#ef4444', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
