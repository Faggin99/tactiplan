import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Users, X, Lock, Crown } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useClub } from '../contexts/ClubContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { categoryService } from '../services/categoryService';
import { Modal } from '../components/common/Modal';
import { Input } from '../components/common/Input';
import { Textarea } from '../components/common/Textarea';
import { Button } from '../components/common/Button';
import { NOME_CLUBE } from '../config/planos';

const SUGGESTED_AGE_GROUPS = ['Sub-6','Sub-7','Sub-8','Sub-9','Sub-10','Sub-11','Sub-12','Sub-13','Sub-14','Sub-15','Sub-17','Sub-20','Profissional','Master'];

export function CategoriesConfigPage() {
  const { colors } = useTheme();
  const { selectedClub, clubs } = useClub();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const plan = usePlanFeatures();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Sem multi_user (assinatura antiga do Essencial): edita a categoria existente, mas não cria outra.
  const canCreateMore = plan.multi_user || categories.length === 0;
  const showPaywall = !plan.multi_user && categories.length >= 1;

  const load = useCallback(async () => {
    if (!selectedClub?.id) { setCategories([]); setLoading(false); return; }
    setLoading(true);
    try {
      const list = await categoryService.listByClub(selectedClub.id);
      setCategories(list);
    } catch (err) {
      console.error('load categories', err);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [selectedClub?.id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    try {
      if (editingCategory) {
        await categoryService.update(editingCategory.id, form);
      } else {
        await categoryService.create({ ...form, club_id: selectedClub.id });
      }
      setShowForm(false);
      setEditingCategory(null);
      await load();
    } catch (err) {
      alert('Erro ao salvar: ' + (err?.message || ''));
    }
  };

  const handleDelete = async (id) => {
    try {
      await categoryService.remove(id);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      alert('Erro ao remover: ' + (err?.message || ''));
    }
  };

  const pageStyle = { padding: isMobile ? '1rem' : '1.5rem 2rem', width: '100%' };
  const headerRowStyle = {
    marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between',
    flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: '1rem',
  };

  if (!clubs || clubs.length === 0) {
    return (
      <div style={pageStyle}>
        <div style={{ padding: '2rem 1rem', textAlign: 'center', color: colors.textSecondary }}>
          Cadastre um clube primeiro pra usar categorias.
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={headerRowStyle}>
        <div>
          <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.875rem', fontWeight: 700, color: colors.text, margin: 0 }}>
            Categorias
          </h1>
          <p style={{ color: colors.textSecondary, fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {selectedClub?.name ? `Clube: ${selectedClub.name}. ` : ''}
            Use categorias pra separar atletas e microciclos (Sub-15, Profissional, etc.). Atletas sem categoria continuam visíveis pra todo o clube.
          </p>
        </div>
        <button
          onClick={() => {
            if (!canCreateMore) {
              navigate('/billing?reason=multi_categories');
              return;
            }
            setEditingCategory(null);
            setShowForm(true);
          }}
          disabled={!selectedClub?.id}
          title={!canCreateMore ? `Disponível no plano ${NOME_CLUBE}` : undefined}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.5rem 1rem',
            backgroundColor: !selectedClub?.id ? colors.border : (canCreateMore ? colors.primary : '#f59e0b'),
            color: colors.primaryText, border: 'none', borderRadius: '0.375rem',
            fontSize: '0.875rem', fontWeight: 500,
            cursor: selectedClub?.id ? 'pointer' : 'not-allowed',
            whiteSpace: 'nowrap',
          }}
        >
          {canCreateMore ? <Plus size={18} /> : <Lock size={16} />}
          {canCreateMore ? 'Nova Categoria' : `Adicionar (plano ${NOME_CLUBE})`}
        </button>
      </div>

      {showPaywall && (
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
            <strong>Várias categorias por clube</strong> são do plano <strong>{NOME_CLUBE}</strong>.
            A assinatura atual desta conta permite uma categoria por clube.
            <div style={{ marginTop: '0.5rem' }}>
              <button
                onClick={() => navigate('/billing')}
                style={{
                  padding: '0.4rem 0.875rem', backgroundColor: '#f59e0b',
                  color: '#fff', border: 'none', borderRadius: '0.375rem',
                  fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Assinar o plano {NOME_CLUBE}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: colors.textSecondary }}>Carregando…</div>
      ) : categories.length === 0 ? (
        <div style={{
          padding: '2.5rem 1.5rem', textAlign: 'center',
          backgroundColor: colors.surface, border: `1px dashed ${colors.border}`,
          borderRadius: '0.5rem', color: colors.textSecondary,
        }}>
          <div style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Nenhuma categoria cadastrada.</div>
          <div style={{ fontSize: '0.8rem' }}>
            Crie categorias como "Sub-15" ou "Profissional" pra organizar atletas e microciclos.
          </div>
        </div>
      ) : (
        <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '0.5rem', overflow: 'hidden' }}>
          {categories.map((c, i) => (
            <CategoryRow
              key={c.id}
              category={c}
              isLast={i === categories.length - 1}
              colors={colors}
              onEdit={() => { setEditingCategory(c); setShowForm(true); }}
              onDelete={() => setConfirmDelete(c)}
            />
          ))}
        </div>
      )}

      <CategoryFormModal
        isOpen={showForm}
        editing={editingCategory}
        onClose={() => { setShowForm(false); setEditingCategory(null); }}
        onSave={handleSave}
      />

      <Modal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Remover Categoria"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => handleDelete(confirmDelete.id)}>Remover</Button>
          </div>
        }
      >
        <p style={{ color: colors.text }}>
          Remover <strong>{confirmDelete?.name}</strong>?
          {Number(confirmDelete?.athletes_count) > 0 && (
            <> Os {confirmDelete.athletes_count} atletas vinculados ficarão sem categoria.</>
          )}
        </p>
      </Modal>
    </div>
  );
}

function CategoryRow({ category, isLast, colors, onEdit, onDelete }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '0.75rem 1rem',
        borderBottom: isLast ? 'none' : `1px solid ${colors.border}`,
        backgroundColor: hover ? colors.background : 'transparent',
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        transition: 'background-color 0.12s',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 600, color: colors.text }}>{category.name}</span>
          {category.age_group && (
            <span style={{ fontSize: '0.7rem', color: colors.textSecondary, fontWeight: 500 }}>· {category.age_group}</span>
          )}
        </div>
        <div style={{ fontSize: '0.72rem', color: colors.textSecondary, marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <Users size={11} /> {category.athletes_count || 0} atleta{Number(category.athletes_count) !== 1 ? 's' : ''}
        </div>
        {category.notes && (
          <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: 4, fontStyle: 'italic' }}>{category.notes}</div>
        )}
      </div>
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

