import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, Search, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useClub } from '../contexts/ClubContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { trainingService } from '../services/trainingService';
import { Modal } from '../components/common/Modal';
import { Input } from '../components/common/Input';
import { Textarea } from '../components/common/Textarea';
import { Button } from '../components/common/Button';
import { Select } from '../components/common/Select';

const DIMENSIONS = [
  { key: 'tatico',  label: 'Tático',  color: '#3b82f6', description: 'Momentos do jogo: OO, OD, transições, bola parada' },
  { key: 'fisico',  label: 'Físico',  color: '#f59e0b', description: 'Capacidades físicas: aeróbio, anaeróbio, força' },
  { key: 'tecnico', label: 'Técnico', color: '#a855f7', description: 'Gestos técnicos: passe, recepção, drible, finalização' },
  { key: 'mental',  label: 'Mental',  color: '#10b981', description: 'Aspectos psicossociais e atividades recreativas' },
];

export function ContentsConfigPage() {
  const { colors } = useTheme();
  const { selectedClub } = useClub();
  const modality = selectedClub?.modality || 'football_11';
  const isMobile = useIsMobile();
  const [contents, setContents] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('tatico');
  const [search, setSearch] = useState('');

  const [showNewContent, setShowNewContent] = useState(false);
  const [editingContent, setEditingContent] = useState(null);
  const [confirmDeleteContent, setConfirmDeleteContent] = useState(null);
  const [submomentForm, setSubmomentForm] = useState(null);
  const [confirmDeleteSub, setConfirmDeleteSub] = useState(null);

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
      console.error('load contents error', err);
    } finally {
      setLoading(false);
    }
  }

  const stagesByContent = useMemo(() => {
    const m = new Map();
    for (const s of stages) {
      if (!m.has(s.content_id)) m.set(s.content_id, []);
      m.get(s.content_id).push(s);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
    return m;
  }, [stages]);

  const dimCounts = useMemo(() => {
    const m = new Map();
    for (const d of DIMENSIONS) m.set(d.key, 0);
    for (const c of contents) {
      if (m.has(c.dimension)) m.set(c.dimension, m.get(c.dimension) + 1);
    }
    return m;
  }, [contents]);

  const dim = DIMENSIONS.find(d => d.key === activeTab);
  const isTatic = activeTab === 'tatico';

  const tabContents = useMemo(() => {
    const filtered = contents
      .filter(c => c.dimension === activeTab)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!search.trim()) return filtered;
    const q = search.toLowerCase();
    return filtered.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if ((c.abbreviation || '').toLowerCase().includes(q)) return true;
      const subs = stagesByContent.get(c.id) || [];
      return subs.some((s) => s.name.toLowerCase().includes(q));
    });
  }, [contents, stagesByContent, activeTab, search]);

  const pageStyle = { padding: isMobile ? '1rem' : '1.5rem 2rem', width: '100%' };
  const headerRowStyle = { marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: '1rem' };
  const titleStyle = { fontSize: isMobile ? '1.25rem' : '1.875rem', fontWeight: 700, color: colors.text };
  const subStyle = { color: colors.textSecondary, fontSize: '0.875rem', marginTop: '0.25rem' };

  const newBtnStyle = {
    display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.5rem 1rem', backgroundColor: colors.primary, color: colors.primaryText,
    border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  if (loading) {
    return <div style={{ padding: '4rem 2rem', textAlign: 'center', color: colors.textSecondary }}>Carregando...</div>;
  }

  return (
    <div style={pageStyle}>
      <div style={headerRowStyle}>
        <div>
          <h1 style={titleStyle}>Conteúdos</h1>
          <p style={subStyle}>
            Pilares são fixos. Conteúdos padrão podem ser <strong>ativados/desativados</strong> mas não editados.
            Os seus conteúdos personalizados podem ser editados e removidos. Submomentos (só em Tático) são editáveis.
          </p>
        </div>
        <button style={newBtnStyle} onClick={() => setShowNewContent(true)}>
          <Plus size={18} /> Novo Conteúdo
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${colors.border}`,
        marginBottom: '1rem',
        flexWrap: 'wrap',
      }}>
        {DIMENSIONS.map((d) => {
          const active = d.key === activeTab;
          return (
            <button
              key={d.key}
              onClick={() => { setActiveTab(d.key); setSearch(''); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.65rem 1rem',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? d.color : 'transparent'}`,
                marginBottom: '-1px',
                color: active ? colors.text : colors.textSecondary,
                fontSize: '0.875rem',
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: d.color }} />
              {d.label}
              <span style={{ fontSize: '0.7rem', color: colors.textSecondary, fontWeight: 500 }}>
                {dimCounts.get(d.key) || 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Descrição + busca */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.875rem', flexWrap: 'wrap' }}>
        <p style={{ fontSize: '0.8rem', color: colors.textSecondary, margin: 0, flex: 1 }}>
          {dim?.description}
        </p>
        <div style={{ position: 'relative', flex: '0 0 260px' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: colors.textSecondary, pointerEvents: 'none' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isTatic ? 'Buscar conteúdo ou submomento…' : 'Buscar conteúdo…'}
            style={{
              width: '100%',
              padding: '0.4rem 0.625rem 0.4rem 2rem',
              fontSize: '0.825rem',
              backgroundColor: colors.surface,
              color: colors.text,
              border: `1px solid ${colors.border}`,
              borderRadius: '0.375rem',
              outline: 'none',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: colors.textSecondary, cursor: 'pointer', padding: '0.2rem' }}
              aria-label="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Lista densa */}
      {tabContents.length === 0 ? (
        <div style={{
          padding: '2rem 1rem',
          textAlign: 'center',
          color: colors.textSecondary,
          fontSize: '0.875rem',
          backgroundColor: colors.surface,
          border: `1px dashed ${colors.border}`,
          borderRadius: '0.5rem',
        }}>
          {search ? `Nada encontrado pra "${search}".` : 'Nenhum conteúdo neste pilar.'}
        </div>
      ) : (
        <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '0.5rem', overflow: 'hidden' }}>
          {tabContents.map((c, i) => (
            <ContentRow
              key={c.id}
              content={c}
              stages={stagesByContent.get(c.id) || []}
              dim={dim}
              isTatic={isTatic}
              isLast={i === tabContents.length - 1}
              colors={colors}
              onEditContent={setEditingContent}
              onDeleteContent={setConfirmDeleteContent}
              onAddSub={(contentId) => setSubmomentForm({ contentId, editing: null })}
              onEditSub={(contentId, sub) => setSubmomentForm({ contentId, editing: sub })}
              onDeleteSub={setConfirmDeleteSub}
              onToggleContent={async (content, active) => {
                try {
                  await trainingService.toggleContentActive(content.id, active);
                  loadData();
                } catch (err) {
                  alert('Erro ao alternar: ' + (err?.message || ''));
                }
              }}
              onToggleStage={async (stage, active) => {
                try {
                  await trainingService.toggleStageActive(stage.id, active);
                  loadData();
                } catch (err) {
                  alert('Erro ao alternar: ' + (err?.message || ''));
                }
              }}
            />
          ))}
        </div>
      )}

      <NewContentModal
        isOpen={showNewContent || !!editingContent}
        editing={editingContent}
        defaultDimension={activeTab}
        onClose={() => { setShowNewContent(false); setEditingContent(null); }}
        onSaved={() => { setShowNewContent(false); setEditingContent(null); loadData(); }}
        colors={colors}
      />

      <SubmomentFormModal
        state={submomentForm}
        onClose={() => setSubmomentForm(null)}
        onSaved={() => { setSubmomentForm(null); loadData(); }}
      />

      <Modal
        isOpen={!!confirmDeleteSub}
        onClose={() => setConfirmDeleteSub(null)}
        title="Remover Submomento"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={() => setConfirmDeleteSub(null)}>Cancelar</Button>
            <Button variant="danger" onClick={async () => {
              try {
                await trainingService.deleteStage(confirmDeleteSub.id);
                setConfirmDeleteSub(null);
                loadData();
              } catch (err) {
                alert('Erro ao remover: ' + (err?.message || ''));
              }
            }}>Remover</Button>
          </div>
        }
      >
        <p style={{ color: colors.text }}>
          Remover <strong>{confirmDeleteSub?.name}</strong>? Atividades que o usavam perdem a ligação (o resto fica intacto).
        </p>
      </Modal>

      <Modal
        isOpen={!!confirmDeleteContent}
        onClose={() => setConfirmDeleteContent(null)}
        title="Remover Conteúdo"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={() => setConfirmDeleteContent(null)}>Cancelar</Button>
            <Button variant="danger" onClick={async () => {
              try {
                await trainingService.deleteContent(confirmDeleteContent.id);
                setConfirmDeleteContent(null);
                loadData();
              } catch (err) {
                alert('Erro ao remover: ' + (err?.message || ''));
              }
            }}>Remover</Button>
          </div>
        }
      >
        <p style={{ color: colors.text }}>
          Remover <strong>{confirmDeleteContent?.name}</strong>? Os submomentos personalizados dele também serão removidos.
        </p>
      </Modal>
    </div>
  );
}

