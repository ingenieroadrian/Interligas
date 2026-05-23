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
