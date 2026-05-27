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
