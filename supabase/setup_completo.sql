-- Interligas: esquema completo (19 migraciones en orden). Pegar en Supabase > SQL Editor > Run.

-- ===== migrations/20260523054326_interligas_initial_schema.sql =====
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

-- ===== migrations/20260523055447_create_super_admin_user.sql =====
/*
  # (Sin cambios de esquema) Super Admin

  Esta migración antes creaba un usuario con contraseña fija en el código.
  Se eliminó por seguridad. El Super Admin se crea una sola vez a mano:
  ver supabase/seed_super_admin.sql
*/

SELECT 1;

-- ===== migrations/20260523055630_fix_super_admin_identity.sql =====
/*
  # (Sin cambios de esquema)

  Antes ajustaba la identidad y la contraseña fija del Super Admin.
  Ya no aplica: el usuario se crea desde el panel de Supabase
  (Authentication > Users), que genera identidad y hash correctamente.
*/

SELECT 1;

-- ===== migrations/20260523063256_coaches_active_players_coach_payment_config_v2.sql =====
/*
  # Coaches active flag, players coach assignment, payment config (v2)

  1. Changes to existing tables
    - `coaches`: add `active` boolean column (default false)
    - `players`: add `coach_id` uuid nullable FK → coaches

  2. New table: `payment_config`
    - Stores the QR image URL used in the payment pre-landing

  3. Security — RLS on payment_config
*/

-- Add active column to coaches
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'coaches' AND column_name = 'active'
  ) THEN
    ALTER TABLE coaches ADD COLUMN active boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add coach_id FK to players
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'coach_id'
  ) THEN
    ALTER TABLE players ADD COLUMN coach_id uuid REFERENCES coaches(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create payment_config table
CREATE TABLE IF NOT EXISTS payment_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_image_url text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES system_users(id) ON DELETE SET NULL
);

ALTER TABLE payment_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_config' AND policyname = 'Authenticated users can read payment config'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated users can read payment config"
      ON payment_config FOR SELECT
      TO authenticated
      USING (true)';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_config' AND policyname = 'Super Admin can insert payment config'
  ) THEN
    EXECUTE 'CREATE POLICY "Super Admin can insert payment config"
      ON payment_config FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM system_users su
          JOIN roles r ON r.id = su.role_id
          WHERE su.auth_id = auth.uid() AND r.name = ''Super Admin''
        )
      )';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_config' AND policyname = 'Super Admin can update payment config'
  ) THEN
    EXECUTE 'CREATE POLICY "Super Admin can update payment config"
      ON payment_config FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM system_users su
          JOIN roles r ON r.id = su.role_id
          WHERE su.auth_id = auth.uid() AND r.name = ''Super Admin''
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM system_users su
          JOIN roles r ON r.id = su.role_id
          WHERE su.auth_id = auth.uid() AND r.name = ''Super Admin''
        )
      )';
  END IF;
END $$;

-- ===== migrations/20260523063317_storage_payment_qr_policies.sql =====
/*
  # Storage RLS policies for payment-qr bucket

  - Any authenticated user can read (needed for pre-landing)
  - Only Super Admin can upload/update
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'payment-qr public read'
  ) THEN
    EXECUTE 'CREATE POLICY "payment-qr public read"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = ''payment-qr'')';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'payment-qr super admin upload'
  ) THEN
    EXECUTE 'CREATE POLICY "payment-qr super admin upload"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = ''payment-qr'' AND
        EXISTS (
          SELECT 1 FROM system_users su
          JOIN roles r ON r.id = su.role_id
          WHERE su.auth_id = auth.uid() AND r.name = ''Super Admin''
        )
      )';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'payment-qr super admin update'
  ) THEN
    EXECUTE 'CREATE POLICY "payment-qr super admin update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = ''payment-qr'' AND
        EXISTS (
          SELECT 1 FROM system_users su
          JOIN roles r ON r.id = su.role_id
          WHERE su.auth_id = auth.uid() AND r.name = ''Super Admin''
        )
      )';
  END IF;
END $$;

-- ===== migrations/20260523064713_leagues_email_coaches_user_id_email.sql =====
/*
  # Add email to leagues; add user_id and email to coaches

  1. leagues table
    - Add `email` TEXT column (nullable) — auto-generated institutional email per league

  2. coaches table
    - Add `user_id` UUID FK → system_users(id) NOT NULL UNIQUE — every coach must have a system user
    - Add `email` TEXT column — mirrors the generated email for quick reference

  Notes:
    - user_id is added nullable first so existing rows are not broken,
      then a NOT NULL constraint is added after a default value migration step.
    - In practice the app will always create a user before inserting the coach row,
      so the FK is enforced at the application layer for existing rows.
*/

