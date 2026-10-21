import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ClubProvider } from './contexts/ClubContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { EntrarContaPage } from './pages/EntrarContaPage';
import { RegisterPage } from './pages/RegisterPage';
import { PricingPage } from './pages/PricingPage';
import { BillingPage } from './pages/BillingPage';
import { BillingCallbackPage } from './pages/BillingCallbackPage';
import { PWAUpdatePrompt } from './components/common/PWAUpdatePrompt';
import { TrainingPage } from './pages/TrainingPage';
import { TrainingStatsPage } from './pages/TrainingStatsPage';
import { ActivitiesConfigPage } from './pages/ActivitiesConfigPage';
import { SubcontentsConfigPage } from './pages/SubcontentsConfigPage';
import { ContentsConfigPage } from './pages/ContentsConfigPage';
import { CategoriesConfigPage } from './pages/CategoriesConfigPage';
import { CompetitionsConfigPage } from './pages/CompetitionsConfigPage';
import { ClubsConfigPage } from './pages/ClubsConfigPage';
import { TeamConfigPage } from './pages/TeamConfigPage';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
import { SelectWorkspacePage } from './pages/SelectWorkspacePage';
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { SetPasswordPage } from './pages/SetPasswordPage';
import { HomePage } from './pages/HomePage';
import { CadastrosIndex } from './components/layout/CadastrosTabs';
import { Layout } from './components/layout/Layout';
import PlantelPage from './modules/training-management/pages/PlantelPage';
import { TacticalBoardPage } from './modules/tactical-board';
import { PlanGate } from './components/common/PlanGate';

// Já logado chegando em /login?redirect=/billing (link do site): vai direto ao destino.
function RedirectLogado() {
  const r = new URLSearchParams((window.location.hash.split('?')[1]) || '').get('redirect') || '';
  return <Navigate to={r.startsWith('/') && !r.startsWith('//') ? r : '/home'} replace />;
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) return <div>Carregando...</div>;
  if (!isAuthenticated) return <Navigate to="/login" />;
  // Contas de login social (Apple/Google) NÃO são obrigadas a criar senha —
  // exigência da Apple (Guideline 4). /set-password segue disponível opcionalmente.
  return children;
}

// Identifica se estamos no subdomínio admin (admin.* ou staging.admin.*)
function isAdminHost() {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return /^(staging\.)?admin\./.test(h);
}

function AdminRoutes() {
  return (
    <Routes>
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminDashboardPage />} />
      {/* Qualquer outra rota no host admin redireciona pro login admin */}
      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  );
}

// Toaster global — estilo integrado ao tema (dark/light). Também expõe
// variáveis CSS pro notify.confirm() customizado ler.
function ThemedToaster() {
  const { isDark, colors } = useTheme();
  const bg = isDark ? colors.surface : '#ffffff';
  const fg = colors.text;
  const border = colors.border;
  return (
    <>
      <style>{`:root { --toast-bg: ${bg}; --toast-color: ${fg}; --toast-border: ${border}; }`}</style>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            background: bg,
            color: fg,
            border: `1px solid ${border}`,
            fontSize: 14,
            padding: '10px 14px',
            borderRadius: 8,
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
          },
          success: {
            duration: 3500,
            iconTheme: { primary: colors.success, secondary: bg },
          },
          error: {
            duration: 6000,
            iconTheme: { primary: colors.error, secondary: bg },
          },
        }}
      />
    </>
  );
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <RedirectLogado /> : <LoginPage />}
      />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/home" /> : <RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* Entrada vinda de outro produto Faggin (seletor, login único) — pública, mesmo já logado */}
      <Route path="/entrar-conta" element={<EntrarContaPage />} />
      <Route path="/set-password" element={isAuthenticated ? <SetPasswordPage /> : <Navigate to="/login" />} />
      {/* Termos e Privacidade ficam na LP (https://tactiplan.faggin.com.br/{termos,privacidade}.html) */}
      <Route path="/pricing" element={<PricingPage />} />
      <Route
        path="/select-workspace"
        element={
          <ProtectedRoute>
            <SelectWorkspacePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing"
        element={
          <ProtectedRoute>
            <Layout>
              <BillingPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing/callback"
        element={
          <ProtectedRoute>
            <Layout>
              <BillingCallbackPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/training"
        element={
          <ProtectedRoute>
            <Layout>
              <TrainingPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/training-stats"
        element={
          <ProtectedRoute>
            <Layout>
              <TrainingStatsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/plantel"
        element={
          <ProtectedRoute>
            <Layout>
              <PlantelPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="/settings" element={<Navigate to="/training" replace />} />
      <Route
        path="/settings/cadastros"
        element={
          <ProtectedRoute>
            <CadastrosIndex />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/clubs"
        element={
          <ProtectedRoute>
            <Layout>
              <ClubsConfigPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/activities"
        element={
          <ProtectedRoute>
            <Layout>
              <ActivitiesConfigPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/subconteudos"
        element={
          <ProtectedRoute>
            <Layout>
              <SubcontentsConfigPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/contents"
        element={
          <ProtectedRoute>
            <Layout>
              <ContentsConfigPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/categories"
        element={
          <ProtectedRoute>
            <Layout>
              <CategoriesConfigPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/competitions"
        element={
          <ProtectedRoute>
            <Layout>
              <CompetitionsConfigPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/team"
        element={
          <ProtectedRoute>
            <Layout>
              <TeamConfigPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />
      {/* Quadro Tático: experiência imersiva em tela cheia — SEM o Layout
          (header/nav) pra o campo ocupar a tela inteira. */}
      <Route
        path="/tactical-board"
        element={
          <ProtectedRoute>
            {/* Quadro Tático: planos pagos; só leitura vê as jogadas salvas sem editar */}
            <PlanGate feature="quadro_tatico">
              <TacticalBoardPage />
            </PlanGate>
          </ProtectedRoute>
        }
      />
      {/* /admin/* fora do host admin → manda pra raiz da app */}
      <Route path="/admin/*" element={<Navigate to="/home" replace />} />
      <Route path="/" element={<Navigate to="/home" />} />
      {/* Catch-all: URL desconhecida cai na home em vez de tela branca */}
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

function App() {
  const adminHost = isAdminHost();
  return (
    <HashRouter>
      <ThemeProvider>
        <ThemedToaster />
        {adminHost ? (
          <AdminRoutes />
        ) : (
          <AuthProvider>
            <WorkspaceProvider>
              <ClubProvider>
                <AppRoutes />
                <PWAUpdatePrompt />
              </ClubProvider>
            </WorkspaceProvider>
          </AuthProvider>
        )}
      </ThemeProvider>
    </HashRouter>
  );
}

export default App;
