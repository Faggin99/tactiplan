import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Crown, CreditCard, Infinity, ShieldCheck, XCircle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '../components/common/Button';
import { api } from '../services/api';
import { notify } from '../lib/notify';
import { openExternalUrl, isNative, getPlatform } from '../lib/platform';
import { useAuth } from '../contexts/AuthContext';
import { iapAvailable, getPurchases, configurePurchases } from '../lib/purchases';
import { NOME_ENTRADA, NOME_CLUBE, MAX_CONVIDADOS_ENTRADA, MAX_CONVIDADOS_CLUBE, PUBLICO, isPlanoEntrada, nomePlano } from '../config/planos';
import { validarDocumento, mascararDocumento } from '../lib/documento';
import { refreshSubscription } from '../hooks/useSubscription';

function formatPrice(cents, currency = 'BRL') {
  if (!cents) return 'Grátis';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
}

function statusBadge(status, colors) {
  const map = {
    trialing:  { label: 'Em avaliação', color: '#f59e0b', bg: '#f59e0b15' },
    active:    { label: 'Ativa',         color: '#22c55e', bg: '#22c55e15' },
    past_due:  { label: 'Pagamento pendente', color: '#ef4444', bg: '#ef444415' },
    paused:    { label: 'Pausada',       color: '#94a3b8', bg: '#94a3b815' },
    canceled:  { label: 'Cancelada',     color: '#94a3b8', bg: '#94a3b815' },
    expired:   { label: 'Expirada',      color: '#ef4444', bg: '#ef444415' },
  };
  const s = map[status] || { label: status, color: colors.textSecondary, bg: 'transparent' };
  return (
    <span style={{ display: 'inline-flex', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: s.color, backgroundColor: s.bg }}>
      {s.label}
    </span>
  );
}

