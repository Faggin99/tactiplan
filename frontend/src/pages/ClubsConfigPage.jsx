// Gestão de clubes dentro da mesma conta (workspace).
// Modelo (21/10/2026): plano Clube = 1 clube ATIVO + arquivados sem limite.
//   - Arquivar: o clube vira só leitura (histórico e relatórios), sai do seletor e libera a vaga.
//   - Desarquivar: só com vaga no limite (o servidor confere: 402 ADDON_REQUIRED).
//   - Clube ativo extra: add-on subscriptions.extra_club_slots (R$20/mês), sem tela de compra:
//     "fale com a gente".
// A conta pode ser de um CLUBE/escolinha ou de uma COMISSÃO TÉCNICA (workspaces.tipo):
// muda só os textos (a comissão muda de time → dica de arquivar).

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import notify from '../lib/notify';
import { Plus, Building2, Edit2, Trash2, Check, AlertCircle, Archive, ArchiveRestore, Eye } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { useClub } from '../contexts/ClubContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { Modal } from '../components/common/Modal';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Button } from '../components/common/Button';
import { MODALITIES, MODALITY_LABELS } from '../lib/sportConfig';
import { clubService } from '../services/clubService';
import { isNative, openExternalUrl } from '../lib/platform';

const CONTATO_CLUBE_EXTRA = 'https://wa.me/5562996359774?text=' + encodeURIComponent('Olá! Quero liberar um clube ativo extra no TactiPlan (R$20/mês).');

