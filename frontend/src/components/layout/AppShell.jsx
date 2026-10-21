import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Calendar, BarChart3, Waypoints, Building2, LayoutGrid, Users, User, Trophy, BookOpen, Target,
  ChevronDown, ChevronRight, LogOut, CreditCard, Settings, Lock, X, PanelLeft, HelpCircle, Moon, Sun, Menu,
  Check, Loader2, FolderCog, Paintbrush,
} from 'lucide-react';
import { CADASTROS_TABS, isCadastrosPath, CADASTROS_EXTRA } from '../../lib/cadastros';
import { usePlanFeatures } from '../../hooks/usePlanFeatures';
import { useCan } from '../../hooks/useCan';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import { ClubSelector } from '../club/ClubSelector';
import { WorkspaceSwitcher } from '../workspace/WorkspaceSwitcher';
import { SettingsSheet } from '../settings/SettingsSheet';
import { replayTour } from '../../hooks/useTour';
import { api } from '../../services/api';
import { isNative } from '../../lib/platform';
import notify from '../../lib/notify';

// SHELL DO APP (out/2026): barra lateral no padrão do Gestsport. Desktop = coluna fixa que
// recolhe em trilho de ícones (preferência guardada no aparelho); celular = gaveta aberta
// pela barra superior. Substitui o menu horizontal do Header.jsx (que fica no repositório
// só como referência). Itens, travas de plano (`gated`) e permissões (`permission`) são os
// mesmos do menu antigo.
const SECTIONS = [
  { items: [
    { to: '/home', icon: Home, label: 'Início' },
  ] },
  { header: 'Planejamento', items: [
    { to: '/training', icon: Calendar, label: 'Programação' },
    { to: '/training-stats', icon: BarChart3, label: 'Estatísticas' },
    { to: '/tactical-board', icon: Waypoints, label: 'Quadro Tático', gated: 'quadro_tatico' },
  ] },
  { header: 'Equipe', items: [
    { to: '/plantel', icon: Users, label: 'Plantel de Atletas', permission: 'athletes:view' },
    { to: '/settings/team', icon: User, label: 'Staff', gated: 'equipe', permission: 'members:manage' },
    // Campeonatos, Categorias, Clubes, Conteúdos e Atividades viraram abas (ver lib/cadastros.js)
    { to: '/settings/cadastros', icon: FolderCog, label: 'Cadastros', isActive: isCadastrosPath },
  ] },
];

const TOUR_PAGES = [
  { key: 'training', label: 'Programação', route: '/training', icon: Calendar },
  { key: 'stats', label: 'Estatísticas', route: '/training-stats', icon: BarChart3 },
  { key: 'plantel', label: 'Plantel de Atletas', route: '/plantel', icon: Users },
  { key: 'tactical-board', label: 'Quadro Tático', route: '/tactical-board', icon: Waypoints },
];

// Páginas fora do menu principal, para a trilha "onde estou".
const OUTRAS_PAGINAS = [
  { to: '/billing', label: 'Assinatura' },
  { to: '/settings/subconteudos', label: 'Submomentos', secao: 'Cadastros' },
];


export const SIDEBAR_W = 248;
export const SIDEBAR_RAIL_W = 76;

const isNavActive = (to, pathname) => pathname === to || pathname.startsWith(to + '/');

export function paginaDaRota(pathname) {
  if (isCadastrosPath(pathname)) {
    const alvo = CADASTROS_EXTRA[Object.keys(CADASTROS_EXTRA).find((p) => pathname.startsWith(p))];
    const extra = OUTRAS_PAGINAS.find((i) => isNavActive(i.to, pathname));
    const aba = CADASTROS_TABS.find((t) => isNavActive(t.to, pathname));
    return { secao: 'Cadastros', pagina: extra?.label || aba?.label || (alvo ? null : 'Cadastros') };
  }
  for (const sec of SECTIONS) {
    const it = sec.items.find((i) => isNavActive(i.to, pathname));
    if (it) return { secao: sec.header || null, pagina: it.label };
  }
  const o = OUTRAS_PAGINAS.find((i) => isNavActive(i.to, pathname));
  return o ? { secao: o.secao || null, pagina: o.label } : { secao: null, pagina: null };
}

