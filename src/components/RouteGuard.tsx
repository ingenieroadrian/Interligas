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
  const { user, isSuperAdmin, hasPermission } = useAuthStore();

  if (!user) return <Navigate to="/login" replace />;

  if (superAdminOnly && !isSuperAdmin()) {
    return <Navigate to="/" replace />;
  }

  if (module && !hasPermission(module, action)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
