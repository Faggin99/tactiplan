// Autenticação do APP NATIVO (rotas /api/app/*): "Authorization: Bearer tpa_…".
// Só aceita o token do app (app_sessions); o JWT do web não entra aqui.
// Toda falha é o MESMO 401 (o app trata qualquer 401 como "sessão acabou").
const appSessoes = require('../services/appSessoes');

const MSG_SESSAO = 'Sua sessão terminou. Entre de novo.';

async function appAuth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    const r = await appSessoes.validar(token);
    if (!r) return res.status(401).json({ error: MSG_SESSAO, code: 'SESSAO_INVALIDA' });
    req.appSessao = r.sessao;
    req.user = r.usuario;
    return next();
  } catch (err) {
    console.error('appAuth:', err.message);
    return res.status(500).json({ error: 'Não foi possível conferir a sessão agora.' });
  }
}

appAuth.MSG_SESSAO = MSG_SESSAO;
module.exports = appAuth;