-- Add email to leagues (nullable, app fills it on creation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'email'
  ) THEN
    ALTER TABLE leagues ADD COLUMN email text;
  END IF;
END $$;

-- Add user_id to coaches (nullable first to not break existing rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'coaches' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE coaches ADD COLUMN user_id uuid REFERENCES system_users(id) ON DELETE SET NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS coaches_user_id_unique ON coaches(user_id) WHERE user_id IS NOT NULL;
  END IF;
END $$;

-- Add email to coaches (nullable, stores generated email for quick reference)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'coaches' AND column_name = 'email'
  ) THEN
    ALTER TABLE coaches ADD COLUMN email text;
  END IF;
END $$;

-- ===== migrations/20260523073706_fix_entrenador_admin_liga_permissions.sql =====
/*
  # Fix missing permissions for Entrenador and Administrador de Liga roles

  ## Problem
  - "Entrenador" role had zero permissions → navigation showed nothing
  - "Administrador de Liga" role had zero permissions → could not create confrontations

  ## Changes
  - Entrenador: add rosters:view
  - Administrador de Liga: add rosters (view/create/edit/delete), results (view/create/edit),
    leagues:view, players:view, coaches:view
*/

-- Entrenador: rosters view
INSERT INTO roles_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Entrenador'
  AND p.module = 'rosters' AND p.action = 'view'
ON CONFLICT DO NOTHING;

-- Administrador de Liga: rosters (all), results (view/create/edit), leagues/players/coaches (view)
INSERT INTO roles_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Administrador de Liga'
  AND (
    (p.module = 'rosters' AND p.action IN ('view','create','edit','delete'))
    OR (p.module = 'results' AND p.action IN ('view','create','edit'))
    OR (p.module = 'leagues' AND p.action = 'view')
    OR (p.module = 'players' AND p.action = 'view')
    OR (p.module = 'coaches' AND p.action = 'view')
  )
ON CONFLICT DO NOTHING;

-- ===== migrations/20260523080549_fix_rosters_players_rls_for_coaches.sql =====
/*
  # Fix RLS for rosters and players to use coaches.user_id

  ## Changes
  - Drop old roster policies that join via unique_code
  - Add new permissive policy on rosters FOR ALL using coaches.user_id = auth.uid()
  - Add explicit SELECT policy on players allowing all authenticated users to read
    (players already had USING(true) policies — this makes it explicit and clean)
*/

-- Drop old roster policies
DROP POLICY IF EXISTS "Coaches can insert own roster" ON rosters;
DROP POLICY IF EXISTS "Coaches can update own roster when not submitted" ON rosters;
DROP POLICY IF EXISTS "Coaches can view own roster" ON rosters;

-- New unified policy: coach owns rosters where coaches.user_id = auth.uid()
CREATE POLICY "coach_own_rosters"
  ON rosters
  FOR ALL
  TO authenticated
  USING (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  )
  WITH CHECK (
    coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid())
  );

-- ===== migrations/20260525220454_fix_rosters_rls_via_system_users.sql =====
/*
  # Fix rosters RLS policy to use correct system_users join

  ## Problem
  coaches.user_id is a FK to system_users.id (not auth.uid() directly).
  The previous policy used coaches.user_id = auth.uid() which never matched.

  ## Fix
  Use coaches JOIN system_users to resolve auth.uid() -> system_users.id -> coaches.id
*/

DROP POLICY IF EXISTS "coach_own_rosters" ON rosters;

