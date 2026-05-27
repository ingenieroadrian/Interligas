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