function useOnOutsideClick(ref, handler) {
  useEffect(() => {
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) handler(); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref, handler]);
}

function getInitials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/).filter(Boolean);
  return (p.length >= 2 ? p[0][0] + p[p.length - 1][0] : p[0][0]).toUpperCase();
}

// Rótulo flutuante ao lado do ícone (barra recolhida). Vai pro <body> via portal: a <nav>
// tem overflow e cortaria um tooltip absoluto.
function Dica({ alvo, texto }) {
  const { colors, isDark } = useTheme();
  if (!alvo) return null;
  const r = alvo.getBoundingClientRect();
  return createPortal(
    <div role="tooltip" style={{ position: 'fixed', top: r.top + r.height / 2, left: r.right + 10, transform: 'translateY(-50%)', zIndex: 2000, pointerEvents: 'none', padding: '0.35rem 0.6rem', borderRadius: '0.45rem', backgroundColor: isDark ? colors.surfaceHover : colors.text, color: isDark ? colors.text : colors.background, fontSize: '0.78rem', fontWeight: 500, whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>
      {texto}
    </div>,
    document.body,
  );
}

function NavItem({ to, icon: Icon, label, locked, onNavigate, collapsed, isActive }) {
  const { colors } = useTheme();
  const location = useLocation();
  const [hov, setHov] = useState(null);
  const active = isActive ? isActive(location.pathname) : isNavActive(to, location.pathname);
  return (
    <NavLink to={to} onClick={onNavigate} aria-label={collapsed ? label : undefined}
      title={locked ? 'Disponível em um plano pago' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.7rem',
        padding: collapsed ? 0 : '0.5rem 0.75rem', height: collapsed ? 42 : undefined,
        justifyContent: collapsed ? 'center' : 'flex-start', borderRadius: '0.7rem',
        fontSize: '0.875rem', fontWeight: active ? 600 : 500, textDecoration: 'none',
        color: active ? colors.primary : colors.textSecondary,
        backgroundColor: active ? `${colors.primary}14` : hov ? colors.surfaceHover : 'transparent',
        opacity: locked ? 0.8 : 1,
        position: 'relative', transition: 'background-color .15s, color .15s',
      }}
      onMouseEnter={(e) => setHov(e.currentTarget)} onMouseLeave={() => setHov(null)}>
      {active && <span style={{ position: 'absolute', left: collapsed ? -12 : -8, top: '22%', bottom: '22%', width: 3, borderRadius: 3, backgroundColor: colors.primary }} />}
      <Icon size={collapsed ? 20 : 18} strokeWidth={active ? 2.2 : 1.8} style={{ flexShrink: 0 }} />
      {!collapsed && <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
      {!collapsed && locked && <Lock size={12} color={colors.warning} style={{ flexShrink: 0 }} />}
      {collapsed && <Dica alvo={hov} texto={locked ? `${label} (plano pago)` : label} />}
    </NavLink>
  );
}

function MenuRow({ icon: Icon, label, onClick, danger = false, disabled = false }) {
  const { colors } = useTheme();
  const [hov, setHov] = useState(false);
  return (
    <button type="button" onClick={onClick} disabled={disabled} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '0.55rem 0.75rem', backgroundColor: hov && !disabled ? colors.surfaceHover : 'transparent', color: danger ? colors.error : colors.textSecondary, border: 'none', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1, fontSize: '0.83rem', textAlign: 'left', fontFamily: 'inherit' }}>
      <Icon size={15} strokeWidth={1.8} /> {label}
    </button>
  );
}

// Seletor de produtos Faggin (login único, F3): o tile do logo, no topo da barra lateral, vira botão
// e abre "Trocar de produto" com os produtos da conta. Clicar em outro pede ao backend uma URL com
// código de uso único e vai para lá — a sessão daqui nunca sai do domínio. Com menos de 2 produtos,
// erro na consulta ou no app nativo, o logo fica como sempre foi (não é botão).
function useProdutosFaggin(userId) {
  const [produtos, setProdutos] = useState([]);
  useEffect(() => {
    if (!userId || isNative()) return undefined;
    let vivo = true;
    api.get('/conta/produtos')
      .then((d) => { if (vivo) setProdutos(Array.isArray(d?.produtos) ? d.produtos : []); })
      .catch(() => { if (vivo) setProdutos([]); });
    return () => { vivo = false; };
  }, [userId]);
  return produtos.length >= 2 ? produtos : [];
}

