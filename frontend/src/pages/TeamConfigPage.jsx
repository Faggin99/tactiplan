import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Trash2, Mail, Crown, Shield, Eye, Copy, Lock, Pencil, Users as UsersIcon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useClub } from '../contexts/ClubContext';
import { useAuth } from '../contexts/AuthContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { membershipService } from '../services/membershipService';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
import { MemberEditPanel } from './MemberEditPanel';
import { ROLE_LABELS, ROLE_DEFAULTS, effectivePermissions, PERMISSION_LABELS } from '../lib/memberPermissions';
import { notify } from '../lib/notify';
import { isNative } from '../lib/platform';
import { NOME_CLUBE } from '../config/planos';

const ROLE_ICONS = { owner: Crown, manager: Shield, head_coach: Shield, assistant_coach: Shield, specialist: Shield, viewer: Eye, other: Shield };

export function TeamConfigPage() {
  const { colors } = useTheme();
  const { selectedClub } = useClub();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const plan = usePlanFeatures();
  const canInvite = plan.equipe;
  const limite = plan.maxConvidados; // -1 = ilimitado

  const [data, setData] = useState({ owner: null, members: [], is_owner: false });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingMember, setEditingMember] = useState(null);
  const [isInviting, setIsInviting] = useState(false);
  const [lastInvite, setLastInvite] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);

  const load = useCallback(async () => {
    if (!selectedClub?.id) { setData({ owner: null, members: [], is_owner: false }); setLoading(false); return; }
    setLoading(true);
    try {
      const [membersRes, catsRes] = await Promise.all([
        membershipService.listMembers(selectedClub.id),
        import('../services/api').then(({ api }) => api.get(`/categories?clubId=${selectedClub.id}`).catch(() => ({ data: [] }))),
      ]);
      setData(membersRes);
      setCategories(catsRes?.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedClub?.id]);

  useEffect(() => { load(); }, [load]);

  function startInvite() {
    if (!canInvite) {
      notify.info(plan.readOnly
        ? 'Conta em modo só leitura: convidar membros depende de uma assinatura ativa.'
        : 'O plano atual não permite convidar membros.');
      return;
    }
    const usados = (data.members || []).length; // aceitos + pendentes
    if (limite >= 0 && usados >= limite) {
      notify.info(`O plano ${plan.planName || ''} inclui o responsável + ${limite} ${limite === 1 ? 'convidado' : 'convidados'}. ` +
        `Remova um membro ou convite pendente${limite < 5 ? ` ou mude para o plano ${NOME_CLUBE}` : ''} para convidar outra pessoa.`);
      return;
    }
    setIsInviting(true);
    setEditingMember(null);
  }

  async function handleSavePanel(payload) {
    try {
      if (isInviting) {
        const res = await membershipService.invite(selectedClub.id, payload);
        setLastInvite(res);
        setIsInviting(false);
      } else if (editingMember) {
        await membershipService.updateMember(selectedClub.id, editingMember.id, payload);
        setEditingMember(null);
      }
      await load();
    } catch (err) {
      // 402: limite de membros (MEMBER_LIMIT), só leitura (READ_ONLY) ou plano.
      if (err?.statusCode === 402) {
        notify.error(err.message || 'Não foi possível convidar com o plano atual.');
        return;
      }
      notify.error('Erro: ' + (err?.message || ''));
    }
  }

  async function handleRemove(memberId) {
    try {
      await membershipService.remove(selectedClub.id, memberId);
      setConfirmRemove(null);
      await load();
    } catch (err) {
      notify.error('Erro: ' + (err?.message || ''));
    }
  }

  const pageStyle = { padding: isMobile ? '1rem' : '1.5rem 2rem', width: '100%' };

  if (!selectedClub?.id) {
    return (
      <div style={pageStyle}>
        <div style={{ padding: '2rem 1rem', textAlign: 'center', color: colors.textSecondary }}>
          Selecione um clube pra gerenciar a equipe.
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.875rem', fontWeight: 700, color: colors.text, margin: 0 }}>Staff</h1>
          <p style={{ color: colors.textSecondary, fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Clube: <strong>{selectedClub.name}</strong>. Convide treinadores, auxiliares e especialistas com permissões personalizadas.
          </p>
          {data.is_owner && canInvite && limite >= 0 && (
            <p style={{ color: colors.textSecondary, fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Plano {plan.planName || ''}: responsável + {limite} {limite === 1 ? 'convidado' : 'convidados'} ({(data.members || []).length} em uso, contando convites pendentes).
            </p>
          )}
        </div>
        {data.is_owner && (
          <button
            onClick={startInvite}
            title={!canInvite ? 'Depende de uma assinatura ativa' : undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem',
              backgroundColor: canInvite ? colors.primary : '#f59e0b',
              color: colors.primaryText, border: 'none', borderRadius: '0.375rem',
              fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer',
            }}
          >
            {canInvite ? <UserPlus size={18} /> : <Lock size={16} />}
            {canInvite ? 'Convidar membro' : 'Convidar membro'}
          </button>
        )}
      </div>

      {data.is_owner && !canInvite && (
        <div style={{
          marginBottom: '1rem', padding: '0.875rem 1rem',
          backgroundColor: '#f59e0b15', border: '1px solid #f59e0b40', borderRadius: '0.5rem',
          display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
        }}>
          <Crown size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, fontSize: '0.85rem', color: colors.text }}>
            <strong>Conta em modo só leitura.</strong> Convidar membros depende de uma assinatura ativa.
            {!isNative() && <div style={{ marginTop: '0.5rem' }}>
              <button onClick={() => navigate('/billing')} style={{
                padding: '0.4rem 0.875rem', backgroundColor: '#f59e0b',
                color: '#fff', border: 'none', borderRadius: '0.375rem',
                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              }}>
                Ver assinatura
              </button>
            </div>}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: colors.textSecondary }}>Carregando…</div>
      ) : (
        <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '0.5rem', overflow: 'hidden' }}>
          {data.owner && (
            <MemberRow
              role="owner"
              name={data.owner.name || data.owner.email || '—'}
              email={data.owner.email}
              accepted
              isMe={data.owner.id === user?.id}
              colors={colors}
            />
          )}
          {data.members.map((m, i) => (
            <MemberRow
              key={m.id}
              member={m}
              role={m.role}
              name={m.user_name || m.invited_email || '—'}
              email={m.user_email || m.invited_email}
              accepted={!!m.accepted_at}
              isMe={m.user_id === user?.id}
              isLast={i === data.members.length - 1}
              colors={colors}
              categories={categories}
              canManage={data.is_owner && m.user_id !== user?.id}
              onEdit={() => { setEditingMember(m); setIsInviting(false); }}
              onRemove={() => setConfirmRemove(m)}
            />
          ))}
          {data.members.length === 0 && (
            <div style={{ padding: '1.25rem 1rem', textAlign: 'center', color: colors.textSecondary, fontSize: '0.85rem', fontStyle: 'italic' }}>
              Você ainda não convidou ninguém.
            </div>
          )}
        </div>
      )}

      <MemberEditPanel
        isOpen={isInviting || !!editingMember}
        member={editingMember}
        categories={categories}
        isInvite={isInviting}
        onClose={() => { setIsInviting(false); setEditingMember(null); }}
        onSave={handleSavePanel}
      />

      <Modal
        isOpen={!!lastInvite}
        onClose={() => setLastInvite(null)}
        title="Convite enviado"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button onClick={() => setLastInvite(null)}>Fechar</Button>
          </div>
        }
      >
        <p style={{ color: colors.text, fontSize: '0.9rem' }}>
          Email enviado pra <strong>{lastInvite?.invited_email}</strong>. Se o convidado não receber, você pode copiar o link:
        </p>
        <div style={{ marginTop: '0.75rem', padding: '0.6rem', backgroundColor: colors.background, border: `1px solid ${colors.border}`, borderRadius: '0.4rem', fontSize: '0.78rem', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ flex: 1, color: colors.text, fontFamily: 'monospace' }}>{lastInvite?.accept_url}</span>
          <button onClick={() => navigator.clipboard?.writeText(lastInvite?.accept_url || '')}
            title="Copiar"
            style={{ padding: '0.35rem', background: 'transparent', border: `1px solid ${colors.border}`, borderRadius: '0.3rem', cursor: 'pointer', color: colors.textSecondary, display: 'flex' }}>
            <Copy size={13} />
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        title="Remover membro"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={() => setConfirmRemove(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => handleRemove(confirmRemove.id)}>Remover</Button>
          </div>
        }
      >
        <p style={{ color: colors.text }}>
          Remover <strong>{confirmRemove?.user_name || confirmRemove?.invited_email}</strong>? Perde acesso imediato.
        </p>
      </Modal>
    </div>
  );
}

