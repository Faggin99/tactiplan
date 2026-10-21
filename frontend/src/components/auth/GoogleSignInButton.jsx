import { useEffect, useRef, useState } from 'react';
import { authService } from '../../services/authService';
import { useTheme } from '../../contexts/ThemeContext';
import { isNative } from '../../lib/platform';
import { nativeGoogleSignIn } from '../../lib/nativeGoogleAuth';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let gisLoadingPromise = null;

// Google Identity Services (o botão web) NÃO funciona dentro do webview de
// apps Capacitor — o Google bloqueia o origin não confiável. No app nativo
// usamos o plugin @capgo/capacitor-social-login (fluxo nativo do Google);
// no navegador seguimos com o GIS oficial.

function loadGoogleIdentity() {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisLoadingPromise) return gisLoadingPromise;
  gisLoadingPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return gisLoadingPromise;
}

/**
 * Botão "Entrar com Google" usando Google Identity Services oficial.
 * Renderiza o botão do Google diretamente (mais confiável que customizar via popup).
 * O tema (filled_black/outline) acompanha o tema da aplicação.
 *
 * Props:
 *  - onSuccess({ token, user })
 *  - label: 'signin_with' | 'signup_with' | 'continue_with' (default) — texto do botão do Google
 *  - disabled: bool — cobre o botão com um overlay bloqueante (o iframe do Google não aceita
 *      atributo `disabled` nativo, então usamos uma camada por cima que intercepta os cliques).
 *  - disabledMessage: string — mensagem exibida ao tentar clicar com o botão desabilitado
 *  - onDisabledClick: função opcional — chamada ao clicar quando `disabled` (ex.: destacar checkbox)
 */
export function GoogleSignInButton({
  onSuccess: onSuccessProp,
  label = 'continue_with',
  disabled = false,
  disabledMessage = 'Aceite os Termos de Uso e a Política de Privacidade para continuar.',
  onDisabledClick,
  redirectTo = '/home',
}) {
  const { isDark } = useTheme();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  // O callback do Google é registrado uma vez: lê o destino ATUAL pelo ref (ex.: "Você é"
  // escolhido no cadastro depois de o botão aparecer entra no ?tipo= do destino).
  const redirectRef = useRef(redirectTo);
  redirectRef.current = redirectTo;
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  // Troca o credential (idToken) do Google pelo nosso token e entra no app.
  async function exchangeCredential(credential) {
    setLoading(true);
    setError('');
    try {
      const { token, user } = await authService.googleLogin(credential);
      localStorage.setItem('auth_token', token);
      localStorage.setItem('user', JSON.stringify(user));
      onSuccessProp?.({ token, user });
      window.location.href = '/#' + redirectRef.current;
      window.location.reload();
    } catch (err) {
      console.error('[GoogleSignIn] backend error', err);
      setError(err?.message || 'Erro ao autenticar com Google');
    } finally {
      setLoading(false);
    }
  }

  function handleCredential(response) {
    if (!response?.credential) {
      setError('Resposta do Google sem credencial.');
      return;
    }
    exchangeCredential(response.credential);
  }

  // App nativo: abre a tela nativa do Google e troca o idToken.
  async function handleNativeLogin() {
    if (disabled) { onDisabledClick?.(); setError(disabledMessage); return; }
    setLoading(true);
    setError('');
    try {
      const idToken = await nativeGoogleSignIn();
      await exchangeCredential(idToken);
    } catch (err) {
      // Cancelamento do usuário não é erro visível
      const msg = String(err?.message || err);
      if (!/cancel/i.test(msg)) setError('Não foi possível entrar com Google. Tente de novo.');
      console.error('[GoogleSignIn] native error', err);
      setLoading(false);
    }
  }

  useEffect(() => {
    // No app nativo não carregamos o GIS (é bloqueado no webview) — usamos o
    // plugin nativo via handleNativeLogin.
    if (!clientId || isNative()) return;
    let mounted = true;
    loadGoogleIdentity()
      .then(() => {
        if (!mounted || !containerRef.current) return;
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredential,
            ux_mode: 'popup',
            auto_select: false,
            cancel_on_tap_outside: true,
          });
          // Limpa container e renderiza botão oficial
          containerRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(containerRef.current, {
            type: 'standard',
            theme: isDark ? 'filled_black' : 'outline',
            size: 'large',
            text: label,
            shape: 'rectangular',
            locale: 'pt-BR',
            width: containerRef.current.offsetWidth || 320,
          });
        } catch (e) {
          console.error('[GoogleSignIn] init error', e);
          setError('Falha ao iniciar Google. Tente recarregar a página.');
        }
      })
      .catch((e) => {
        console.error('[GoogleSignIn] load error', e);
        setError('Falha ao carregar Google. Verifique sua conexão.');
      });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, isDark, label]);

  if (!clientId) return null;

  // App nativo: botão próprio que dispara o fluxo nativo do Google.
  if (isNative()) {
    return (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={handleNativeLogin}
          disabled={loading}
          style={{
            width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '0.7rem 1rem', borderRadius: 8, cursor: loading ? 'default' : 'pointer',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : '#dadce0'}`,
            backgroundColor: isDark ? '#131314' : '#fff',
            color: isDark ? '#e3e3e3' : '#1f1f1f',
            fontSize: '0.95rem', fontWeight: 600, opacity: disabled ? 0.55 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {loading ? 'Entrando…' : 'Entrar com Google'}
        </button>
        {error && <div style={{ fontSize: '0.75rem', color: '#ef4444', textAlign: 'center' }}>{error}</div>}
      </div>
    );
  }

  function handleOverlayClick(e) {
    // Intercepta o clique antes de chegar no iframe do Google.
    e.preventDefault();
    e.stopPropagation();
    onDisabledClick?.();
    if (disabledMessage) setError(disabledMessage);
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <div
          ref={containerRef}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            minHeight: 44,
            opacity: disabled ? 0.5 : 1,
            filter: disabled ? 'grayscale(0.3)' : 'none',
            transition: 'opacity 0.15s',
          }}
          aria-disabled={disabled || undefined}
        />
        {disabled && (
          <div
            role="button"
            tabIndex={0}
            aria-label={disabledMessage}
            onClick={handleOverlayClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOverlayClick(e); }}
            style={{
              position: 'absolute',
              inset: 0,
              cursor: 'not-allowed',
              background: 'transparent',
            }}
          />
        )}
      </div>
      {loading && <div style={{ fontSize: '0.75rem', color: '#888' }}>Autenticando…</div>}
      {error && <div style={{ fontSize: '0.75rem', color: '#ef4444', textAlign: 'center' }}>{error}</div>}
    </div>
  );
}
