import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { supabase } from './lib/supabase';
import { ToastContainer } from './components/Toast';
import Layout from './components/Layout';
import RouteGuard from './components/RouteGuard';
import LoginPage from './modules/auth/LoginPage';
import SetupPage from './modules/auth/SetupPage';
import InactiveLandingPage from './modules/auth/InactiveLandingPage';
import DashboardPage from './modules/dashboard/DashboardPage';
import LeaguesPage from './modules/registration/LeaguesPage';
import PlayersPage from './modules/registration/PlayersPage';
import CoachesPage from './modules/registration/CoachesPage';
import UsersPage from './modules/admin/UsersPage';
import RolesPage from './modules/admin/RolesPage';
import PaymentConfigPage from './modules/admin/PaymentConfigPage';
import ConfrontationsPage from './modules/rosters/ConfrontationsPage';
import RosterPage from './modules/rosters/RosterPage';
import ResultsPage from './modules/results/ResultsPage';
import CanchasPage from './modules/admin/CanchasPage';
import PublicResultsPage from './modules/results/PublicResultsPage';

function AppRoutes() {
  const { user, initialized, isInactiveCoach } = useAuthStore();

  if (!initialized) {
    return (
      <div className="min-h-screen bg-navy-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-navy-300 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  // Inactive coach gate — redirect all protected routes to /acceso-bloqueado
  const coachBlocked = user && isInactiveCoach();

  return (
    <Routes>
      <Route path="/live" element={<PublicResultsPage />} />
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />

      {/* Inactive coach landing — only accessible to inactive coaches */}
      <Route
        path="/acceso-bloqueado"
        element={
          !user
            ? <Navigate to="/login" replace />
            : !isInactiveCoach()
              ? <Navigate to="/" replace />
              : <InactiveLandingPage />
        }
      />

      <Route path="/" element={
        coachBlocked
          ? <Navigate to="/acceso-bloqueado" replace />
          : <RouteGuard>
              <Layout>
                <DashboardPage />
              </Layout>
            </RouteGuard>
      } />
      <Route path="/ligas" element={
        coachBlocked
          ? <Navigate to="/acceso-bloqueado" replace />
          : <RouteGuard module="leagues" action="view">
              <Layout>
                <LeaguesPage />
              </Layout>
            </RouteGuard>
      } />
      <Route path="/jugadores" element={
        coachBlocked
          ? <Navigate to="/acceso-bloqueado" replace />
          : <RouteGuard module="players" action="view">
              <Layout>
                <PlayersPage />
              </Layout>
            </RouteGuard>
      } />
      <Route path="/entrenadores" element={
        coachBlocked
          ? <Navigate to="/acceso-bloqueado" replace />
          : <RouteGuard module="coaches" action="view">
              <Layout>
                <CoachesPage />
              </Layout>
            </RouteGuard>
      } />
      <Route path="/usuarios" element={
        coachBlocked
          ? <Navigate to="/acceso-bloqueado" replace />
          : <RouteGuard superAdminOnly>
              <Layout>
                <UsersPage />
              </Layout>
            </RouteGuard>
      } />
      <Route path="/roles" element={
        coachBlocked
          ? <Navigate to="/acceso-bloqueado" replace />
          : <RouteGuard superAdminOnly>
              <Layout>
                <RolesPage />
              </Layout>
            </RouteGuard>
      } />
      <Route path="/configuracion/pagos" element={
        coachBlocked
          ? <Navigate to="/acceso-bloqueado" replace />
          : <RouteGuard superAdminOnly>
              <Layout>
                <PaymentConfigPage />
              </Layout>
            </RouteGuard>
      } />
      <Route path="/nominas" element={
        coachBlocked
          ? <Navigate to="/acceso-bloqueado" replace />
          : <RouteGuard module="rosters" action="view">
              <Layout>
                <ConfrontationsPage />
              </Layout>
            </RouteGuard>
      } />
      <Route path="/nominas/:id" element={
        coachBlocked
          ? <Navigate to="/acceso-bloqueado" replace />
          : <RouteGuard module="rosters" action="view">
              <Layout>
                <RosterPage />
              </Layout>
            </RouteGuard>
      } />
      <Route path="/resultados" element={
        coachBlocked
          ? <Navigate to="/acceso-bloqueado" replace />
          : <RouteGuard module="results" action="view">
              <Layout>
                <ResultsPage />
              </Layout>
            </RouteGuard>
      } />
      <Route path="/canchas" element={
        coachBlocked
          ? <Navigate to="/acceso-bloqueado" replace />
          : <RouteGuard superAdminOnly>
              <Layout>
                <CanchasPage />
              </Layout>
            </RouteGuard>
      } />
      <Route path="*" element={
        coachBlocked ? <Navigate to="/acceso-bloqueado" replace /> : <Navigate to="/" replace />
      } />
    </Routes>
  );
}

export default function App() {
  const { loadProfile } = useAuthStore();

  useEffect(() => {
    loadProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        loadProfile();
      } else if (event === 'SIGNED_OUT') {
        useAuthStore.setState({ user: null, role: null, permissions: [], coachProfile: null, initialized: true });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <AppRoutes />
      <ToastContainer />
    </BrowserRouter>
  );
}