function IconeProduto({ p, size = 28 }) {
  const { colors } = useTheme();
  const [falhou, setFalhou] = useState(false);
  const box = { width: size, height: size, borderRadius: 8, flexShrink: 0 };
  if (falhou) {
    return (
      <span aria-hidden="true" style={{ ...box, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, color: colors.primaryText, fontSize: '0.8rem', fontWeight: 700 }}>
        {(p.nome || p.produto || '?').trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  return <img src={`/produtos/${p.produto}.svg`} alt="" aria-hidden="true" onError={() => setFalhou(true)} style={{ ...box, display: 'block' }} />;
}

function ItemProduto({ p, abrindo, onEscolher, itemRef }) {
  const { colors } = useTheme();
  const [hov, setHov] = useState(false);
  const [foco, setFoco] = useState(false);
  const ocupado = abrindo === p.produto;
  const travado = !!abrindo && !ocupado;
  return (
    <button ref={itemRef} type="button" role="menuitem" aria-current={p.atual ? 'true' : undefined}
      disabled={travado} aria-busy={ocupado || undefined}
      onClick={() => onEscolher(p)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onFocus={(e) => setFoco(e.currentTarget.matches(':focus-visible'))} onBlur={() => setFoco(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.45rem 0.55rem',
        border: 'none', borderRadius: '0.6rem', textAlign: 'left', fontFamily: 'inherit',
        fontSize: '0.86rem', fontWeight: p.atual ? 600 : 500,
        color: p.atual ? colors.primary : colors.text,
        backgroundColor: p.atual ? `${colors.primary}14` : (hov && !abrindo) ? colors.surfaceHover : 'transparent',
        cursor: p.atual ? 'default' : abrindo ? 'wait' : 'pointer', opacity: travado ? 0.5 : 1,
        outline: foco ? `2px solid ${colors.primary}` : 'none', outlineOffset: -2,
        transition: 'background-color .15s',
      }}>
      {ocupado ? (
        <span aria-hidden="true" style={{ width: 28, height: 28, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 size={18} className="animate-spin" color={colors.primary} />
        </span>
      ) : <IconeProduto p={p} />}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ocupado ? 'Abrindo…' : p.nome}
      </span>
      {p.atual && <Check size={16} strokeWidth={2.4} color={colors.primary} style={{ flexShrink: 0 }} aria-label="Produto atual" />}
    </button>
  );
}

const POPOVER_W = 240;

function SeletorProduto({ produtos, botaoRef, onFechar }) {
  const { colors, isDark } = useTheme();
  const popRef = useRef(null);
  const itensRef = useRef([]);
  const [abrindo, setAbrindo] = useState(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    function calcular() {
      const b = botaoRef.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, window.innerWidth - POPOVER_W - 8));
      setPos({ top: r.bottom + 8, left });
    }
    calcular();
    window.addEventListener('resize', calcular);
    window.addEventListener('scroll', calcular, true);
    return () => { window.removeEventListener('resize', calcular); window.removeEventListener('scroll', calcular, true); };
  }, [botaoRef]);

  // Foco inicial no produto atual (ou no primeiro).
  useEffect(() => {
    if (!pos) return;
    const i = Math.max(0, produtos.findIndex((p) => p.atual));
    itensRef.current[i]?.focus();
  }, [pos, produtos]);

  useEffect(() => {
    function fora(e) {
      if (popRef.current?.contains(e.target) || botaoRef.current?.contains(e.target)) return;
      onFechar(false);
    }
    document.addEventListener('mousedown', fora);
    document.addEventListener('touchstart', fora);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('touchstart', fora); };
  }, [botaoRef, onFechar]);

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); onFechar(true); return; }
    if (e.key === 'Tab') { onFechar(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const itens = itensRef.current.filter((el) => el && !el.disabled);
    if (!itens.length) return;
    const atual = itens.indexOf(document.activeElement);
    let prox = 0;
    if (e.key === 'End') prox = itens.length - 1;
    else if (e.key === 'ArrowDown') prox = atual < 0 ? 0 : (atual + 1) % itens.length;
    else if (e.key === 'ArrowUp') prox = atual < 0 ? itens.length - 1 : (atual - 1 + itens.length) % itens.length;
    itens[prox].focus();
  }

  async function escolher(p) {
    if (abrindo) return;
    if (p.atual) { onFechar(true); return; }
    setAbrindo(p.produto);
    try {
      const d = await api.post('/conta/trocar', { destino: p.produto });
      if (!d?.url) throw new Error('sem url');
      window.location.href = d.url;
    } catch {
      setAbrindo(null);
      notify.error(`Não foi possível abrir o ${p.nome} agora. Tente de novo.`);
    }
  }

  if (!pos) return null;
  return createPortal(
    <div ref={popRef} id="seletor-produto" role="menu" aria-label="Trocar de produto" onKeyDown={onKeyDown}
      style={{
        position: 'fixed', top: pos.top, left: pos.left, width: POPOVER_W, zIndex: 2100,
        backgroundColor: colors.surface || colors.background, border: `1px solid ${colors.border}`, borderRadius: 13,
        boxShadow: isDark ? '0 12px 32px rgba(0,0,0,0.45)' : '0 12px 32px rgba(15,23,42,0.14), 0 2px 6px rgba(15,23,42,0.06)',
        padding: '0.4rem', fontFamily: 'inherit',
      }}>
      <div style={{ padding: '0.35rem 0.55rem 0.45rem', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textMuted }}>
        Trocar de produto
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
        {produtos.map((p, i) => (
          <ItemProduto key={p.produto} p={p} abrindo={abrindo} onEscolher={escolher} itemRef={(el) => { itensRef.current[i] = el; }} />
        ))}
      </div>
    </div>,
    document.body,
  );
}