function ContentRow({ content, stages, dim, isTatic, isLast, colors, onEditContent, onDeleteContent, onAddSub, onEditSub, onDeleteSub, onToggleContent, onToggleStage }) {
  const isCustom = !!content.tenant_id;
  const isActive = content.active !== false;
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '0.75rem 1rem',
        borderBottom: isLast ? 'none' : `1px solid ${colors.border}`,
        backgroundColor: hover ? colors.surfaceHover || colors.background : 'transparent',
        opacity: isActive ? 1 : 0.5,
        transition: 'background-color 0.12s, opacity 0.12s',
      }}
    >
      {/* Linha principal: switch + nome + abrev + ações */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Switch
          checked={isActive}
          onChange={() => onToggleContent(content, !isActive)}
          color={dim.color}
          colors={colors}
          title={isActive
            ? 'Ativo — clique pra desativar (não aparece no cadastro de atividades)'
            : 'Inativo — clique pra reativar'}
        />
        <span style={{
          fontSize: '0.925rem', fontWeight: 600, color: colors.text,
          textDecoration: isActive ? 'none' : 'line-through',
        }}>{content.name}</span>
        {content.abbreviation && (
          <span style={{ fontSize: '0.7rem', color: colors.textSecondary, fontWeight: 500 }}>
            · {content.abbreviation}
          </span>
        )}
        {!isCustom && (
          <span style={{ fontSize: '0.62rem', color: colors.textSecondary, padding: '0.05rem 0.4rem', backgroundColor: `${dim.color}1A`, borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
            Padrão
          </span>
        )}
        <div style={{ flex: 1 }} />
        {isTatic && isActive && (
          <button
            onClick={() => onAddSub(content.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
              padding: '0.25rem 0.5rem',
              background: 'transparent',
              border: `1px solid ${colors.border}`,
              borderRadius: '0.3rem',
              color: colors.textSecondary,
              fontSize: '0.72rem',
              fontWeight: 500,
              cursor: 'pointer',
              opacity: hover ? 1 : 0.6,
              transition: 'opacity 0.15s',
            }}
            title="Adicionar submomento personalizado"
          >
            <Plus size={11} /> Submomento
          </button>
        )}
        {/* Conteúdos PADRÃO não podem ser editados — só ativados/desativados pelo switch.
            Apenas os personalizados (criados pelo treinador) têm edição e remoção. */}
        {isCustom && (
          <>
            <button
              onClick={() => onEditContent(content)}
              title="Editar conteúdo"
              style={{ padding: '0.3rem', background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer', display: 'flex', opacity: hover ? 1 : 0.4, transition: 'opacity 0.15s' }}
            >
              <Edit2 size={13} />
            </button>
            <button
              onClick={() => onDeleteContent(content)}
              title="Remover conteúdo"
              style={{ padding: '0.3rem', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', opacity: hover ? 1 : 0.4, transition: 'opacity 0.15s' }}
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>

      {/* Submomentos inline (só táticos) */}
      {isTatic && stages.length > 0 && (
        <div style={{ marginTop: '0.4rem', paddingLeft: '2.6rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.15rem', fontSize: '0.8rem', color: colors.textSecondary, lineHeight: 1.85 }}>
          {stages.map((s, idx) => (
            <SubmomentText
              key={s.id}
              stage={s}
              colors={colors}
              dimColor={dim.color}
              showSeparator={idx < stages.length - 1}
              onEdit={() => onEditSub(content.id, s)}
              onDelete={() => onDeleteSub(s)}
              onToggle={() => onToggleStage(s, !(s.active !== false))}
            />
          ))}
        </div>
      )}
      {isTatic && stages.length === 0 && (
        <div style={{ marginTop: '0.3rem', paddingLeft: '2.6rem', fontSize: '0.75rem', color: colors.textSecondary, fontStyle: 'italic' }}>
          sem submomentos
        </div>
      )}
    </div>
  );
}

function Switch({ checked, onChange, color, colors, title }) {
  return (
    <button
      type="button"
      onClick={onChange}
      title={title}
      role="switch"
      aria-checked={checked}
      style={{
        position: 'relative',
        width: 30, height: 16,
        borderRadius: 999,
        backgroundColor: checked ? color : colors.border,
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
        transition: 'background-color 0.15s',
      }}
    >
      <span style={{
        position: 'absolute',
        top: 2,
        left: checked ? 16 : 2,
        width: 12, height: 12,
        borderRadius: '50%',
        backgroundColor: '#fff',
        transition: 'left 0.15s',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

function SubmomentText({ stage, colors, dimColor, showSeparator, onEdit, onDelete, onToggle }) {
  const isCustom = !!stage.tenant_id;
  const isActive = stage.active !== false;
  const [hover, setHover] = useState(false);
  return (
    <>
      <span
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
          color: hover ? colors.text : colors.textSecondary,
          opacity: isActive ? 1 : 0.4,
          textDecoration: isActive ? 'none' : 'line-through',
          transition: 'color 0.12s, opacity 0.12s',
        }}
      >
        <span>{stage.name}</span>
        <span style={{ display: 'inline-flex', gap: '0.1rem', marginLeft: '0.1rem', opacity: hover ? 1 : 0, transition: 'opacity 0.15s' }}>
          <button onClick={onToggle} title={isActive ? 'Desativar' : 'Reativar'}
            style={{ padding: 0, background: 'transparent', border: 'none', color: isActive ? colors.textSecondary : dimColor, cursor: 'pointer', display: 'flex' }}>
            {isActive ? <X size={11} /> : <Plus size={11} />}
          </button>
          <button onClick={onEdit} title="Editar (globais geram cópia sua)"
            style={{ padding: 0, background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer', display: 'flex' }}>
            <Edit2 size={11} />
          </button>
          {isCustom && (
            <button onClick={onDelete} title="Remover"
              style={{ padding: 0, background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex' }}>
              <Trash2 size={11} />
            </button>
          )}
        </span>
      </span>
      {showSeparator && <span style={{ color: colors.textSecondary, opacity: 0.5, margin: '0 0.35rem' }}>·</span>}
    </>
  );
}

function NewContentModal({ isOpen, editing, defaultDimension, onClose, onSaved, colors }) {
  const [form, setForm] = useState({ name: '', abbreviation: '', description: '', dimension: defaultDimension || 'tatico' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setForm(editing
        ? { name: editing.name || '', abbreviation: editing.abbreviation || '', description: editing.description || '', dimension: editing.dimension || 'tatico' }
        : { name: '', abbreviation: '', description: '', dimension: defaultDimension || 'tatico' });
      setError('');
    }
  }, [isOpen, editing, defaultDimension]);

  async function handleSave() {
    if (!form.name.trim()) { setError('Informe o nome'); return; }
    setSaving(true);
    try {
      if (editing) await trainingService.updateContent(editing.id, form);
      else await trainingService.createContent(form);
      onSaved?.();
    } catch (err) {
      setError(err?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Editar Conteúdo' : 'Novo Conteúdo'}
      size="sm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : (editing ? 'Salvar' : 'Criar')}</Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Select
          label="Pilar *"
          fullWidth
          options={DIMENSIONS.map(d => ({ value: d.key, label: d.label }))}
          value={form.dimension}
          onChange={(e) => setForm({ ...form, dimension: e.target.value })}
          disabled={!!editing}
        />
        <Input label="Nome *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Saída de Bola" />
        <Input label="Abreviação (opcional)" value={form.abbreviation} onChange={(e) => setForm({ ...form, abbreviation: e.target.value })} placeholder="Ex.: SB" maxLength={20} />
        <Textarea label="Descrição (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        {error && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{error}</div>}
        {form.dimension !== 'tatico' && !editing && (
          <div style={{ fontSize: '0.75rem', color: colors.textSecondary, padding: '0.5rem 0.625rem', backgroundColor: colors.background, borderRadius: '0.375rem', border: `1px solid ${colors.border}` }}>
            Conteúdos não-táticos não têm submomentos.
          </div>
        )}
      </div>
    </Modal>
  );
}

function SubmomentFormModal({ state, onClose, onSaved }) {
  const editing = state?.editing || null;
  const contentId = state?.contentId;
  const [form, setForm] = useState({ name: '', description: '', display_order: 999 });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    setForm(editing
      ? { name: editing.name || '', description: editing.description || '', display_order: editing.display_order ?? 999 }
      : { name: '', description: '', display_order: 999 });
    setError('');
  }, [state, editing]);

  async function handleSave() {
    if (!form.name.trim()) { setError('Informe o nome'); return; }
    setSaving(true);
    try {
      if (editing) await trainingService.updateStage(editing.id, form);
      else await trainingService.createStage({ ...form, content_id: contentId });
      onSaved?.();
    } catch (err) {
      setError(err?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={!!state}
      onClose={onClose}
      title={editing ? 'Editar Submomento' : 'Novo Submomento'}
      size="sm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Input label="Nome *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: 1ª Fase de Construção" />
        <Textarea label="Descrição (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Quando e como usar..." />
        <Input label="Ordem" type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value, 10) || 0 })} />
        {error && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{error}</div>}
      </div>
    </Modal>
  );
}
