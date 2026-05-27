import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { SystemUser, Role, Permission, PermissionModule, PermissionAction, Coach } from '../types/database';

interface AuthState {
  user: SystemUser | null;
  role: Role | null;
  permissions: Permission[];
  coachProfile: Coach | null;
  hasInactivePlayers: boolean;
  loading: boolean;
  initialized: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  loadProfile: () => Promise<void>;
  hasPermission: (module: PermissionModule, action: PermissionAction) => boolean;
  isSuperAdmin: () => boolean;
  isInactiveCoach: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  role: null,
  permissions: [],
  coachProfile: null,
  hasInactivePlayers: false,
  loading: false,
  initialized: false,

  signIn: async (email, password) => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ loading: false });
    if (error) return error.message;
    await get().loadProfile();
    return null;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, role: null, permissions: [], coachProfile: null, hasInactivePlayers: false, initialized: true });
  },

  loadProfile: async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      set({ user: null, role: null, permissions: [], coachProfile: null, initialized: true });
      return;
    }

    const { data: sysUser } = await supabase
      .from('system_users')
      .select('*, role:roles(*)')
      .eq('auth_id', authUser.id)
      .maybeSingle();

    if (!sysUser) {
      set({ user: null, role: null, permissions: [], coachProfile: null, initialized: true });
      return;
    }

    let permissions: Permission[] = [];
    if (sysUser.role_id) {
      const { data: rp } = await supabase
        .from('roles_permissions')
        .select('permission_id, permissions(*)')
        .eq('role_id', sysUser.role_id);

      if (rp) {
        permissions = rp
          .map((r: any) => r.permissions)
          .filter(Boolean) as Permission[];
      }
    }

    // If user's role is "Entrenador", look up the coach record by unique_code
    let coachProfile: Coach | null = null;
    let hasInactivePlayers = false;
    const roleName = (sysUser.role as Role)?.name;
    if (roleName === 'Entrenador') {
      const { data: coach } = await supabase
        .from('coaches')
        .select('*, league:leagues(id,name,city,representative,created_at)')
        .eq('unique_code', sysUser.unique_code)
        .maybeSingle();
      coachProfile = (coach as Coach) || null;

      if (coachProfile?.id) {
        const { count } = await supabase
          .from('players')
          .select('id', { count: 'exact', head: true })
          .eq('coach_id', coachProfile.id)
          .eq('league_active', false);
        hasInactivePlayers = (count ?? 0) > 0;
      }
    }

    set({
      user: sysUser as SystemUser,
      role: sysUser.role as Role || null,
      permissions,
      coachProfile,
      hasInactivePlayers,
      initialized: true,
    });
  },

  hasPermission: (module, action) => {
    const { permissions, role } = get();
    if (role?.name === 'Super Admin') return true;
    return permissions.some(p => p.module === module && p.action === action);
  },

  isSuperAdmin: () => {
    return get().role?.name === 'Super Admin';
  },

  isInactiveCoach: () => {
    const { role, coachProfile, hasInactivePlayers } = get();
    if (role?.name !== 'Entrenador') return false;
    return coachProfile === null || !coachProfile.active || hasInactivePlayers;
  },
}));
