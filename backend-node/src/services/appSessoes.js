// Sessões do APP NATIVO (migration 056). Token opaco "tpa_<43 chars base64url>" (256 bits),
// guardado no banco só como SHA-256: quem lê o banco não consegue se passar pelo aparelho.
// - Expiração longa e DESLIZANTE: APP_SESSAO_DIAS (padrão 180) a partir do último uso.
// - Revogável: sair (POST /api/app/auth/sair) grava revoked_at; conta removida (LGPD) derruba.
// O JWT do web não é aceito no BFF; desde a T1 o token do app também abre as rotas do web
// (authMiddleware), com as mesmas regras. Trocar a senha no web derruba as sessões do app.
const crypto = require('crypto');
const { query } = require('../config/database');

const PREFIXO = 'tpa_';
const TOKEN_RE = /^tpa_[A-Za-z0-9_-]{43}$/;
// Renovar a validade no máximo 1x por hora (evita um UPDATE por requisição).
const RENOVAR_APOS_MS = 60 * 60 * 1000;

function diasDeValidade() {
  const n = parseInt(process.env.APP_SESSAO_DIAS || '180', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 365) : 180;
}

function gerarToken() {
  return PREFIXO + crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function pareceToken(token) {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

function limpar(v, max) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return s ? s.slice(0, max) : null;
}

// O pg deste projeto devolve timestamptz como texto do Postgres ("2027-04-19 02:57:22.2+00"):
// o app recebe ISO 8601.
function isoOuNull(v) {
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function plataformaValida(p) {
  const s = String(p || '').toLowerCase();
  return s === 'ios' || s === 'android' ? s : null;
}

// Cria a sessão e devolve o token CRU (a única vez que ele existe fora do aparelho).
async function criar({ userId, metodo, plataforma, aparelho, versaoApp, ip }) {
  const token = gerarToken();
  const dias = diasDeValidade();
  const r = await query(
    `INSERT INTO app_sessions (user_id, token_hash, metodo, plataforma, aparelho, versao_app, ip, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + ($8 || ' days')::interval)
     RETURNING id, expires_at`,
    [userId, hashToken(token), metodo, plataformaValida(plataforma), limpar(aparelho, 120),
     limpar(versaoApp, 20), limpar(ip, 64), String(dias)]
  );
  return { token, id: r.rows[0].id, expira_em: isoOuNull(r.rows[0].expires_at) };
}

// Token → { sessao, usuario } ou null (inexistente, revogado, vencido, conta removida).
async function validar(token) {
  if (!pareceToken(token)) return null;
  const r = await query(
    `SELECT s.id, s.user_id, s.metodo, s.plataforma, s.expires_at, s.last_used_at,
            u.email, u.role
       FROM app_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.deleted_at IS NULL`,
    [hashToken(token)]
  );
  const s = r.rows[0];
  if (!s) return null;
  const usado = new Date(s.last_used_at).getTime();
  if (!Number.isFinite(usado) || Date.now() - usado > RENOVAR_APOS_MS) {
    // Melhor esforço: falhar aqui não derruba a requisição.
    query(
      `UPDATE app_sessions SET last_used_at = now(), expires_at = now() + ($2 || ' days')::interval
        WHERE id = $1 AND revoked_at IS NULL`,
      [s.id, String(diasDeValidade())]
    ).catch((e) => console.error('appSessoes.renovar:', e.message));
  }
  return {
    sessao: { id: s.id, metodo: s.metodo, plataforma: s.plataforma, expira_em: isoOuNull(s.expires_at) },
    usuario: { id: s.user_id, email: s.email, role: s.role },
  };
}

async function revogar(sessionId) {
  await query('UPDATE app_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [sessionId]);
}

// Senha trocada/redefinida no web: TODA sessão do app desta pessoa cai (o aparelho perdido ou
// de outra pessoa deixa de entrar). Os aparelhos de push saem junto. Devolve quantas caíram.
async function revogarTodasDoUsuario(userId) {
  const r = await query(
    'UPDATE app_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id',
    [userId]
  );
  await query('DELETE FROM app_push_devices WHERE user_id = $1', [userId]);
  return r.rows.length;
}

// Aparelho para push: um token pertence a UMA pessoa (troca de conta no mesmo aparelho move o token).
async function registrarPush({ userId, sessionId, plataforma, token }) {
  const p = plataformaValida(plataforma);
  const t = limpar(token, 4096);
  if (!p || !t) return null;
  const r = await query(
    `INSERT INTO app_push_devices (user_id, session_id, plataforma, token)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (token) DO UPDATE
        SET user_id = EXCLUDED.user_id, session_id = EXCLUDED.session_id,
            plataforma = EXCLUDED.plataforma, updated_at = now()
     RETURNING id`,
    [userId, sessionId, p, t]
  );
  return r.rows[0]?.id || null;
}

// Sair: o aparelho deixa de receber push desta pessoa.
async function apagarPushDaSessao(sessionId) {
  await query('DELETE FROM app_push_devices WHERE session_id = $1', [sessionId]);
}

module.exports = {
  PREFIXO, gerarToken, hashToken, pareceToken, diasDeValidade, plataformaValida,
  criar, validar, revogar, revogarTodasDoUsuario, registrarPush, apagarPushDaSessao,
};
