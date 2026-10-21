const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/auth');
const { query } = require('../config/database');
const { effectivePermissionsForMember, PERMISSIONS } = require('../utils/permissions');
const { travaClubeArquivado } = require('../utils/clubArquivado');

// Cache pequeno por user_id pra reduzir queries por request — invalida em 30s
const accessibleCache = new Map();
const CACHE_TTL_MS = 30 * 1000;

// Carrega tudo que o user pode acessar de uma vez: workspaces (próprias + member),
// clubs (legado pra compat até remoção do tenant_id) e papéis.
async function loadAccessible(userId) {
  const cached = accessibleCache.get(userId);
  if (cached && (Date.now() - cached.at) < CACHE_TTL_MS) return cached.data;

  // Workspaces: próprias (owner) + onde sou member aceito
  const workspacesRes = await query(
    `SELECT w.id AS workspace_id, w.name, w.owner_id, w.tipo, 'owner' AS role,
            NULL::uuid[] AS category_ids, NULL::jsonb AS permissions, TRUE AS is_owner
       FROM workspaces w
      WHERE w.owner_id = $1
      UNION
     SELECT w.id AS workspace_id, w.name, w.owner_id, w.tipo, m.role,
            m.category_ids, m.permissions, FALSE AS is_owner
       FROM workspace_members m
       JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = $1 AND m.accepted_at IS NOT NULL`,
    [userId]
  );

  // Clubs acessíveis pelo user — agora baseado em workspace (não mais tenant_id legado).
  // Owner: clubes de workspaces que o user é dono. Member: clubes de workspaces onde o user
  // foi aceito como workspace_member (escopo de categoria aplicado depois pelo gate).
  const clubsRes = await query(
    `SELECT c.id AS club_id, c.tenant_id, c.workspace_id, 'owner' AS role, TRUE AS is_owner
       FROM clubs c
       JOIN workspaces w ON w.id = c.workspace_id
      WHERE w.owner_id = $1
      UNION
     SELECT c.id AS club_id, c.tenant_id, c.workspace_id, m.role, FALSE AS is_owner
       FROM workspace_members m
       JOIN clubs c ON c.workspace_id = m.workspace_id
      WHERE m.user_id = $1 AND m.accepted_at IS NOT NULL`,
    [userId]
  );

  const data = { workspaces: workspacesRes.rows, clubs: clubsRes.rows };
  accessibleCache.set(userId, { at: Date.now(), data });
  return data;
}

