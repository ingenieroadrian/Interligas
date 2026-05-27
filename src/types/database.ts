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

export type ConfrontationStatus = 'programada' | 'alineacion' | 'cerrada' | 'en_curso' | 'finalizada';
export type RosterSlot = 'partido_1' | 'partido_2' | 'dobles';

export interface Coach {
  id: string;
  full_name: string;
  unique_code: string;
  phone: string;
  league_id: string | null;
  active: boolean;
  user_id: string | null;
  email: string | null;
  category: PlayerCategory | null;
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
  ranking: number | null;
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

export interface Confrontation {
  id: string;
  category: PlayerCategory;
  home_league_id: string;
  away_league_id: string;
  match_date: string;
  match_time: string;
  deadline: string;
  status: ConfrontationStatus;
  created_by: string | null;
  created_at: string;
  home_league?: League;
  away_league?: League;
}

export interface Roster {
  id: string;
  confrontation_id: string;
  coach_id: string;
  league_id: string;
  slot_1: string | null;
  slot_2: string | null;
  slot_doubles_a: string | null;
  slot_doubles_b: string | null;
  submitted_at: string | null;
  is_submitted: boolean;
  coach?: Coach;
  league?: League;
  player_slot_1?: Player;
  player_slot_2?: Player;
  player_doubles_a?: Player;
  player_doubles_b?: Player;
}

export interface MatchAssignment {
  id: string;
  roster_id: string;
  slot: RosterSlot;
  court: string | null;
  scheduled_time: string | null;
  assigned_by: string | null;
}

export type MatchWinner = 'home' | 'away';

export interface MatchResult {
  id: string;
  confrontation_id: string;
  slot: RosterSlot;
  home_player_ids: string[];
  away_player_ids: string[];
  home_score: string;
  away_score: string;
  winner: MatchWinner | null;
  notes: string;
  recorded_by: string | null;
  recorded_at: string | null;
  created_at: string;
}

export interface StatusLog {
  id: string;
  confrontation_id: string;
  old_status: ConfrontationStatus;
  new_status: ConfrontationStatus;
  changed_at: string;
  changed_by: string;
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