// Logo do clube ativo (Personalização): substitui o tile TactiPlan no topo. No tema escuro usa
// a logo escura quando o clube tem uma. Imagem quebrada → volta ao tile TactiPlan.
export function useMarcaClube() {
  const { selectedClub, getLogoUrl } = useClub();
  const { isDark } = useTheme();
  const path = (isDark && selectedClub?.logo_dark_path) || selectedClub?.logo_path || null;
  const url = path ? getLogoUrl(path) : null;
  const [falhou, setFalhou] = useState(null);
  const ok = url && falhou !== url;
  return {
    url: ok ? url : null,
    nome: ok ? (selectedClub?.name || 'TactiPlan') : 'TactiPlan',
    onError: () => setFalhou(url),
  };
}

// Marca do topo: logo do clube (altura fixa, largura até o limite, sem distorcer) ou o tile TactiPlan.
function MarcaImg({ marca, collapsed, mobile = false }) {
  if (marca.url) {
    const h = mobile ? '1.9rem' : collapsed ? '2.1rem' : '2rem';
    return <img src={marca.url} alt={marca.nome} onError={marca.onError} style={{ height: h, width: 'auto', maxWidth: mobile ? '7rem' : collapsed ? '2.6rem' : '9rem', objectFit: 'contain', flexShrink: 0, display: 'block' }} />;
  }
  const tam = mobile ? '1.9rem' : collapsed ? '2.1rem' : '2.2rem';
  return <img src="/pwa-192.svg" alt="TactiPlan" style={{ width: tam, height: tam, borderRadius: '0.55rem', flexShrink: 0, display: 'block' }} />;
}

