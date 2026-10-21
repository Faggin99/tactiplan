const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { jwtSecret } = require('../config/auth');
const billing = require('../services/billing');
const appSessoes = require('../services/appSessoes');

// F1 (15/10/2026): não existe mais plano Free. Este middleware global:
//   (1) valida o acesso à workspace pedida (X-Workspace-Id);
//   (2) MODO SÓ LEITURA: conta sem assinatura paga (nem cortesia/admin) pode LER
//       tudo, mas qualquer escrita (POST/PUT/PATCH/DELETE) volta 402 READ_ONLY;
//   (3) bloqueia rotas PREMIUM quando o plano efetivo não tem a feature
//       (402 PLAN_REQUIRED). Limites numéricos ficam nas rotas de criação.
// Mensagens NEUTRAS (sem "assine"/URL): o app nativo mostra esse texto.
const ALWAYS_ALLOWED_PREFIXES = [
  '/api/auth/',
  '/api/admin/',        // área admin tem auth+permissão própria
  '/api/billing/',      // assinar/renovar precisa funcionar em conta só leitura
  '/api/conta/',        // login único Faggin
  '/api/workspaces',
  '/api/health',
  '/api/invites/',      // aceitar convite para uma equipe que paga
  '/api/app/',          // BFF do app nativo: regras próprias (entrar, sair, convites, push)
  '/uploads/',
];

// Escritas permitidas mesmo em só leitura (não criam conteúdo do usuário).
const READ_ONLY_WRITE_EXEMPT = [
  /^\/api\/microcycles\/ensure\/?$/,             // get-or-create da semana ao abrir o planejamento
  /^\/api\/announcements\/[^/]+\/dismiss\/?$/,   // fechar aviso do admin
  /^\/api\/reports\/[^/]+\/?$/,                 // gerar PDF não grava nada (gate: feature pdf_export)
];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const READ_ONLY_MESSAGE =
  'Esta conta está em modo só leitura (sem assinatura ativa). Os dados podem ser consultados, mas não é possível criar nem editar.';

// Rotas exclusivas dos planos pagos → feature exigida no plano.
const PREMIUM_ROUTES = [
  { prefix: '/api/plays', feature: 'quadro_tatico', message: 'O Quadro Tático não está incluído no seu plano atual.' },
  { prefix: '/api/reports', feature: 'pdf_export', message: 'As exportações não estão incluídas no seu plano atual.' },
];

function featureMessage(feature) {
  return PREMIUM_ROUTES.find((r) => r.feature === feature)?.message || 'Recurso não incluído no seu plano atual.';
}

function isAlwaysAllowed(path) {
  return ALWAYS_ALLOWED_PREFIXES.some((p) => path === p.replace(/\/$/, '') || path.startsWith(p));
}

function isWriteRequest(req) {
  if (!WRITE_METHODS.has(String(req.method || '').toUpperCase())) return false;
  return !READ_ONLY_WRITE_EXEMPT.some((re) => re.test(req.path));
}

function matchPremium(path) {
  return PREMIUM_ROUTES.find((r) => path === r.prefix || path.startsWith(r.prefix + '/'));
}

// Dono do token: JWT do web OU token do app nativo ("tpa_…", T1). O do app é validado UMA vez
// por requisição (o authMiddleware reaproveita o resultado). Token inválido → null (a rota
// responde 401). Banco fora → lança (cai no fail-open do middleware, e a rota decide).
async function extractUserId(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (token.startsWith(appSessoes.PREFIXO)) {
    // require tardio: o auth.js também carrega este módulo indiretamente via rotas.
    const auth = require('./auth');
    const r = await auth.validarTokenApp(req, token);
    return r?.usuario?.id || null;
  }
  try {
    return jwt.verify(token, jwtSecret)?.id || null;
  } catch (_) {
    return null;
  }
}

// Mesma regra do authMiddleware quando não vem X-Workspace-Id: a primeira
// workspace própria; senão a primeira onde é membro aceito.
async function defaultWorkspaceId(userId) {
  const r = await query(
    `SELECT id FROM (
        SELECT w.id, 0 AS ord, w.created_at FROM workspaces w WHERE w.owner_id = $1
        UNION ALL
        SELECT m.workspace_id, 1 AS ord, m.accepted_at FROM workspace_members m
         WHERE m.user_id = $1 AND m.accepted_at IS NOT NULL
     ) t ORDER BY ord, created_at LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.id || null;
}

async function requireActiveSubscription(req, res, next) {
  try {
    if (!req.path.startsWith('/api')) return next();
    if (isAlwaysAllowed(req.path)) return next();

    const userId = await extractUserId(req);
    if (!userId) return next(); // sem token: a rota responde 401

    const userRes = await query('SELECT role FROM users WHERE id = $1', [userId]);
    if (userRes.rows[0]?.role === 'admin') return next();

    // Acesso à workspace ativa (header X-Workspace-Id).
    const requestedWs = req.headers['x-workspace-id'] || null;
    if (requestedWs) {
      const accessRes = await query(
        `SELECT 1 FROM workspaces w
           WHERE w.id = $1
             AND (w.owner_id = $2 OR EXISTS (
               SELECT 1 FROM workspace_members m
                WHERE m.workspace_id = w.id AND m.user_id = $2 AND m.accepted_at IS NOT NULL
             ))`,
        [requestedWs, userId]
      );
      if (accessRes.rows.length === 0) {
        return res.status(403).json({ error: 'workspace_not_accessible' });
      }
    }

    const write = isWriteRequest(req);
    const premium = matchPremium(req.path);
    if (!write && !premium) return next(); // leitura comum: sempre passa

    const workspaceId = requestedWs || await defaultWorkspaceId(userId);
    const sub = await billing.getEffectiveSubscription({ userId, workspaceId });
    req.effectiveSubscription = sub;

    if (write && sub?.read_only) {
      return res.status(402).json({
        error: READ_ONLY_MESSAGE,
        code: 'READ_ONLY',
        read_only: true,
        plan_id: sub.plan_id,
      });
    }

    if (!premium) return next();
    if (sub?.is_admin || sub?.plan_id === 'lifetime' || sub?.features?.[premium.feature]) return next();

    return res.status(402).json({
      error: premium.message,
      code: 'PLAN_REQUIRED',
      required_feature: premium.feature,
      plan_id: sub?.plan_id || null,
    });
  } catch (err) {
    console.error('requireActiveSubscription error:', err);
    next(); // fail-open pra não derrubar o app por bug nosso
  }
}

requireActiveSubscription.READ_ONLY_MESSAGE = READ_ONLY_MESSAGE;
requireActiveSubscription._isWriteRequest = isWriteRequest;
requireActiveSubscription.featureMessage = featureMessage;
module.exports = requireActiveSubscription;
