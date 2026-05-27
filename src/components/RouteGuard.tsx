import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import type { PermissionModule, PermissionAction } from '../types/database';

interface RouteGuardProps {
  children: React.ReactNode;
  module?: PermissionModule;
  action?: PermissionAction;
  superAdminOnly?: boolean;
}

export default function RouteGuard({ children, module, action = 'view', superAdminOnly }: RouteGuardProps) {
  const { user, isSuperAdmin, isMesaDeControl, hasPermission } = useAuthStore();

  if (!user) return <Navigate to="/login" replace />;

  if (superAdminOnly && !isSuperAdmin()) {
    return <Navigate to="/" replace />;
  }

  // Mesa de Control bypasses module permission checks for results and rosters (view)
  if (module && !hasPermission(module, action)) {
    const mesaAllowed = isMesaDeControl() && (module === 'results' || module === 'rosters') && action === 'view';
    if (!mesaAllowed) return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
