export type PlayerCategory = '12F' | '12M' | '14F' | '14M' | '16F' | '16M' | '18F' | '18M';
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';
export type PermissionModule = 'leagues' | 'players' | 'coaches' | 'users' | 'roles' | 'results' | 'rosters';

export interface Role {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  created_at: string;
}

export interface Permission {
  id: string;
  module: PermissionModule;
  action: PermissionAction;
}

export interface RolePermission {
  role_id: string;
  permission_id: string;
}

export interface SystemUser {
  id: string;
  auth_id: string | null;
  full_name: string;
  unique_code: string;
  email: string;
  role_id: string | null;
  active: boolean;
  created_at: string;
  role?: Role;
}

export interface League {
  id: string;
  name: string;
  city: string;
  representative: string;
  email: string | null;
  created_at: string;
}

export interface Coach {
  id: string;
  full_name: string;
  unique_code: string;
  phone: string;
  league_id: string | null;
  active: boolean;
  user_id: string | null;
  email: string | null;
  created_at: string;
  league?: League;
}

export interface Player {
  id: string;
  full_name: string;
  birth_date: string;
  unique_code: string;
  league_id: string | null;
  category: PlayerCategory;
  league_active: boolean;
  coach_id: string | null;
  created_at: string;
  league?: League;
  coach?: Coach;
}

export interface PaymentConfig {
  id: string;
  qr_image_url: string;
  updated_at: string;
  updated_by: string | null;
}

export interface Database {
  public: {
    Tables: {
      roles: { Row: Role; Insert: Omit<Role, 'id' | 'created_at'>; Update: Partial<Omit<Role, 'id'>> };
      permissions: { Row: Permission; Insert: Omit<Permission, 'id'>; Update: Partial<Permission> };
      roles_permissions: { Row: RolePermission; Insert: RolePermission; Update: RolePermission };
      system_users: { Row: SystemUser; Insert: Omit<SystemUser, 'id' | 'created_at' | 'role'>; Update: Partial<Omit<SystemUser, 'id' | 'role'>> };
      leagues: { Row: League; Insert: Omit<League, 'id' | 'created_at'>; Update: Partial<Omit<League, 'id'>> };
      coaches: { Row: Coach; Insert: Omit<Coach, 'id' | 'created_at' | 'league'>; Update: Partial<Omit<Coach, 'id' | 'league'>> };
      players: { Row: Player; Insert: Omit<Player, 'id' | 'created_at' | 'league' | 'coach'>; Update: Partial<Omit<Player, 'id' | 'league' | 'coach'>> };
      payment_config: { Row: PaymentConfig; Insert: Omit<PaymentConfig, 'id'>; Update: Partial<Omit<PaymentConfig, 'id'>> };
    };
  };
}
