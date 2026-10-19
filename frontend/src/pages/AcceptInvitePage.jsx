import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Crown, Shield, Eye, AlertCircle, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { membershipService } from '../services/membershipService';
import { Button } from '../components/common/Button';

import { ROLE_LABELS as PAPEIS } from '../lib/memberPermissions';

const ROLE_LABELS = { coach: 'Treinador', assistant: 'Auxiliar', ...PAPEIS };
const ROLE_ICONS = { coach: Shield, assistant: Eye, viewer: Eye };

export function AcceptInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let mounted = true;
    membershipService.getInvite(token)
      .then(data => { if (mounted) setInvite(data); })
      .catch(err => { if (mounted) setError(err?.message || 'Convite inválido ou expirado'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);
    try {
      const res = await membershipService.acceptInvite(token);
      setAccepted(true);
      // Entra direto no clube de quem convidou (e não na conta pessoal vazia criada no cadastro).
      const wsId = res?.workspace_id || invite?.workspace_id;
      if (wsId) localStorage.setItem('active_workspace_id', wsId);
      // Recarrega para workspace, clube e assinatura serem lidos já da conta nova.
      setTimeout(() => { window.location.hash = '#/home'; window.location.reload(); }, 1800);
    } catch (err) {
      setError(err?.message || 'Não foi possível aceitar o convite');
    } finally {
      setAccepting(false);
    }
  };

  const wrap = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '2rem 1rem', backgroundColor: colors.background,
  };
  const card = {
    maxWidth: 420, width: '100%',
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.75rem',
    padding: '1.75rem',
    boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
  };

  if (loading) {
    return <div style={wrap}><div style={card}>Carregando convite…</div></div>;
  }

  if (error && !invite) {
    return (
      <div style={wrap}>
        <div style={{ ...card, textAlign: 'center' }}>
          <AlertCircle size={36} style={{ color: '#ef4444', margin: '0 auto 0.6rem' }} />
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: colors.text }}>Convite indisponível</h1>
          <p style={{ margin: '0.6rem 0 0', color: colors.textSecondary, fontSize: '0.9rem' }}>{error}</p>
          <div style={{ marginTop: '1.25rem' }}>
            <Link to="/login" style={{ color: colors.primary, textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 }}>Voltar ao login</Link>
          </div>
        </div>
      </div>
    );
  }

  const Icon = ROLE_ICONS[invite?.role] || Shield;
  const roleLabel = ROLE_LABELS[invite?.role] || invite?.role;

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          backgroundColor: `${colors.primary}1A`, color: colors.primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 0.9rem',
        }}>
          {accepted ? <Check size={26} /> : <Icon size={24} />}
        </div>

        {accepted ? (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: colors.text }}>Pronto!</h1>
            <p style={{ margin: '0.6rem 0 0', color: colors.textSecondary, fontSize: '0.9rem' }}>
              Você agora faz parte de <strong>{invite.club_name}</strong>. Redirecionando…
            </p>
          </div>
        ) : (
          <>
            <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: colors.text, textAlign: 'center' }}>
              Convite para participar
            </h1>
            <p style={{ margin: '0.6rem 0 0.4rem', textAlign: 'center', color: colors.textSecondary, fontSize: '0.9rem', lineHeight: 1.5 }}>
              <strong>{invite.invited_by_name || invite.invited_by_email || 'O dono do clube'}</strong> convidou
              você para o clube <strong>{invite.club_name}</strong> como <strong>{roleLabel}</strong>.
            </p>
            <p style={{ margin: 0, textAlign: 'center', color: colors.textSecondary, fontSize: '0.78rem' }}>
              E-mail do convite: {invite.invited_email || '—'}
            </p>

            {error && (
              <div style={{
                marginTop: '0.85rem', padding: '0.6rem 0.8rem',
                backgroundColor: '#ef444415', color: '#ef4444',
                border: '1px solid #ef444440', borderRadius: '0.4rem',
                fontSize: '0.82rem',
              }}>
                {error}
              </div>
            )}

            <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {!isAuthenticated ? (
                <>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: colors.textSecondary, textAlign: 'center' }}>
                    Entre com a conta TactiPlan correspondente ao e-mail acima:
                  </p>
                  <Button onClick={() => navigate(`/login?redirect=${encodeURIComponent(`/accept-invite/${token}`)}`)} fullWidth>
                    Entrar pra aceitar
                  </Button>
                  <Button variant="secondary" onClick={() => navigate(`/register?email=${encodeURIComponent(invite.invited_email || '')}&redirect=${encodeURIComponent(`/accept-invite/${token}`)}`)} fullWidth>
                    Criar conta com {invite.invited_email}
                  </Button>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textSecondary, textAlign: 'center' }}>
                    Você está logado como <strong>{user?.email}</strong>.
                  </p>
                  <Button onClick={handleAccept} disabled={accepting} fullWidth>
                    {accepting ? 'Aceitando…' : 'Aceitar convite'}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
