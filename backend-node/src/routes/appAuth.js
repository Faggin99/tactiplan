// BFF do app nativo — entrada e saída. Montado em /api/app/auth (server.js, ANTES dos routers
// '/api' com auth global). Nenhuma rota aqui cria conta: o app é só por convite.
//
//   GET  /api/app/auth/config  → quais logins estão ligados (+ versão mínima do app)
//   POST /api/app/auth/entrar  { email, senha, aparelho? }
//   POST /api/app/auth/google  { id_token, aparelho? }
//   POST /api/app/auth/apple   { identity_token, aparelho? }
//   POST /api/app/auth/sair    (Bearer tpa_…)
// Resposta de login: { token, expira_em, me } (me = o mesmo do GET /api/app/me).
const express = require('express');
const rateLimit = require('express-rate-limit');
const appSessoes = require('../services/appSessoes');
const appLogin = require('../services/appLogin');
const appMe = require('../services/appMe');
const appAuth = require('../middleware/appAuth');

const router = express.Router();

// Mesma regra do login do web (5 erros / 15 min por IP; acerto não conta).
const limiteEntrar = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.APP_LOGIN_MAX || '5', 10) || 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.', code: 'MUITAS_TENTATIVAS' },
});

const ligado = (v) => String(v || '').toLowerCase() === 'on';

// Flags do servidor (o app também tem as suas, de build). Sem credencial nativa = desligado.
function configDoApp(env = process.env) {
  const googleBase = !!env.GOOGLE_CLIENT_ID && ligado(env.APP_LOGIN_GOOGLE);
  return {
    google: {
      ativo: googleBase,
      // iPhone: client iOS (OAuth com PKCE no navegador do sistema). Android: client WEB como
      // serverClientId do Credential Manager (o client Android só precisa existir no Google).
      ios_client_id: googleBase && env.GOOGLE_IOS_CLIENT_ID ? env.GOOGLE_IOS_CLIENT_ID : null,
      android_server_client_id: googleBase ? env.GOOGLE_CLIENT_ID : null,
    },
    apple: { ativo: ligado(env.APP_LOGIN_APPLE) },
    versao_minima: {
      ios: env.APP_VERSAO_MINIMA_IOS || null,
      android: env.APP_VERSAO_MINIMA_ANDROID || null,
    },
    privacidade_url: env.APP_PRIVACIDADE_URL || 'https://tactiplan.faggin.com.br/privacidade.html',
    termos_url: env.APP_TERMOS_URL || 'https://tactiplan.faggin.com.br/termos.html',
    esqueci_senha_url: (env.APP_BASE_URL || 'https://app.tactiplan.faggin.com.br') + '/#/forgot-password',
  };
}

router.get('/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(configDoApp());
});

function dadosDoAparelho(req) {
  const a = (req.body && typeof req.body.aparelho === 'object' && req.body.aparelho) || {};
  return { plataforma: a.plataforma, aparelho: a.nome, versaoApp: a.versao_app };
}

async function concluirLogin(req, res, user, metodo) {
  const s = await appSessoes.criar({ userId: user.id, metodo, ip: req.ip, ...dadosDoAparelho(req) });
  const me = await appMe.carregarMe(user.id);
  res.set('Cache-Control', 'no-store');
  res.json({ token: s.token, expira_em: s.expira_em, me });
}

function responderErro(res, err, rotulo) {
  if (err instanceof appLogin.ErroLogin) {
    return res.status(err.status).json({ error: err.message, code: err.codigo });
  }
  console.error(`app auth ${rotulo}:`, err.message);
  return res.status(500).json({ error: 'Não foi possível entrar agora. Tente de novo.' });
}

router.post('/entrar', limiteEntrar, async (req, res) => {
  try {
    const { email, senha } = req.body || {};
    const user = await appLogin.entrarComSenha(email, senha, req.ip);
    await concluirLogin(req, res, user, 'senha');
  } catch (err) {
    responderErro(res, err, 'entrar');
  }
});

router.post('/google', limiteEntrar, async (req, res) => {
  try {
    if (!configDoApp().google.ativo) {
      return res.status(503).json({ error: 'O login com Google não está disponível.', code: 'GOOGLE_DESLIGADO' });
    }
    const user = await appLogin.entrarComGoogle((req.body || {}).id_token);
    await concluirLogin(req, res, user, 'google');
  } catch (err) {
    responderErro(res, err, 'google');
  }
});

router.post('/apple', limiteEntrar, async (req, res) => {
  try {
    if (!configDoApp().apple.ativo) {
      return res.status(503).json({ error: 'O login com a Apple não está disponível.', code: 'APPLE_DESLIGADO' });
    }
    const user = await appLogin.entrarComApple((req.body || {}).identity_token);
    await concluirLogin(req, res, user, 'apple');
  } catch (err) {
    responderErro(res, err, 'apple');
  }
});

// Sair: revoga ESTE token e solta o push deste aparelho. Idempotente para o app (sempre 200 com
// token válido; token já inválido → 401, que o app também trata como "saiu").
router.post('/sair', appAuth, async (req, res) => {
  try {
    await appSessoes.apagarPushDaSessao(req.appSessao.id);
    await appSessoes.revogar(req.appSessao.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('app auth sair:', err.message);
    res.status(500).json({ error: 'Não foi possível sair agora.' });
  }
});

module.exports = router;
module.exports.configDoApp = configDoApp;
