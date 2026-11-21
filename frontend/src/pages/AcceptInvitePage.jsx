import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Crown, Shield, Eye, AlertCircle, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { membershipService } from '../services/membershipService';
import { authService } from '../services/authService';
import { formatarNome } from '../lib/formatarNome';
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
  // cadastro direto no convite (e-mail sem conta): nome + senha
  const [cad, setCad] = useState({ nome: '', senha: '', confirma: '', termos: false });
  const [criando, setCriando] = useState(false);

  // Cria a conta com o e-mail do convite, aceita e entra no clube de quem convidou
  const criarEAceitar = async (e) => {
    e.preventDefault();
    setError(null);
    if (!cad.nome.trim()) return setError('Informe seu nome.');
    if (cad.senha.length < 6) return setError('A senha precisa ter ao menos 6 caracteres.');
    if (cad.senha !== cad.confirma) return setError('As senhas não conferem.');
    if (!cad.termos) return setError('Aceite os Termos de Uso e a Política de Privacidade para continuar.');
    setCriando(true);
    try {
      const { token: t, user: u } = await authService.register({
        email: String(invite.invited_email || '').trim().toLowerCase(),
        password: cad.senha,
        name: formatarNome(cad.nome),
        accept_terms: true,
      });
      localStorage.setItem('auth_token', t);
      localStorage.setItem('user', JSON.stringify(u));
      const res = await membershipService.acceptInvite(token);
      const wsId = res?.workspace_id || invite?.workspace_id;
      if (wsId) localStorage.setItem('active_workspace_id', wsId);
      setAccepted(true);
      setTimeout(() => { window.location.hash = '#/home'; window.location.reload(); }, 1500);
    } catch (err) {
      setError(err?.message || 'Não foi possível criar a conta. Tente de novo.');
    } finally {
      setCriando(false);
    }
  };

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

  const rotulo = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem', fontWeight: 600, color: colors.textSecondary };
  const campo = { padding: '0.6rem 0.7rem', borderRadius: '0.45rem', border: `1px solid ${colors.border}`, backgroundColor: colors.background, color: colors.text, fontSize: '0.92rem', fontFamily: 'inherit' };
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
              {!isAuthenticated && invite.tem_conta === false ? (
                // e-mail ainda sem conta: cria a senha aqui mesmo e já entra no clube
                <form onSubmit={criarEAceitar} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: colors.text, textAlign: 'center', fontWeight: 600 }}>
                    Crie sua senha para entrar
                  </p>
                  <label style={rotulo}>Seu nome
                    <input style={campo} value={cad.nome} onChange={(e) => setCad({ ...cad, nome: e.target.value })} autoComplete="name" autoFocus />
                  </label>
                  <label style={rotulo}>E-mail
                    <input style={{ ...campo, opacity: 0.75 }} value={invite.invited_email || ''} readOnly />
                  </label>
                  <label style={rotulo}>Senha
                    <input style={campo} type="password" value={cad.senha} onChange={(e) => setCad({ ...cad, senha: e.target.value })} autoComplete="new-password" placeholder="Ao menos 6 caracteres" />
                  </label>
                  <label style={rotulo}>Confirmar senha
                    <input style={campo} type="password" value={cad.confirma} onChange={(e) => setCad({ ...cad, confirma: e.target.value })} autoComplete="new-password" />
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.8rem', color: colors.textSecondary, lineHeight: 1.4 }}>
                    <input type="checkbox" checked={cad.termos} onChange={(e) => setCad({ ...cad, termos: e.target.checked })} style={{ marginTop: 2 }} />
                    <span>Li e aceito os <a href="https://tactiplan.faggin.com.br/termos.html" target="_blank" rel="noopener noreferrer" style={{ color: colors.primary }}>Termos de Uso</a> e a <a href="https://tactiplan.faggin.com.br/privacidade.html" target="_blank" rel="noopener noreferrer" style={{ color: colors.primary }}>Política de Privacidade</a>.</span>
                  </label>
                  <Button type="submit" disabled={criando} fullWidth>
                    {criando ? 'Criando sua conta…' : 'Criar senha e entrar no clube'}
                  </Button>
                  <button type="button" onClick={() => navigate(`/login?redirect=${encodeURIComponent(`/accept-invite/${token}`)}`)}
                    style={{ background: 'none', border: 'none', color: colors.textSecondary, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Já tenho conta TactiPlan
                  </button>
                </form>
              ) : !isAuthenticated ? (
                <>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: colors.textSecondary, textAlign: 'center' }}>
                    Este e-mail já tem conta. Entre com a sua senha para aceitar:
                  </p>
                  <Button onClick={() => navigate(`/login?redirect=${encodeURIComponent(`/accept-invite/${token}`)}`)} fullWidth>
                    Entrar para aceitar
                  </Button>
                  <Link to="/forgot-password" style={{ textAlign: 'center', fontSize: '0.8rem', color: colors.textSecondary }}>Esqueci minha senha</Link>
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
