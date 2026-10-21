import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { api } from '../services/api';

// Entrada vinda de outro produto Faggin (seletor de produtos, login único F3). O outro produto
// manda para cá com ?codigo=... (uso único, 2 min). O código é resgatado servidor a servidor e o
// TactiPlan emite a PRÓPRIA sessão — nenhuma sessão de outro domínio passa pelo navegador.
// Com HashRouter o Conta monta /?codigo=X#/entrar-conta, mas aceitamos também #/entrar-conta?codigo=X.
let resgatando = null; // evita resgatar duas vezes (StrictMode/re-render): o código é de uso único

function lerCodigo() {
  const daBusca = new URLSearchParams(window.location.search).get('codigo');
  if (daBusca) return daBusca;
  const hash = window.location.hash || '';
  const i = hash.indexOf('?');
  return i >= 0 ? new URLSearchParams(hash.slice(i + 1)).get('codigo') : null;
}

export function EntrarContaPage() {
  const { colors } = useTheme();
  const [erro, setErro] = useState('');

  useEffect(() => {
    const codigo = lerCodigo();
    // Tira o código da barra de endereço (e do histórico) antes de qualquer outra coisa.
    try { window.history.replaceState(null, '', window.location.pathname + '#/entrar-conta'); } catch { /* ignora */ }
    if (!codigo && !resgatando) { setErro('Link de acesso inválido ou expirado.'); return; }
    if (!resgatando) resgatando = api.post('/conta/resgatar', { codigo });
    resgatando
      .then((data) => {
        if (!data?.token || !data?.user) throw new Error('resposta inválida');
        // Mesmo armazenamento do login social (GoogleSignInButton): token + user e recarrega.
        let anterior = null;
        try { anterior = JSON.parse(localStorage.getItem('user') || 'null'); } catch { /* ignora */ }
        if (anterior?.id && anterior.id !== data.user.id) localStorage.removeItem('active_workspace_id');
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = '/#/home';
        window.location.reload();
      })
      .catch(() => {
        resgatando = null;
        setErro('Não foi possível entrar com este link. Ele vale por 2 minutos e só pode ser usado uma vez.');
      });
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backgroundColor: colors.background }}>
      <div style={{ width: '100%', maxWidth: 440, backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '0.75rem', padding: '2rem', textAlign: 'center' }}>
        {!erro ? (
          <>
            <Loader2 size={36} color={colors.primary} style={{ margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} />
            <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.text, margin: 0 }}>Entrando no TactiPlan…</h1>
            <p style={{ fontSize: '0.875rem', color: colors.textSecondary, marginTop: 8 }}>Só um instante.</p>
          </>
        ) : (
          <>
            <AlertCircle size={40} color={colors.error || '#ef4444'} style={{ margin: '0 auto 12px' }} />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.text, margin: 0 }}>Não deu para entrar</h1>
            <p style={{ fontSize: '0.875rem', color: colors.textSecondary, marginTop: 8, lineHeight: 1.5 }}>{erro}</p>
            <Link to="/login" style={{ display: 'inline-block', marginTop: 20, padding: '0.65rem 1.25rem', borderRadius: '0.6rem', backgroundColor: colors.primary, color: colors.primaryText, fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none' }}>
              Ir para o login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
