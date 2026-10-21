// Billing — integração com Mercado Pago (modo opcional).
// Se MP_ACCESS_TOKEN não estiver setado, checkout/cancel remoto respondem 501,
// mas o ciclo de vida local (trial, status, cancel_at_period_end) continua rodando.

const { query } = require('../config/database');
const { ADDON_PRICES, ADDON_MAX, computeRecurringAmountCents } = require('../config/addons');
const { isAdmin, isLifetime } = require('../config/specialUsers');
const { nomePlano, isPlanoEntrada, config: planosCfg } = require('../config/planos');

let mpClient = null;
let PreApproval = null;
let PreApprovalPlan = null;
let Payment = null;

function getMP() {
  if (mpClient) return mpClient;
  if (!process.env.MP_ACCESS_TOKEN) return null;

  const { MercadoPagoConfig, PreApproval: PA, PreApprovalPlan: PAP, Payment: PAY } = require('mercadopago');
  mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  PreApproval = PA;
  PreApprovalPlan = PAP;
  Payment = PAY;
  return mpClient;
}

function isEnabled() {
  return !!process.env.MP_ACCESS_TOKEN;
}

// -----------------------------------------------------------------------------
// Helpers internos
// -----------------------------------------------------------------------------

// Registra um evento em billing_events. Falha silenciosa — auditoria nunca
// deve derrubar o fluxo principal.
async function logBillingEvent({ subscriptionId, userId, type, mpResourceId = null, status = null, raw = null }) {
  try {
    await query(
      `INSERT INTO billing_events (subscription_id, user_id, type, mp_resource_id, status, raw)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [subscriptionId || null, userId || null, String(type), mpResourceId, status, raw]
    );
  } catch (err) {
    console.error('logBillingEvent error:', err?.message);
  }
}

// Cancela a recorrência no Mercado Pago. Retorna true se OK, false em qualquer erro.
// Nunca lança — o cancelamento local acontece de qualquer jeito.
async function cancelOnMP(preapprovalId) {
  if (!isEnabled() || !preapprovalId) return false;
  try {
    const mp = getMP();
    const pa = new PreApproval(mp);
    await pa.update({ id: preapprovalId, body: { status: 'cancelled' } });
    return true;
  } catch (err) {
    console.error('cancelOnMP error:', err?.message);
    return false;
  }
}

// Cancela IMEDIATAMENTE (status='canceled') todas as subs ativas de um user.
// Usado no upgrade/checkout novo — o unique index parcial
// `uq_subscriptions_active_per_user` bloqueia 2 subs ativas do mesmo user, então
// precisamos fechar as antigas antes de inserir a nova.
// Não é o mesmo fluxo do cancelSubscription do usuário (que preserva o período).
async function _hardCancelActiveSubsForUser(userId, reason = 'upgrade', exceptSubId = null) {
  const r = await query(
    `SELECT id, mp_preapproval_id, plan_id, status, current_period_end
       FROM subscriptions
      WHERE user_id = $1
        AND status IN ('trialing','active','past_due','paused')
        AND plan_id <> 'lifetime'
        AND ($2::uuid IS NULL OR id <> $2)`,
    [userId, exceptSubId]
  );
  let closed = 0;
  for (const sub of r.rows) {
    const mpOk = await cancelOnMP(sub.mp_preapproval_id);
    await query(
      `UPDATE subscriptions
          SET status = 'canceled',
              cancel_at_period_end = TRUE,
              canceled_at = COALESCE(canceled_at, NOW()),
              updated_at = NOW()
        WHERE id = $1`,
      [sub.id]
    );
    await logBillingEvent({
      subscriptionId: sub.id,
      userId,
      type: 'subscription.canceled',
      mpResourceId: sub.mp_preapproval_id,
      status: 'canceled',
      raw: {
        reason,
        previous_status: sub.status,
        mp_cancel_ok: mpOk,
        plan_id: sub.plan_id,
      },
    });
    closed++;
  }
  return closed;
}

// -----------------------------------------------------------------------------
// Helper público: uma sub é considerada "ativa" para efeitos de acesso quando
// - status é trialing/active/past_due; OU
// - está em cancel_at_period_end e ainda dentro do período pago
//   (defensivo — permite deixar `status` intacto durante a graça).
// -----------------------------------------------------------------------------
function isSubscriptionActive(sub) {
  if (!sub) return false;
  const activeStatuses = ['trialing', 'active', 'past_due'];
  if (activeStatuses.includes(sub.status)) return true;
  if (sub.cancel_at_period_end === true && sub.current_period_end) {
    return new Date(sub.current_period_end) > new Date();
  }
  return false;
}

// -----------------------------------------------------------------------------
// Lookups
// -----------------------------------------------------------------------------

async function getPlan(planId) {
  const r = await query('SELECT * FROM plans WHERE id = $1 AND is_active = true', [planId]);
  return r.rows[0] || null;
}

async function getActiveSubscription(userId) {
  // Admin: acesso ilimitado independente de assinatura
  const userRes = await query('SELECT role FROM users WHERE id = $1', [userId]);
  const role = userRes.rows[0]?.role;
  if (role === 'admin') {
    return {
      plan_id: 'admin',
      plan_name: 'Admin',
      status: 'active',
      is_admin: true,
      features: { max_clubs: -1, max_athletes: -1, multi_user: true, admin: true },
    };
  }

  const r = await query(
    `SELECT s.*, p.name AS plan_name, p.price_cents, p.features, p.interval
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.user_id = $1
       AND (s.status IN ('trialing','active','past_due','paused')
            OR (s.cancel_at_period_end = TRUE AND s.current_period_end > NOW()))
     ORDER BY (s.plan_id = 'lifetime') DESC, (s.plan_id = 'free') ASC, s.created_at DESC LIMIT 1`,
    [userId]
  );
  const sub = r.rows[0];
  if (!sub) return null;

  // Calcula dias restantes do trial pra facilitar a UI
  if (sub.status === 'trialing' && sub.trial_ends_at) {
    const msLeft = new Date(sub.trial_ends_at).getTime() - Date.now();
    sub.trial_days_left = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
  }
  return sub;
}

// Subscription da workspace ativa. Considera admin-bypass se o owner da workspace é admin.
async function getSubscriptionForWorkspace(workspaceId) {
  if (!workspaceId) return null;

  // Quem é dono da workspace? Se admin, retorna features Admin.
  const wsRes = await query(
    `SELECT w.owner_id, u.role FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE w.id = $1`,
    [workspaceId]
  );
  if (wsRes.rows.length === 0) return null;
  if (wsRes.rows[0].role === 'admin') {
    return {
      plan_id: 'admin',
      plan_name: 'Admin',
      status: 'active',
      is_admin: true,
      features: { max_clubs: -1, max_athletes: -1, multi_user: true, max_coaches: 999, admin: true },
    };
  }

  const r = await query(
    `SELECT s.*, p.name AS plan_name, p.price_cents, p.features, p.interval
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.workspace_id = $1
       AND (s.status IN ('trialing','active','past_due','paused')
            OR (s.cancel_at_period_end = TRUE AND s.current_period_end > NOW()))
     ORDER BY (s.plan_id = 'lifetime') DESC, (s.plan_id = 'free') ASC, s.created_at DESC LIMIT 1`,
    [workspaceId]
  );
  const sub = r.rows[0];
  if (!sub) return null;

  if (sub.status === 'trialing' && sub.trial_ends_at) {
    const msLeft = new Date(sub.trial_ends_at).getTime() - Date.now();
    sub.trial_days_left = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
  }
  return sub;
}

// -----------------------------------------------------------------------------
// Ciclo de vida
// -----------------------------------------------------------------------------

async function startTrial(userId, planId = 'clube', days = 30) {
  const plan = await getPlan(planId);
  if (!plan) throw new Error('Plan not found');
  // Guarda contra re-trial: um usuário só pode ter UM trial na vida. Sem isso,
  // qualquer chamada repetida reabriria acesso grátis indefinidamente. A
  // checagem cobre qualquer assinatura já existente (trial ou paga).
  const prior = await query(
    'SELECT 1 FROM subscriptions WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  if (prior.rows.length > 0) {
    const err = new Error('Usuário já possui (ou já teve) uma assinatura — trial não pode ser reiniciado.');
    err.statusCode = 409;
    throw err;
  }
  // Trial também conta como sub ativa — precisa fechar as antigas pro unique
  // index não rejeitar.
  await _hardCancelActiveSubsForUser(userId, 'start_trial');
  const now = new Date();
  const trialEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const r = await query(
    `INSERT INTO subscriptions (user_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
     VALUES ($1, $2, 'trialing', $3, $4, $3) RETURNING *`,
    [userId, planId, trialEnd, now]
  );
  const sub = r.rows[0];
  await logBillingEvent({
    subscriptionId: sub.id,
    userId,
    type: 'subscription.trial_started',
    status: 'trialing',
    raw: { plan_id: planId, trial_days: days },
  });
  return sub;
}

// Cria preapproval (assinatura recorrente) no Mercado Pago.
// Retorna { init_point } — URL pra redirecionar o usuário.
async function createCheckout({ userId, planId, payerEmail, workspaceId = null, metadata = null }) {
  if (!isEnabled()) {
    const err = new Error('Payment provider not configured');
    err.statusCode = 501;
    throw err;
  }
  // getPlan só devolve plano ATIVO: pro/pro_annual (Essencial) saíram da venda em 21/10/2026.
  const plan = await getPlan(planId);
  if (!plan) {
    const err = new Error('Plano indisponível. Escolha o plano Clube (mensal ou anual).');
    err.statusCode = 400;
    throw err;
  }

  // IMPORTANTE: NÃO cancelamos a assinatura anterior aqui. O checkout pode ser
  // abandonado; cancelar antes de confirmar o pagamento deixaria o usuário sem
  // o plano que já pagava. A troca de plano só se efetiva quando o webhook
  // confirma o preapproval como autorizado (syncSubscriptionFromPreapproval).
  //
  // Limpa apenas checkouts PENDENTES antigos deste user (não-pagos, fora do
  // índice de ativos) pra não acumular lixo — nunca toca em sub ativa/paga.
  await query(
    `UPDATE subscriptions
        SET status = 'expired', updated_at = NOW()
      WHERE user_id = $1 AND status = 'pending'`,
    [userId]
  );

  const mp = getMP();
  const paPlan = new PreApprovalPlan(mp);

  // Fluxo baseado em PLANO (preapproval_plan): a conta MP recusa preapproval
  // direto (500), mas plano funciona e gera init_point (checkout por redirect).
  // Criamos um plano por checkout com o valor BASE do plano (add-ons são
  // comprados depois, via setAddons, que ajusta o valor). external_reference
  // = "userId|planId" pra vincular; guardamos o id do plano na sub pendente e,
  // quando a assinatura (preapproval) resultante chega no webhook, linkamos.
  const baseUrl = process.env.APP_BASE_URL || 'https://app.tactiplan.faggin.com.br';
  const result = await paPlan.create({
    body: {
      reason: `${nomePlano(plan.id, plan.name)} — TactiPlan`,
      external_reference: `${userId}|${planId}`,
      auto_recurring: {
        frequency: plan.interval === 'yearly' ? 12 : 1,
        frequency_type: 'months',
        transaction_amount: plan.price_cents / 100,
        currency_id: plan.currency || 'BRL',
      },
      back_url: `${baseUrl}/#/billing/callback`,
    },
  });

  // Sub nasce 'pending' guardando o id do PLANO (o preapproval real vem depois).
  const ins = await query(
    `INSERT INTO subscriptions (user_id, workspace_id, plan_id, status, mp_preapproval_plan_id, mp_status, metadata)
     VALUES ($1, $2, $3, 'pending', $4, $5, COALESCE($6::jsonb, '{}'::jsonb))
     RETURNING id`,
    [userId, workspaceId, planId, result.id, result.status, metadata ? JSON.stringify(metadata) : null]
  );

  await logBillingEvent({
    subscriptionId: ins.rows[0]?.id || null,
    userId,
    type: 'subscription.checkout_started',
    mpResourceId: result.id,
    status: result.status,
    raw: { plan_id: planId, workspace_id: workspaceId, preapproval_plan_id: result.id },
  });

  return { init_point: result.init_point, preapproval_plan_id: result.id };
}

