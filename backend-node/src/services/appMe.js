// GET /api/app/me — tudo que o app precisa para abrir: a pessoa, as contas (workspaces) com os
// clubes, o papel e as 16 permissões em cada uma, as categorias que ela enxerga, se a conta está
// em SÓ LEITURA, a personalização de cada clube (cores + logo) e os convites pendentes.
//
// Regra de texto (Apple 3.1.3): NADA de plano, preço, "assinatura" ou link de compra aqui. A
// conta sem assinatura vira só `somente_leitura: true` e a frase neutra MSG_SOMENTE_LEITURA.
//
// `montarMe` é PURO (testado sem banco); `carregarMe` faz as consultas e chama ele.
const { query } = require('../config/database');
const billing = require('./billing');
const { effectivePermissionsForMember, PERMISSIONS } = require('../utils/permissions');

const MSG_SOMENTE_LEITURA = 'Somente leitura. Fale com o responsável pela equipe.';

// Rótulos curtos (a tela do app tem pouco espaço). Papel desconhecido → "Comissão".
const ROTULOS_PAPEL = {
  owner: 'Dono',
  manager: 'Gerente',
  head_coach: 'Treinador principal',
  assistant_coach: 'Treinador auxiliar',
  specialist: 'Especialista',
  viewer: 'Observador',
  other: 'Comissão',
};

function rotuloPapel(papel) {
  return ROTULOS_PAPEL[papel] || 'Comissão';
}

const HEX_RE = /^#[0-9a-f]{6}$/;
const CORES_BRANDING = ['primary', 'background', 'surface', 'border', 'text', 'textSecondary'];
// Azul padrão do web: primary_color igual a ele = "sem cor própria".
const PRIMARIA_PADRAO_WEB = '#2563eb';

function hexOuNull(v) {
  if (typeof v !== 'string') return null;
  const h = v.trim().toLowerCase().slice(0, 7);
  return HEX_RE.test(h) ? h : null;
}

// Mesmo saneamento do web (ThemeContext.sanitizeBranding): só #rrggbb nas 6 chaves.
function limparBranding(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const out = {};
  for (const tema of ['light', 'dark']) {
    const sec = b[tema];
    if (!sec || typeof sec !== 'object') continue;
    const limpo = {};
    for (const k of CORES_BRANDING) {
      const h = hexOuNull(sec[k]);
      if (h) limpo[k] = h;
    }
    if (Object.keys(limpo).length) out[tema] = limpo;
  }
  return Object.keys(out).length ? out : null;
}