// Tile do logo: botão que abre o seletor quando há 2+ produtos; senão, a imagem de sempre.
// Com logo do clube, a própria logo vira o botão do seletor (mesmo padrão do Gestsport): o
// selo de seta continua indicando que ali se troca de produto, e funciona com o menu recolhido.
function LogoProduto({ produtos, collapsed, marca }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [hov, setHov] = useState(false);
  const [foco, setFoco] = useState(false);
  const botaoRef = useRef(null);
  const img = <MarcaImg marca={marca} collapsed={collapsed} />;
  const fechar = useCallback((devolverFoco) => {
    setOpen(false);
    if (devolverFoco) botaoRef.current?.focus();
  }, []);
  if (!produtos.length) return img;
  return (
    <>
      <button ref={botaoRef} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'seletor-produto' : undefined}
        aria-label="Trocar de produto" title={open ? undefined : 'Trocar de produto'}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        onFocus={(e) => setFoco(e.currentTarget.matches(':focus-visible'))} onBlur={() => setFoco(false)}
        style={{
          position: 'relative', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0,
          borderRadius: '0.6rem', lineHeight: 0,
          boxShadow: foco ? `0 0 0 2px ${colors.background}, 0 0 0 4px ${colors.primary}` : (open || hov) ? `0 0 0 3px ${colors.primary}33` : 'none',
          transition: 'box-shadow .15s',
        }}>
        {img}
        <span aria-hidden="true" style={{ position: 'absolute', right: -4, bottom: -4, width: 15, height: 15, borderRadius: '50%', backgroundColor: colors.background, border: `1px solid ${colors.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronDown size={10} strokeWidth={2.6} color={colors.textSecondary} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        </span>
      </button>
      {open && <SeletorProduto produtos={produtos} botaoRef={botaoRef} onFechar={fechar} />}
    </>
  );
}

function UserFooter({ collapsed, onOpenSettings }) {
  const { colors, isDark } = useTheme();
  const { user, logout } = useAuth();
  const { can } = useCan();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOnOutsideClick(ref, () => setOpen(false));
  const avatar = (
    <span style={{ width: 36, height: 36, borderRadius: '0.65rem', flexShrink: 0, backgroundColor: isDark ? colors.surfaceHover : colors.text, color: isDark ? colors.text : colors.background, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em' }}>{getInitials(user?.name || user?.email)}</span>
  );
  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start' }}>
      {collapsed ? (
        <button type="button" onClick={() => setOpen((v) => !v)} title={user?.name || 'Conta'} aria-label="Menu da conta"
          style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '0.65rem' }}>
          {avatar}
        </button>
      ) : (
        <button type="button" onClick={() => setOpen((v) => !v)}
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.45rem', background: 'transparent', border: 'none', borderRadius: '0.7rem', cursor: 'pointer', textAlign: 'left', minWidth: 0, fontFamily: 'inherit' }}>
          {avatar}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || 'Usuário'}</span>
            <span style={{ display: 'block', fontSize: '0.7rem', color: colors.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</span>
          </span>
          <ChevronDown size={15} color={colors.textMuted} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />
        </button>
      )}
      {open && (
        <div style={{ position: 'absolute', ...(collapsed ? { bottom: 0, left: 'calc(100% + 12px)', width: 250 } : { bottom: 'calc(100% + 8px)', left: 0, right: 0 }), backgroundColor: colors.background, border: `1px solid ${colors.border}`, borderRadius: '0.6rem', boxShadow: '0 -8px 30px rgba(0,0,0,0.22)', overflow: 'hidden', zIndex: 999 }}>
          <MenuRow icon={User} label="Meu perfil" onClick={() => { setOpen(false); onOpenSettings('perfil'); }} />
          <MenuRow icon={Settings} label="Configurações" onClick={() => { setOpen(false); onOpenSettings('perfil'); }} />
          {can('club_settings:manage') && <MenuRow icon={Paintbrush} label="Personalização" onClick={() => { setOpen(false); navigate('/settings/personalizacao'); }} />}
          <MenuRow icon={CreditCard} label="Assinatura" onClick={() => { setOpen(false); navigate('/billing'); }} />
          <div style={{ borderTop: `1px solid ${colors.border}` }}>
            <MenuRow icon={LogOut} label="Sair" danger onClick={() => { setOpen(false); logout(); }} />
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarContent({ onNavigate, collapsed = false, onOpenSettings }) {
  const { colors } = useTheme();
  const { clubs } = useClub();
  const planFeatures = usePlanFeatures();
  const { can } = useCan();
  const showClubSelector = (clubs?.length || 0) > 1;
  const { user } = useAuth();
  const produtos = useProdutosFaggin(user?.id);
  const marca = useMarcaClube();
  const nomeMarca = { fontSize: marca.url ? '1rem' : '1.1rem', fontWeight: 700, color: colors.text, letterSpacing: marca.url ? '-0.01em' : '-0.02em', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const sections = SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((it) => !it.permission || can(it.permission)) }))
    .filter((s) => s.items.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.9rem', padding: collapsed ? '1rem 0.75rem' : '1.1rem 0.9rem' }}>
      {produtos.length ? (
        // Com seletor: o tile é botão (abre "Trocar de produto") e o nome continua levando ao Início.
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: '0.6rem', padding: '0 0.15rem', minHeight: 36 }}>
          <LogoProduto produtos={produtos} collapsed={collapsed} marca={marca} />
          {!collapsed && (
            <Link to="/home" onClick={onNavigate} title={marca.nome} style={nomeMarca}>{marca.nome}</Link>
          )}
        </div>
      ) : (
        <Link to="/home" onClick={onNavigate} title={collapsed ? marca.nome : undefined}
          style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: '0.6rem', textDecoration: 'none', padding: '0 0.15rem', minHeight: 36, minWidth: 0 }}>
          <MarcaImg marca={marca} collapsed={collapsed} />
          {!collapsed && <span style={nomeMarca}>{marca.nome}</span>}
        </Link>
      )}

      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <WorkspaceSwitcher compact />
          {showClubSelector && <ClubSelector />}
        </div>
      )}

      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: collapsed ? '0.5rem' : '0.85rem', margin: '0 -0.1rem', padding: '0.1rem 0.1rem 0' }}>
        {sections.map((sec, i) => (
          <div key={sec.header || i}>
            {sec.header && !collapsed && <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: colors.textMuted, padding: '0 0.75rem 0.35rem' }}>{sec.header}</div>}
            {sec.header && collapsed && i > 0 && <div style={{ height: 1, backgroundColor: colors.border, margin: '0 0.6rem 0.55rem' }} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: collapsed ? '0.3rem' : '0.15rem' }}>
              {sec.items.map((it) => (
                <NavItem key={it.to} {...it} locked={!!it.gated && !planFeatures.has(it.gated)} onNavigate={onNavigate} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '0.75rem' }}>
        <UserFooter collapsed={collapsed} onOpenSettings={onOpenSettings} />
      </div>
    </div>
  );
}

// Desktop: coluna fixa (inteira ou recolhida). Celular: gaveta com fundo escurecido.
export function AppSidebar({ isMobile, open, onClose, collapsed = false }) {
  const { colors } = useTheme();
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('perfil');
  const abrirConfig = (tab) => { setSettingsTab(tab); setSettingsOpen(true); onClose?.(); };

  // Trocar de página fecha a gaveta do celular.
  useEffect(() => { if (isMobile) onClose?.(); }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const sheet = <SettingsSheet isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} initialTab={settingsTab} />;

  if (!isMobile) {
    return (
      <>
        <aside style={{ width: collapsed ? SIDEBAR_RAIL_W : SIDEBAR_W, flexShrink: 0, height: '100vh', position: 'sticky', top: 0, zIndex: 250, backgroundColor: colors.surface, borderRight: `1px solid ${colors.border}`, transition: 'width .2s ease' }}>
          <SidebarContent collapsed={collapsed} onOpenSettings={abrirConfig} />
        </aside>
        {sheet}
      </>
    );
  }
  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 300 }} />}
      <aside style={{ position: 'fixed', top: 0, bottom: 0, left: 0, width: SIDEBAR_W, maxWidth: '82vw', zIndex: 301, backgroundColor: colors.surface, borderRight: `1px solid ${colors.border}`, transform: open ? 'translateX(0)' : `translateX(-${SIDEBAR_W + 12}px)`, transition: 'transform .22s ease', boxShadow: open ? '0 0 40px rgba(0,0,0,0.3)' : 'none' }}>
        <button type="button" onClick={onClose} aria-label="Fechar menu" style={{ position: 'absolute', top: '0.9rem', right: '0.7rem', zIndex: 2, width: 32, height: 32, borderRadius: '0.5rem', border: 'none', background: 'transparent', color: colors.textSecondary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={18} />
        </button>
        <SidebarContent onNavigate={onClose} onOpenSettings={abrirConfig} />
      </aside>
      {sheet}
    </>
  );
}

function BotaoIcone({ onClick, title, children, cor }) {
  const { colors } = useTheme();
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title}
      style={{ width: 38, height: 38, borderRadius: '0.7rem', flexShrink: 0, border: `1px solid ${colors.border}`, backgroundColor: colors.surface, color: cor || colors.textSecondary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </button>
  );
}

function MenuTutorial({ compacto = false }) {
  const { colors } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOnOutsideClick(ref, () => setOpen(false));
  function iniciar(page) {
    setOpen(false);
    if (location.pathname !== page.route) { navigate(page.route); setTimeout(() => replayTour(page.key), 400); }
    else replayTour(page.key);
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {compacto ? (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Tutorial"
          style={{ width: 36, height: 36, borderRadius: '0.6rem', border: 'none', background: 'transparent', color: colors.primary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <HelpCircle size={19} />
        </button>
      ) : (
        <BotaoIcone onClick={() => setOpen((v) => !v)} title="Tutorial guiado" cor={colors.primary}><HelpCircle size={18} /></BotaoIcone>
      )}
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: '15rem', backgroundColor: colors.background, border: `1px solid ${colors.border}`, borderRadius: '0.6rem', boxShadow: '0 12px 30px rgba(0,0,0,0.22)', overflow: 'hidden', zIndex: 999 }}>
          <div style={{ padding: '0.6rem 0.8rem', borderBottom: `1px solid ${colors.border}`, fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.textMuted }}>Tutorial guiado</div>
          {TOUR_PAGES.map((p) => <MenuRow key={p.key} icon={p.icon} label={p.label} onClick={() => iniciar(p)} />)}
        </div>
      )}
    </div>
  );
}

// Barra superior do desktop: recolher/expandir o menu + "onde estou" + tutorial e tema.
export function AppTopBar({ collapsed, onToggle }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { selectedClub } = useClub();
  const { pathname } = useLocation();
  const { secao, pagina } = paginaDaRota(pathname);
  const clube = selectedClub?.name;
  const trilha = [secao, pagina].filter(Boolean);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', height: 64, padding: '0 1.5rem', flexShrink: 0 }}>
      <button type="button" onClick={onToggle} title={collapsed ? 'Expandir menu' : 'Recolher menu'} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} aria-pressed={collapsed}
        style={{ width: 34, height: 34, borderRadius: '0.55rem', border: 'none', background: 'transparent', color: colors.textSecondary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <PanelLeft size={19} strokeWidth={1.8} />
      </button>
      <nav aria-label="Você está em" style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
        {clube && <span style={{ color: colors.primary, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{clube}</span>}
        {trilha.map((t, i) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
            {(clube || i > 0) && <ChevronRight size={15} color={colors.textMuted} style={{ flexShrink: 0 }} />}
            <span style={{ color: i === trilha.length - 1 ? colors.text : colors.textSecondary, fontWeight: i === trilha.length - 1 ? 500 : 400 }}>{t}</span>
          </span>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <MenuTutorial />
      <BotaoIcone onClick={toggleTheme} title={isDark ? 'Usar tema claro' : 'Usar tema escuro'}>
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </BotaoIcone>
    </div>
  );
}

// Barra superior do celular: abre a gaveta, marca e atalhos.
export function AppMobileBar({ onOpenMenu }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const marca = useMarcaClube();
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 200, height: '3.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0 0.75rem', paddingTop: 'env(safe-area-inset-top)', boxSizing: 'content-box', backgroundColor: colors.surface, borderBottom: `1px solid ${colors.border}` }}>
      <button type="button" onClick={onOpenMenu} aria-label="Abrir menu"
        style={{ width: 38, height: 38, borderRadius: '0.5rem', border: 'none', background: 'transparent', color: colors.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Menu size={22} />
      </button>
      <Link to="/home" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', minWidth: 0 }}>
        <MarcaImg marca={marca} mobile />
        <span style={{ fontSize: '1rem', fontWeight: 700, color: colors.text, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{marca.nome}</span>
      </Link>
      <div style={{ flex: 1 }} />
      <MenuTutorial compacto />
      <button type="button" onClick={toggleTheme} aria-label={isDark ? 'Usar tema claro' : 'Usar tema escuro'}
        style={{ width: 36, height: 36, borderRadius: '0.6rem', border: 'none', background: 'transparent', color: colors.textSecondary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {isDark ? <Sun size={19} /> : <Moon size={19} />}
      </button>
    </header>
  );
}