// Mapeia status do Mercado Pago para nosso schema interno
function mapMpStatus(mpStatus) {
  const m = String(mpStatus || '').toLowerCase();
  if (['authorized', 'active', 'approved'].includes(m)) return 'active';
  if (m === 'trialing') return 'trialing';
  // 'pending' fica 'pending' (NÃO ativo) — preapproval criado mas não pago
  // ainda não libera acesso; só vira 'active' quando o pagamento confirma.
  if (m === 'pending') return 'pending';
  if (['paused'].includes(m)) return 'paused';
  if (['cancelled', 'canceled'].includes(m)) return 'canceled';
  if (['rejected', 'failed'].includes(m)) return 'past_due';
  if (['expired', 'finished'].includes(m)) return 'expired';
  return null;
}

async function fetchPreapproval(preapprovalId) {
  if (!isEnabled() || !preapprovalId) return null;
  const mp = getMP();
  const pa = new PreApproval(mp);
  try {
    return await pa.get({ id: preapprovalId });
  } catch (err) {
    console.error('fetchPreapproval error:', err?.message);
    return null;
  }
}

async function fetchPayment(paymentId) {
  if (!isEnabled() || !paymentId) return null;
  const mp = getMP();
  const pay = new Payment(mp);
  try {
    return await pay.get({ id: paymentId });
  } catch (err) {
    console.error('fetchPayment error:', err?.message);
    return null;
  }
}

