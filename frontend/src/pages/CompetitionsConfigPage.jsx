import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Trophy, Archive, X, Download } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useClub } from '../contexts/ClubContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { Modal } from '../components/common/Modal';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { competitionService } from '../services/competitionService';
import { externalApiService } from '../services/externalApiService';
import { ImportFixturesModal } from '../components/competitions/ImportFixturesModal';

const FORMAT_SUGGESTIONS = ['Pontos corridos', 'Mata-mata', 'Grupos + playoffs', 'Liga + Copa', 'Amistosos'];

export function CompetitionsConfigPage() {
  const { colors } = useTheme();
  const { selectedClub, clubs } = useClub();
  const isMobile = useIsMobile();

  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [externalEnabled, setExternalEnabled] = useState(false);
  const [importTarget, setImportTarget] = useState(null); // competição alvo do import

  // Detecta se a integração externa (api-football) está disponível no backend.
  useEffect(() => {
    let cancelled = false;
    externalApiService.isApiFootballEnabled().then((enabled) => {
      if (!cancelled) setExternalEnabled(enabled);
    });
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    if (!selectedClub?.id) { setCompetitions([]); setLoading(false); return; }
    setLoading(true);
    try {
      const list = await competitionService.list({ clubId: selectedClub.id, includeArchived: showArchived });
      setCompetitions(list || []);
    } catch (err) {
      console.error('load competitions', err);
      setCompetitions([]);
    } finally {
      setLoading(false);
    }
  }, [selectedClub?.id, showArchived]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form) {
    try {
      const payload = { ...form, club_id: selectedClub.id };
      if (editing) await competitionService.update(editing.id, payload);
      else         await competitionService.create(payload);
      setShowForm(false); setEditing(null);
      await load();
    } catch (err) {
      alert('Erro ao salvar: ' + (err?.message || ''));
    }
  }

  async function handleDelete(id) {
    try {
      await competitionService.remove(id);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      alert('Erro ao remover: ' + (err?.message || ''));
    }
  }

  async function handleArchive(comp) {
    try {
      await competitionService.update(comp.id, { is_archived: !comp.is_archived });
      await load();
    } catch (err) {
      alert('Erro: ' + (err?.message || ''));
    }
  }

  const pageStyle = { padding: isMobile ? '1rem' : '1.5rem 2rem', width: '100%' };

  if (!clubs || clubs.length === 0) {
    return (
      <div style={pageStyle}>
        <div style={{ padding: '2rem 1rem', textAlign: 'center', color: colors.textSecondary }}>
          Cadastre um clube primeiro pra criar campeonatos.
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.875rem', fontWeight: 700, color: colors.text, margin: 0 }}>Campeonatos</h1>
          <p style={{ color: colors.textSecondary, fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {selectedClub?.name && `Clube: ${selectedClub.name}. `}
            Vincule cada jogo a um campeonato pra organizar histórico e estatísticas por competição.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setShowArchived(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.5rem 0.875rem', backgroundColor: 'transparent',
              border: `1px solid ${colors.border}`, borderRadius: '0.375rem',
              color: colors.textSecondary, cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            <Archive size={14} /> {showArchived ? 'Ocultar arquivados' : 'Ver arquivados'}
          </button>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            disabled={!selectedClub?.id}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem', backgroundColor: colors.primary,
              color: colors.primaryText, border: 'none', borderRadius: '0.375rem',
              fontSize: '0.875rem', fontWeight: 500, cursor: selectedClub?.id ? 'pointer' : 'not-allowed',
            }}
          >
            <Plus size={18} /> Novo Campeonato
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: colors.textSecondary }}>Carregando…</div>
      ) : competitions.length === 0 ? (
        <div style={{
          padding: '2.5rem 1.5rem', textAlign: 'center',
          backgroundColor: colors.surface, border: `1px dashed ${colors.border}`,
          borderRadius: '0.5rem', color: colors.textSecondary,
        }}>
          <Trophy size={32} style={{ opacity: 0.6, marginBottom: '0.5rem' }} />
          <div style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Nenhum campeonato cadastrado.</div>
          <div style={{ fontSize: '0.8rem' }}>Crie "Brasileirão Série D 2026", "Campeonato Estadual Sub-15", etc.</div>
        </div>
      ) : (
        <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '0.5rem', overflow: 'hidden' }}>
          {competitions.map((c, i) => (
            <CompetitionRow
              key={c.id}
              comp={c}
              isLast={i === competitions.length - 1}
              colors={colors}
              externalEnabled={externalEnabled}
              onEdit={() => { setEditing(c); setShowForm(true); }}
              onDelete={() => setConfirmDelete(c)}
              onArchive={() => handleArchive(c)}
              onImport={() => setImportTarget(c)}
            />
          ))}
        </div>
      )}

      <CompetitionFormModal
        isOpen={showForm}
        editing={editing}
        onClose={() => { setShowForm(false); setEditing(null); }}
        onSave={handleSave}
      />

      <ImportFixturesModal
        isOpen={!!importTarget}
        competition={importTarget}
        onClose={() => setImportTarget(null)}
        onImported={async () => { setImportTarget(null); await load(); }}
      />

      <Modal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Remover campeonato"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => handleDelete(confirmDelete.id)}>Remover</Button>
          </div>
        }
      >
        <p style={{ color: colors.text }}>
          Remover <strong>{confirmDelete?.name}</strong>? Os jogos vinculados ficarão sem campeonato (não serão apagados).
        </p>
      </Modal>
    </div>
  );
}

