import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { supabase } from './lib/supabase';
import { ToastContainer } from './components/Toast';
import Layout from './components/Layout';
import RouteGuard from './components/RouteGuard';
import LoginPage from './modules/auth/LoginPage';
import SetupPage from './modules/auth/SetupPage';
import DashboardPage from './modules/dashboard/DashboardPage';
import LeaguesPage from './modules/registration/LeaguesPage';
import PlayersPage from './modules/registration/PlayersPage';
import CoachesPage from './modules/registration/CoachesPage';
import UsersPage from './modules/admin/UsersPage';
import RolesPage from './modules/admin/RolesPage';

function AppRoutes() {
  const { user, initialized } = useAuthStore();

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

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/" element={
        <RouteGuard>
          <Layout>
            <DashboardPage />
          </Layout>
        </RouteGuard>
      } />
      <Route path="/ligas" element={
        <RouteGuard module="leagues" action="view">
          <Layout>
            <LeaguesPage />
          </Layout>
        </RouteGuard>
      } />
      <Route path="/jugadores" element={
        <RouteGuard module="players" action="view">
          <Layout>
            <PlayersPage />
          </Layout>
        </RouteGuard>
      } />
      <Route path="/entrenadores" element={
        <RouteGuard module="coaches" action="view">
          <Layout>
            <CoachesPage />
          </Layout>
        </RouteGuard>
      } />
      <Route path="/usuarios" element={
        <RouteGuard superAdminOnly>
          <Layout>
            <UsersPage />
          </Layout>
        </RouteGuard>
      } />
      <Route path="/roles" element={
        <RouteGuard superAdminOnly>
          <Layout>
            <RolesPage />
          </Layout>
        </RouteGuard>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
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
        useAuthStore.setState({ user: null, role: null, permissions: [], initialized: true });
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
