import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { api } from '../../services/api';
import { ROLE_LABELS } from '../../lib/memberPermissions';
import { Button } from '../common/Button';
import notify from '../../lib/notify';

// Convite pendente para o e-mail da pessoa logada (ela entrou/cadastrou sem passar pelo
// link, ou o link se perdeu no login). Aparece no lugar do "crie seu primeiro clube".
export function usePendingInvites(enabled) {
  const [invites, setInvites] = useState(null); // null = carregando
  useEffect(() => {
    if (!enabled) { setInvites([]); return; }
    let vivo = true;
    api.get('/invites-pending')
      .then((r) => { if (vivo) setInvites(r?.data || []); })
      .catch(() => { if (vivo) setInvites([]); });
    return () => { vivo = false; };
  }, [enabled]);
  return invites;
}

export function PendingInvitesModal({ invites, onDismiss }) {
  const { colors } = useTheme();
  const [aceitando, setAceitando] = useState(null);
  const inv = invites[0];

  async function aceitar() {
    setAceitando(inv.token);
    try {
      const res = await api.post(`/invites/${inv.token}/accept`, {});
      if (res?.workspace_id) localStorage.setItem('active_workspace_id', res.workspace_id);
      notify.success(`Pronto! Você agora faz parte de ${inv.club_name || inv.workspace_name}.`);
      setTimeout(() => { window.location.hash = '#/home'; window.location.reload(); }, 900);
    } catch (err) {
      notify.error(err?.message || 'Não foi possível aceitar o convite');
      setAceitando(null);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div style={{
        background: colors.background, borderRadius: '0.75rem', width: '100%', maxWidth: 440,
        padding: '1.75rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', margin: '0 auto 0.9rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${colors.primary}20`, color: colors.primary,
        }}>
          <Users size={26} />
        </div>
        <h2 style={{ margin: 0, fontSize: '1.2rem', color: colors.text }}>Você tem um convite</h2>
        <p style={{ margin: '0.7rem 0 0', color: colors.textSecondary, fontSize: '0.92rem', lineHeight: 1.5 }}>
          <strong>{inv.invited_by_name || 'O responsável'}</strong> convidou você para o clube{' '}
          <strong>{inv.club_name || inv.workspace_name}</strong> como{' '}
          <strong>{ROLE_LABELS[inv.role] || 'membro da comissão'}</strong>.
        </p>
        {invites.length > 1 && (
          <p style={{ margin: '0.4rem 0 0', color: colors.textSecondary, fontSize: '0.8rem' }}>
            E mais {invites.length - 1} convite(s) depois deste.
          </p>
        )}
        <div style={{ marginTop: '1.4rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Button onClick={aceitar} disabled={!!aceitando} fullWidth>
            {aceitando ? 'Aceitando…' : 'Aceitar convite'}
          </Button>
          <Button variant="secondary" onClick={onDismiss} disabled={!!aceitando} fullWidth>
            Agora não
          </Button>
        </div>
      </div>
    </div>
  );
}
