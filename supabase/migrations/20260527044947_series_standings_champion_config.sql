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