function MemberRow({ role, name, email, accepted, isMe, isLast, colors, member, categories = [], canManage, onEdit, onRemove }) {
  const Icon = ROLE_ICONS[role] || Shield;
  const effective = member ? effectivePermissions(member) : null;
  const catNames = (member?.category_ids || []).map(id => categories.find(c => c.id === id)?.name).filter(Boolean);
  const scopeLabel = !member ? null
    : (catNames.length === 0 ? 'Todas as categorias' : catNames.join(', '));
  const isCustom = member && Array.isArray(member.permissions);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.75rem 1rem',
      borderBottom: isLast ? 'none' : `1px solid ${colors.border}`,
      backgroundColor: 'transparent',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        backgroundColor: `${colors.primary}15`, color: colors.primary,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: colors.text, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          {isMe && <span style={{ fontSize: '0.6rem', padding: '0.05rem 0.35rem', backgroundColor: `${colors.primary}20`, color: colors.primary, borderRadius: 999, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Você</span>}
          {!accepted && <span style={{ fontSize: '0.6rem', padding: '0.05rem 0.35rem', backgroundColor: '#f59e0b20', color: '#f59e0b', borderRadius: 999, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Pendente</span>}
        </div>
        <div style={{ fontSize: '0.72rem', color: colors.textSecondary, marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <Mail size={10} /> {email}
        </div>
        {scopeLabel && (
          <div style={{ fontSize: '0.7rem', color: colors.textSecondary, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <UsersIcon size={10} /> {scopeLabel}
            {isCustom && <span style={{ marginLeft: '0.3rem', fontSize: '0.65rem', color: '#f59e0b', fontWeight: 600 }}>(permissões customizadas)</span>}
          </div>
        )}
      </div>
      <span style={{
        fontSize: '0.75rem', color: colors.text, padding: '0.25rem 0.55rem',
        backgroundColor: colors.background, border: `1px solid ${colors.border}`, borderRadius: 999,
        fontWeight: 500,
      }}>
        {ROLE_LABELS[role] || role}
      </span>
      {canManage && (
        <>
          <button onClick={onEdit} title="Editar permissões"
            style={{ padding: '0.35rem', background: 'transparent', border: `1px solid ${colors.border}`, borderRadius: '0.3rem', cursor: 'pointer', color: colors.textSecondary, display: 'flex' }}>
            <Pencil size={13} />
          </button>
          <button onClick={onRemove} title="Remover"
            style={{ padding: '0.3rem', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex' }}>
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
  );
}
