// BFF do app nativo (TactiPlan iPhone/Android) — /api/app/*. Montado no server.js ANTES dos
// routers '/api' que têm auth global. Só rotas novas: o web não muda.
//
//   /api/app/auth/*                         → routes/appAuth.js (entrar, google, apple, sair, config)
//   GET  /api/app/me                        → pessoa, contas, clubes, papel, permissões, só leitura,
//                                             personalização do clube e convites pendentes
//   POST /api/app/convites/:token/aceitar   → aceita um convite do PRÓPRIO e-mail
//   POST /api/app/push/registrar            → guarda o token de push (nada é enviado ainda)
const express = require('express');
const { query } = require('../config/database');
const appAuth = require('../middleware/appAuth');
const appMe = require('../services/appMe');
const appSessoes = require('../services/appSessoes');
const billing = require('../services/billing');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use('/auth', require('./appAuth'));

router.get('/me', appAuth, async (req, res) => {
  try {
    const me = await appMe.carregarMe(req.user.id);
    if (!me) return res.status(401).json({ error: appAuth.MSG_SESSAO, code: 'SESSAO_INVALIDA' });
    res.set('Cache-Control', 'no-store');
    res.json(me);
  } catch (err) {
    console.error('app me:', err.message);
    res.status(500).json({ error: 'Não foi possível carregar seus dados agora.' });
  }
});

// Aceitar convite: as MESMAS regras do POST /api/invites/:token/accept do web (e-mail do convite
// = e-mail da conta; não aceita duas vezes; limite de membros da equipe no aceite). Mensagens
// neutras (sem plano/preço): o app mostra o texto como veio.
async function aceitarConvite(userId, email, token) {
  const r = await query(
    `SELECT m.id, m.workspace_id, m.invited_email, m.accepted_at, w.name AS workspace_name
       FROM workspace_members m
       JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.invite_token = $1`,
    [token]
  );
  const convite = r.rows[0];
  if (!convite) return { status: 404, corpo: { error: 'Convite inválido ou já usado.', code: 'CONVITE_INVALIDO' } };
  if (convite.accepted_at) return { status: 410, corpo: { error: 'Este convite já foi aceito.', code: 'CONVITE_USADO' } };
  if (convite.invited_email && String(convite.invited_email).toLowerCase() !== String(email || '').toLowerCase()) {
    return { status: 403, corpo: { error: 'Este convite é para outro e-mail. Entre com a conta que recebeu o convite.', code: 'CONVITE_OUTRO_EMAIL' } };
  }
  const ja = await query(
    'SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND accepted_at IS NOT NULL',
    [convite.workspace_id, userId]
  );
  if (ja.rows.length) return { status: 409, corpo: { error: 'Você já faz parte desta equipe.', code: 'JA_MEMBRO' } };

  const sub = await billing.getEffectiveSubscription({ userId, workspaceId: convite.workspace_id });
  const limite = billing.limiteConvidados(sub);
  if (limite === 0 || limite > 0) {
    const n = await query(
      `SELECT COUNT(*)::int AS n FROM workspace_members WHERE workspace_id = $1 AND accepted_at IS NOT NULL`,
      [convite.workspace_id]
    );
    if (limite === 0 || (n.rows[0]?.n || 0) >= limite) {
      return {
        status: 402,
        corpo: { error: 'Esta equipe não pode receber mais pessoas agora. Fale com o responsável pela equipe.', code: 'LIMITE_EQUIPE' },
      };
    }
  }

  const up = await query(
    `UPDATE workspace_members
        SET user_id = $1, accepted_at = NOW(), invite_token = NULL, updated_at = NOW()
      WHERE id = $2 AND accepted_at IS NULL
      RETURNING id`,
    [userId, convite.id]
  );
  if (!up.rows.length) return { status: 410, corpo: { error: 'Este convite já foi aceito.', code: 'CONVITE_USADO' } };
  authMiddleware.invalidateAccessibleCache?.(userId);
  return { status: 200, corpo: { ok: true, workspace_id: convite.workspace_id, workspace_nome: convite.workspace_name } };
}

router.post('/convites/:token/aceitar', appAuth, async (req, res) => {
  try {
    const token = String(req.params.token || '');
    if (!/^[0-9a-f]{16,128}$/i.test(token)) {
      return res.status(404).json({ error: 'Convite inválido ou já usado.', code: 'CONVITE_INVALIDO' });
    }
    const r = await aceitarConvite(req.user.id, req.user.email, token);
    if (r.status !== 200) return res.status(r.status).json(r.corpo);
    const me = await appMe.carregarMe(req.user.id);
    res.json({ ...r.corpo, me });
  } catch (err) {
    console.error('app convite aceitar:', err.message);
    res.status(500).json({ error: 'Não foi possível aceitar o convite agora.' });
  }
});

// Push: estrutura pronta, DESLIGADA (só guarda o token; não há envio no servidor).
router.post('/push/registrar', appAuth, async (req, res) => {
  try {
    const { token, plataforma } = req.body || {};
    const id = await appSessoes.registrarPush({
      userId: req.user.id, sessionId: req.appSessao.id, plataforma, token,
    });
    if (!id) return res.status(400).json({ error: 'Token de push ou plataforma inválidos.', code: 'DADOS_INVALIDOS' });
    res.json({ ok: true, envio_ativo: false });
  } catch (err) {
    console.error('app push registrar:', err.message);
    res.status(500).json({ error: 'Não foi possível registrar o aparelho agora.' });
  }
});

router.use((req, res) => res.status(404).json({ error: 'Rota do app não encontrada.', code: 'NAO_ENCONTRADA' }));

module.exports = router;
module.exports.aceitarConvite = aceitarConvite;
