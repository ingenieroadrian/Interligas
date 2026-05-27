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
