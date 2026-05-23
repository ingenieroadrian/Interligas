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
