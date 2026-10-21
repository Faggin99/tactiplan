import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, AlertTriangle, Check } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

/**
 * Página exigida pra contas sem senha (criadas só via Google).
 * Bloqueia acesso ao resto da app até o usuário definir uma senha.
 */
export function SetPasswordPage() {
  const { colors } = useTheme();
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Se o usuário já tem senha, sai daqui
  useEffect(() => {
    if (user && !user.requires_password) {
      navigate('/home', { replace: true });
    }
  }, [user, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Senha precisa ter pelo menos 8 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/set-password', { password });
      // Refresh user state e segue
      await refresh?.();
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err?.message || 'Erro ao definir senha');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.background,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem',
    }}>
      <div style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: '0.75rem',
        padding: '2rem',
        width: '100%', maxWidth: 420,
        boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          backgroundColor: `${colors.primary}15`, color: colors.primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1rem',
        }}>
          <Lock size={22} />
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.text, textAlign: 'center', marginBottom: '0.5rem' }}>
          Defina uma senha
        </h1>
        <p style={{ fontSize: '0.875rem', color: colors.textSecondary, textAlign: 'center', marginBottom: '1.5rem' }}>
          Por segurança, toda conta precisa ter uma senha — mesmo as criadas via Google.
          Você poderá usar essa senha pra entrar mesmo sem o Google.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: colors.textSecondary, display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
              Nova senha
            </label>
            <input
              type="password"
              autoFocus
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              style={inputStyle(colors)}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: colors.textSecondary, display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
              Confirmar senha
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={inputStyle(colors)}
            />
          </div>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.5rem 0.75rem', backgroundColor: '#fef2f2',
              border: '1px solid #fecaca', borderRadius: '0.375rem',
              color: '#b91c1c', fontSize: '0.825rem',
            }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.65rem 1rem',
              backgroundColor: colors.primary, color: colors.primaryText,
              border: 'none', borderRadius: '0.375rem',
              fontSize: '0.875rem', fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1, marginTop: '0.25rem',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            }}
          >
            <Check size={15} /> {loading ? 'Salvando...' : 'Definir senha'}
          </button>
        </form>
      </div>
    </div>
  );
}

function inputStyle(colors) {
  return {
    width: '100%',
    padding: '0.55rem 0.75rem',
    backgroundColor: colors.background,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.375rem',
    color: colors.text,
    fontSize: '0.875rem',
    outline: 'none',
  };
}