function CompetitionRow({ comp, isLast, colors, externalEnabled, onEdit, onDelete, onArchive, onImport }) {
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
        opacity: comp.is_archived ? 0.55 : 1,
      }}
    >
      <Trophy size={18} color={colors.primary} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 600, color: colors.text }}>{comp.name}</span>
          {comp.season && <span style={{ fontSize: '0.72rem', color: colors.textSecondary }}>· {comp.season}</span>}
          {comp.is_archived && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', backgroundColor: '#94a3b820', color: '#94a3b8', borderRadius: 999, fontWeight: 700, textTransform: 'uppercase' }}>Arquivado</span>}
        </div>
        <div style={{ fontSize: '0.72rem', color: colors.textSecondary, marginTop: 2 }}>
          {comp.format && <span>{comp.format}</span>}
          {comp.start_date && <span>{comp.format ? ' · ' : ''}{fmt(comp.start_date)}{comp.end_date ? ` – ${fmt(comp.end_date)}` : ''}</span>}
        </div>
      </div>
      {externalEnabled && !comp.is_archived && (
        <button onClick={onImport} title="Importar jogos do Brasileirão (api-football)"
          style={{ padding: '0.3rem', background: 'transparent', border: 'none', color: colors.primary, cursor: 'pointer', display: 'flex', opacity: hover ? 1 : 0.7 }}>
          <Download size={14} />
        </button>
      )}
      <button onClick={onArchive} title={comp.is_archived ? 'Desarquivar' : 'Arquivar'}
        style={{ padding: '0.3rem', background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer', display: 'flex', opacity: hover ? 1 : 0.5 }}>
        <Archive size={14} />
      </button>
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

function fmt(d) {
  if (!d) return '';
  const [y, m, day] = String(d).split('T')[0].split('-');
  return `${day}/${m}/${y}`;
}

function CompetitionFormModal({ isOpen, editing, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', season: '', format: '', start_date: '', end_date: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      setForm({
        name: editing.name || '',
        season: editing.season || '',
        format: editing.format || '',
        start_date: editing.start_date ? String(editing.start_date).split('T')[0] : '',
        end_date: editing.end_date ? String(editing.end_date).split('T')[0] : '',
      });
    } else {
      setForm({ name: '', season: String(new Date().getFullYear()), format: '', start_date: '', end_date: '' });
    }
    setError('');
  }, [isOpen, editing]);

  async function handleSubmit() {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        season: form.season?.trim() || null,
        format: form.format?.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      });
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
      title={editing ? 'Editar Campeonato' : 'Novo Campeonato'}
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
          placeholder="Ex.: Brasileirão Série D 2026"
          fullWidth
          autoFocus
        />
        <Input
          label="Temporada / Edição"
          value={form.season}
          onChange={(e) => setForm({ ...form, season: e.target.value })}
          placeholder="2026 ou 2025/26"
          fullWidth
        />
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.4rem' }}>
            Formato
          </label>
          <input
            list="comp-format-suggestions"
            value={form.format}
            onChange={(e) => setForm({ ...form, format: e.target.value })}
            placeholder="Ex.: Pontos corridos"
            style={{
              width: '100%', padding: '0.55rem 0.7rem',
              borderRadius: '0.375rem', border: '1px solid rgba(0,0,0,0.15)',
              fontSize: '0.875rem', backgroundColor: 'transparent', color: 'inherit',
            }}
          />
          <datalist id="comp-format-suggestions">
            {FORMAT_SUGGESTIONS.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <Input
            label="Início"
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            fullWidth
          />
          <Input
            label="Fim"
            type="date"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            fullWidth
          />
        </div>
        {error && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{error}</div>}
      </div>
    </Modal>
  );
}