async function syncSubscriptionFromPreapproval(preapprovalId, paOverride = null) {
  // paOverride: usado em testes pra injetar o preapproval sem chamar o MP.
  // Em produção nunca é passado (busca o preapproval real no MP).
  const pa = paOverride || await fetchPreapproval(preapprovalId);
  if (!pa) return null;

  const mappedStatus = mapMpStatus(pa.status);
  // external_reference vem no formato "userId|planId" do nosso createCheckout
  let userId = null;
  let planId = null;
  if (pa.external_reference && pa.external_reference.includes('|')) {
    [userId, planId] = pa.external_reference.split('|');
  }

  // Próxima data de cobrança
  const nextPaymentDate = pa.next_payment_date ? new Date(pa.next_payment_date) : null;
  // A assinatura (preapproval) criada pelo comprador vem LINKADA ao nosso plano.
  const planRef = pa.preapproval_plan_id || null;

  // Acha a sub local: (1) já linkada por preapproval_id; senão (2) a pendente
  // pelo id do PLANO que criamos no checkout; senão (3) por external_reference.
  let existing = await query(
    'SELECT id, user_id, plan_id, status, cancel_at_period_end, current_period_end FROM subscriptions WHERE mp_preapproval_id = $1',
    [preapprovalId]
  );
  if (existing.rows.length === 0 && planRef) {
    existing = await query(
      `SELECT id, user_id, plan_id, status, cancel_at_period_end, current_period_end
         FROM subscriptions WHERE mp_preapproval_plan_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [planRef]
    );
  }

  if (existing.rows.length > 0) {
    const local = existing.rows[0];

    if (mappedStatus === 'active') {
      // PAGAMENTO CONFIRMADO. Vincula o preapproval real, ativa a sub e cancela
      // as OUTRAS ativas do user (troca de plano só se efetiva aqui). Checkout
      // abandonado nunca chega neste ponto.
      await _hardCancelActiveSubsForUser(local.user_id, 'plan_switch_confirmed', local.id);
      await query(
        `UPDATE subscriptions SET
           status = 'active',
           mp_preapproval_id = $2,
           mp_status = $3,
           mp_payer_id = COALESCE($4, mp_payer_id),
           current_period_end = COALESCE($5, current_period_end),
           cancel_at_period_end = FALSE,
           updated_at = now()
         WHERE id = $1`,
        [local.id, preapprovalId, pa.status, pa.payer_id ? String(pa.payer_id) : null, nextPaymentDate]
      );
    } else {
      // Não rebaixa uma sub em período de graça (cancelou mas período ainda
      // válido) pra 'canceled' — o cron faz a transição final no fim do período.
      const inGrace = local.cancel_at_period_end === true
        && local.current_period_end && new Date(local.current_period_end) > new Date();
      const nextStatus = (mappedStatus === 'canceled' && inGrace) ? local.status : mappedStatus;
      await query(
        `UPDATE subscriptions SET
           status = COALESCE($2, status),
           mp_preapproval_id = COALESCE(mp_preapproval_id, $3),
           mp_status = $4,
           mp_payer_id = COALESCE($5, mp_payer_id),
           current_period_end = COALESCE($6, current_period_end),
           updated_at = now()
         WHERE id = $1`,
        [local.id, nextStatus, preapprovalId, pa.status, pa.payer_id ? String(pa.payer_id) : null, nextPaymentDate]
      );
    }
  } else if (userId && planId) {
    // Checkout não criou o registro local antes (raro). Se já está autorizado,
    // fecha as ativas e insere como active; senão insere pending.
    if (mappedStatus === 'active') {
      await _hardCancelActiveSubsForUser(userId, 'sync_from_preapproval');
    }
    await query(
      `INSERT INTO subscriptions (user_id, plan_id, status, mp_preapproval_id, mp_status, mp_payer_id, current_period_end)
       VALUES ($1, $2, COALESCE($3, 'pending'), $4, $5, $6, $7)`,
      [userId, planId, mappedStatus, preapprovalId, pa.status, pa.payer_id ? String(pa.payer_id) : null, nextPaymentDate]
    );
  }

  return { preapprovalId, status: mappedStatus, mp_status: pa.status };
}

async function handleWebhook(payload, headers = {}) {
  const type = payload?.type || payload?.action || 'unknown';
  const resourceId = payload?.data?.id || payload?.id || null;

  // Log do evento bruto pra auditoria
  await query(
    `INSERT INTO billing_events (type, mp_resource_id, raw) VALUES ($1, $2, $3)`,
    [String(type), resourceId ? String(resourceId) : null, payload]
  );

  if (!isEnabled() || !resourceId) return { ok: true, skipped: true };

  try {
    // Eventos de assinatura: type = 'subscription_preapproval' | 'preapproval'
    if (type.includes('preapproval')) {
      await syncSubscriptionFromPreapproval(resourceId);
    }
    // Eventos de pagamento dentro da assinatura
    else if (type.includes('subscription_authorized_payment') || type.startsWith('payment')) {
      const payment = await fetchPayment(resourceId);
      if (payment?.metadata?.preapproval_id || payment?.point_of_interaction?.transaction_data?.preapproval_id) {
        const preId = payment.metadata?.preapproval_id || payment.point_of_interaction?.transaction_data?.preapproval_id;
        await syncSubscriptionFromPreapproval(preId);
      } else if (payment?.external_reference?.includes('|')) {
        // Fallback sem preapproval_id: identifica a sub pelo external_reference
        // (userId|planId) e promove a pendente pra ativa quando o pagamento
        // aprovar, cancelando as demais ativas do user.
        const [userId, planId] = payment.external_reference.split('|');
        if (userId && mapMpStatus(payment.status) === 'active') {
          const pend = await query(
            `SELECT id FROM subscriptions
              WHERE user_id = $1 AND plan_id = $2
                AND status IN ('pending','trialing','past_due','paused')
              ORDER BY created_at DESC LIMIT 1`,
            [userId, planId]
          );
          if (pend.rows[0]) {
            await _hardCancelActiveSubsForUser(userId, 'payment_confirmed', pend.rows[0].id);
            await query(
              `UPDATE subscriptions
                  SET status='active', mp_status=$2, cancel_at_period_end=FALSE, updated_at=now()
                WHERE id=$1`,
              [pend.rows[0].id, payment.status]
            );
          }
        }
      }
    }
  } catch (err) {
    // Propaga pro caller (rota do webhook) responder != 2xx e o MP re-enviar.
    // O evento bruto já foi gravado em billing_events antes deste try, então
    // nada se perde mesmo que o retry demore.
    console.error('Webhook sync error:', err);
    throw err;
  }
  return { ok: true };
}

// migrateToCanceled: cancelamento imediato (usado por /cancel-all e /migrate-to-free).
// Fecha tudo já — não respeita período. Uso administrativo / limpeza.
async function migrateToCanceled(userId) {
  const closed = await _hardCancelActiveSubsForUser(userId, 'migrate_to_canceled');
  return { ok: true, closed };
}

// -----------------------------------------------------------------------------
// Cancelamento respeitoso ao CDC.
//
// Não muda o `status` na hora — só marca `cancel_at_period_end = TRUE` e
// `canceled_at = NOW()`. O acesso permanece via isSubscriptionActive() até
// `current_period_end`. O cron (jobs/cleanupExpiredSubscriptions) faz a
// transição final pra 'canceled' quando o período acabar.
//
// A recorrência no Mercado Pago é cancelada imediatamente pra não gerar
// cobrança nova — mas isso é ortogonal ao acesso do user.
//
// Assinatura: aceita (userIdOrSubId, userIdIfSubIdGiven) para dar suporte tanto
// ao caller atual (userId, workspaceId) quanto a chamadas mais específicas.
// Comportamento antigo (userId, workspaceId) continua funcionando.
// -----------------------------------------------------------------------------
async function cancelSubscription(userId, workspaceId = null) {
  if (!userId) {
    const err = new Error('userId required');
    err.statusCode = 400;
    throw err;
  }

  // Busca a sub relevante: prioriza a da workspace (se fornecida), senão a mais
  // recente do user. Ignora lifetime.
  let sub = null;
  if (workspaceId) {
    const r = await query(
      `SELECT id, user_id, workspace_id, mp_preapproval_id, plan_id, status,
              cancel_at_period_end, current_period_end
         FROM subscriptions
        WHERE workspace_id = $1
          AND status IN ('trialing','active','past_due','paused')
          AND plan_id <> 'lifetime'
        ORDER BY created_at DESC LIMIT 1`,
      [workspaceId]
    );
    sub = r.rows[0];
  }
  if (!sub) {
    const r = await query(
      `SELECT id, user_id, workspace_id, mp_preapproval_id, plan_id, status,
              cancel_at_period_end, current_period_end
         FROM subscriptions
        WHERE user_id = $1
          AND status IN ('trialing','active','past_due','paused')
          AND plan_id <> 'lifetime'
        ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    sub = r.rows[0];
  }

  if (!sub) {
    const err = new Error('Nenhuma assinatura ativa para cancelar');
    err.statusCode = 404;
    throw err;
  }

  // Não rechama MP se já estava marcada
  const mpOk = sub.cancel_at_period_end ? null : await cancelOnMP(sub.mp_preapproval_id);

  await query(
    `UPDATE subscriptions
        SET cancel_at_period_end = TRUE,
            canceled_at = COALESCE(canceled_at, NOW()),
            updated_at = NOW()
      WHERE id = $1`,
    [sub.id]
  );

  await logBillingEvent({
    subscriptionId: sub.id,
    userId: sub.user_id || userId,
    type: 'subscription.cancel_at_period_end',
    mpResourceId: sub.mp_preapproval_id,
    status: sub.status,
    raw: {
      plan_id: sub.plan_id,
      mp_cancel_ok: mpOk,
      ends_at: sub.current_period_end,
    },
  });

  return {
    ok: true,
    sub_id: sub.id,
    ends_at: sub.current_period_end,
    mp_cancel_ok: mpOk,
  };
}

// Atualiza o valor recorrente do preapproval no Mercado Pago (base + add-ons).
// A mudança de valor no MP vale a partir do PRÓXIMO ciclo (não é proporcional).
// Retorna true se OK; nunca lança (o estado local é atualizado de qualquer jeito).
async function updatePreapprovalAmount(preapprovalId, amountCents) {
  if (!isEnabled() || !preapprovalId) return false;
  try {
    const mp = getMP();
    const pa = new PreApproval(mp);
    await pa.update({ id: preapprovalId, body: { auto_recurring: { transaction_amount: amountCents / 100 } } });
    return true;
  } catch (err) {
    console.error('updatePreapprovalAmount error:', err?.message);
    return false;
  }
}

// Atualiza o valor do PLANO (preapproval_plan). Como criamos um plano por
// assinante, atualizar o plano é a forma canônica de mudar o valor recorrente
// da assinatura linkada. Fazemos os dois (plano + preapproval) por robustez.
async function updatePlanAmount(planId, amountCents) {
  if (!isEnabled() || !planId) return false;
  try {
    const mp = getMP();
    const pap = new PreApprovalPlan(mp);
    await pap.update({ id: planId, body: { auto_recurring: { transaction_amount: amountCents / 100 } } });
    return true;
  } catch (err) {
    console.error('updatePlanAmount error:', err?.message);
    return false;
  }
}

// Define os add-ons (clubes/categorias extras) da assinatura ATIVA e ajusta o
// valor recorrente no MP. Só funciona em assinatura paga (status='active').
// Fase 1: planos MENSAIS. Anual (cobrança proporcional imediata) fica pra Fase 2.
async function setAddons(userId, workspaceId, { extraClubs, extraCategories }) {
  const selectSql = (whereCol) => `
    SELECT s.*, p.interval, p.price_cents AS plan_price, p.features
      FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.${whereCol} = $1 AND s.status = 'active' AND s.plan_id <> 'lifetime'
     ORDER BY s.created_at DESC LIMIT 1`;
  let sub = null;
  if (workspaceId) sub = (await query(selectSql('workspace_id'), [workspaceId])).rows[0] || null;
  if (!sub) sub = (await query(selectSql('user_id'), [userId])).rows[0] || null;
  if (!sub) {
    const err = new Error('Você precisa de uma assinatura ativa para adicionar clubes ou categorias.');
    err.statusCode = 402; throw err;
  }

  const features = sub.features || {};
  if (sub.plan_id === 'free') {
    const err = new Error('Add-ons estão disponíveis apenas em assinaturas pagas.');
    err.statusCode = 402; throw err;
  }
  const isClube = features.multi_user === true;

  let ec = Math.max(0, Math.min(ADDON_MAX.extra_club, Math.round(Number(extraClubs) || 0)));
  let ecat = Math.max(0, Math.min(ADDON_MAX.extra_category, Math.round(Number(extraCategories) || 0)));

  // Categoria extra só no Clube (no Pro, pra ter categorias, sobe pro Clube).
  if (ecat > 0 && !isClube) {
    const err = new Error('Categorias extras estão disponíveis no plano Clube. Faça upgrade primeiro.');
    err.statusCode = 402; throw err;
  }

  // Fase 1: add-ons no plano ANUAL ainda não (precisa da cobrança proporcional).
  const currentEc = sub.extra_club_slots || 0;
  const currentEcat = sub.extra_category_slots || 0;
  if (sub.interval === 'yearly' && (ec > currentEc || ecat > currentEcat)) {
    const err = new Error('Add-ons no plano anual chegam em breve. Por enquanto, disponíveis no plano mensal.');
    err.statusCode = 501; throw err;
  }

  // Não deixa reduzir abaixo do que já está EM USO (senão cobraria menos do que usa).
  const wsId = sub.workspace_id;
  if (wsId) {
    const clubsUsed = (await query('SELECT COUNT(*)::int n FROM clubs WHERE workspace_id = $1', [wsId])).rows[0].n;
    const planClubs = features.max_clubs === -1 ? Infinity : (features.max_clubs || 1);
    if (Number.isFinite(planClubs)) ec = Math.max(ec, Math.max(0, clubsUsed - planClubs));

    const catUsed = (await query(
      `SELECT COALESCE(MAX(c),0)::int AS maxc FROM (
         SELECT COUNT(*)::int c FROM categories WHERE workspace_id = $1 GROUP BY club_id
       ) t`, [wsId])).rows[0].maxc;
    const planCats = features.max_categories || 1;
    ecat = Math.max(ecat, Math.max(0, catUsed - planCats));
  }

  const amountCents = computeRecurringAmountCents(
    { price_cents: sub.plan_price, interval: sub.interval }, ec, ecat
  );
  // Atualiza o plano E o preapproval (robustez — a assinatura é linkada ao plano).
  const planUpdated = await updatePlanAmount(sub.mp_preapproval_plan_id, amountCents);
  const paUpdated = await updatePreapprovalAmount(sub.mp_preapproval_id, amountCents);
  const mpUpdated = planUpdated || paUpdated;

  await query(
    `UPDATE subscriptions SET extra_club_slots = $2, extra_category_slots = $3, updated_at = NOW() WHERE id = $1`,
    [sub.id, ec, ecat]
  );
  await logBillingEvent({
    subscriptionId: sub.id, userId, type: 'subscription.addons_updated',
    mpResourceId: sub.mp_preapproval_id, status: sub.status,
    raw: { extra_clubs: ec, extra_categories: ecat, amount_cents: amountCents, interval: sub.interval, mp_updated: mpUpdated },
  });

  return {
    extra_clubs: ec, extra_categories: ecat,
    amount_cents: amountCents, interval: sub.interval, mp_updated: mpUpdated,
    effective: sub.interval === 'yearly' ? 'next_renewal' : 'next_cycle',
  };
}

// -----------------------------------------------------------------------------
// F1 (15/10/2026): FIM DO PLANO FREE + modo SÓ LEITURA
//
// Acesso de uma workspace (decidido pelo DONO dela, não por quem pede):
//   1. admin (role/ADMIN_EMAILS)                    → ilimitado ("Admin")
//   2. cortesia permanente (users.cortesia_permanente ou LIFETIME_EMAILS)
//                                                   → ilimitado, nunca expira
//   3. assinatura paga usável (MP, Apple, trial vigente, lifetime) → o plano dela
//   4. qualquer outro caso (sem assinatura, Free antigo, vencida)
//                                                   → SÓ LEITURA (plan_id 'inactive')
// O middleware requireActiveSubscription recusa escrita com 402 READ_ONLY.
// -----------------------------------------------------------------------------
const FREE_PLAN_ID = 'free';
const INACTIVE_PLAN_ID = 'inactive';

const UNLIMITED_FEATURES = Object.freeze({
  max_clubs: -1, max_athletes: -1, max_categories: -1, multi_user: true, max_coaches: 999,
  equipe: true, max_convidados: -1, quadro_tatico: true, pdf_export: true,
  stats_completas: true, monthly_theme: true,
});

// Só leitura: vê tudo (inclusive o quadro tático salvo), não cria nem edita
// (o servidor bloqueia a escrita). Exportações e convites ficam desligados.
const READ_ONLY_FEATURES = Object.freeze({
  read_only: true, max_clubs: 1, max_categories: 1, max_athletes: -1, multi_user: false,
  equipe: false, max_convidados: 0, quadro_tatico: true, pdf_export: false, stats_completas: true,
});

// Uma sub "usável" é a que ainda dá direito às features do SEU plano.
function isSubscriptionUsable(sub) {
  if (!sub) return false;
  if (sub.is_admin || sub.plan_id === 'admin' || sub.plan_id === 'lifetime') return true;
  if (sub.plan_id === FREE_PLAN_ID) return false; // o Free acabou
  const now = Date.now();
  if (sub.status === 'trialing') {
    return !sub.trial_ends_at || new Date(sub.trial_ends_at).getTime() >= now;
  }
  if (sub.status === 'active') {
    return !sub.current_period_end || new Date(sub.current_period_end).getTime() >= now;
  }
  return isSubscriptionActive(sub);
}

async function getWorkspaceOwnerId(workspaceId) {
  if (!workspaceId) return null;
  const r = await query('SELECT owner_id FROM workspaces WHERE id = $1', [workspaceId]);
  return r.rows[0]?.owner_id || null;
}

// Admin ou cortesia do usuário (normalmente o DONO da workspace).
// → { tipo: 'admin' } | { tipo: 'cortesia', motivo } | null
async function getCortesia(userId) {
  if (!userId) return null;
  let u = null;
  try {
    u = (await query(
      'SELECT email, role, cortesia_permanente, cortesia_motivo FROM users WHERE id = $1',
      [userId]
    )).rows[0];
  } catch (_) {
    // Migration 048 ainda não aplicada (coluna inexistente): segue sem a flag.
    u = (await query('SELECT email, role FROM users WHERE id = $1', [userId])).rows[0];
  }
  if (!u) return null;
  if (u.role === 'admin' || isAdmin?.(u.email)) return { tipo: 'admin' };
  if (u.cortesia_permanente === true) return { tipo: 'cortesia', motivo: u.cortesia_motivo || 'cortesia' };
  if (isLifetime?.(u.email)) return { tipo: 'cortesia', motivo: 'LIFETIME_EMAILS' };
  return null;
}

function adminSub() {
  return {
    plan_id: 'admin', plan_name: 'Admin', status: 'active', is_admin: true,
    is_free: false, read_only: false,
    features: { ...UNLIMITED_FEATURES, admin: true },
  };
}

// Sub efetiva da dupla (user, workspace).
async function getEffectiveSubscription({ userId, workspaceId = null }) {
  const ownerId = (workspaceId && await getWorkspaceOwnerId(workspaceId)) || userId;

  const cortesia = await getCortesia(ownerId);
  if (cortesia?.tipo === 'admin') return adminSub();
  if (cortesia) {
    return {
      plan_id: 'lifetime', plan_name: 'Cortesia', status: 'active',
      is_cortesia: true, cortesia_motivo: cortesia.motivo,
      is_free: false, read_only: false,
      user_id: ownerId, workspace_id: workspaceId || null,
      features: { ...UNLIMITED_FEATURES, lifetime: true },
    };
  }

  let sub = null;
  if (workspaceId) sub = await getSubscriptionForWorkspace(workspaceId);
  if (!sub) sub = await getActiveSubscription(ownerId);
  if (sub && isSubscriptionUsable(sub)) {
    if (sub.is_admin) return adminSub();
    sub.plan_name = nomePlano(sub.plan_id, sub.plan_name);
    sub.is_free = false;
    sub.read_only = false;
    return sub;
  }

  const lapsed = (sub && sub.plan_id !== FREE_PLAN_ID) ? {
    plan_id: sub.plan_id,
    plan_name: nomePlano(sub.plan_id, sub.plan_name),
    status: sub.status,
    trial_ends_at: sub.trial_ends_at,
    current_period_end: sub.current_period_end,
    cancel_at_period_end: sub.cancel_at_period_end,
  } : null;
  return {
    plan_id: INACTIVE_PLAN_ID,
    plan_name: 'Sem assinatura ativa',
    status: 'inactive',
    price_cents: 0,
    interval: null,
    features: { ...READ_ONLY_FEATURES },
    read_only: true,
    is_free: false,
    is_fallback: true,
    is_owner: ownerId === userId,
    user_id: userId,
    workspace_id: workspaceId || null,
    lapsed,
  };
}

// Quantos CONVIDADOS (além do dono) a sub permite. -1 = ilimitado, 0 = nenhum.
function limiteConvidados(sub) {
  if (!sub) return 0;
  if (sub.is_admin || sub.plan_id === 'admin' || sub.plan_id === 'lifetime') return -1;
  if (sub.read_only) return 0;
  const f = sub.features || {};
  if (typeof f.max_convidados === 'number') return f.max_convidados;
  // Antes da migration 048: entrada pelo arquivo de planos; Clube por max_coaches.
  if (isPlanoEntrada(sub.plan_id)) return planosCfg.entrada.max_convidados;
  if (f.multi_user) return typeof f.max_coaches === 'number' ? f.max_coaches : planosCfg.clube.max_convidados;
  return 0;
}

// Assinatura inicial no cadastro (email/Google/Apple). Sem plano grátis:
//   admin → nada; LIFETIME_EMAILS → vitalícia; SIGNUP_TRIAL_DAYS>0 → avaliação
//   do plano Clube (único vendido); padrão → NADA (conta fica em só leitura até assinar).
async function createInitialSubscription({ userId, workspaceId, email, role }) {
  if (role === 'admin') return { kind: 'admin', trialDays: 0 };
  if (isLifetime?.(email)) {
    await query(
      `INSERT INTO subscriptions (user_id, workspace_id, plan_id, status, current_period_start, current_period_end)
       VALUES ($1, $2, 'lifetime', 'active', now(), now() + interval '100 years')`,
      [userId, workspaceId]
    );
    return { kind: 'lifetime', trialDays: 0 };
  }
  const trialDays = Math.max(0, parseInt(process.env.SIGNUP_TRIAL_DAYS || '0', 10) || 0);
  if (trialDays > 0) {
    const trialEnd = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    await query(
      `INSERT INTO subscriptions (user_id, workspace_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
       VALUES ($1, $2, 'clube', 'trialing', $3, now(), $3)`,
      [userId, workspaceId, trialEnd]
    );
    return { kind: 'trial', trialDays };
  }
  return { kind: 'none', trialDays: 0 };
}

// -----------------------------------------------------------------------------
// IAP (Apple App Store / Google Play) via RevenueCat
//
// O app nativo compra pela loja; a RevenueCat valida o recibo e nos manda
// webhooks. Aqui traduzimos os eventos pra tabela `subscriptions`
// (provider='apple'|'google'). O resto do sistema não muda: o gate lê a
// assinatura efetiva como sempre.
// -----------------------------------------------------------------------------
const RC_PRODUCT_TO_PLAN = {
  'com.faggin.tactiplan.pro.monthly':   'pro',
  'com.faggin.tactiplan.pro.yearly':    'pro_annual',
  'com.faggin.tactiplan.clube.monthly': 'clube',
  'com.faggin.tactiplan.clube.yearly':  'clube_annual',
  // alias defensivo: o ID foi criado com um 'V' colado por engano no ASC
  'Vcom.faggin.tactiplan.clube.yearly': 'clube_annual',
};

function rcResolveUserId(event) {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const candidates = [event.app_user_id, event.original_app_user_id, ...(Array.isArray(event.aliases) ? event.aliases : [])];
  return candidates.find((c) => typeof c === 'string' && uuidRe.test(c)) || null;
}

// Compras de SANDBOX (TestFlight, revisão da Apple, testes) não podem liberar
// plano no banco de produção: por padrão só são registradas em billing_events.
// Exceções (desligadas por padrão):
//   REVENUECAT_ACEITAR_SANDBOX=1        → aceita qualquer sandbox (staging/testes)
//   REVENUECAT_SANDBOX_EMAILS=a@x,b@y   → aceita sandbox só dessas contas (ex.: conta
//                                         de revisão da Apple durante a submissão)
function rcIsSandbox(event) {
  return String(event?.environment || '').toUpperCase() === 'SANDBOX';
}

function rcSandboxAllowed(email) {
  if (process.env.REVENUECAT_ACEITAR_SANDBOX === '1') return true;
  const lista = String(process.env.REVENUECAT_SANDBOX_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !!email && lista.includes(String(email).toLowerCase());
}

async function applyRevenueCatEvent(event) {
  const type = event?.type;
  const RELEVANT = ['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE'];
  if (!type || !RELEVANT.includes(type)) return { handled: false, reason: `ignored:${type || 'no_type'}` };

  const userId = rcResolveUserId(event);
  if (!userId) return { handled: false, reason: 'no_uuid_user_id' };
  const userRes = await query('SELECT id, email FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) return { handled: false, reason: 'user_not_found' };
  const sandboxIgnorado = rcIsSandbox(event) && !rcSandboxAllowed(userRes.rows[0].email);

  const provider = String(event.store || '').toUpperCase() === 'PLAY_STORE' ? 'google' : 'apple';
  const ref = String(event.original_transaction_id || event.transaction_id || event.id || '');
  const productId = event.new_product_id || event.product_id || '';
  const planId = RC_PRODUCT_TO_PLAN[productId] || null;
  const expMs = Number(event.expiration_at_ms) || null;
  const periodEnd = expMs ? new Date(expMs) : null;

  await query(
    'INSERT INTO billing_events (type, mp_resource_id, raw) VALUES ($1, $2, $3)',
    [`revenuecat.${type.toLowerCase()}`, ref || null, JSON.stringify({ userId, productId, planId, environment: event.environment, expiration_at_ms: expMs, ...(sandboxIgnorado ? { ignored: 'sandbox' } : {}) })]
  ).catch(() => {});

  if (sandboxIgnorado) return { handled: false, reason: 'sandbox_ignored' };

  const existing = (await query(
    `SELECT id FROM subscriptions
      WHERE provider = $1 AND provider_subscription_id = $2
      ORDER BY created_at DESC LIMIT 1`,
    [provider, ref]
  )).rows[0] || null;

  const activates = ['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE'].includes(type);

  if (activates) {
    if (!planId) return { handled: false, reason: `unknown_product:${productId}` };
    if (existing) {
      await _hardCancelActiveSubsForUser(userId, `iap_${type.toLowerCase()}`, existing.id);
      await query(
        `UPDATE subscriptions SET
           plan_id = $2, status = 'active', cancel_at_period_end = FALSE,
           current_period_start = now(), current_period_end = $3, updated_at = now()
         WHERE id = $1`,
        [existing.id, planId, periodEnd]
      );
      return { handled: true, action: 'updated', plan: planId };
    }
    // Cancela as outras ativas (inclusive Free antigo e Mercado Pago — evita cobrança dupla)
    await _hardCancelActiveSubsForUser(userId, `iap_${type.toLowerCase()}`);
    const ws = (await query('SELECT id FROM workspaces WHERE owner_id = $1 ORDER BY created_at ASC LIMIT 1', [userId])).rows[0]?.id || null;
    await query(
      `INSERT INTO subscriptions (user_id, workspace_id, plan_id, status, provider, provider_subscription_id, current_period_start, current_period_end)
       VALUES ($1, $2, $3, 'active', $4, $5, now(), $6)`,
      [userId, ws, planId, provider, ref, periodEnd]
    );
    return { handled: true, action: 'created', plan: planId };
  }

  if (!existing) return { handled: true, action: 'noop_no_local_sub' };

  if (type === 'CANCELLATION') {
    // Desligou a renovação: continua ativa até o fim do período pago.
    await query(
      `UPDATE subscriptions SET cancel_at_period_end = TRUE, canceled_at = now(), updated_at = now() WHERE id = $1`,
      [existing.id]
    );
    return { handled: true, action: 'cancel_at_period_end' };
  }
  if (type === 'EXPIRATION') {
    // Encerra o período explicitamente (senão a janela de graça do
    // cancel_at_period_end poderia manter o acesso além do devido).
    await query(
      `UPDATE subscriptions SET
         status = 'expired', cancel_at_period_end = FALSE,
         current_period_end = LEAST(COALESCE($2, now()), now()),
         updated_at = now()
       WHERE id = $1`,
      [existing.id, periodEnd]
    );
    return { handled: true, action: 'expired' }; // conta passa a só leitura automaticamente
  }
  if (type === 'BILLING_ISSUE') {
    await query(`UPDATE subscriptions SET status = 'past_due', updated_at = now() WHERE id = $1`, [existing.id]);
    return { handled: true, action: 'past_due' };
  }
  return { handled: true };
}

module.exports = {
  applyRevenueCatEvent,
  _rcSandboxAllowed: rcSandboxAllowed,
  FREE_PLAN_ID,
  INACTIVE_PLAN_ID,
  isSubscriptionUsable,
  getCortesia,
  getWorkspaceOwnerId,
  limiteConvidados,
  getEffectiveSubscription,
  createInitialSubscription,
  isEnabled,
  getPlan,
  getActiveSubscription,
  getSubscriptionForWorkspace,
  startTrial,
  createCheckout,
  setAddons,
  ADDON_PRICES,
  handleWebhook,
  cancelSubscription,
  migrateToCanceled,
  isSubscriptionActive,
  // Exportado pra rota do webhook consultar status/valor real do pagamento no MP.
  fetchPayment,
  mapMpStatus,
  logBillingEvent,
  // Exportado pro cron de reconciliação (reconcilePendingSubscriptions).
  syncSubscriptionFromPreapproval,
  // Exportado pra tests/scripts admin — não usar em rotas de user comum.
  _hardCancelActiveSubsForUser,
};
