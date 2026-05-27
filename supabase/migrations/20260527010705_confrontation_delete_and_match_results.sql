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
