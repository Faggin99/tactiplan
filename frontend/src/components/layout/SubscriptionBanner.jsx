import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, X } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useSubscription } from '../../hooks/useSubscription';
import { isNative } from '../../lib/platform';
import { SITE_PLANOS_URL } from '../../config/planos';

export function SubscriptionBanner() {
  const { colors } = useTheme();
  const { sub, loading } = useSubscription();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (loading || !sub) return null;
  if (sub.is_admin || sub.plan_id === 'admin' || sub.plan_id === 'lifetime') return null;
  if (dismissed) return null;

  const native = isNative();
  // F1: sem plano Free. Conta sem assinatura ativa = SÓ LEITURA (o servidor
  // recusa criar/editar). Web: botão Assinar/Renovar → página de planos do site.
  // App nativo: texto neutro, sem botão nem link de compra.
  if (sub.read_only) {
    const dono = sub.is_owner !== false;
    const renovar = !!sub.lapsed;
    let msg;
    if (!dono) msg = 'A conta desta equipe está sem assinatura ativa: modo só leitura. Fale com o responsável pela equipe.';
    else if (native) msg = 'Sua conta está em modo só leitura (sem assinatura ativa). Fale com o responsável pela equipe.';
    else if (renovar) msg = 'Sua assinatura terminou. A conta está em modo só leitura: seus dados estão salvos, mas criar e editar volta ao renovar.';
    else msg = 'Conta em modo só leitura. Assine o plano Clube para criar e editar treinos, plantel, jogos e jogadas.';
    return (
      <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.625rem 1.25rem', backgroundColor: '#f59e0b15', borderBottom: '1px solid #f59e0b40', color: colors.text, fontSize: '0.875rem' }}>
        <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{msg}</span>
        {!native && dono && (
          <a href={SITE_PLANOS_URL} style={{ padding: '0.375rem 0.875rem', background: '#f59e0b', color: '#fff', borderRadius: 6, fontWeight: 600, fontSize: '0.8125rem', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {renovar ? 'Renovar' : 'Assinar'}
          </a>
        )}
      </div>
    );
  }

  const isTrial = sub.status === 'trialing';
  const daysLeft = sub.trial_days_left;
  const isPastDue = sub.status === 'past_due';

  let message = null;
  let level = 'info';
  let cta = 'Ver assinatura';
  let icon = Clock;

  if (isPastDue) {
    message = 'Pagamento pendente. Atualize seu método de pagamento para evitar interrupção.';
    level = 'error';
    cta = 'Atualizar pagamento';
    icon = AlertTriangle;
  } else if (isTrial && daysLeft != null) {
    // Mostra SEMPRE durante o trial, com cor por urgência
    if (daysLeft === 0) {
      message = 'Seu período de avaliação termina hoje. Assine agora para manter o acesso.';
      level = 'error';
      cta = 'Assinar agora';
      icon = AlertTriangle;
    } else if (daysLeft <= 3) {
      message = `Seu período de avaliação termina em ${daysLeft} dia${daysLeft === 1 ? '' : 's'}.`;
      level = 'warning';
      cta = 'Assinar antes que acabe';
    } else if (daysLeft <= 7) {
      message = `Você está em período de avaliação — restam ${daysLeft} dias.`;
      level = 'warning';
    } else {
      message = `Você está no período de avaliação — restam ${daysLeft} dias grátis.`;
      level = 'info';
    }
  }

  if (!message) return null;

  const styles = {
    info:    { bg: '#2563eb15', color: '#3b82f6', border: '#3b82f640', btn: '#2563eb', btnHover: '#1d4ed8' },
    warning: { bg: '#f59e0b15', color: '#f59e0b', border: '#f59e0b40', btn: '#f59e0b', btnHover: '#d97706' },
    error:   { bg: '#ef444415', color: '#ef4444', border: '#ef444440', btn: '#ef4444', btnHover: '#dc2626' },
  }[level];

  const Icon = icon;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '0.625rem 1.25rem',
      backgroundColor: styles.bg,
      borderBottom: `1px solid ${styles.border}`,
      color: colors.text,
      fontSize: '0.875rem',
    }}>
      <Icon size={16} color={styles.color} />
      <span style={{ flex: 1 }}>{message}</span>
      {!native && <button
        onClick={() => navigate('/billing')}
        style={{
          padding: '0.375rem 0.875rem',
          background: styles.btn, color: '#fff',
          border: 'none', borderRadius: 6,
          fontWeight: 600, fontSize: '0.8125rem',
          cursor: 'pointer',
        }}
      >
        {cta}
      </button>}
      {level !== 'error' && (
        <button
          onClick={() => setDismissed(true)}
          aria-label="Fechar"
          style={{ background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer', display: 'inline-flex', padding: 4 }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
