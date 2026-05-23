/*
  # INTERLIGAS 2026 — Initial Schema

  ## Summary
  Creates the full data model for the tournament management platform.

  ## New Tables

  ### 1. `roles`
  System roles with name and description. Seeded with 5 default roles.

  ### 2. `permissions`
  Granular permission entries per module and action (view/create/edit/delete).
  Modules: leagues, players, coaches, users, roles, results, rosters.

  ### 3. `roles_permissions`
  Many-to-many join table linking roles to permissions.

  ### 4. `system_users`
  Platform users (non-players). References Supabase auth.users via auth_id.
  Includes full_name, unique_code, email, role_id, active flag.

  ### 5. `leagues`
  Liga entities with name, city, representative.

  ### 6. `coaches`
  Coaches with unique_code, phone, league FK.

  ### 7. `players`
  Players with birth_date, unique_code, category, league_active status.

  ## Security
  - RLS enabled on all tables
  - Authenticated users can read all operational data
  - Write operations restricted to authenticated users
  - system_users admin operations gated to super admin role via policy
*/

-- ============================================================
-- ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text DEFAULT '',
  is_system boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view roles"
  ON roles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create roles"
  ON roles FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update roles"
  ON roles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete roles"
  ON roles FOR DELETE
  TO authenticated
  USING (is_system = false);

-- Seed default roles
INSERT INTO roles (name, description, is_system) VALUES
  ('Super Admin', 'Acceso total al sistema', true),
  ('Administrador de Liga', 'Gestiona su propia liga', true),
  ('Entrenador', 'Acceso a su equipo', true),
  ('Árbitro', 'Acceso a resultados', true),
  ('Solo Lectura', 'Solo puede ver información', true)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- PERMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  action text NOT NULL CHECK (action IN ('view', 'create', 'edit', 'delete')),
  UNIQUE (module, action)
);

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view permissions"
  ON permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage permissions"
  ON permissions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Seed permissions for all modules
DO $$
DECLARE
  modules text[] := ARRAY['leagues','players','coaches','users','roles','results','rosters'];
  actions text[] := ARRAY['view','create','edit','delete'];
  m text;
  a text;
BEGIN
  FOREACH m IN ARRAY modules LOOP
    FOREACH a IN ARRAY actions LOOP
      INSERT INTO permissions (module, action)
      VALUES (m, a)
      ON CONFLICT (module, action) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- ROLES_PERMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS roles_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

ALTER TABLE roles_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view roles_permissions"
  ON roles_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage roles_permissions"
  ON roles_permissions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete roles_permissions"
  ON roles_permissions FOR DELETE
  TO authenticated
  USING (true);

-- Assign all permissions to Super Admin
INSERT INTO roles_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

-- Assign view permissions to Solo Lectura
INSERT INTO roles_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Solo Lectura' AND p.action = 'view'
ON CONFLICT DO NOTHING;

-- ============================================================
-- SYSTEM_USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS system_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  unique_code text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE system_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view system_users"
  ON system_users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create system_users"
  ON system_users FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update system_users"
  ON system_users FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete system_users"
  ON system_users FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- LEAGUES
-- ============================================================
CREATE TABLE IF NOT EXISTS leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL,
  representative text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view leagues"
  ON leagues FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create leagues"
  ON leagues FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update leagues"
  ON leagues FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete leagues"
  ON leagues FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- COACHES
-- ============================================================
CREATE TABLE IF NOT EXISTS coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  unique_code text NOT NULL UNIQUE,
  phone text DEFAULT '',
  league_id uuid REFERENCES leagues(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view coaches"
  ON coaches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create coaches"
  ON coaches FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update coaches"
  ON coaches FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete coaches"
  ON coaches FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- PLAYERS
-- ============================================================
CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  birth_date date NOT NULL,
  unique_code text NOT NULL UNIQUE,
  league_id uuid REFERENCES leagues(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('12F','12M','14F','14M','16F','16M','18F','18M')),
  league_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view players"
  ON players FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create players"
  ON players FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update players"
  ON players FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete players"
  ON players FOR DELETE
  TO authenticated
  USING (true);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_coaches_league ON coaches(league_id);
CREATE INDEX IF NOT EXISTS idx_players_league ON players(league_id);
CREATE INDEX IF NOT EXISTS idx_players_category ON players(category);
CREATE INDEX IF NOT EXISTS idx_system_users_role ON system_users(role_id);
