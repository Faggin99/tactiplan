// Permissões granulares e papéis de membro.
//
// Modelo:
// - 6 papéis pré-configurados (owner, manager, head_coach, assistant_coach, specialist, viewer)
// - 16 permissões discretas em workspace_members.permissions (JSONB array)
// - Quando member.permissions é NULL → usa os defaults do role.
// - Quando preenchido → é o conjunto efetivo (override do role).
//
// Filtragem por categoria é HARD: se member.category_ids é array, todas as queries
// de leitura/escrita são limitadas àquelas categorias.

const PERMISSIONS = [
  'training:view', 'training:edit', 'training:delete',
  'games:view', 'games:edit',
  'athletes:view', 'athletes:edit',
  'injuries:manage',
  'tactical:view', 'tactical:edit',
  'stats:view',
  'library:edit',
  'categories:manage',
  'members:manage',
  'club_settings:manage',
  'billing:manage',
];

// 'manager'/'viewer' não são mais oferecidos (19/10/2026), mas seguem válidos p/ membros antigos.
const ROLES = ['owner', 'manager', 'head_coach', 'assistant_coach', 'specialist', 'viewer', 'other'];

const ROLE_DEFAULTS = {
  owner: PERMISSIONS.slice(), // tudo
  manager: [
    'training:view', 'training:edit', 'training:delete',
    'games:view', 'games:edit',
    'athletes:view', 'athletes:edit',
    'injuries:manage',
    'tactical:view', 'tactical:edit',
    'stats:view',
    'library:edit',
    'categories:manage',
  ],
  head_coach: [
    'training:view', 'training:edit', 'training:delete',
    'games:view', 'games:edit',
    'athletes:view', 'athletes:edit',
    'tactical:view', 'tactical:edit',
    'stats:view',
    'library:edit',
  ],
  assistant_coach: [
    'training:view', 'training:edit',
    'games:view',
    'athletes:view',
    'tactical:view',
    'stats:view',
  ],
  specialist: [
    'training:view',
    'games:view',
    'athletes:view', 'athletes:edit',
    'injuries:manage',
    'stats:view',
    'library:edit',
  ],
  viewer: [
    'training:view',
    'games:view',
    'athletes:view',
    'tactical:view',
    'stats:view',
  ],
  // Outros: começa só vendo; o dono marca o resto nas permissões.
  other: [
    'training:view',
    'games:view',
    'athletes:view',
    'tactical:view',
    'stats:view',
  ],
};

function isValidPermission(p) {
  return PERMISSIONS.includes(p);
}

function isValidRole(r) {
  return ROLES.includes(r);
}

// Resolve as permissões efetivas de um member { role, permissions (array|null), is_owner }.
function effectivePermissionsForMember({ role, permissions, is_owner }) {
  if (is_owner) return new Set(PERMISSIONS); // owner sempre faz tudo
  if (Array.isArray(permissions)) {
    return new Set(permissions.filter(isValidPermission));
  }
  const defaults = ROLE_DEFAULTS[role] || [];
  return new Set(defaults);
}

// Helper: o member pode acessar a categoria? Se category_ids é null → todas; se array → checa.
function memberCanAccessCategory(memberCategoryIds, targetCategoryId) {
  if (!memberCategoryIds) return true;
  if (!targetCategoryId) return false; // se filtro é restrito, atletas/microcycles sem category são invisíveis
  return memberCategoryIds.includes(targetCategoryId);
}

module.exports = {
  PERMISSIONS,
  ROLES,
  ROLE_DEFAULTS,
  isValidPermission,
  isValidRole,
  effectivePermissionsForMember,
  memberCanAccessCategory,
};
