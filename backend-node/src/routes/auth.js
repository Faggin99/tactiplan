const express = require('express');
const { formatarNome } = require('../utils/formatarNome');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { jwtSecret, jwtExpiresIn } = require('../config/auth');
const authMiddleware = require('../middleware/auth');
const { uploadProfilePhoto } = require('../middleware/upload');
const { loginLimiter, registerLimiter, recoveryLimiter } = require('../middleware/rateLimit');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../services/mailer');
const billing = require('../services/billing');
const { isAdmin, isLifetime } = require('../config/specialUsers');
const { OAuth2Client } = require('google-auth-library');
const conta = require('../services/conta'); // login único (Conta Faggin)

const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

// Sign in with Apple: valida o identityToken (JWT RS256) contra o JWKS público
// da Apple. Audience = bundle id do app (login nativo iOS); o Services ID
// (login web, opcional) entra via APPLE_SERVICES_ID no .env quando existir.
const { createRemoteJWKSet, jwtVerify } = require('jose');
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const APPLE_AUDIENCES = ['com.faggin.tactiplan', process.env.APPLE_SERVICES_ID].filter(Boolean);

const router = express.Router();

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn: jwtExpiresIn });
}

// POST /api/auth/register
router.post('/register', registerLimiter, [
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().notEmpty(),
  body('accept_terms').equals('true'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, phone } = req.body;
    const name = formatarNome(req.body.name);
    // "Você é": clube/escolinha ou comissão técnica (só ajusta textos; preço é o mesmo).
    const tipoConta = ['clube', 'comissao'].includes(req.body.tipo) ? req.body.tipo : null;

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Login único: o e-mail pode já ter conta Faggin (outro produto). Aí só aceita a MESMA senha.
    let contaId = null;
    if (conta.ativo()) {
      const c = await conta.criar({ email, nome: name, senha: password });
      if (c.criada) contaId = c.conta.id;
      else if (c.existe) {
        const a = await conta.autenticar(email, password, req.ip);
        if (!a.ok && !a.indisponivel) {
          return res.status(400).json({ error: 'Este e-mail já tem uma conta nos produtos Faggin. Use a mesma senha que você usa lá.' });
        }
        contaId = c.conta_id;
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = isAdmin(email) ? 'admin' : 'coach';

    const result = await query(
      `INSERT INTO users (email, encrypted_password, name, phone, role, terms_accepted_at, terms_version)
       VALUES ($1, $2, $3, $4, $5, now(), '2026-05-11')
       RETURNING id, email, name, phone, bio, profile_photo, role`,
      [email, hashedPassword, name, phone || null, role]
    );

    const user = result.rows[0];
    user.tenant_id = user.id;
    if (contaId) await conta.vincular(contaId, user.id);

    // Cria workspace inicial pro user (uma por user no cadastro)
    const wsName = (name && name.trim()) || (email.split('@')[0]) || 'Minha conta';
    const wsRes = await query(
      `INSERT INTO workspaces (name, owner_id, tipo) VALUES ($1, $2, $3) RETURNING id`,
      [wsName, user.id, tipoConta]
    );
    const workspaceId = wsRes.rows[0].id;

    // Assinatura inicial (F1, sem plano grátis): admin → nada; LIFETIME_EMAILS → vitalícia;
    // demais → nenhuma (conta em só leitura até assinar; o front leva para os planos).
    const initialSub = await billing.createInitialSubscription({ userId: user.id, workspaceId, email, role });

    const token = generateToken(user);

    // Fire-and-forget: e-mail de boas-vindas (não bloqueia o response).
    // Se for admin/lifetime, ainda mandamos welcome (sem falar de trial).
    setImmediate(() => {
      const appUrl = process.env.APP_BASE_URL || 'https://app.tactiplan.faggin.com.br';
      sendWelcomeEmail({ to: user.email, name: user.name, trialDaysLeft: initialSub?.trialDays || 0, appUrl })
        .catch(err => console.error('sendWelcomeEmail error:', err?.message));
    });

    res.status(201).json({ token, user, workspace_id: workspaceId });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, [
  body('email').isEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const result = await query(
      'SELECT id, email, encrypted_password, name, phone, bio, profile_photo, role, deleted_at, id as tenant_id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );

    if (result.rows.length === 0) {
      // Não distinguimos "não existe" de "conta removida" pra evitar user enumeration
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    if (user.deleted_at) {
      return res.status(401).json({ error: 'Conta removida' });
    }
    let validPassword;
    const viaConta = conta.ativo() ? await conta.autenticar(email, password, req.ip) : { indisponivel: true };
    if (viaConta.ok) {
      validPassword = true;
      if (viaConta.usuario_id !== user.id) await conta.vincular(viaConta.conta.id, user.id);
    } else if (viaConta.status === 429) {
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
    } else if (viaConta.indisponivel) {
      validPassword = await bcrypt.compare(password, user.encrypted_password || '');
    } else {
      validPassword = false;
    }
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    delete user.deleted_at;

    delete user.encrypted_password;
    user.tenant_id = user.tenant_id || user.id;

    const token = generateToken(user);

    res.json({ token, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, name, phone, bio, profile_photo, role, id as tenant_id,
              (encrypted_password IS NULL OR encrypted_password = '') AS requires_password
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    user.tenant_id = user.tenant_id || user.id;

    res.json(user);
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

// DELETE /api/auth/me — LGPD "direito ao esquecimento"
// Anonimiza PII (não hard-delete pra preservar integridade referencial), cancela
// assinaturas imediatamente e invalida sessões futuras (JWT existente será rejeitado
// pelo middleware quando bater no check de deleted_at).
router.delete('/me', authMiddleware, async (req, res) => {
  try {
    // Confirma que o user existe e recupera a senha atual pra validar (se houver)
    const userRes = await query(
      'SELECT id, encrypted_password, deleted_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const u = userRes.rows[0];
    if (u.deleted_at) {
      return res.status(410).json({ error: 'Conta já foi removida' });
    }

    // Se tiver senha, exige confirmação. Google-only users (sem senha) passam direto.
    if (u.encrypted_password) {
      const { password } = req.body || {};
      if (!password) {
        return res.status(400).json({ error: 'Senha obrigatória para confirmar exclusão' });
      }
      const valid = await bcrypt.compare(password, u.encrypted_password);
      if (!valid) {
        return res.status(401).json({ error: 'Senha incorreta' });
      }
    }

    // Anonimiza PII e marca soft-delete. Email vira placeholder único
    // pra liberar o e-mail original pra futuros cadastros.
    await query(
      `UPDATE users
          SET deleted_at         = NOW(),
              email              = 'deleted-' || id || '@deleted.local',
              name               = 'Usuário removido',
              encrypted_password = NULL,
              google_id          = NULL,
              apple_id           = NULL,
              avatar_url         = NULL,
              profile_photo      = NULL,
              phone              = NULL,
              bio                = NULL,
              updated_at         = NOW()
        WHERE id = $1`,
      [req.user.id]
    );

    // Cancela a recorrência no Mercado Pago E marca a sub local como canceled.
    // NÃO usar DELETE: (1) sem cancelar no MP a cobrança recorrente continua
    // pro cartão do usuário excluído; (2) deletar a linha faz o próximo webhook
    // do MP RE-INSERIR a sub via external_reference, ressuscitando-a. Manter a
    // linha 'canceled' faz o webhook só dar UPDATE (idempotente).
    try {
      await billing._hardCancelActiveSubsForUser(req.user.id, 'account_deleted');
    } catch (e) {
      console.error('Falha ao cancelar assinatura na exclusão de conta:', e?.message);
      // Não bloqueia a exclusão LGPD — mas registra pra reconciliação manual.
    }

    // ── LGPD: purga os DADOS do tenant, não só a PII do usuário ──
    // Antes só o registro em `users` era anonimizado; clubes, atletas (com foto),
    // treinos, jogos e arquivos ficavam pra sempre. Aqui apagamos tudo que o
    // usuário É DONO. Quase todas as tabelas têm ON DELETE CASCADE a partir de
    // workspaces, então deletar as workspaces próprias cascateia o resto.
    try {
      const fs = require('fs');
      const path = require('path');
      const uploadDir = path.resolve(process.env.UPLOAD_DIR || '../uploads');

      // 1) Coleta caminhos de arquivos físicos ANTES de apagar as linhas.
      const owned = await query('SELECT id FROM workspaces WHERE owner_id = $1', [req.user.id]);
      const ownedIds = owned.rows.map(r => r.id);
      const filePaths = [];
      if (ownedIds.length > 0) {
        const f1 = await query(
          `SELECT file_path FROM training_activity_files WHERE workspace_id = ANY($1) AND file_path IS NOT NULL`,
          [ownedIds]
        );
        const f2 = await query(
          `SELECT logo_path, logo_dark_path FROM clubs WHERE workspace_id = ANY($1) AND (logo_path IS NOT NULL OR logo_dark_path IS NOT NULL)`,
          [ownedIds]
        );
        const f3 = await query(
          `SELECT photo_url FROM athletes WHERE workspace_id = ANY($1) AND photo_url IS NOT NULL`,
          [ownedIds]
        );
        for (const row of f1.rows) filePaths.push(row.file_path);
        for (const row of f2.rows) {
          if (row.logo_path) filePaths.push(row.logo_path);
          if (row.logo_dark_path) filePaths.push(row.logo_dark_path);
        }
        for (const row of f3.rows) filePaths.push(row.photo_url);
      }
      // Foto de perfil do próprio usuário (capturada antes da anonimização acima —
      // relê do banco pra garantir; já foi setada NULL, então usa a lista se houver).

      // 2) Destaca a assinatura das workspaces pra ela SOBREVIVER ao cascade
      //    (subscriptions→workspaces é CASCADE; queremos manter a linha canceled).
      await query('UPDATE subscriptions SET workspace_id = NULL WHERE user_id = $1', [req.user.id]);

      // 3) Apaga as workspaces próprias — cascateia clubes, atletas, categorias,
      //    conteúdos, microciclos/sessões/atividades, jogos, quadro tático,
      //    lesões, temas do mês, memberships dessas workspaces, etc.
      await query('DELETE FROM workspaces WHERE owner_id = $1', [req.user.id]);

      // 4) Remove o usuário das workspaces de OUTRAS pessoas (memberships).
      await query('DELETE FROM workspace_members WHERE user_id = $1', [req.user.id]);
      await query('DELETE FROM announcement_dismissals WHERE user_id = $1', [req.user.id]);

      // 5) Apaga os arquivos físicos (best-effort — nunca derruba a exclusão).
      for (const p of filePaths) {
        try {
          const rel = String(p).replace(/^\/uploads\//, '');
          const abs = path.join(uploadDir, rel);
          // Confinamento: só apaga dentro do uploadDir (evita path traversal).
          if (abs.startsWith(uploadDir) && fs.existsSync(abs)) fs.unlinkSync(abs);
        } catch (_) { /* ignora arquivo individual */ }
      }
    } catch (e) {
      console.error('Falha na purga LGPD de dados do tenant:', e?.message);
      // A conta já está soft-deleted (sem login). Registra pra limpeza manual.
    }

    // Invalida cache de accessible workspaces/clubs pra esse user
    if (typeof authMiddleware.invalidateAccessibleCache === 'function') {
      authMiddleware.invalidateAccessibleCache(req.user.id);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// POST /api/auth/set-password — primeira senha (pra quem entrou só via Google)
router.post('/set-password', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 8 caracteres' });
    }
    // Confirma que ainda não tem senha (não é endpoint pra trocar — pra trocar usa /password)
    const u = await query('SELECT encrypted_password FROM users WHERE id = $1', [req.user.id]);
    if (u.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (u.rows[0].encrypted_password) {
      return res.status(400).json({ error: 'Senha já está definida. Use /api/auth/password pra trocar.' });
    }
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 10);
    await query(
      `UPDATE users SET encrypted_password = $1, updated_at = NOW() WHERE id = $2`,
      [hash, req.user.id]
    );
    await conta.definirSenha(req.user.email, password);
    res.json({ ok: true });
  } catch (err) {
    console.error('Set password error:', err);
    res.status(500).json({ error: 'Failed to set password' });
  }
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone, bio } = req.body;

    const result = await query(
      `UPDATE users SET name = $1, phone = $2, bio = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, email, name, phone, bio, profile_photo, role, id as tenant_id`,
      [formatarNome(name), phone || null, bio || null, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    user.tenant_id = user.tenant_id || user.id;

    res.json(user);
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// PUT /api/auth/password
router.put('/password', authMiddleware, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    const result = await query('SELECT encrypted_password FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const viaConta = conta.ativo() ? await conta.autenticar(req.user.email, currentPassword, req.ip) : { indisponivel: true };
    const validPassword = viaConta.ok
      || (viaConta.indisponivel && await bcrypt.compare(currentPassword, result.rows[0].encrypted_password || ''));
    if (!validPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await query(
      'UPDATE users SET encrypted_password = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, req.user.id]
    );
    await conta.definirSenha(req.user.email, newPassword);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// POST /api/auth/upload-photo
router.post('/upload-photo', authMiddleware, (req, res) => {
  uploadProfilePhoto(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const photoPath = `/uploads/profile-photos/${req.file.filename}`;
      const result = await query(
        `UPDATE users SET profile_photo = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, email, name, phone, bio, profile_photo, role, id as tenant_id`,
        [photoPath, req.user.id]
      );

      res.json(result.rows[0]);
    } catch (dbErr) {
      console.error('Upload photo DB error:', dbErr);
      res.status(500).json({ error: 'Failed to save photo' });
    }
  });
});

// =============================================================
// Google OAuth login
// =============================================================
// POST /api/auth/google — recebe ID token do Google e autentica/cria conta
router.post('/google', loginLimiter, async (req, res) => {
  try {
    if (!googleClient) {
      return res.status(501).json({ error: 'Google OAuth not configured' });
    }
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'Missing credential' });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email_verified) {
      return res.status(401).json({ error: 'Google email não verificado' });
    }

    const email = (payload.email || '').toLowerCase();
    const googleId = payload.sub;
    const name = formatarNome(payload.name || payload.given_name || email.split('@')[0]);

    // Procura por google_id ou email — ignora contas removidas (LGPD)
    let userRes = await query(
      'SELECT id, email, name, phone, bio, profile_photo, role, deleted_at FROM users WHERE (google_id = $1 OR email = $2) AND deleted_at IS NULL LIMIT 1',
      [googleId, email]
    );

    let user;
    if (userRes.rows.length > 0) {
      user = userRes.rows[0];
      if (user.deleted_at) {
        return res.status(401).json({ error: 'Conta removida' });
      }
      delete user.deleted_at;
      // Atualiza google_id se ainda não estiver setado (vinculação à conta existente)
      await query(
        `UPDATE users SET google_id = COALESCE(google_id, $1), auth_provider = CASE WHEN google_id IS NULL THEN 'google' ELSE auth_provider END WHERE id = $2`,
        [googleId, user.id]
      );
    } else {
      // Cria nova conta
      const role = isAdmin(email) ? 'admin' : 'coach';
      const insertRes = await query(
        `INSERT INTO users (email, name, google_id, auth_provider, role, terms_accepted_at, terms_version)
         VALUES ($1, $2, $3, 'google', $4, now(), '2026-05-11')
         RETURNING id, email, name, phone, bio, profile_photo, role`,
        [email, name, googleId, role]
      );
      user = insertRes.rows[0];

      // Cria workspace inicial
      const wsName = (name && name.trim()) || (email.split('@')[0]) || 'Minha conta';
      const wsRes = await query(
        `INSERT INTO workspaces (name, owner_id) VALUES ($1, $2) RETURNING id`,
        [wsName, user.id]
      );
      const workspaceId = wsRes.rows[0].id;

      // Assinatura inicial (F1): sem plano grátis — ver billing.createInitialSubscription.
      const initialSub = await billing.createInitialSubscription({ userId: user.id, workspaceId, email, role });

      // Email de boas-vindas — o cadastro via Google não disparava (só o
      // cadastro por email/senha chamava). Fire-and-forget.
      const appUrl = process.env.APP_BASE_URL || 'https://app.tactiplan.faggin.com.br';
      sendWelcomeEmail({ to: user.email, name: user.name, trialDaysLeft: initialSub?.trialDays || 0, appUrl })
        .catch(err => console.error('sendWelcomeEmail (google) error:', err?.message));
    }

    user.tenant_id = user.id;
    const token = generateToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error('Google auth error:', err?.message);
    res.status(401).json({ error: 'Falha ao autenticar com Google' });
  }
});

// POST /api/auth/apple — Sign in with Apple (obrigatório na App Store por
// oferecermos login Google). Recebe o identityToken do fluxo nativo iOS,
// valida assinatura/iss/aud e autentica/cria conta — espelho do /google.
router.post('/apple', loginLimiter, async (req, res) => {
  try {
    const { identityToken, name: givenName } = req.body || {};
    if (!identityToken) return res.status(400).json({ error: 'Missing identityToken' });

    let payload;
    try {
      const verified = await jwtVerify(identityToken, APPLE_JWKS, {
        issuer: 'https://appleid.apple.com',
        audience: APPLE_AUDIENCES,
      });
      payload = verified.payload;
    } catch (e) {
      console.error('Apple token verify error:', e?.message);
      return res.status(401).json({ error: 'Token da Apple inválido' });
    }

    const appleId = payload.sub;
    // Apple manda o email no token (real ou relay @privaterelay.appleid.com);
    // email_verified pode vir como boolean ou string "true".
    const email = String(payload.email || '').toLowerCase();
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    if (!appleId) return res.status(401).json({ error: 'Token da Apple sem subject' });

    // Procura por apple_id; senão vincula por email verificado (LGPD: ignora removidas)
    let userRes = await query(
      `SELECT id, email, name, phone, bio, profile_photo, role FROM users
       WHERE deleted_at IS NULL AND (apple_id = $1 OR ($2 <> '' AND $3 = TRUE AND email = $2))
       LIMIT 1`,
      [appleId, email, emailVerified]
    );

    let user;
    if (userRes.rows.length > 0) {
      user = userRes.rows[0];
      await query(
        `UPDATE users SET apple_id = COALESCE(apple_id, $1),
                auth_provider = CASE WHEN apple_id IS NULL AND google_id IS NULL THEN 'apple' ELSE auth_provider END
         WHERE id = $2`,
        [appleId, user.id]
      );
    } else {
      if (!email) {
        // Sem email não dá pra criar conta (caso raro: usuário revogou o compartilhamento)
        return res.status(401).json({ error: 'A Apple não compartilhou seu email. Remova o app em Ajustes > Apple ID > Início de Sessão e Segurança e tente de novo.' });
      }
      const name = formatarNome((givenName || '').trim() || email.split('@')[0]);
      const role = isAdmin(email) ? 'admin' : 'coach';
      const insertRes = await query(
        `INSERT INTO users (email, name, apple_id, auth_provider, role, terms_accepted_at, terms_version)
         VALUES ($1, $2, $3, 'apple', $4, now(), '2026-05-11')
         RETURNING id, email, name, phone, bio, profile_photo, role`,
        [email, name, appleId, role]
      );
      user = insertRes.rows[0];

      const wsName = name || 'Minha conta';
      const wsRes = await query(
        `INSERT INTO workspaces (name, owner_id) VALUES ($1, $2) RETURNING id`,
        [wsName, user.id]
      );
      const workspaceId = wsRes.rows[0].id;

      // Assinatura inicial (F1): sem plano grátis — ver billing.createInitialSubscription.
      const initialSub = await billing.createInitialSubscription({ userId: user.id, workspaceId, email, role });

      const appUrl = process.env.APP_BASE_URL || 'https://app.tactiplan.faggin.com.br';
      sendWelcomeEmail({ to: user.email, name: user.name, trialDaysLeft: initialSub?.trialDays || 0, appUrl })
        .catch(err => console.error('sendWelcomeEmail (apple) error:', err?.message));
    }

    user.tenant_id = user.id;
    const token = generateToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error('Apple auth error:', err?.message);
    res.status(401).json({ error: 'Falha ao autenticar com Apple' });
  }
});

// =============================================================
// Password recovery
// =============================================================

// POST /api/auth/forgot — solicita link de redefinição
router.post('/forgot', recoveryLimiter, [
  body('email').isEmail(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email } = req.body;
    const user = await query('SELECT id, email, name FROM users WHERE email = $1', [email]);

    // Resposta uniforme — não revela se o e-mail existe
    if (user.rows.length === 0) {
      return res.json({ ok: true });
    }

    const u = user.rows[0];
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

    // invalida tokens anteriores ainda não usados
    await query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [u.id]);

    await query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at, requested_ip)
       VALUES ($1, $2, $3, $4)`,
      [u.id, tokenHash, expiresAt, req.ip]
    );

    const baseUrl = process.env.APP_BASE_URL || 'https://app.tactiplan.faggin.com.br';
    const resetUrl = `${baseUrl}/#/reset-password?token=${rawToken}`;

    try {
      await sendPasswordResetEmail({ to: u.email, name: u.name, resetUrl });
    } catch (err) {
      console.error('Failed to send reset email:', err);
      // Não vazamos a falha de envio pro cliente — log only.
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
});

// POST /api/auth/reset — completa a redefinição
router.post('/reset', recoveryLimiter, [
  body('token').isString().isLength({ min: 32 }),
  body('password').isLength({ min: 6 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { token, password } = req.body;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const result = await query(
      `SELECT pr.id, pr.user_id, pr.expires_at, pr.used_at, u.email
       FROM password_resets pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.token_hash = $1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Token inválido' });
    }
    const row = result.rows[0];
    if (row.used_at) return res.status(400).json({ error: 'Token já utilizado' });
    if (new Date(row.expires_at) < new Date()) return res.status(400).json({ error: 'Token expirado' });

    const hashed = await bcrypt.hash(password, 10);

    await query('UPDATE users SET encrypted_password = $1, updated_at = now() WHERE id = $2', [hashed, row.user_id]);
    await query('UPDATE password_resets SET used_at = now() WHERE id = $1', [row.id]);
    await conta.definirSenha(row.email, password);

    res.json({ ok: true });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

module.exports = router;
// Helper reaproveitado pelo resgate da troca de produto (routes/conta.js).
module.exports.generateToken = generateToken;