function CategoryFormModal({ isOpen, editing, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', age_group: '', display_order: 0, notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      setForm({
        name: editing.name || '',
        age_group: editing.age_group || '',
        display_order: editing.display_order ?? 0,
        notes: editing.notes || '',
      });
    } else {
      setForm({ name: '', age_group: '', display_order: 0, notes: '' });
    }
    setError('');
  }, [isOpen, editing]);

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Informe um nome'); return; }
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        age_group: form.age_group?.trim() || null,
        display_order: Number(form.display_order) || 0,
        notes: form.notes?.trim() || null,
      });
    } catch (err) {
      setError(err?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Editar Categoria' : 'Nova Categoria'}
      size="sm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Input
          label="Nome *"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Ex.: Sub-15 Tarde"
          fullWidth
        />
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'currentColor', marginBottom: '0.4rem' }}>
            Categoria etária
          </label>
          <input
            list="age-group-suggestions"
            value={form.age_group}
            onChange={(e) => setForm({ ...form, age_group: e.target.value })}
            placeholder="Ex.: Sub-15"
            style={{
              width: '100%', padding: '0.55rem 0.7rem',
              borderRadius: '0.375rem',
              border: '1px solid rgba(0,0,0,0.15)',
              fontSize: '0.875rem',
              backgroundColor: 'transparent',
              color: 'inherit',
            }}
          />
          <datalist id="age-group-suggestions">
            {SUGGESTED_AGE_GROUPS.map(g => <option key={g} value={g} />)}
          </datalist>
        </div>
        <Input
          label="Ordem (opcional)"
          type="number"
          value={form.display_order}
          onChange={(e) => setForm({ ...form, display_order: e.target.value })}
          fullWidth
        />
        <Textarea
          label="Observações"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          placeholder="Treinador responsável, horário, anotações…"
          fullWidth
        />
        {error && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{error}</div>}
      </div>
    </Modal>
  );
}
