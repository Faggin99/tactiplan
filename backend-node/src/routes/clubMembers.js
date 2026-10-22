const express = require('express');
const crypto = require('crypto');
const { query } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const mailer = require('../services/mailer');
const billing = require('../services/billing');
const { NOME_ENTRADA, NOME_CLUBE, isPlanoEntrada } = require('../config/planos');

// Limite de CONVIDADOS (além do dono) da workspace, pelo plano efetivo:
// entrada = 1, Clube = 5 (max_coaches), cortesia/admin = ilimitado (-1),
// só leitura = 0. Ver billing.limiteConvidados.
async function workspaceMemberLimit(userId, workspaceId) {
  const sub = await billing.getEffectiveSubscription({ userId, workspaceId });
  return { sub, limit: billing.limiteConvidados(sub) };
}

function memberLimitMessage(sub, limit) {
  const plural = limit === 1 ? 'convidado' : 'convidados';
  if (isPlanoEntrada(sub?.plan_id)) {
    return `O plano ${NOME_ENTRADA} inclui o responsável + ${limit} ${plural}. ` +
      `Para convidar outra pessoa, remova um membro ou convite pendente, ou mude para o plano ${NOME_CLUBE}.`;
  }
  return `O seu plano inclui o responsável + ${limit} ${plural}. ` +
    'Para convidar outra pessoa, remova um membro ou convite pendente.';
}

// Conta membros ativos da workspace (excluindo owner). Pra gate max_coaches.
async function countActiveMembers(workspaceId) {
  const r = await query(
    `SELECT COUNT(*)::int AS n FROM workspace_members
      WHERE workspace_id = $1 AND accepted_at IS NOT NULL`,
    [workspaceId]
  );
  return r.rows[0]?.n || 0;
}

// Conta convites pendentes (ainda não aceitos).
async function countPendingInvites(workspaceId) {
  const r = await query(
    `SELECT COUNT(*)::int AS n FROM workspace_members
      WHERE workspace_id = $1 AND accepted_at IS NULL`,
    [workspaceId]
  );
  return r.rows[0]?.n || 0;
}

// Escapa valores controlados pelo usuário antes de injetar no HTML do e-mail.
// Sem isso, um nome de workspace/convidador com < > & " vira injeção de HTML
// no corpo do e-mail (o destinatário e o conteúdo são escolhidos pelo emissor).
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildInviteEmail({ workspaceName, role, inviterName, acceptUrl }) {
  const roleLabel = ({ head_coach: 'treinador principal', assistant_coach: 'treinador auxiliar', specialist: 'especialista', assistant: 'auxiliar' })[role] || 'membro da comissão';
  const wsName = escapeHtml(workspaceName);
  const invName = escapeHtml(inviterName || 'Um treinador');
  const url = escapeHtml(acceptUrl);
  const subject = `Convite para participar de "${workspaceName}" no TactiPlan`;
  const html = `
    <div style="font-family: Helvetica, Arial, sans-serif; max-width: 540px; margin: auto; padding: 24px; color: #0f172a;">
      <h2 style="color: #2563eb; margin-top: 0;">Você recebeu um convite</h2>
      <p>${invName} te convidou para participar de
        <strong>${wsName}</strong> como <strong>${roleLabel}</strong> no TactiPlan.</p>
      <p>Pra aceitar, clique no botão abaixo. Você precisa ter uma conta TactiPlan
        com o mesmo e-mail pra qual o convite foi enviado.</p>
      <p style="margin: 24px 0;">
        <a href="${url}" style="background: #2563eb; color: #fff; padding: 12px 22px; text-decoration: none; border-radius: 6px; font-weight: 600;">
          Aceitar convite
        </a>
      </p>
      <p style="font-size: 13px; color: #64748b;">Se você não esperava esse convite, é só ignorar.</p>
      <p style="font-size: 12px; color: #94a3b8; margin-top: 32px;">
        Não consegue clicar? Cole no navegador: ${url}
      </p>
    </div>
  `;
  const text = `Você foi convidado para "${workspaceName}" no TactiPlan como ${roleLabel}.
Pra aceitar, abra: ${acceptUrl}`;
  return { subject, html, text };
}

