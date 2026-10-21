import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

// Integração manual sem depender do virtual module do vite-plugin-pwa,
// que pode causar problemas de resolução em produção.
export function PWAUpdatePrompt() {
  const { colors } = useTheme();
  const [waitingWorker, setWaitingWorker] = useState(null);
  const [needRefresh, setNeedRefresh] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let interval;
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setNeedRefresh(true);
      }
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(installing);
            setNeedRefresh(true);
          }
        });
      });
      // Verifica updates a cada 60s
      interval = setInterval(() => reg.update().catch(() => {}), 60_000);
    });

    return () => { if (interval) clearInterval(interval); };
  }, []);

  async function applyUpdate() {
    try {
      // Estratégia robusta: limpa caches + SWs e recarrega.
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
      }
    } catch (_) {}
    window.location.reload();
  }

  if (!needRefresh) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 9000,
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: 12,
      boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
      padding: '12px 16px',
      maxWidth: 320,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <RefreshCw size={20} color={colors.primary} />
      <div style={{ flex: 1, fontSize: '0.875rem', color: colors.text }}>
        <strong style={{ display: 'block', marginBottom: 2 }}>Nova versão disponível</strong>
        <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Recarregue para atualizar.</span>
      </div>
      <button
        onClick={applyUpdate}
        style={{
          padding: '6px 12px',
          background: colors.primary, color: colors.primaryText,
          border: 'none', borderRadius: 6,
          fontWeight: 600, fontSize: '0.8125rem',
          cursor: 'pointer',
        }}
      >
        Atualizar
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        aria-label="Fechar"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textSecondary, fontSize: 18, lineHeight: 1, padding: 4 }}
      >
        ×
      </button>
    </div>
  );
}
