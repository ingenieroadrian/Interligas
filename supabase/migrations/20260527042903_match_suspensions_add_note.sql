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