export function ClubsConfigPage() {
  const { colors } = useTheme();
  const isMobile = useIsMobile();
  const { clubs, archivedClubs, selectedClub, selectClub, createClub, updateClub, deleteClub, archiveClub, unarchiveClub } = useClub();
  const { activeWorkspace, setWorkspaceTipo } = useWorkspace() || {};
  const comissao = activeWorkspace?.tipo === 'comissao';
  const souDono = !!activeWorkspace?.is_owner;

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState('');
  const [limite, setLimite] = useState(null);
  const [busy, setBusy] = useState(null);

  const carregarLimite = useCallback(() => {
    clubService.getLimit().then(setLimite).catch(() => setLimite(null));
  }, []);
  useEffect(() => { carregarLimite(); }, [carregarLimite, clubs.length]);

  const semLimite = limite && limite.limit === -1;
  const lotado = !!limite && !semLimite && limite.current >= limite.limit;

  function openCreate() {
    if (lotado) {
      setError(`Seu plano permite ${limite.limit} clube${limite.limit === 1 ? '' : 's'} ativo${limite.limit === 1 ? '' : 's'}. `
        + 'Para criar outro, arquive um clube ativo (o histórico fica guardado) ou fale com a gente para liberar um clube extra (R$20/mês por clube).');
      return;
    }
    setEditing(null); setError(''); setShowForm(true);
  }
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
      carregarLimite();
    } catch (err) {
      // Limite de clubes ativos (402 ADDON_REQUIRED): fecha o formulário e mostra o aviso na
      // página. Outros erros (nome repetido…) voltam pro formulário.
      if (err?.code !== 'ADDON_REQUIRED') throw err;
      setShowForm(false);
      setEditing(null);
      setError(err.message || 'Limite de clubes ativos atingido.');
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteClub(confirmDelete.id);
      setConfirmDelete(null);
      carregarLimite();
    } catch (err) {
      notify.error('Erro ao remover clube: ' + (err?.message || ''));
    }
  }

  async function handleArchive(c) {
    const ok = await notify.confirm(
      `Arquivar "${c.name}"?\n\n`
      + 'O clube fica guardado em só leitura: o histórico de treinos, jogos e atletas e os relatórios continuam disponíveis, '
      + 'mas não dá para editar. Ele sai do seletor de clube e deixa de contar no limite de clubes ativos.\n\n'
      + 'Você pode desarquivar depois, se houver vaga no plano.',
      { confirmText: 'Arquivar', cancelText: 'Cancelar' }
    );
    if (!ok) return;
    setBusy(c.id); setError('');
    try {
      await archiveClub(c.id);
      notify.success(`"${c.name}" foi arquivado.`);
      carregarLimite();
    } catch (err) {
      notify.error(err?.message || 'Não foi possível arquivar o clube.');
    } finally { setBusy(null); }
  }

  async function handleUnarchive(c) {
    if (lotado) {
      setError(`Para desarquivar "${c.name}", arquive o clube ativo ou fale com a gente para liberar um clube extra (R$20/mês por clube).`);
      return;
    }
    const ok = await notify.confirm(
      `Desarquivar "${c.name}"?\n\nEle volta a ser um clube ativo (editável) e passa a contar no limite de clubes ativos.`,
      { confirmText: 'Desarquivar', cancelText: 'Cancelar' }
    );
    if (!ok) return;
    setBusy(c.id); setError('');
    try {
      await unarchiveClub(c.id);
      notify.success(`"${c.name}" voltou a ser um clube ativo.`);
      carregarLimite();
    } catch (err) {
      setError(err?.message || 'Não foi possível desarquivar o clube.');
    } finally { setBusy(null); }
  }

  async function trocarTipo(tipo) {
    if (!activeWorkspace?.id || activeWorkspace.tipo === tipo) return;
    try { await setWorkspaceTipo(activeWorkspace.id, tipo); }
    catch (err) { notify.error(err?.message || 'Não foi possível salvar.'); }
  }

  const pageStyle = { padding: isMobile ? '1rem' : '1.5rem 2rem', width: '100%' };
  const listaStyle = { backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '0.5rem', overflow: 'hidden' };
  const n = limite?.limit;
  const textoLimite = !limite ? null
    : semLimite ? `${limite.current} clube${limite.current === 1 ? '' : 's'} ativo${limite.current === 1 ? '' : 's'} · sem limite nesta conta`
    : `Clubes ativos: ${limite.current} de ${n}${limite.extra_slots ? ` (${limite.plan_limit} do plano + ${limite.extra_slots} extra${limite.extra_slots === 1 ? '' : 's'})` : ''}`;

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.875rem', fontWeight: 700, color: colors.text, margin: 0 }}>Clubes</h1>
          <p style={{ color: colors.textSecondary, fontSize: '0.875rem', marginTop: '0.25rem', maxWidth: 680 }}>
            {comissao
              ? 'Os times em que a sua comissão trabalha. Mudou de time? Arquive o anterior: o histórico fica guardado para consulta e não conta no limite.'
              : 'Gerencie os clubes da sua conta. Cada clube tem seu próprio plantel, treinos e estatísticas.'}
            {' '}Conteúdos, submomentos e títulos de atividades são da conta e valem para todos os clubes.
          </p>
        </div>
        <Button onClick={openCreate} icon={<Plus size={18} />}>Novo Clube</Button>
      </div>

      {souDono && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: '0.82rem', color: colors.textSecondary }}>
          <span>Esta conta é de:</span>
          {[['clube', 'Clube / Escolinha'], ['comissao', 'Comissão técnica']].map(([v, rotulo]) => {
            const on = (activeWorkspace?.tipo || 'clube') === v;
            return (
              <button key={v} type="button" onClick={() => trocarTipo(v)} aria-pressed={on}
                style={{ padding: '0.3rem 0.75rem', borderRadius: 999, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${on ? colors.primary : colors.border}`, backgroundColor: on ? `${colors.primary}18` : 'transparent', color: on ? colors.primary : colors.text }}>
                {rotulo}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
          padding: '0.75rem 1rem', marginBottom: '1rem',
          backgroundColor: '#f59e0b15', color: colors.text,
          border: '1px solid #f59e0b40', borderRadius: '0.5rem',
          fontSize: '0.85rem',
        }}>
          <AlertCircle size={16} color="#f59e0b" style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>{error}</div>
          <button type="button" onClick={() => setError('')} aria-label="Fechar aviso" style={{ background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
        </div>
      )}

      {clubs.length === 0 ? (
        <div style={{
          padding: '2.5rem 1.5rem', textAlign: 'center',
          backgroundColor: colors.surface, border: `1px dashed ${colors.border}`,
          borderRadius: '0.5rem', color: colors.textSecondary,
        }}>
          <Building2 size={32} style={{ opacity: 0.6, marginBottom: '0.5rem' }} />
          <div style={{ fontSize: '0.95rem' }}>
            {archivedClubs.length ? 'Nenhum clube ativo. Crie um clube novo ou desarquive um abaixo.' : 'Nenhum clube cadastrado.'}
          </div>
        </div>
      ) : (
        <div style={listaStyle}>
          {clubs.map((c, i) => (
            <ClubRow
              key={c.id}
              club={c}
              isLast={i === clubs.length - 1}
              colors={colors}
              isSelected={selectedClub?.id === c.id}
              busy={busy === c.id}
              onSelect={() => selectClub(c)}
              onEdit={() => openEdit(c)}
              onArchive={() => handleArchive(c)}
              onDelete={() => setConfirmDelete(c)}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: '0.85rem', fontSize: '0.78rem', color: colors.textSecondary, lineHeight: 1.55 }}>
        {textoLimite && <div><strong style={{ color: colors.text }}>{textoLimite}</strong>{!semLimite && ' · clubes arquivados não contam.'}</div>}
        {!semLimite && (
          <div>
            Precisa de mais um clube ativo ao mesmo tempo? Clube extra por R$20/mês.{' '}
            {isNative() ? 'Fale com a gente.' : (
              <button type="button" onClick={() => openExternalUrl(CONTATO_CLUBE_EXTRA)} style={{ background: 'transparent', border: 'none', padding: 0, color: colors.primary, fontWeight: 600, cursor: 'pointer', fontSize: 'inherit' }}>
                Fale com a gente
              </button>
            )}
          </div>
        )}
        {comissao && !semLimite && <div>Dica: ao trocar de time, arquive o anterior e crie o novo: o histórico do time antigo continua guardado.</div>}
      </div>

      {archivedClubs.length > 0 && (
        <div style={{ marginTop: '1.75rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: colors.text, margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Archive size={16} color={colors.textSecondary} /> Arquivados ({archivedClubs.length})
          </h2>
          <p style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', color: colors.textSecondary }}>
            Só leitura: abra para consultar o histórico e gerar relatórios. Não contam no limite.
          </p>
          <div style={listaStyle}>
            {archivedClubs.map((c, i) => (
              <ArchivedRow
                key={c.id}
                club={c}
                isLast={i === archivedClubs.length - 1}
                colors={colors}
                isSelected={selectedClub?.id === c.id}
                busy={busy === c.id}
                onOpen={() => selectClub(c)}
                onUnarchive={() => handleUnarchive(c)}
                onDelete={() => setConfirmDelete(c)}
              />
            ))}
          </div>
        </div>
      )}

      <ClubFormModal
        isOpen={showForm}
        editing={editing}
        onClose={() => { setShowForm(false); setEditing(null); }}
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
          {!confirmDelete?.archived_at && <> Para guardar o histórico, prefira <strong>Arquivar</strong>.</>}
        </p>
      </Modal>
    </div>
  );
}

const iconBtn = (colors, hover, cor) => ({ padding: '0.3rem', background: 'transparent', border: 'none', color: cor || colors.textSecondary, cursor: 'pointer', display: 'flex', opacity: hover ? 1 : 0.6 });

function ClubRow({ club, isLast, colors, isSelected, busy, onSelect, onEdit, onArchive, onDelete }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '0.85rem 1rem',
        borderBottom: isLast ? 'none' : `1px solid ${colors.border}`,
        backgroundColor: hover ? colors.background : 'transparent',
        display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap',
      }}
    >
      <Building2 size={20} color={isSelected ? colors.primary : colors.textSecondary} />
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 600, color: colors.text }}>{club.name}</span>
          {isSelected && (
            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', backgroundColor: `${colors.primary}20`, color: colors.primary, borderRadius: 999, fontWeight: 700, textTransform: 'uppercase' }}>
              Aberto
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.72rem', color: colors.textSecondary, marginTop: 2 }}>
          {MODALITY_LABELS[club.modality] || 'Futebol 11'}
          {club.description ? ` · ${club.description}` : ''}
        </div>
      </div>
      {!isSelected && (
        <Button size="sm" variant="outline" onClick={onSelect}>Abrir</Button>
      )}
      <Button size="sm" variant="secondary" onClick={onArchive} disabled={busy} icon={<Archive size={14} />}>
        {busy ? 'Arquivando…' : 'Arquivar'}
      </Button>
      <button onClick={onEdit} title="Editar" aria-label={`Editar ${club.name}`} style={iconBtn(colors, hover)}>
        <Edit2 size={14} />
      </button>
      <button onClick={onDelete} title="Remover" aria-label={`Remover ${club.name}`} style={iconBtn(colors, hover, '#ef4444')}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function ArchivedRow({ club, isLast, colors, isSelected, busy, onOpen, onUnarchive, onDelete }) {
  const [hover, setHover] = useState(false);
  const quando = club.archived_at ? new Date(club.archived_at).toLocaleDateString('pt-BR') : null;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '0.75rem 1rem',
        borderBottom: isLast ? 'none' : `1px solid ${colors.border}`,
        backgroundColor: hover ? colors.background : 'transparent',
        display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap',
      }}
    >
      <Archive size={18} color={colors.textSecondary} />
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.92rem', fontWeight: 600, color: colors.textSecondary }}>{club.name}</span>
          {isSelected && (
            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', backgroundColor: `${colors.textSecondary}22`, color: colors.textSecondary, borderRadius: 999, fontWeight: 700, textTransform: 'uppercase' }}>
              Aberto · só leitura
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.72rem', color: colors.textSecondary, marginTop: 2 }}>
          {MODALITY_LABELS[club.modality] || 'Futebol 11'}{quando ? ` · arquivado em ${quando}` : ''}
        </div>
      </div>
      {!isSelected && (
        <Button size="sm" variant="outline" onClick={onOpen} icon={<Eye size={14} />}>Consultar</Button>
      )}
      <Button size="sm" variant="secondary" onClick={onUnarchive} disabled={busy} icon={<ArchiveRestore size={14} />}>
        {busy ? 'Desarquivando…' : 'Desarquivar'}
      </Button>
      <button onClick={onDelete} title="Remover" aria-label={`Remover ${club.name}`} style={iconBtn(colors, hover, '#ef4444')}>
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
