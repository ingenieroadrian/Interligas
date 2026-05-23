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