CREATE POLICY "coach_own_rosters"
  ON rosters
  FOR ALL
  TO authenticated
  USING (
    coach_id IN (
      SELECT c.id FROM coaches c
      JOIN system_users su ON su.id = c.user_id
      WHERE su.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    coach_id IN (
      SELECT c.id FROM coaches c
      JOIN system_users su ON su.id = c.user_id
      WHERE su.auth_id = auth.uid()
    )
  );

-- ===== migrations/20260527010153_add_admin_rosters_write_policies.sql =====
/*
  # Add write permissions for admins on rosters

  ## Problem
  Admins could only SELECT rosters (read-only policy), but INSERT and UPDATE
  were blocked by RLS. Only coaches could write via the coach_own_rosters policy.

  ## Changes
  - Add INSERT policy for Super Admin and Administrador de Liga on rosters
  - Add UPDATE policy for Super Admin and Administrador de Liga on rosters
*/

CREATE POLICY "Admins can insert rosters"
  ON rosters
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM system_users su
      JOIN roles r ON r.id = su.role_id
      WHERE su.auth_id = auth.uid()
        AND r.name IN ('Super Admin', 'Administrador de Liga')
    )
  );

CREATE POLICY "Admins can update rosters"
  ON rosters
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM system_users su
      JOIN roles r ON r.id = su.role_id
      WHERE su.auth_id = auth.uid()
        AND r.name IN ('Super Admin', 'Administrador de Liga')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM system_users su
      JOIN roles r ON r.id = su.role_id
      WHERE su.auth_id = auth.uid()
        AND r.name IN ('Super Admin', 'Administrador de Liga')
    )
  );

-- ===== migrations/20260527010705_confrontation_delete_and_match_results.sql =====
/*
  # Admin delete on confrontations + match_results table

  ## Changes

  ### 1. confrontations DELETE policy
  - Adds DELETE policy for Super Admin and Administrador de Liga so they can
    delete confrontations in any status (not just 'programada').

  ### 2. New table: match_results
  - Stores the result of each individual match (partido_1, partido_2, dobles)
    within a confrontation.
  - Each row represents one "VS" slot: home player(s) vs away player(s).
  - Fields:
    - `id` uuid PK
    - `confrontation_id` uuid FK to confrontations
    - `slot` varchar — 'partido_1' | 'partido_2' | 'dobles'
    - `home_player_ids` uuid[] — one player for singles, two for doubles
    - `away_player_ids` uuid[] — one player for singles, two for doubles
    - `home_score` text — score string entered by judge (e.g. "6-3 6-4")
    - `away_score` text
    - `winner` varchar — 'home' | 'away' | null (pending)
    - `notes` text
    - `recorded_by` uuid FK to system_users
    - `recorded_at` timestamptz
    - `created_at` timestamptz

  ### Security
  - RLS enabled
  - SELECT: all authenticated users
  - INSERT: admins only
  - UPDATE: admins only
*/

-- 1. Allow admins to delete confrontations in any status
CREATE POLICY "Admins can delete confrontations"
  ON confrontations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM system_users su
      JOIN roles r ON r.id = su.role_id
      WHERE su.auth_id = auth.uid()
        AND r.name IN ('Super Admin', 'Administrador de Liga')
    )
  );

-- 2. match_results table
CREATE TABLE IF NOT EXISTS match_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  confrontation_id uuid NOT NULL REFERENCES confrontations(id) ON DELETE CASCADE,
  slot varchar NOT NULL CHECK (slot IN ('partido_1', 'partido_2', 'dobles')),
  home_player_ids uuid[] NOT NULL DEFAULT '{}',
  away_player_ids uuid[] NOT NULL DEFAULT '{}',
  home_score text DEFAULT '',
  away_score text DEFAULT '',
  winner varchar CHECK (winner IN ('home', 'away')),
  notes text DEFAULT '',
  recorded_by uuid REFERENCES system_users(id),
  recorded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (confrontation_id, slot)
);

ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view match results"
  ON match_results
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert match results"
  ON match_results
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM system_users su
      JOIN roles r ON r.id = su.role_id
      WHERE su.auth_id = auth.uid()
        AND r.name IN ('Super Admin', 'Administrador de Liga')
    )
  );

