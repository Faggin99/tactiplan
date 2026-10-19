// Permissões de membro de workspace (espelho do backend src/utils/permissions.js).
// Mantenha em sincronia ao adicionar/remover permissões ou roles.

export const PERMISSIONS = [
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

export const PERMISSION_LABELS = {
  'training:view':       'Ver treinos',
  'training:edit':       'Editar treinos',
  'training:delete':     'Apagar treinos',
  'games:view':          'Ver jogos',
  'games:edit':          'Editar jogos',
  'athletes:view':       'Ver atletas',
  'athletes:edit':       'Editar atletas',
  'injuries:manage':     'Gerenciar lesões',
  'tactical:view':       'Ver quadro tático',
  'tactical:edit':       'Editar quadro tático',
  'stats:view':          'Ver estatísticas',
  'library:edit':        'Editar biblioteca (conteúdos/atividades)',
  'categories:manage':   'Gerenciar categorias',
  'members:manage':      'Gerenciar equipe (convidar/remover)',
  'club_settings:manage':'Configurações do clube',
  'billing:manage':      'Gerenciar assinatura',
};

// Papéis oferecidos na tela. 'manager' e 'viewer' saíram (19/10/2026) mas seguem
// reconhecidos abaixo para membros antigos (hoje não há nenhum).
export const ROLES = ['owner', 'head_coach', 'assistant_coach', 'specialist', 'other'];

export const ROLE_LABELS = {
  owner:           'Proprietário',
  manager:         'Gerente',
  head_coach:      'Treinador Principal',
  assistant_coach: 'Treinador Auxiliar',
  specialist:      'Especialista (Fisio/PF/Analista)',
  viewer:          'Somente leitura',
  other:           'Outros',
};

export const ROLE_DESCRIPTIONS = {
  manager:         'Faz quase tudo, menos billing e gestão de membros',
  head_coach:      'Treinador principal — treinos, jogos, atletas, táticas',
  assistant_coach: 'Auxiliar — edita treinos, vê jogos/atletas/táticas',
  specialist:      'Fisio/PF/Analista — gerencia lesões, vê stats, edita biblioteca',
  viewer:          'Apenas leitura',
  other:           'Outra função: escolha abaixo o que a pessoa pode ver e editar',
};

export const ROLE_DEFAULTS = {
  owner: PERMISSIONS.slice(),
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

// Agrupamento por área pra UI
export const PERMISSION_GROUPS = [
  { label: 'Treinos', items: ['training:view', 'training:edit', 'training:delete'] },
  { label: 'Jogos', items: ['games:view', 'games:edit'] },
  { label: 'Atletas', items: ['athletes:view', 'athletes:edit', 'injuries:manage'] },
  { label: 'Quadro Tático', items: ['tactical:view', 'tactical:edit'] },
  { label: 'Estatísticas e Biblioteca', items: ['stats:view', 'library:edit'] },
  { label: 'Administração', items: ['categories:manage', 'members:manage', 'club_settings:manage', 'billing:manage'] },
];

// Resolve permissões efetivas de um member { role, permissions (array|null) }.
// is_owner é overlay separado (vem do switcher de workspace).
export function effectivePermissions(member, { isOwner = false } = {}) {
  if (isOwner || member?.role === 'owner') return new Set(PERMISSIONS);
  if (!member) return new Set();
  if (Array.isArray(member.permissions)) return new Set(member.permissions);
  return new Set(ROLE_DEFAULTS[member.role] || []);
}
