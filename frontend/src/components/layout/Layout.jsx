import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AppSidebar, AppTopBar, AppMobileBar } from './AppShell';
import { useTheme } from '../../contexts/ThemeContext';
import { useClub } from '../../contexts/ClubContext';
import { useAuth } from '../../contexts/AuthContext';
import { ClubOnboardingModal } from '../club/ClubOnboardingModal';
import { useIsMobile } from '../../hooks/useIsMobile';
import { SubscriptionBanner } from './SubscriptionBanner';
import { WorkspaceSwapNotice } from '../workspace/WorkspaceSwapNotice';
import { CadastrosTabs } from './CadastrosTabs';
import { isCadastrosPath } from '../../lib/cadastros';
import { PendingInvitesModal, usePendingInvites } from '../workspace/PendingInvitesModal';

// Rotas onde o conteúdo precisa caber na viewport (calendário, canvas tático).
// Nelas o scroll é interno; nas demais, é o scroll natural da página.
const FIXED_VIEWPORT_ROUTES = ['/training', '/tactical-board'];

export function Layout({ children }) {
  const { colors } = useTheme();
  const { clubs, loading, loadError, createClub } = useClub();
  const isMobile = useIsMobile();
  const location = useLocation();

  const fixedViewport = FIXED_VIEWPORT_ROUTES.some(p => location.pathname.startsWith(p));
  // Menu lateral (padrão do Gestsport): gaveta no celular; no computador recolhe em trilho de
  // ícones, preferência guardada no aparelho.
  const [drawer, setDrawer] = useState(false);
  const [recolhida, setRecolhida] = useState(() => { try { return localStorage.getItem('sidebar_recolhida') === '1'; } catch { return false; } });
  const alternarBarra = () => setRecolhida((v) => { try { localStorage.setItem('sidebar_recolhida', v ? '0' : '1'); } catch { /* sem storage */ } return !v; });

  const bgWrapperStyle = {
    position: 'fixed',
    inset: 0,
    backgroundColor: colors.background,
    zIndex: 0,
    pointerEvents: 'none',
  };

  const shellStyle = {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    minHeight: '100vh',
    overflowX: 'clip',
    maxWidth: '100%',
  };

  const containerStyle = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    ...(fixedViewport ? { height: '100vh' } : {}),
    // Rotas de viewport fixo (ex: Programação) usam fundo OPACO pra o conteúdo
    // preencher a tela toda — sem o gramado do StadiumBackground aparecendo na
    // metade de baixo quando o conteúdo é curto (efeito de "tela dividida").
    backgroundColor: fixedViewport ? colors.background : 'transparent',
  };

  const contentStyle = {
    flex: 1,
    padding: isMobile ? '0.75rem' : (fixedViewport ? '0 1.5rem 1.25rem' : '0.25rem 1.5rem 1.5rem'),
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    ...(fixedViewport ? { minHeight: 0, overflowY: 'auto' } : {}),
  };

  // Convite pendente para o e-mail da pessoa: oferece aceitar ANTES do "crie seu clube"
  // (o convidado não deve criar clube próprio — entra no de quem convidou).
  const { isAuthenticated } = useAuth();
  const pendingInvites = usePendingInvites(!!isAuthenticated);
  const [convitesDispensados, setConvitesDispensados] = useState(false);
  const showInvites = !convitesDispensados && Array.isArray(pendingInvites) && pendingInvites.length > 0;

  const showOnboarding = !loading
    && !loadError
    && clubs.length === 0
    && pendingInvites !== null
    && !showInvites
    && location.pathname !== '/billing';

  return (
    <>
      <div style={bgWrapperStyle}>
        {/* sem imagem de fundo (o gramado ilustrado saiu a pedido do dono) */}
      </div>
      <div style={shellStyle}>
        <AppSidebar isMobile={isMobile} open={drawer} onClose={() => setDrawer(false)} collapsed={!isMobile && recolhida} />
        <div style={containerStyle}>
          {isMobile ? <AppMobileBar onOpenMenu={() => setDrawer(true)} /> : <AppTopBar collapsed={recolhida} onToggle={alternarBarra} />}
          <SubscriptionBanner />
          <main style={contentStyle}>
            {isCadastrosPath(location.pathname) && <CadastrosTabs />}
            {children}
          </main>
        </div>
      </div>

      {showInvites && (
        <PendingInvitesModal invites={pendingInvites} onDismiss={() => setConvitesDispensados(true)} />
      )}

      {showOnboarding && (
        <ClubOnboardingModal onCreateClub={createClub} />
      )}

      <WorkspaceSwapNotice />
    </>
  );
}