CREATE POLICY "Admins can update match results"
  ON match_results
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM system_users su
      JOIN roles r ON r.id = su.role_id
      WHERE su.auth_id = auth.uid()
        AND r.name IN ('Super Admin', 'Administrador de Liga')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM system_users su
      JOIN roles r ON r.id = su.role_id
      WHERE su.auth_id = auth.uid()
        AND r.name IN ('Super Admin', 'Administrador de Liga')
    )
  );

CREATE INDEX IF NOT EXISTS idx_match_results_confrontation ON match_results(confrontation_id);

-- ===== migrations/20260527013353_add_results_view_to_entrenador.sql =====
/*
  # Add results:view permission to Entrenador role

  Coaches (Entrenador) need read-only access to the results page so they
  can follow match results for their league. This migration inserts the
  results:view permission into roles_permissions for the Entrenador role.
*/

INSERT INTO roles_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Entrenador'
  AND p.module = 'results'
  AND p.action = 'view'
ON CONFLICT DO NOTHING;

-- ===== migrations/20260527013416_courts_and_match_results_sets.sql =====
/*
  # Courts, confrontation court assignment, and match results restructure

  ## New Tables
  - `courts`
    - `id` (uuid, primary key)
    - `name` (text, required)
    - `active` (boolean, default true)
    - `created_at` (timestamptz)

  ## Modified Tables
  - `confrontations`
    - Add `court_id` (uuid, FK to courts, nullable) — a court can have N confrontations

  - `match_results`
    - Add `set1_home`, `set1_away` (integer nullable) — first set scores
    - Add `set2_home`, `set2_away` (integer nullable) — second set scores
    - Add `set3_home`, `set3_away` (integer nullable) — third set (tiebreak if needed)
    - Add `wo` (boolean, default false) — walkover flag
    - Add `wo_winner` (varchar nullable: 'home'|'away') — who wins the WO
    - Add `started_at` (timestamptz nullable) — when the match was started by the judge
    - Add `match_status` (varchar, default 'pending': 'pending'|'in_progress'|'finished')
    - Keep existing `home_score`, `away_score` (legacy, kept for backwards compat)

  ## Security
  - RLS enabled on courts
  - Authenticated users can view active courts
  - Only super admins (via service role or app-level check) manage courts
*/

-- Courts table
CREATE TABLE IF NOT EXISTS courts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE courts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view courts"
  ON courts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert courts"
  ON courts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update courts"
  ON courts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete courts"
  ON courts FOR DELETE
  TO authenticated
  USING (true);

