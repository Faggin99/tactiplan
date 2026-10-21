import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, Lock, Search } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useClub } from '../contexts/ClubContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { trainingService } from '../services/trainingService';
import { Modal } from '../components/common/Modal';
import { Select } from '../components/common/Select';
import { Input } from '../components/common/Input';
import { Textarea } from '../components/common/Textarea';
import { Button } from '../components/common/Button';

export function SubcontentsConfigPage() {
  const { colors } = useTheme();
  const { selectedClub } = useClub();
  const modality = selectedClub?.modality || 'football_11';
  const isMobile = useIsMobile();
  const [contents, setContents] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterContent, setFilterContent] = useState('all');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ content_id: '', name: '', description: '', display_order: 999 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        trainingService.getContents(),
        trainingService.getStages(null, modality),
      ]);
      setContents(c?.data || []);
      setStages(s?.data || []);
    } catch (err) {
      console.error('load stages error', err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setError('');
    setForm({
      content_id: filterContent !== 'all' ? filterContent : (contents[0]?.id || ''),
      name: '',
      description: '',
      display_order: 999,
    });
    setShowModal(true);
  }

  function openEdit(stage) {
    if (!stage.tenant_id) return; // globais não editáveis
    setEditing(stage);
    setError('');
    setForm({
      content_id: stage.content_id,
      name: stage.name,
      description: stage.description || '',
      display_order: stage.display_order ?? 999,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.content_id || !form.name.trim()) {
      setError('Preencha conteúdo e nome');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await trainingService.updateStage(editing.id, form);
      } else {
        await trainingService.createStage(form);
      }
      setShowModal(false);
      await loadData();
    } catch (err) {
      setError(err?.message || 'Erro ao salvar subconteúdo');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(stage) {
    try {
      await trainingService.deleteStage(stage.id);
      setConfirmDelete(null);
      await loadData();
    } catch (err) {
      alert('Erro ao remover: ' + (err?.message || 'desconhecido'));
    }
  }

  const grouped = useMemo(() => {
    const byContent = new Map();
    const filtered = stages.filter((s) => {
      if (filterContent !== 'all' && s.content_id !== filterContent) return false;
      if (searchTerm && !s.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
    for (const s of filtered) {
      const key = s.content_id || 'sem-conteudo';
      if (!byContent.has(key)) byContent.set(key, []);
      byContent.get(key).push(s);
    }
    return byContent;
  }, [stages, filterContent, searchTerm]);

  const contentName = (id) => contents.find((c) => c.id === id)?.name || '—';

  const pageStyle = { padding: isMobile ? '1rem' : '1.5rem 2rem', width: '100%' };
  const headerStyle = {
    display: 'flex', justifyContent: 'space-between', flexDirection: isMobile ? 'column' : 'row',
    alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '0.75rem' : 0, marginBottom: '2rem',
  };
  const titleStyle = { fontSize: isMobile ? '1.25rem' : '1.875rem', fontWeight: 700, color: colors.text };
  const addButtonStyle = {
    display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1rem',
    backgroundColor: colors.primary, color: colors.primaryText, border: 'none', borderRadius: '0.375rem',
    fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer',
  };
  const filtersStyle = {
    display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1rem', marginBottom: '1.5rem',
    flexWrap: 'wrap', alignItems: isMobile ? 'stretch' : 'center',
  };
  const searchBoxStyle = { flex: 1, minWidth: isMobile ? '100%' : 250, position: 'relative' };
  const searchInputStyle = {
    width: '100%', padding: '0.625rem 0.625rem 0.625rem 2.5rem', backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`, borderRadius: '0.375rem', color: colors.text, fontSize: '0.875rem',
  };
  const searchIconStyle = { position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: colors.textSecondary };
  const groupStyle = {
    backgroundColor: colors.surface, border: `1px solid ${colors.border}`,
    borderRadius: '0.5rem', overflow: 'hidden', marginBottom: '1rem',
  };
  const groupHeaderStyle = {
    padding: '0.75rem 1rem', backgroundColor: colors.background,
    borderBottom: `1px solid ${colors.border}`, fontSize: '0.875rem', fontWeight: 600, color: colors.text,
  };
  const rowStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.625rem 1rem', borderBottom: `1px solid ${colors.border}`,
  };
  const iconBtn = (variant) => ({
    padding: '0.4rem', backgroundColor: 'transparent', border: 'none', borderRadius: '0.25rem',
    color: variant === 'danger' ? '#ef4444' : colors.text, cursor: 'pointer',
    display: 'flex', alignItems: 'center',
  });

  if (loading) {
    return <div style={{ padding: '4rem 2rem', textAlign: 'center', color: colors.textSecondary }}>Carregando...</div>;
  }

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <h1 style={titleStyle}>Subconteúdos</h1>
          <p style={{ color: colors.textSecondary, fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Subdivisões de cada Conteúdo (momento de jogo). Subconteúdos padrão são globais e não editáveis — você pode adicionar os seus.
          </p>
        </div>
        <button style={addButtonStyle} onClick={openCreate}>
          <Plus size={18} /> Novo Subconteúdo
        </button>
      </div>

      <div style={filtersStyle}>
        <div style={searchBoxStyle}>
          <Search size={18} style={searchIconStyle} />
          <input
            type="text"
            placeholder="Buscar subconteúdo..."
            style={searchInputStyle}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select
          value={filterContent}
          onChange={(e) => setFilterContent(e.target.value)}
          options={[
            { value: 'all', label: 'Todos os conteúdos' },
            ...contents.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </div>

      {grouped.size === 0 ? (
        <div style={{ ...groupStyle, padding: '2rem', textAlign: 'center', color: colors.textSecondary }}>
          Nenhum subconteúdo encontrado.
        </div>
      ) : (
        contents
          .filter((c) => grouped.has(c.id))
          .map((c) => (
            <div key={c.id} style={groupStyle}>
              <div style={groupHeaderStyle}>{c.name}</div>
              {grouped.get(c.id).map((s) => {
                const isGlobal = !s.tenant_id;
                return (
                  <div key={s.id} style={rowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, color: colors.text, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {s.name}
                        {isGlobal && (
                          <span title="Subconteúdo padrão (não editável)" style={{ color: colors.textSecondary, display: 'inline-flex' }}>
                            <Lock size={12} />
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginTop: '0.125rem' }}>
                          {s.description}
                        </div>
                      )}
                    </div>
                    {!isGlobal && (
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button style={iconBtn()} onClick={() => openEdit(s)} title="Editar"><Edit2 size={16} /></button>
                        <button style={iconBtn('danger')} onClick={() => setConfirmDelete(s)} title="Remover"><Trash2 size={16} /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Editar Subconteúdo' : 'Novo Subconteúdo'}
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: colors.text, marginBottom: '0.375rem' }}>
              Conteúdo *
            </label>
            <Select
              value={form.content_id}
              onChange={(e) => setForm({ ...form, content_id: e.target.value })}
              options={contents.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Selecione o conteúdo"
              fullWidth
            />
          </div>
          <Input
            label="Nome *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ex.: Construção pelo meio"
          />
          <Textarea
            label="Descrição (opcional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Quando e como usar esse subconteúdo"
            rows={3}
          />
          <Input
            label="Ordem de exibição"
            type="number"
            value={form.display_order}
            onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value, 10) || 0 })}
          />
          {error && <div style={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</div>}
        </div>
      </Modal>

      <Modal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Remover Subconteúdo"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => handleDelete(confirmDelete)}>Remover</Button>
          </div>
        }
      >
        <p style={{ color: colors.text }}>
          Remover o subconteúdo <strong>{confirmDelete?.name}</strong>? Atividades já criadas continuam com o nome registrado, mas perdem a ligação com este subconteúdo.
        </p>
      </Modal>
    </div>
  );
}
