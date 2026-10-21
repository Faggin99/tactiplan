// Login do APP NATIVO: as MESMAS conferências do login do web (routes/auth.js), sem criar conta.
// - E-mail e senha: a senha é conferida no Conta Faggin (login único) e, se ele estiver
//   desligado/fora do ar, na senha local (bcrypt) — igual ao POST /api/auth/login.
// - Google: id_token conferido pelo google-auth-library (audiência = client web e, se houver,
//   os clients nativos do .env).
// - Apple: identityToken conferido no JWKS da Apple (audiência = bundle do app novo e do antigo).
// Entrada SÓ por convite: quem não tem conta recebe 404 SEM_CONTA (o app não cadastra).
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const conta = require('./conta');

// Hash de mentira (custo 10, como os reais) para o caminho "e-mail não existe" gastar o mesmo
// tempo do bcrypt. Gerado uma vez, na 1ª tentativa.
let hashFalso = null;
function HASH_FALSO_() {
  if (!hashFalso) hashFalso = bcrypt.hashSync('tactiplan-app-falso', 10);
  return hashFalso;
}

const MSG_CREDENCIAIS = 'E-mail ou senha incorretos.';
const MSG_SEM_CONTA = 'Não encontramos uma conta TactiPlan com este e-mail. Se você recebeu um convite, abra o link do e-mail para criar o seu acesso.';
const MSG_MUITAS = 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';

class ErroLogin extends Error {
  constructor(status, codigo, mensagem) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
  }
}

const COLUNAS = 'id, email, encrypted_password, name, role';

async function buscarPorEmail(email) {
  // Preferência pela grafia exata (o e-mail é UNIQUE com caixa); senão, sem diferenciar caixa.
  const r = await query(
    `SELECT ${COLUNAS} FROM users
      WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL
      ORDER BY (email = $1) DESC LIMIT 1`,
    [email]
  );
  return r.rows[0] || null;
}

async function entrarComSenha(email, senha, ip) {
  const e = String(email || '').trim();
  const s = String(senha || '');
  if (!e || !s || !e.includes('@')) throw new ErroLogin(400, 'DADOS_INVALIDOS', 'Informe o e-mail e a senha.');

  const user = await buscarPorEmail(e);
  if (!user) {
    await bcrypt.compare(s, HASH_FALSO_()); // anti-oráculo de tempo
    throw new ErroLogin(401, 'CREDENCIAIS', MSG_CREDENCIAIS);
  }

  const viaConta = conta.ativo() ? await conta.autenticar(user.email, s, ip) : { indisponivel: true };
  let ok;
  if (viaConta.ok) {
    ok = true;
    if (viaConta.usuario_id !== user.id) await conta.vincular(viaConta.conta.id, user.id);
  } else if (viaConta.status === 429) {
    throw new ErroLogin(429, 'MUITAS_TENTATIVAS', MSG_MUITAS);
  } else if (viaConta.indisponivel) {
    ok = await bcrypt.compare(s, user.encrypted_password || HASH_FALSO_());
    if (!user.encrypted_password) ok = false;
  } else {
    ok = false;
  }
  if (!ok) throw new ErroLogin(401, 'CREDENCIAIS', MSG_CREDENCIAIS);
  return user;
}

// ---- Google ----------------------------------------------------------------------------------

function audienciasGoogle() {
  return [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ].filter(Boolean);
}

let clienteGoogle = null;
function verificadorGoogle() {
  if (!clienteGoogle) {
    const { OAuth2Client } = require('google-auth-library');
    clienteGoogle = new OAuth2Client();
  }
  return async (idToken) => {
    const ticket = await clienteGoogle.verifyIdToken({ idToken, audience: audienciasGoogle() });
    return ticket.getPayload();
  };
}

async function entrarComGoogle(idToken, { verificar } = {}) {
  if (!idToken || typeof idToken !== 'string') throw new ErroLogin(400, 'DADOS_INVALIDOS', 'Credencial do Google ausente.');
  if (!audienciasGoogle().length) throw new ErroLogin(503, 'GOOGLE_DESLIGADO', 'O login com Google não está disponível.');
  let payload;
  try {
    payload = await (verificar || verificadorGoogle())(idToken);
  } catch (e) {
    throw new ErroLogin(401, 'GOOGLE_INVALIDO', 'Não foi possível entrar com o Google.');
  }
  if (!payload || !payload.sub || !payload.email || payload.email_verified === false) {
    throw new ErroLogin(401, 'GOOGLE_INVALIDO', 'Não foi possível entrar com o Google.');
  }
  const email = String(payload.email).toLowerCase();
  const r = await query(
    `SELECT ${COLUNAS}, google_id FROM users
      WHERE deleted_at IS NULL AND (google_id = $1 OR LOWER(email) = $2)
      ORDER BY COALESCE(google_id = $1, FALSE) DESC LIMIT 1`,
    [payload.sub, email]
  );
  const user = r.rows[0];
  if (!user) throw new ErroLogin(404, 'SEM_CONTA', MSG_SEM_CONTA);
  if (!user.google_id) {
    // Vincula como o web faz (o e-mail foi verificado pelo Google).
    await query(
      `UPDATE users SET google_id = COALESCE(google_id, $1) WHERE id = $2`,
      [payload.sub, user.id]
    );
  }
  return user;
}

// ---- Apple -----------------------------------------------------------------------------------

function audienciasApple() {
  return ['com.faggin.tactiplan.app', 'com.faggin.tactiplan', process.env.APPLE_SERVICES_ID].filter(Boolean);
}

let verificadorAppleCache = null;
function verificadorApple() {
  if (!verificadorAppleCache) {
    const { createRemoteJWKSet, jwtVerify } = require('jose');
    const jwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
    verificadorAppleCache = async (token) => (await jwtVerify(token, jwks, {
      issuer: 'https://appleid.apple.com',
      audience: audienciasApple(),
    })).payload;
  }
  return verificadorAppleCache;
}

async function entrarComApple(identityToken, { verificar } = {}) {
  if (!identityToken || typeof identityToken !== 'string') throw new ErroLogin(400, 'DADOS_INVALIDOS', 'Credencial da Apple ausente.');
  let payload;
  try {
    payload = await (verificar || verificadorApple())(identityToken);
  } catch (e) {
    throw new ErroLogin(401, 'APPLE_INVALIDO', 'Não foi possível entrar com a Apple.');
  }
  if (!payload || !payload.sub) throw new ErroLogin(401, 'APPLE_INVALIDO', 'Não foi possível entrar com a Apple.');
  const email = String(payload.email || '').toLowerCase();
  const verificado = payload.email_verified === true || payload.email_verified === 'true';
  const r = await query(
    `SELECT ${COLUNAS}, apple_id FROM users
      WHERE deleted_at IS NULL AND (apple_id = $1 OR ($2 <> '' AND $3 = TRUE AND LOWER(email) = $2))
      ORDER BY COALESCE(apple_id = $1, FALSE) DESC LIMIT 1`,
    [payload.sub, email, verificado]
  );
  const user = r.rows[0];
  if (!user) throw new ErroLogin(404, 'SEM_CONTA', MSG_SEM_CONTA);
  if (!user.apple_id) {
    await query('UPDATE users SET apple_id = COALESCE(apple_id, $1) WHERE id = $2', [payload.sub, user.id]);
  }
  return user;
}

module.exports = {
  ErroLogin, MSG_CREDENCIAIS, MSG_SEM_CONTA,
  entrarComSenha, entrarComGoogle, entrarComApple, audienciasGoogle, audienciasApple,
};