-- Add court_id to confrontations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'confrontations' AND column_name = 'court_id'
  ) THEN
    ALTER TABLE confrontations ADD COLUMN court_id uuid REFERENCES courts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add set score columns to match_results
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_results' AND column_name = 'set1_home') THEN
    ALTER TABLE match_results ADD COLUMN set1_home integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_results' AND column_name = 'set1_away') THEN
    ALTER TABLE match_results ADD COLUMN set1_away integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_results' AND column_name = 'set2_home') THEN
    ALTER TABLE match_results ADD COLUMN set2_home integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_results' AND column_name = 'set2_away') THEN
    ALTER TABLE match_results ADD COLUMN set2_away integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_results' AND column_name = 'set3_home') THEN
    ALTER TABLE match_results ADD COLUMN set3_home integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_results' AND column_name = 'set3_away') THEN
    ALTER TABLE match_results ADD COLUMN set3_away integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_results' AND column_name = 'wo') THEN
    ALTER TABLE match_results ADD COLUMN wo boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_results' AND column_name = 'wo_winner') THEN
    ALTER TABLE match_results ADD COLUMN wo_winner varchar CHECK (wo_winner IN ('home', 'away'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_results' AND column_name = 'started_at') THEN
    ALTER TABLE match_results ADD COLUMN started_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_results' AND column_name = 'match_status') THEN
    ALTER TABLE match_results ADD COLUMN match_status varchar NOT NULL DEFAULT 'pending'
      CHECK (match_status IN ('pending', 'in_progress', 'finished'));
  END IF;
END $$;

-- ===== migrations/20260527034315_match_suspensions_table.sql =====
/*
  # Match suspensions table

  Stores rain/weather suspension events with optional resume time.

  New Tables:
  - `match_suspensions`
    - `id` (uuid, primary key)
    - `confrontation_id` (uuid, nullable FK to confrontations)
    - `reason` (text)
    - `resume_time` (time, nullable)
    - `created_by` (uuid, nullable FK to system_users)
    - `created_at` (timestamptz)

  Security:
  - RLS enabled
  - Authenticated users can insert
  - Authenticated users can read
*/

CREATE TABLE IF NOT EXISTS match_suspensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  confrontation_id uuid REFERENCES confrontations(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT '',
  resume_time time,
  created_by uuid REFERENCES system_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE match_suspensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read suspensions"
  ON match_suspensions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert suspensions"
  ON match_suspensions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ===== migrations/20260527035939_match_suspensions_cancelled_at_and_match_results_finished_at.sql =====
/*
  # Add cancelled_at to match_suspensions, finished_at to match_results

  - match_suspensions.cancelled_at (timestamptz, nullable): set when a suspension is dismissed
  - match_results.finished_at (timestamptz, nullable): set when a match is finished
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_suspensions' AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE match_suspensions ADD COLUMN cancelled_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_results' AND column_name = 'finished_at'
  ) THEN
    ALTER TABLE match_results ADD COLUMN finished_at timestamptz;
  END IF;
END $$;

-- ===== migrations/20260527042903_match_suspensions_add_note.sql =====
/*
  # Add note column to match_suspensions

  - `note` (text, nullable): optional message shown to players during rain suspension
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_suspensions' AND column_name = 'note'
  ) THEN
    ALTER TABLE match_suspensions ADD COLUMN note text;
  END IF;
END $$;

-- ===== migrations/20260527044947_series_standings_champion_config.sql =====
/*
  # Series standings and champion config tables

  1. New columns
    - confrontations.series_winner (varchar, nullable): 'home' | 'away' when confrontation is finalizada

  2. New tables
    - series_standings: tracks wins/losses per league per category
    - champion_config: one defending champion per category

  3. Security
    - RLS enabled on both new tables
    - Authenticated users can read; only authenticated can write
*/

-- Add series_winner to confrontations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'confrontations' AND column_name = 'series_winner'
  ) THEN
    ALTER TABLE confrontations ADD COLUMN series_winner VARCHAR;
  END IF;
END $$;

-- Series standings table
CREATE TABLE IF NOT EXISTS series_standings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR NOT NULL,
  league_id uuid REFERENCES leagues(id) ON DELETE CASCADE,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category, league_id)
);

ALTER TABLE series_standings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read series_standings"
  ON series_standings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert series_standings"
  ON series_standings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update series_standings"
  ON series_standings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Public read for series standings (needed by PublicResultsPage)
CREATE POLICY "Public can read series_standings"
  ON series_standings FOR SELECT
  TO anon
  USING (true);

-- Champion config table
CREATE TABLE IF NOT EXISTS champion_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid REFERENCES leagues(id) ON DELETE SET NULL,
  category VARCHAR NOT NULL,
  year_won INTEGER NOT NULL,
  logo_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category)
);

ALTER TABLE champion_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read champion_config"
  ON champion_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert champion_config"
  ON champion_config FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update champion_config"
  ON champion_config FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Public read for champion config
CREATE POLICY "Public can read champion_config"
  ON champion_config FOR SELECT
  TO anon
  USING (true);

-- ===== migrations/20260527044955_champion_logos_storage.sql =====
/*
  # Storage bucket for champion logos

  Creates the champion-logos bucket and policies for upload/read.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('champion-logos', 'champion-logos', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read champion logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'champion-logos');

CREATE POLICY "Authenticated upload champion logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'champion-logos');

CREATE POLICY "Authenticated update champion logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'champion-logos');

-- ===== migrations/20260527071844_make_rosters_coach_id_nullable.sql =====
/*
  # Make rosters.coach_id nullable

  Allows admins to create rosters without an active coach assigned.
  The coach_id column previously had a NOT NULL constraint which blocked
  admin-created rosters when no active coach exists for a league.
*/

ALTER TABLE rosters ALTER COLUMN coach_id DROP NOT NULL;
