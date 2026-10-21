// "Cadastros": telas de configuração que saíram do menu lateral e viraram abas
// de uma página só. As rotas antigas continuam valendo (links salvos funcionam).
export const CADASTROS_TABS = [
  { to: '/settings/competitions', label: 'Campeonatos', permission: 'training:edit' },
  { to: '/settings/categories', label: 'Categorias', gated: 'multi_user', permission: 'categories:manage' },
  { to: '/settings/clubs', label: 'Clubes' },
  { to: '/settings/contents', label: 'Conteúdos', permission: 'library:edit' },
  { to: '/settings/activities', label: 'Atividades', permission: 'library:edit' },
  { to: '/settings/personalizacao', label: 'Personalização', permission: 'club_settings:manage' },
];
// Telas que pertencem a Cadastros sem ter aba própria (aba ativa = a indicada).
export const CADASTROS_EXTRA = { '/settings/subconteudos': '/settings/contents' };

export function isCadastrosPath(pathname) {
  return pathname === '/settings/cadastros'
    || CADASTROS_TABS.some((t) => pathname === t.to || pathname.startsWith(t.to + '/'))
    || Object.keys(CADASTROS_EXTRA).some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// Abas que a pessoa pode ver (permissão; aba travada por plano aparece com cadeado).
export function abasVisiveis(can) {
  return CADASTROS_TABS.filter((t) => !t.permission || can(t.permission));
}