export function BillingPage() {
  const { colors } = useTheme();
  const [sub, setSub] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [planoEscolhido, setPlanoEscolhido] = useState(null); // abre o formulário "Dados da assinatura"
  const [params] = useSearchParams();
  const novo = params.get('novo') === '1';

  useEffect(() => {
    Promise.all([
      api.get('/billing/subscription').catch(() => null),
      api.get('/billing/plans').catch(() => []),
    ]).then(([s, p]) => {
      setSub(s); setPlans(p || []); setLoading(false);
      // Vindo do site/cadastro com ?plano=pro|clube&ciclo=mensal|anual → já abre o formulário.
      const plano = params.get('plano');
      if (plano && !isNative()) {
        const anual = params.get('ciclo') === 'anual';
        const id = `${plano === 'clube' ? 'clube' : 'pro'}${anual ? '_annual' : ''}`;
        if ((p || []).some((x) => x.id === id)) setPlanoEscolhido(id);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCheckout(planId) {
    if (isNative()) return;
    setPlanoEscolhido(planId);
  }

  async function confirmarCheckout(planId, dados) {
    // Compliance lojas (Apple 3.1.1 / Google): não vendemos assinatura digital
    // DENTRO do app. As CTAs de compra ficam escondidas no nativo; este guard
    // é só cinto de segurança caso algo chame o checkout.
    if (isNative()) return;
    // Quem está no Clube e escolhe o plano de entrada: avisa o que perde.
    const noClube = !sub?.read_only && (sub?.plan_id === 'clube' || sub?.plan_id === 'clube_annual');
    if (noClube && isPlanoEntrada(planId)) {
      const ok = await notify.confirm(
        `Atenção: sua conta está no plano ${NOME_CLUBE}.\n\n` +
        `No plano ${NOME_ENTRADA} você fica com:\n` +
        `• o responsável + ${MAX_CONVIDADOS_ENTRADA} convidado (hoje até ${MAX_CONVIDADOS_CLUBE})\n` +
        '• 1 categoria por clube\n\n' +
        'Membros já aceitos continuam, mas novos convites respeitam o limite.\n\n' +
        `Assinar o ${NOME_ENTRADA} mesmo assim?`,
        { confirmText: `Assinar ${NOME_ENTRADA}`, cancelText: 'Voltar' }
      );
      if (!ok) return;
    }
    setCheckoutLoading(planId);
    try {
      const data = await api.post('/billing/checkout', { plan_id: planId, ...dados });
      // Em nativo (iOS/Android) abrir no browser embutido evita rejeição
      // da Apple pela Guideline 3.1.1 (payments) — o pagamento acontece
      // fora do app e volta pro app via deep link no sucesso.
      if (data.init_point) await openExternalUrl(data.init_point, { sameTab: true });
    } catch (err) {
      notify.error(err.message || 'Erro ao abrir checkout');
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function cancelSubscription() {
    const ok = await notify.confirm(
      'Tem certeza que deseja cancelar sua assinatura?\n\nO acesso pago será encerrado e você perderá os recursos premium.',
      { confirmText: 'Cancelar assinatura', cancelText: 'Voltar' }
    );
    if (!ok) return;
    try {
      await api.post('/billing/cancel', {});
      notify.success('Assinatura cancelada.');
      const s = await api.get('/billing/subscription').catch(() => null);
      setSub(s);
    } catch (err) {
      notify.error(err.message || 'Erro ao cancelar');
    }
  }

  if (loading) {
    return <div style={{ padding: 32, color: colors.textSecondary }}>Carregando…</div>;
  }

  const native = isNative();

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 960, margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: colors.text, margin: 0 }}>
        {novo ? 'Escolha o plano da sua equipe' : 'Assinatura'}
      </h1>
      <p style={{ fontSize: '0.875rem', color: colors.textSecondary, marginTop: 4, marginBottom: 24 }}>
        {novo
          ? `Conta criada. O TactiPlan é feito para ${PUBLICO}: escolha o plano e conclua o pagamento para começar.`
          : 'Gerencie o plano e os pagamentos da conta.'}
      </p>

      {planoEscolhido && !native && (
        <DadosAssinatura
          colors={colors}
          plano={plans.find((p) => p.id === planoEscolhido)}
          conta={sub?.conta}
          loading={checkoutLoading === planoEscolhido}
          onCancelar={() => setPlanoEscolhido(null)}
          onConfirmar={(dados) => confirmarCheckout(planoEscolhido, dados)}
        />
      )}

      <CurrentSubscription sub={sub} colors={colors} onCancel={cancelSubscription} native={native} />

      {native && <NativeBillingSection sub={sub} colors={colors} onSub={setSub} />}

      {!native && (() => {
        const paidPlans = plans.filter(p =>
          p.id !== 'lifetime'
          && p.id !== 'free'
          && p.price_cents > 0
        );
        if (paidPlans.length === 0) return null;
        const isTrialExpiringOrExpired = sub?.status === 'trialing' || !!sub?.read_only;
        // Ordena: Pro mensal, Clube mensal, Pro anual, Clube anual
        const order = ['pro', 'clube', 'pro_annual', 'clube_annual'];
        const sorted = [...paidPlans].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        return (
          <div style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: colors.text, margin: '0 0 12px' }}>
              {isTrialExpiringOrExpired ? 'Escolha como continuar' : 'Planos disponíveis'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              {sorted.map((p) => (
                <PlanItem
                  key={p.id}
                  plan={p}
                  colors={colors}
                  onSelect={() => startCheckout(p.id)}
                  loading={checkoutLoading === p.id}
                  highlight={p.id === 'clube_annual'}
                  isCurrent={p.id === sub?.plan_id && sub?.status === 'active' && !sub?.read_only}
                />
              ))}
            </div>
          </div>
        );
      })()}

    </div>
  );
}

// Seção de billing do app NATIVO.
// iOS com IAP configurado: plano Free → grade de compra nativa (StoreKit);
// assinatura da App Store → gerenciar/restaurar. Demais casos (Android,
// binário antigo, chave ausente, assinatura do site) → aviso neutro.
function NativeBillingSection({ sub, colors, onSub }) {
  const isFree = !!sub?.read_only; // F1: sem Free — "sem assinatura ativa"
  if (getPlatform() === 'ios' && iapAvailable()) {
    if (isFree) return <IapPlansSection colors={colors} onSub={onSub} />;
    if (sub?.provider === 'apple') return <AppleManageSection colors={colors} onSub={onSub} />;
  }
  return <NativeManageNotice colors={colors} isFree={isFree} />;
}

// Ordem e rótulos dos produtos da loja (mesmo mapa do backend).
const IAP_PRODUCTS = [
  { id: 'com.faggin.tactiplan.pro.monthly',   name: nomePlano('pro'),          per: '/mês', desc: `Responsável + ${MAX_CONVIDADOS_ENTRADA} convidado` },
  { id: 'com.faggin.tactiplan.clube.monthly', name: nomePlano('clube'),        per: '/mês', desc: 'Comissão completa e categorias' },
  { id: 'com.faggin.tactiplan.pro.yearly',    name: nomePlano('pro_annual'),   per: '/ano', desc: '2 meses grátis vs. mensal' },
  { id: 'com.faggin.tactiplan.clube.yearly',  name: nomePlano('clube_annual'), per: '/ano', desc: '2 meses grátis vs. mensal' },
];

async function pollSubscriptionChange(onSub, tries = 10) {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await api.get('/billing/subscription').catch(() => null);
    if (s && !s.read_only) { onSub(s); refreshSubscription(); return true; }
  }
  return false;
}

function IapPlansSection({ colors, onSub }) {
  const { user } = useAuth();
  const [pkgs, setPkgs] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  // Timeout: se a loja não responder, mostra erro (com retry) em vez de
  // carregar eternamente.
  const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('A loja demorou pra responder. Tente novamente em instantes.')), ms)),
  ]);

  async function load() {
    setError(null);
    setPkgs(null);
    let stage = 'configure';
    try {
      const Purchases = getPurchases(); // síncrono — NÃO dar await no Proxy
      await withTimeout(configurePurchases(user?.id), 15000);
      stage = 'offerings';
      let list = [];
      try {
        const { current } = await withTimeout(Purchases.getOfferings(), 20000);
        list = current?.availablePackages || [];
      } catch { /* cai pro fallback abaixo */ }
      if (list.length === 0) {
        // Fallback: busca os produtos DIRETO na loja. O offerings pode falhar
        // no ambiente de revisão da Apple (assinaturas "Waiting for Review"
        // às vezes não resolvem lá) — sem isso o revisor via tela vazia.
        stage = 'products';
        const { products } = await withTimeout(
          Purchases.getProducts({ productIdentifiers: IAP_PRODUCTS.map((m) => m.id) }), 20000
        );
        list = (products || []).map((prod) => ({ __direct: true, identifier: prod.identifier, product: prod }));
      }
      setPkgs(list);
    } catch (e) {
      const detail = e?.underlyingErrorMessage || e?.message || 'Não foi possível carregar os planos.';
      setError(`[${stage}] ${detail}${e?.code ? ` (code ${e.code})` : ''}`);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  async function buy(pkg) {
    setBusy(pkg.identifier);
    try {
      const Purchases = getPurchases();
      if (pkg.__direct) await Purchases.purchaseStoreProduct({ product: pkg.product });
      else await Purchases.purchasePackage({ aPackage: pkg });
      notify.success('Compra concluída! Liberando seu acesso…');
      const ok = await pollSubscriptionChange(onSub);
      if (!ok) notify.info('Compra registrada — seu acesso será liberado em instantes.');
    } catch (e) {
      const cancelled = e?.userCancelled || /cancel/i.test(String(e?.code || e?.message || ''));
      if (!cancelled) notify.error(e?.message || 'Não foi possível concluir a compra.');
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    setBusy('restore');
    try {
      const Purchases = getPurchases();
      await Purchases.restorePurchases();
      const ok = await pollSubscriptionChange(onSub, 3);
      notify[ok ? 'success' : 'info'](ok ? 'Compras restauradas!' : 'Nenhuma compra ativa encontrada.');
    } catch (e) {
      notify.error(e?.message || 'Não foi possível restaurar as compras.');
    } finally {
      setBusy(null);
    }
  }

  const ordered = (pkgs || [])
    .map((pkg) => ({ pkg, meta: IAP_PRODUCTS.find((m) => m.id === (pkg.product?.identifier || '')) }))
    .sort((a, b) => (a.meta ? IAP_PRODUCTS.indexOf(a.meta) : 99) - (b.meta ? IAP_PRODUCTS.indexOf(b.meta) : 99));

  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: colors.text, margin: '0 0 12px' }}>Planos disponíveis</h2>
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ color: colors.textSecondary, fontSize: '0.875rem', margin: 0 }}>{error}</p>
          <Button size="sm" variant="secondary" onClick={load}>Tentar novamente</Button>
        </div>
      )}
      {!error && pkgs === null && <p style={{ color: colors.textSecondary, fontSize: '0.875rem' }}>Carregando planos…</p>}
      {!error && pkgs !== null && pkgs.length === 0 && (
        <p style={{ color: colors.textSecondary, fontSize: '0.875rem' }}>
          Planos indisponíveis no momento — a loja ainda não liberou os produtos. Tente novamente mais tarde.
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {ordered.map(({ pkg, meta }) => (
          <div key={pkg.identifier} style={{ padding: 16, backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <strong style={{ color: colors.text }}>{meta?.name || pkg.product?.title || pkg.identifier}</strong>
              <span style={{ color: colors.text, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {pkg.product?.priceString}
                <span style={{ fontWeight: 400, color: colors.textSecondary, fontSize: 13 }}>{meta?.per || ''}</span>
              </span>
            </div>
            {meta?.desc && <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: 2 }}>{meta.desc}</div>}
            <div style={{ height: 12 }} />
            <Button size="sm" fullWidth onClick={() => buy(pkg)} disabled={busy !== null}>
              {busy === pkg.identifier ? 'Abrindo…' : 'Assinar'}
            </Button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={restore} disabled={busy !== null} style={{ background: 'transparent', border: 'none', color: colors.primary, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', padding: 4, alignSelf: 'flex-start' }}>
          {busy === 'restore' ? 'Restaurando…' : 'Restaurar compras'}
        </button>
        <p style={{ fontSize: '0.75rem', color: colors.textSecondary, margin: 0, lineHeight: 1.5 }}>
          A assinatura é cobrada no seu Apple ID e renova automaticamente até ser cancelada
          nas configurações de assinaturas da App Store.
        </p>
      </div>
    </div>
  );
}

function AppleManageSection({ colors, onSub }) {
  return (
    <div style={{ marginTop: 24, padding: 16, backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12 }}>
      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: colors.text, marginBottom: 6 }}>Assinatura pela App Store</div>
      <p style={{ fontSize: '0.85rem', color: colors.textSecondary, margin: '0 0 12px', lineHeight: 1.55 }}>
        Sua assinatura é cobrada no seu Apple ID. Pra trocar de plano ou cancelar, use as
        configurações de assinaturas da App Store.
      </p>
      <Button size="sm" variant="secondary" onClick={() => openExternalUrl('https://apps.apple.com/account/subscriptions')}>
        Gerenciar assinatura
      </Button>
    </div>
  );
}

// Aviso no app NATIVO no lugar da grade de planos. As lojas (Apple 3.1.1 /
// Google Play) não permitem vender assinatura digital dentro do app nem levar
// a checkout externo. Então no app só informamos (texto puro, sem botão/link).
// No iOS a Apple é MAIS rígida: nem citar o site/URL de compra — texto 100%
// neutro. No Android citamos o site (tolerado pelo Play).
function NativeManageNotice({ colors, isFree }) {
  const isIos = getPlatform() === 'ios';
  if (isFree) {
    // Sem assinatura no app: texto neutro, sem botão/link de compra.
    return (
      <div style={{ marginTop: 24, padding: 16, backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: colors.text, marginBottom: 6 }}>Conta inativa</div>
        <p style={{ fontSize: '0.85rem', color: colors.textSecondary, margin: 0, lineHeight: 1.55 }}>
          Sua conta está em modo só leitura. Fale com o responsável pela equipe.
        </p>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 24, padding: 16, backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12 }}>
      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: colors.text, marginBottom: 6 }}>
        Planos e pagamentos
      </div>
      {isIos ? (
        <p style={{ fontSize: '0.85rem', color: colors.textSecondary, margin: 0, lineHeight: 1.55 }}>
          A assinatura da sua conta é gerenciada fora do app. Seu acesso é liberado
          automaticamente aqui assim que a assinatura estiver ativa.
        </p>
      ) : (
        <p style={{ fontSize: '0.85rem', color: colors.textSecondary, margin: 0, lineHeight: 1.55 }}>
          As assinaturas do TactiPlan são gerenciadas no site. Acesse{' '}
          <strong style={{ color: colors.text }}>tactiplan.faggin.com.br</strong> pelo navegador
          para assinar ou trocar de plano. Seu acesso é liberado automaticamente aqui no app
          assim que a assinatura estiver ativa.
        </p>
      )}
    </div>
  );
}

function CurrentSubscription({ sub, colors, onCancel, native }) {
  if (!sub) {
    return (
      <div style={{ padding: 20, backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <AlertTriangle size={20} color="#f59e0b" />
          <strong style={{ color: colors.text }}>Sem assinatura ativa</strong>
        </div>
        <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: 0 }}>
          {native
            ? 'Sua assinatura é gerenciada no site — veja como continuar logo abaixo.'
            : 'Escolha um plano abaixo para começar a usar todos os recursos.'}
        </p>
      </div>
    );
  }

  if (sub.is_admin || sub.plan_id === 'admin') {
    return (
      <Card colors={colors} icon={<ShieldCheck size={20} color="#a855f7" />} title="Conta Admin" subtitle="Acesso ilimitado a toda a plataforma." />
    );
  }

  if (sub.plan_id === 'lifetime') {
    return (
      <Card colors={colors} icon={<Infinity size={20} color="#22c55e" />}
        title={sub.is_cortesia ? 'Cortesia' : 'Plano Vitalício'}
        subtitle="Acesso completo, sem cobrança e sem data de término." />
    );
  }

  // Sem assinatura ativa (F1: não existe mais plano grátis) → só leitura.
  if (sub.read_only) {
    const lapsed = sub.lapsed;
    return (
      <div style={{ padding: 20, backgroundColor: colors.surface, border: '1px solid #f59e0b55', borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <AlertTriangle size={20} color="#f59e0b" />
          <strong style={{ color: colors.text, fontSize: '1.05rem' }}>Sem assinatura ativa — modo só leitura</strong>
        </div>
        <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: 0, lineHeight: 1.55 }}>
          {lapsed
            ? `A assinatura ${lapsed.plan_name || ''} terminou. Seus dados estão salvos e podem ser consultados; criar e editar volta ao renovar.`
            : 'Seus dados podem ser consultados, mas criar e editar depende de uma assinatura ativa.'}
          {native ? ' Fale com o responsável pela equipe.' : ' Escolha um plano abaixo.'}
        </p>
      </div>
    );
  }

  const isTrial = sub.status === 'trialing';
  const trialDays = sub.trial_days_left ?? null;
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString('pt-BR') : null;

  return (
    <div style={{ padding: 20, backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Crown size={20} color="#2563eb" />
            <strong style={{ color: colors.text, fontSize: '1.05rem' }}>{sub.plan_name || sub.plan_id}</strong>
            {statusBadge(sub.status, colors)}
          </div>
          {sub.price_cents != null && (
            <div style={{ color: colors.textSecondary, fontSize: '0.875rem' }}>
              {formatPrice(sub.price_cents)}{sub.interval === 'yearly' ? '/ano' : '/mês'}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {isTrial && trialDays !== null && trialDays > 0 && (
          <InfoItem label="Dias restantes do trial" value={`${trialDays} ${trialDays === 1 ? 'dia' : 'dias'}`} colors={colors} highlight={trialDays <= 3 ? '#f59e0b' : undefined} />
        )}
        {periodEnd && (
          <InfoItem
            label={isTrial ? (trialDays === 0 ? 'Trial expirou em' : 'Trial expira em') : 'Próxima cobrança'}
            value={periodEnd}
            colors={colors}
            highlight={isTrial && trialDays === 0 ? '#ef4444' : undefined}
          />
        )}
      </div>

      {isTrial && trialDays === 0 && (
        <div style={{ marginTop: 16, padding: 14, backgroundColor: '#ef444415', borderRadius: 8, border: '1px solid #ef444440', fontSize: '0.875rem', color: colors.text }}>
          <strong style={{ color: '#ef4444' }}>Seu período de avaliação terminou.</strong>{' '}
          {native
            ? 'Assim que sua assinatura estiver ativa, o acesso é liberado automaticamente aqui no app.'
            : 'Escolha um dos planos abaixo para continuar usando o TactiPlan com todos os recursos.'}
        </div>
      )}

      {isTrial && trialDays > 0 && (
        <div style={{ marginTop: 16, padding: 12, backgroundColor: '#f59e0b15', borderRadius: 8, border: '1px solid #f59e0b40', fontSize: '0.8125rem', color: colors.text }}>
          <strong>Você está no período de avaliação</strong> — {native
            ? `restam ${trialDays} dia${trialDays === 1 ? '' : 's'} de acesso completo.`
            : `após ${trialDays} dia${trialDays === 1 ? '' : 's'} é necessário escolher um plano (${NOME_ENTRADA} ou ${NOME_CLUBE}) pra continuar editando.`}
        </div>
      )}

      {/* Add-ons (só pra assinatura paga ativa) — escondidos no app nativo
          (compra de add-on também é venda digital: fica só na web). */}
      {!native && sub.status === 'active' && sub.plan_id !== 'lifetime' && !sub.is_admin && (
        <AddonsSection colors={colors} />
      )}

      {/* Cancelar (só pra planos pagos não-vitalício/admin; assinatura de LOJA cancela na App Store/Play) */}
      {sub.plan_id !== 'lifetime' && !sub.is_admin && sub.provider !== 'apple' && sub.provider !== 'google' && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0.5rem 0.875rem',
              background: 'transparent',
              border: `1px solid #ef444440`,
              color: '#ef4444',
              borderRadius: 6,
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#ef444415'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <XCircle size={14} />
            Cancelar assinatura
          </button>
        </div>
      )}
    </div>
  );
}

// Gerenciamento de add-ons (clubes/categorias extras) da assinatura ativa.
function AddonsSection({ colors }) {
  const [data, setData] = useState(null);
  const [clubs, setClubs] = useState(0);
  const [cats, setCats] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/billing/addons')
      .then((d) => { setData(d); setClubs(d.extra_clubs || 0); setCats(d.extra_categories || 0); })
      .catch(() => setData({ can_manage: false }));
  }, []);

  if (!data || !data.can_manage) return null;

  const isAnnual = data.interval === 'yearly';
  const isClube = data.is_clube;
  const clubPrice = (data.prices?.extra_club ?? 2000) / 100;
  const catPrice = (data.prices?.extra_category ?? 500) / 100;
  const addonMonthly = clubs * clubPrice + cats * catPrice;
  const dirty = clubs !== (data.extra_clubs || 0) || cats !== (data.extra_categories || 0);
  const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.post('/billing/addons', { extra_clubs: clubs, extra_categories: cats });
      setClubs(res.extra_clubs); setCats(res.extra_categories);
      setData((d) => ({ ...d, extra_clubs: res.extra_clubs, extra_categories: res.extra_categories }));
      notify.success(
        res.effective === 'next_cycle'
          ? 'Add-ons atualizados — entram na próxima fatura.'
          : 'Add-ons atualizados.'
      );
    } catch (e) {
      notify.error(e.message || 'Não foi possível atualizar os add-ons.');
    } finally { setSaving(false); }
  };

  const Stepper = ({ label, sub, value, setValue, unit, disabled }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0.6rem 0' }}>
      <div>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.text }}>{label}</div>
        <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>{sub}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => setValue(Math.max(0, value - 1))} disabled={disabled || value <= 0}
          style={stepBtn(colors, disabled || value <= 0)}>−</button>
        <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 700, color: colors.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        <button onClick={() => setValue(value + 1)} disabled={disabled}
          style={stepBtn(colors, disabled)}>+</button>
      </div>
    </div>
  );

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.textSecondary, marginBottom: 4 }}>
        Add-ons
      </div>
      {isAnnual && (
        <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginBottom: 8 }}>
          Add-ons no plano anual chegam em breve. Por enquanto, disponíveis no plano mensal.
        </div>
      )}

      <Stepper
        label="Clubes extras"
        sub={`+ ${brl(clubPrice)}/mês por clube`}
        value={clubs} setValue={setClubs}
        disabled={isAnnual}
      />
      {isClube && (
        <Stepper
          label="Categorias extras"
          sub={`+ ${brl(catPrice)}/mês por categoria (além das 5 do Clube)`}
          value={cats} setValue={setCats}
          disabled={isAnnual}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${colors.border}` }}>
        <div style={{ fontSize: '0.8rem', color: colors.textSecondary }}>
          Adicionais: <strong style={{ color: colors.text }}>{brl(addonMonthly)}/mês</strong>
        </div>
        <button
          onClick={save}
          disabled={!dirty || saving || isAnnual}
          style={{
            padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none',
            backgroundColor: (!dirty || saving || isAnnual) ? colors.border : colors.primary,
            color: colors.primaryText, fontSize: '0.82rem', fontWeight: 600,
            cursor: (!dirty || saving || isAnnual) ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Salvando…' : 'Salvar add-ons'}
        </button>
      </div>
    </div>
  );
}

function stepBtn(colors, disabled) {
  return {
    width: 30, height: 30, borderRadius: 6,
    border: `1px solid ${colors.border}`,
    backgroundColor: disabled ? 'transparent' : colors.surface,
    color: disabled ? colors.textSecondary : colors.text,
    fontSize: '1.1rem', fontWeight: 700, lineHeight: 1,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}

function Card({ colors, icon, title, subtitle }) {
  return (
    <div style={{ padding: 20, backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        {icon}
        <strong style={{ color: colors.text, fontSize: '1.05rem' }}>{title}</strong>
      </div>
      <div style={{ color: colors.textSecondary, fontSize: '0.875rem' }}>{subtitle}</div>
    </div>
  );
}

function InfoItem({ label, value, colors, highlight }) {
  return (
    <div>
      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, color: colors.textSecondary }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 600, color: highlight || colors.text, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// Preço mensal "de referência" pra calcular economia do anual vs 12x mensal.
// Mantido inline pra não ter que carregar toda a lista de plans no PlanItem.
const MONTHLY_REF = { pro: 3990, clube: 8900 };

function PlanItem({ plan, colors, onSelect, loading, highlight, isCurrent }) {
  const isYearly = plan.interval === 'yearly';
  const monthlyEquiv = isYearly ? plan.price_cents / 12 : plan.price_cents;
  // Economia real: (12 × mensal - anual) / (12 × mensal)
  const baseId = String(plan.id).replace('_annual', '');
  const monthlyRef = MONTHLY_REF[baseId];
  const savingsPct = (isYearly && monthlyRef)
    ? Math.round(((monthlyRef * 12 - plan.price_cents) / (monthlyRef * 12)) * 100)
    : 0;
  return (
    <div style={{
      padding: 16,
      backgroundColor: colors.surface,
      border: `1px solid ${highlight ? colors.primary : colors.border}`,
      borderRadius: 12,
      position: 'relative',
      boxShadow: highlight ? `0 0 0 4px ${colors.primary}1A` : 'none',
    }}>
      {highlight && !isCurrent && (
        <span style={{
          position: 'absolute', top: -10, right: 12,
          background: colors.primary, color: colors.primaryText,
          fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: 999,
          letterSpacing: '0.04em',
        }}>RECOMENDADO</span>
      )}
      {isCurrent && (
        <span style={{
          position: 'absolute', top: -10, right: 12,
          background: '#22c55e', color: '#fff',
          fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: 999,
          letterSpacing: '0.04em',
        }}>PLANO ATUAL</span>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong style={{ color: colors.text, fontSize: '1rem' }}>{plan.name}</strong>
        <span style={{ color: colors.text, fontWeight: 700 }}>
          {formatPrice(monthlyEquiv)}
          <span style={{ fontWeight: 400, color: colors.textSecondary, fontSize: 13 }}>/mês</span>
        </span>
      </div>
      {isYearly ? (
        <div style={{ fontSize: '0.75rem', color: '#22c55e', marginTop: 2 }}>
          Cobrado anualmente: {formatPrice(plan.price_cents)}{savingsPct > 0 ? ` · economize ${savingsPct}%` : ''}
        </div>
      ) : (
        <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: 2 }}>
          Sem fidelidade · cancele quando quiser
        </div>
      )}
      <div style={{ fontSize: '0.78rem', color: colors.textSecondary, marginTop: 8, lineHeight: 1.45 }}>
        {isPlanoEntrada(plan.id)
          ? `Responsável + ${MAX_CONVIDADOS_ENTRADA} convidado · 1 clube · 1 categoria · quadro tático e exportações`
          : `Responsável + ${MAX_CONVIDADOS_CLUBE} convidados · até 5 categorias · comissão técnica completa`}
      </div>
      <div style={{ height: 12 }} />
      <Button size="sm" fullWidth onClick={onSelect} disabled={loading || isCurrent} icon={<CreditCard size={14} />}>
        {isCurrent ? 'Você está aqui' : (loading ? 'Abrindo…' : 'Assinar')}
      </Button>
    </div>
  );
}

// Dados da assinatura (F1): nome da conta (time/clube/escolinha) + responsável
// com CPF ou CNPJ validado por dígito verificador. O servidor valida de novo.
function DadosAssinatura({ colors, plano, conta, loading, onCancelar, onConfirmar }) {
  const { user } = useAuth();
  const [contaNome, setContaNome] = useState(conta?.nome || '');
  const [respNome, setRespNome] = useState(conta?.responsavel_nome || user?.name || '');
  const [doc, setDoc] = useState(conta?.responsavel_documento ? mascararDocumento(conta.responsavel_documento) : '');
  const [erro, setErro] = useState('');
  if (!plano) return null;

  const docInfo = validarDocumento(doc);
  const docErro = doc && docInfo.digitos.length >= 11 && !docInfo.ok
    ? `${docInfo.tipo ? docInfo.tipo.toUpperCase() : 'Documento'} inválido — confira os números.`
    : '';

  function enviar(e) {
    e.preventDefault();
    setErro('');
    if (contaNome.trim().length < 2) return setErro('Informe o nome do time, clube ou escolinha.');
    if (respNome.trim().length < 3) return setErro('Informe o nome do responsável.');
    if (!docInfo.ok) return setErro('Informe um CPF ou CNPJ válido do responsável.');
    onConfirmar({ conta_nome: contaNome.trim(), responsavel_nome: respNome.trim(), responsavel_documento: docInfo.digitos });
  }

  const campo = { width: '100%', padding: '0.6rem 0.75rem', borderRadius: 8, border: `1px solid ${colors.border}`, backgroundColor: colors.background, color: colors.text, fontSize: '0.9rem', boxSizing: 'border-box' };
  const rotulo = { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: colors.text, marginBottom: 4 };
  const preco = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plano.price_cents / 100);

  return (
    <form onSubmit={enviar} style={{ marginBottom: 24, padding: 20, backgroundColor: colors.surface, border: `1px solid ${colors.primary}`, borderRadius: 12, boxShadow: `0 0 0 4px ${colors.primary}1A` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <strong style={{ color: colors.text, fontSize: '1.05rem' }}>Dados da assinatura</strong>
        <span style={{ color: colors.textSecondary, fontSize: '0.85rem' }}>
          {plano.name} · {preco}{plano.interval === 'yearly' ? '/ano' : '/mês'}
        </span>
      </div>
      <p style={{ fontSize: '0.82rem', color: colors.textSecondary, margin: '0 0 16px', lineHeight: 1.5 }}>
        A assinatura é da conta da equipe. Depois destes dados você segue para o pagamento no Mercado Pago.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <label>
          <span style={rotulo}>Nome do time, clube ou escolinha</span>
          <input style={campo} value={contaNome} onChange={(e) => setContaNome(e.target.value)} maxLength={120} placeholder="Ex.: Sub-15 Atlético Exemplo" required />
        </label>
        <label>
          <span style={rotulo}>Responsável (nome completo)</span>
          <input style={campo} value={respNome} onChange={(e) => setRespNome(e.target.value)} maxLength={160} required />
        </label>
        <label>
          <span style={rotulo}>CPF ou CNPJ do responsável</span>
          <input style={{ ...campo, borderColor: docErro ? '#ef4444' : colors.border }} value={doc} inputMode="numeric"
            onChange={(e) => setDoc(mascararDocumento(e.target.value))} placeholder="000.000.000-00" required aria-invalid={!!docErro} />
          {docErro && <span style={{ display: 'block', color: '#ef4444', fontSize: '0.75rem', marginTop: 4 }}>{docErro}</span>}
        </label>
      </div>
      {erro && <div style={{ marginTop: 12, color: '#ef4444', fontSize: '0.85rem' }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
        <Button type="button" variant="secondary" size="sm" onClick={onCancelar} disabled={loading}>Voltar</Button>
        <Button type="submit" size="sm" disabled={loading} icon={<CreditCard size={14} />}>
          {loading ? 'Abrindo o pagamento…' : 'Ir para o pagamento'}
        </Button>
      </div>
    </form>
  );
}