const router = express.Router();
const { isValidRole, isValidPermission } = require('../utils/permissions');
const VALID_ROLES = ['head_coach', 'assistant_coach', 'specialist', 'other'];

// Resolve workspace a partir de clubId (1 conta = 1 clube = 1 workspace)
async function resolveWorkspaceFromClub(clubId) {
  if (!clubId) return null;
  const r = await query('SELECT workspace_id FROM clubs WHERE id = $1', [clubId]);
  return r.rows[0]?.workspace_id || null;
}

// ───────── ROTAS COMPAT: /api/clubs/:clubId/members → workspace_members ─────────

// GET /api/clubs/:clubId/members
router.get('/clubs/:clubId/members', authMiddleware, async (req, res) => {
  try {
    const { clubId } = req.params;
    const wsId = await resolveWorkspaceFromClub(clubId);
    if (!wsId) return res.status(404).json({ error: 'Clube não encontrado' });

    const isOwner = req.user.isWorkspaceOwner(wsId);
    const isMember = (req.user.accessibleWorkspaces || []).some(w => w.workspace_id === wsId);
    if (!isOwner && !isMember) return res.status(403).json({ error: 'Sem acesso à workspace' });

    const ownerRow = await query(
      `SELECT u.id, u.name, u.email FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE w.id = $1`,
      [wsId]
    );

    const membersResult = await query(
      `SELECT m.id, m.user_id, m.invited_email, m.role, m.category_ids, m.permissions, m.invited_at, m.accepted_at,
              u.name AS user_name, u.email AS user_email,
              inv.name AS invited_by_name
         FROM workspace_members m
         LEFT JOIN users u   ON u.id = m.user_id
         LEFT JOIN users inv ON inv.id = m.invited_by
        WHERE m.workspace_id = $1
        ORDER BY m.invited_at ASC`,
      [wsId]
    );

    // Limite de convidados (só para o dono, que é quem convida): -1 = sem limite.
    // O app nativo mostra "X de Y" com isso (o web calcula pelo plano no front).
    let limiteConvidados = null;
    if (isOwner) {
      try { limiteConvidados = (await workspaceMemberLimit(req.user.id, wsId)).limit; } catch (_) { limiteConvidados = null; }
    }

    res.json({
      owner: ownerRow.rows[0] ? { ...ownerRow.rows[0], role: 'owner' } : null,
      members: membersResult.rows,
      is_owner: isOwner,
      workspace_id: wsId,
      limite_convidados: limiteConvidados,
    });
  } catch (err) {
    console.error('List members error:', err);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

// POST /api/clubs/:clubId/invite
router.post('/clubs/:clubId/invite', authMiddleware, async (req, res) => {
  try {
    const { clubId } = req.params;
    const { email, role, category_ids, permissions } = req.body;

    if (!email?.trim()) return res.status(400).json({ error: 'email é obrigatório' });
    if (role && !VALID_ROLES.includes(role)) return res.status(400).json({ error: 'role inválido' });

    const wsId = await resolveWorkspaceFromClub(clubId);
    if (!wsId) return res.status(404).json({ error: 'Clube não encontrado' });
    if (!req.user.can('members:manage') || !req.user.isWorkspaceOwner(wsId)) {
      return res.status(403).json({ error: 'Apenas o dono pode convidar' });
    }

    const wsRow = await query('SELECT name FROM workspaces WHERE id = $1', [wsId]);
    const workspaceName = wsRow.rows[0]?.name || 'TactiPlan';

    // Limite de membros do plano (aplicado no servidor; conta aceitos + pendentes).
    const { sub, limit } = await workspaceMemberLimit(req.user.id, wsId);
    if (limit === 0) {
      return res.status(402).json({
        error: sub?.read_only
          ? 'Esta conta está em modo só leitura (sem assinatura ativa). Não é possível convidar membros.'
          : 'O plano atual não permite convidar membros.',
        code: sub?.read_only ? 'READ_ONLY' : 'PLAN_REQUIRED',
        required_feature: 'equipe',
      });
    }
    if (limit > 0) {
      const active = await countActiveMembers(wsId);
      const pending = await countPendingInvites(wsId);
      if (active + pending >= limit) {
        return res.status(402).json({
          error: memberLimitMessage(sub, limit),
          code: 'MEMBER_LIMIT',
          required_feature: 'max_convidados',
          current: active + pending,
          limit,
          plan_id: sub?.plan_id || null,
        });
      }
    }

    // Valida category_ids (todas devem pertencer à workspace, se informadas)
    let normalizedCategoryIds = null;
    if (Array.isArray(category_ids) && category_ids.length > 0) {
      const check = await query(
        'SELECT id FROM categories WHERE workspace_id = $1 AND id = ANY($2)',
        [wsId, category_ids]
      );
      if (check.rows.length !== category_ids.length) {
        return res.status(400).json({ error: 'Uma ou mais categorias inválidas' });
      }
      normalizedCategoryIds = category_ids;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const userResult = await query('SELECT id, name FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    const existingUser = userResult.rows[0] || null;

    if (existingUser) {
      const dup = await query(
        'SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND accepted_at IS NOT NULL',
        [wsId, existingUser.id]
      );
      if (dup.rows.length > 0) return res.status(409).json({ error: 'Esse usuário já é membro' });
    }

    const pending = await query(
      `SELECT id FROM workspace_members
        WHERE workspace_id = $1 AND accepted_at IS NULL
          AND (LOWER(invited_email) = $2 OR user_id = $3)`,
      [wsId, normalizedEmail, existingUser?.id || null]
    );
    if (pending.rows.length > 0) return res.status(409).json({ error: 'Já existe um convite pendente pra esse email' });

    // Permissões customizadas opcionais (se omitido, usa defaults do role)
    let normalizedPermissions = null;
    if (Array.isArray(permissions)) {
      normalizedPermissions = permissions.filter(isValidPermission);
    }

    const token = crypto.randomBytes(24).toString('hex');
    const inserted = await query(
      `INSERT INTO workspace_members (workspace_id, user_id, invited_email, role, category_ids, permissions, invited_by, invite_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [wsId, existingUser?.id || null, normalizedEmail, role || 'head_coach', normalizedCategoryIds,
       normalizedPermissions ? JSON.stringify(normalizedPermissions) : null, req.user.id, token]
    );

    // APP_BASE_URL é a env var usada no resto do backend; APP_URL não existe,
    // então o link do convite do staging saía apontando pro app de produção.
    const baseUrl = process.env.APP_BASE_URL || 'https://app.tactiplan.faggin.com.br';
    const acceptUrl = `${baseUrl}/#/accept-invite/${token}`;

    try {
      const { subject, html, text } = buildInviteEmail({
        workspaceName,
        role: role || 'coach',
        inviterName: req.user.email,
        acceptUrl,
      });
      await mailer.sendMail({ to: normalizedEmail, subject, html, text });
    } catch (mailErr) {
      console.error('Failed to send invite email:', mailErr.message);
    }

    res.status(201).json({
      ...inserted.rows[0],
      accept_url: acceptUrl,
    });
  } catch (err) {
    console.error('Invite error:', err);
    res.status(500).json({ error: 'Failed to invite member' });
  }
});

// POST /api/clubs/:clubId/members/:memberId/resend — convite pendente: manda o e-mail de novo
// e devolve o link (o app compartilha pela folha do sistema). Só o dono, só pendente.
router.post('/clubs/:clubId/members/:memberId/resend', authMiddleware, async (req, res) => {
  try {
    const { clubId, memberId } = req.params;
    const wsId = await resolveWorkspaceFromClub(clubId);
    if (!wsId) return res.status(404).json({ error: 'Clube não encontrado' });
    if (!req.user.can('members:manage') || !req.user.isWorkspaceOwner(wsId)) {
      return res.status(403).json({ error: 'Apenas o dono pode reenviar convites' });
    }
    const r = await query(
      `SELECT m.id, m.invited_email, m.role, m.invite_token, w.name AS workspace_name
         FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.id = $1 AND m.workspace_id = $2 AND m.accepted_at IS NULL`,
      [memberId, wsId]
    );
    const conv = r.rows[0];
    if (!conv || !conv.invite_token) return res.status(404).json({ error: 'Convite pendente não encontrado' });
    const baseUrl = process.env.APP_BASE_URL || 'https://app.tactiplan.faggin.com.br';
    const acceptUrl = `${baseUrl}/#/accept-invite/${conv.invite_token}`;
    let enviado = true;
    try {
      const { subject, html, text } = buildInviteEmail({
        workspaceName: conv.workspace_name || 'TactiPlan', role: conv.role || 'coach', inviterName: req.user.email, acceptUrl,
      });
      await mailer.sendMail({ to: conv.invited_email, subject, html, text });
    } catch (mailErr) {
      enviado = false;
      console.error('Failed to resend invite email:', mailErr.message);
    }
    await query('UPDATE workspace_members SET updated_at = NOW() WHERE id = $1', [conv.id]);
    res.json({ ok: true, id: conv.id, invited_email: conv.invited_email, accept_url: acceptUrl, email_enviado: enviado });
  } catch (err) {
    console.error('Resend invite error:', err);
    res.status(500).json({ error: 'Failed to resend invite' });
  }
});

// PUT /api/clubs/:clubId/members/:memberId — atualiza role/categorias/permissions
router.put('/clubs/:clubId/members/:memberId', authMiddleware, async (req, res) => {
  try {
    const { clubId, memberId } = req.params;
    const { role, category_ids, permissions } = req.body;
    if (role && !VALID_ROLES.includes(role)) return res.status(400).json({ error: 'role inválido' });

    const wsId = await resolveWorkspaceFromClub(clubId);
    if (!wsId) return res.status(404).json({ error: 'Clube não encontrado' });
    if (!req.user.can('members:manage') || !req.user.isWorkspaceOwner(wsId)) {
      return res.status(403).json({ error: 'Apenas o dono pode alterar membros' });
    }

    let normalizedCategoryIds = null;
    if (Array.isArray(category_ids) && category_ids.length > 0) {
      const check = await query(
        'SELECT id FROM categories WHERE workspace_id = $1 AND id = ANY($2)',
        [wsId, category_ids]
      );
      if (check.rows.length !== category_ids.length) {
        return res.status(400).json({ error: 'Uma ou mais categorias inválidas' });
      }
      normalizedCategoryIds = category_ids;
    }

    // permissions:
    //   omitido (undefined) → mantém o que está
    //   null  → reseta pros defaults do role
    //   array → grava override
    let permissionsParam = undefined;
    if (permissions === null) permissionsParam = null;
    else if (Array.isArray(permissions)) {
      permissionsParam = JSON.stringify(permissions.filter(isValidPermission));
    }

    const result = await query(
      `UPDATE workspace_members
          SET role         = COALESCE($1, role),
              category_ids = $2,
              permissions  = CASE WHEN $4::boolean THEN $3::jsonb ELSE permissions END,
              updated_at   = NOW()
        WHERE id = $5 AND workspace_id = $6
        RETURNING *`,
      [role || null, normalizedCategoryIds, permissionsParam, permissionsParam !== undefined, memberId, wsId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Membro não encontrado' });

    if (result.rows[0].user_id) authMiddleware.invalidateAccessibleCache?.(result.rows[0].user_id);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update member error:', err);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// DELETE /api/clubs/:clubId/members/:memberId
router.delete('/clubs/:clubId/members/:memberId', authMiddleware, async (req, res) => {
  try {
    const { clubId, memberId } = req.params;
    const wsId = await resolveWorkspaceFromClub(clubId);
    if (!wsId) return res.status(404).json({ error: 'Clube não encontrado' });
    if (!req.user.can('members:manage') || !req.user.isWorkspaceOwner(wsId)) {
      return res.status(403).json({ error: 'Apenas o dono pode remover membros' });
    }

    const result = await query(
      'DELETE FROM workspace_members WHERE id = $1 AND workspace_id = $2 RETURNING user_id',
      [memberId, wsId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Membro não encontrado' });

    if (result.rows[0].user_id) authMiddleware.invalidateAccessibleCache?.(result.rows[0].user_id);

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete member error:', err);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

// ───────── Endpoints PÚBLICOS — fluxo de aceite ─────────

// GET /api/invites/:token — PÚBLICO (montado também antes do auth global em server.js):
// quem abre o link ainda pode não estar logado; o token (48 hex) é o segredo.
async function getInviteHandler(req, res) {
  try {
    const result = await query(
      `SELECT m.id, m.invited_email, m.role, m.invited_at, m.accepted_at, m.category_ids,
              w.id AS workspace_id, w.name AS workspace_name,
              inv.name AS invited_by_name, inv.email AS invited_by_email
         FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
         LEFT JOIN users inv ON inv.id = m.invited_by
        WHERE m.invite_token = $1`,
      [req.params.token]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Convite inválido ou já usado' });
    const invite = result.rows[0];
    if (invite.accepted_at) return res.status(410).json({ error: 'Convite já foi aceito' });

    // Compat: front antigo espera club_id/club_name — adiciona campo extra
    const clubRow = await query('SELECT id, name FROM clubs WHERE workspace_id = $1 LIMIT 1', [invite.workspace_id]);
    if (clubRow.rows.length > 0) {
      invite.club_id = clubRow.rows[0].id;
      invite.club_name = clubRow.rows[0].name;
    }

    res.json(invite);
  } catch (err) {
    console.error('Get invite error:', err);
    res.status(500).json({ error: 'Failed to get invite' });
  }
}
router.get('/invites/:token', getInviteHandler);

// GET /api/invites-pending — convites ainda não aceitos para o e-mail do usuário logado.
// Rede de segurança: se a pessoa se cadastrou/entrou por outro caminho e não aceitou o link,
// o app oferece aceitar (o token só vai para o dono do e-mail convidado).
router.get('/invites-pending', authMiddleware, async (req, res) => {
  try {
    const r = await query(
      `SELECT m.invite_token AS token, m.role, w.name AS workspace_name,
              (SELECT c.name FROM clubs c WHERE c.workspace_id = w.id ORDER BY c.created_at LIMIT 1) AS club_name,
              inv.name AS invited_by_name
         FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
         LEFT JOIN users inv ON inv.id = m.invited_by
        WHERE m.accepted_at IS NULL AND m.invite_token IS NOT NULL
          AND LOWER(m.invited_email) = LOWER($1)`,
      [req.user.email]
    );
    res.json({ data: r.rows });
  } catch (err) {
    console.error('Pending invites error:', err);
    res.status(500).json({ error: 'Failed to list invites' });
  }
});

// POST /api/invites/:token/accept
router.post('/invites/:token/accept', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT m.*, w.name AS workspace_name
         FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.invite_token = $1`,
      [req.params.token]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Convite inválido ou já usado' });
    const invite = result.rows[0];
    if (invite.accepted_at) return res.status(410).json({ error: 'Convite já foi aceito' });

    if (invite.invited_email) {
      const me = await query('SELECT email FROM users WHERE id = $1', [req.user.id]);
      const myEmail = (me.rows[0]?.email || '').toLowerCase();
      if (myEmail !== invite.invited_email.toLowerCase()) {
        return res.status(403).json({ error: 'Esse convite é pra outro email. Entre com a conta correspondente.' });
      }
    }

    const already = await query(
      'SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND accepted_at IS NOT NULL',
      [invite.workspace_id, req.user.id]
    );
    if (already.rows.length > 0) {
      return res.status(409).json({ error: 'Você já é membro' });
    }

    // Limite do plano também no aceite (o plano pode ter mudado depois do convite).
    const { sub, limit } = await workspaceMemberLimit(req.user.id, invite.workspace_id);
    if (limit === 0 || (limit > 0 && (await countActiveMembers(invite.workspace_id)) >= limit)) {
      return res.status(402).json({
        error: 'Esta equipe já atingiu o limite de membros do plano. Fale com o responsável pela conta.',
        code: sub?.read_only ? 'READ_ONLY' : 'MEMBER_LIMIT',
        limit,
      });
    }

    const updated = await query(
      `UPDATE workspace_members
          SET user_id = $1, accepted_at = NOW(), invite_token = NULL, updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [req.user.id, invite.id]
    );

    authMiddleware.invalidateAccessibleCache?.(req.user.id);

    res.json({ ok: true, member: updated.rows[0], workspace_id: invite.workspace_id, workspace_name: invite.workspace_name });
  } catch (err) {
    console.error('Accept invite error:', err);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

module.exports = router;
module.exports.getInviteHandler = getInviteHandler;