function urlAbsoluta(caminho, base) {
  if (!caminho || typeof caminho !== 'string') return null;
  if (/^https?:\/\//i.test(caminho)) return caminho;
  const b = String(base || '').replace(/\/+$/, '');
  return b + (caminho.startsWith('/') ? caminho : '/' + caminho);
}

// Personalização EFETIVA do clube (= effectiveClubBranding do web): o branding salvo; sem ele, a
// primary_color legada vale nos dois temas. A edição continua só no web — o app só exibe.
function personalizacaoDoClube(clube, base) {
  const branding = limparBranding(clube.branding);
  const legado = hexOuNull(clube.primary_color);
  const legadoValido = legado && legado !== PRIMARIA_PADRAO_WEB ? legado : null;
  const claro = branding?.light?.primary || (branding ? null : legadoValido);
  const escuro = branding?.dark?.primary || (branding ? null : legadoValido);
  return {
    cor_primaria: { claro: claro || null, escuro: escuro || null },
    branding,
    logo_url: urlAbsoluta(clube.logo_path, base),
    logo_escura_url: urlAbsoluta(clube.logo_dark_path, base),
  };
}

// Monta a resposta. Entradas já carregadas do banco:
//   usuario: { id, email, name, profile_photo, role, tem_senha }
//   workspaces: linhas do loadAccessible ({ workspace_id, name, owner_id, role, category_ids, permissions, is_owner })
//   clubes: [{ id, name, modality, workspace_id, logo_path, logo_dark_path, primary_color, branding, archived_at? }]
//   categorias: [{ id, name, club_id, display_order }]
//   assinaturas: { [workspace_id]: sub efetiva do billing }
//   convites: [{ token, role, workspace_name, club_name, invited_by_name }]
function montarMe({ usuario, workspaces = [], clubes = [], categorias = [], assinaturas = {}, convites = [], base }) {
  const admin = usuario.role === 'admin';
  const contas = workspaces.map((w) => {
    const dono = !!w.is_owner;
    const perms = admin ? new Set(PERMISSIONS) : effectivePermissionsForMember({
      role: w.role, permissions: w.permissions, is_owner: dono,
    });
    // Escopo por categoria: dono/admin vê todas; membro com lista vê só as dela.
    const restrito = !admin && !dono && Array.isArray(w.category_ids);
    const permitidas = restrito ? new Set(w.category_ids) : null;
    const sub = assinaturas[w.workspace_id];
    const somenteLeitura = !!(sub ? sub.read_only : true);
    const papel = dono ? 'owner' : (w.role || 'other');

    const clubesDaConta = clubes
      .filter((c) => c.workspace_id === w.workspace_id)
      .map((c) => ({
        id: c.id,
        nome: c.name,
        modalidade: c.modality || 'football_11',
        arquivado: !!c.archived_at,
        categorias: categorias
          .filter((k) => k.club_id === c.id && (!permitidas || permitidas.has(k.id)))
          .sort((a, b) => (a.display_order - b.display_order) || String(a.name).localeCompare(String(b.name), 'pt-BR'))
          .map((k) => ({ id: k.id, nome: k.name })),
        personalizacao: personalizacaoDoClube(c, base),
      }))
      // Ativos primeiro; dentro de cada grupo, por nome.
      .sort((a, b) => (a.arquivado - b.arquivado) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

    return {
      id: w.workspace_id,
      nome: w.name,
      dono,
      papel,
      papel_rotulo: rotuloPapel(papel),
      permissoes: PERMISSIONS.filter((p) => perms.has(p)),
      categorias_restritas: restrito,
      somente_leitura: somenteLeitura,
      clubes: clubesDaConta,
    };
  });

  // Próprias primeiro, depois as de convite; por nome.
  contas.sort((a, b) => (b.dono - a.dono) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

  return {
    usuario: {
      id: usuario.id,
      nome: usuario.name || '',
      email: usuario.email,
      foto_url: urlAbsoluta(usuario.profile_photo, base),
      tem_senha: !!usuario.tem_senha,
    },
    workspaces: contas,
    convites: convites.map((c) => ({
      token: c.token,
      papel: c.role || 'other',
      papel_rotulo: rotuloPapel(c.role),
      workspace_nome: c.workspace_name,
      clube_nome: c.club_name || null,
      convidado_por: c.invited_by_name || null,
    })),
    mensagem_somente_leitura: MSG_SOMENTE_LEITURA,
  };
}

// clubs.archived_at (migration 055) pode ainda não existir num banco antigo: descobre uma vez.
let temArquivado = null;
async function colunaArquivado() {
  if (temArquivado !== null) return temArquivado;
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'clubs' AND column_name = 'archived_at'`
    );
    temArquivado = r.rows.length > 0;
  } catch (_) {
    temArquivado = false;
  }
  return temArquivado;
}

async function carregarMe(userId, { base = process.env.APP_BASE_URL || 'https://app.tactiplan.faggin.com.br' } = {}) {
  const u = await query(
    `SELECT id, email, name, profile_photo, role,
            (encrypted_password IS NOT NULL AND encrypted_password <> '') AS tem_senha
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  const usuario = u.rows[0];
  if (!usuario) return null;

  // Mesma consulta do authMiddleware (loadAccessible): próprias + onde é membro aceito.
  const ws = await query(
    `SELECT w.id AS workspace_id, w.name, w.owner_id, 'owner' AS role,
            NULL::uuid[] AS category_ids, NULL::jsonb AS permissions, TRUE AS is_owner
       FROM workspaces w
      WHERE w.owner_id = $1
      UNION
     SELECT w.id AS workspace_id, w.name, w.owner_id, m.role,
            m.category_ids, m.permissions, FALSE AS is_owner
       FROM workspace_members m
       JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = $1 AND m.accepted_at IS NOT NULL`,
    [userId]
  );
  const workspaces = ws.rows;
  const ids = workspaces.map((w) => w.workspace_id);

  let clubes = [];
  let categorias = [];
  if (ids.length) {
    const arq = await colunaArquivado();
    const c = await query(
      `SELECT id, name, modality, workspace_id, logo_path, logo_dark_path, primary_color, branding
              ${arq ? ', archived_at' : ''}
         FROM clubs WHERE workspace_id = ANY($1)`,
      [ids]
    );
    clubes = c.rows;
    const k = await query(
      'SELECT id, name, club_id, display_order FROM categories WHERE workspace_id = ANY($1)',
      [ids]
    );
    categorias = k.rows;
  }

  const assinaturas = {};
  for (const w of workspaces) {
    try {
      assinaturas[w.workspace_id] = await billing.getEffectiveSubscription({ userId, workspaceId: w.workspace_id });
    } catch (e) {
      console.error('appMe.assinatura:', e.message);
      assinaturas[w.workspace_id] = { read_only: true };
    }
  }

  // Mesma consulta do GET /api/invites-pending (o token só vai para o dono do e-mail convidado).
  const conv = await query(
    `SELECT m.invite_token AS token, m.role, w.name AS workspace_name,
            (SELECT c.name FROM clubs c WHERE c.workspace_id = w.id ORDER BY c.created_at LIMIT 1) AS club_name,
            inv.name AS invited_by_name
       FROM workspace_members m
       JOIN workspaces w ON w.id = m.workspace_id
       LEFT JOIN users inv ON inv.id = m.invited_by
      WHERE m.accepted_at IS NULL AND m.invite_token IS NOT NULL
        AND LOWER(m.invited_email) = LOWER($1)
      ORDER BY m.invited_at`,
    [usuario.email]
  );

  return montarMe({ usuario, workspaces, clubes, categorias, assinaturas, convites: conv.rows, base });
}

module.exports = {
  MSG_SOMENTE_LEITURA, rotuloPapel, limparBranding, personalizacaoDoClube, urlAbsoluta, montarMe, carregarMe,
  _resetColunaArquivado() { temArquivado = null; },
};