function invalidateAccessibleCache(userId) {
  if (userId) accessibleCache.delete(userId);
  else accessibleCache.clear();
}

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header provided' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid authorization format. Use: Bearer <token>' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, jwtSecret);

    // LGPD: rejeita JWT de conta removida (soft-deleted). Também cobre user apagado
    // manualmente do banco (userCheck vem vazio).
    const userCheck = await query(
      'SELECT deleted_at, role FROM users WHERE id = $1',
      [decoded.id]
    );
    if (userCheck.rows.length === 0 || userCheck.rows[0].deleted_at) {
      return res.status(401).json({ error: 'Conta removida' });
    }

    // role vem do BANCO (fonte da verdade), não do token: o JWT antigo não
    // carregava role, então `decoded.role` era sempre undefined e o bypass
    // de admin abaixo nunca disparava. Ler do banco também evita token stale.
    const dbRole = userCheck.rows[0].role;
    req.user = { id: decoded.id, email: decoded.email, role: dbRole };

    let accessible = { workspaces: [], clubs: [] };
    try {
      accessible = await loadAccessible(decoded.id);
    } catch (err) {
      console.error('Failed to load accessible workspaces/clubs:', err.message);
    }

    req.user.accessibleWorkspaces = accessible.workspaces;
    req.user.accessibleClubs = accessible.clubs;

    // Lista de TODAS as workspaces acessíveis (pra UI/switcher).
    const allWorkspaceIds = (accessible.workspaces || []).map(w => w.workspace_id);

    // Workspace ativa: vem do header X-Workspace-Id (front injeta a workspace selecionada).
    // Se o header for inválido (workspace não acessível), cai pra primeira própria; se não tiver, undefined.
    const requestedWs = req.headers['x-workspace-id'];
    const activeWs = (requestedWs && allWorkspaceIds.includes(requestedWs))
      ? requestedWs
      : (accessible.workspaces.find(w => w.is_owner)?.workspace_id || allWorkspaceIds[0] || null);
    req.user.workspaceId = activeWs;

    // workspaceIds (singular, embrulhada em array) — usado pelos endpoints
    // que ainda fazem `WHERE workspace_id = ANY($N)`. Pra isolamento por conta,
    // contém SÓ a workspace ativa (e não todas as acessíveis).
    req.user.workspaceIds = activeWs ? [activeWs] : [];

    // tenantIds: mantido por compatibilidade com queries que ainda usam tenant_id.
    const tenantSet = new Set([decoded.id]);
    for (const w of accessible.workspaces || []) tenantSet.add(w.owner_id);
    for (const c of accessible.clubs || []) tenantSet.add(c.tenant_id);
    req.user.tenantIds = Array.from(tenantSet);

    // Membership na workspace ativa (com role/permissions/category_ids)
    const activeMember = (accessible.workspaces || []).find(w => w.workspace_id === activeWs) || null;

    // Resolve permissões efetivas. Admin global passa por tudo.
    if (dbRole === 'admin') {
      req.user.permissions = new Set(PERMISSIONS);
      req.user.allowedCategoryIds = null; // todas
    } else if (activeMember) {
      req.user.permissions = effectivePermissionsForMember(activeMember);
      req.user.allowedCategoryIds = activeMember.is_owner ? null : (activeMember.category_ids || null);
    } else {
      req.user.permissions = new Set();
      req.user.allowedCategoryIds = [];
    }

    // Helper principal: o user tem essa permissão na workspace ativa?
    req.user.can = (permission) => {
      if (!permission) return true;
      return req.user.permissions.has(permission);
    };

    // Helper: filtragem HARD por categoria. Retorna { sql, params }.
    // - allowedCategoryIds = null → sem filtro
    // - allowedCategoryIds = []   → bloqueia tudo (sem acesso)
    // - allowedCategoryIds = [a,b]→ AND category_id = ANY($N)
    req.user.assertCanAccessCategory = (catId) => {
      const allowed = req.user.allowedCategoryIds;
      if (allowed === null) return true;
      if (!catId) return false;
      return allowed.includes(catId);
    };

    // Helper: o user pode escrever (qualquer role exceto viewer) na workspace dada?
    // Checagem fina é via req.user.can('xxx:edit') — esse helper só descarta viewer.
    req.user.canWriteWorkspace = (workspaceId) => {
      if (!workspaceId) return false;
      const ws = (req.user.accessibleWorkspaces || []).find(w => w.workspace_id === workspaceId);
      if (!ws) return false;
      return ws.role !== 'viewer';
    };

    // Helper: o user é dono da workspace?
    req.user.isWorkspaceOwner = (workspaceId) => {
      const ws = (req.user.accessibleWorkspaces || []).find(w => w.workspace_id === workspaceId);
      return !!(ws && ws.is_owner);
    };

    // Helpers de workspace por club (substituem os legados *TenantForClub).
    req.user.writableWorkspaceForClub = (clubId) => {
      if (!clubId) return null;
      const access = (req.user.accessibleClubs || []).find(c => c.club_id === clubId);
      if (!access) return null;
      if (access.role === 'viewer') return null;
      return access.workspace_id;
    };
    req.user.readableWorkspaceForClub = (clubId) => {
      if (!clubId) return null;
      const access = (req.user.accessibleClubs || []).find(c => c.club_id === clubId);
      return access ? access.workspace_id : null;
    };

    // Helpers legados (mantidos pra rotas ainda não migradas)
    req.user.writableTenantForClub = (clubId) => {
      if (!clubId) return null;
      const access = (req.user.accessibleClubs || []).find(c => c.club_id === clubId);
      if (!access) return null;
      if (access.role === 'owner' || access.role === 'coach') return access.tenant_id;
      return null;
    };
    req.user.readableTenantForClub = (clubId) => {
      if (!clubId) return null;
      const access = (req.user.accessibleClubs || []).find(c => c.club_id === clubId);
      return access ? access.tenant_id : null;
    };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Clube arquivado = só leitura (409 CLUB_ARCHIVED). Fora do try: erro de rota
  // não pode virar "Invalid token".
  return travaClubeArquivado(req, res, next);
};

authMiddleware.invalidateAccessibleCache = invalidateAccessibleCache;

module.exports = authMiddleware;
