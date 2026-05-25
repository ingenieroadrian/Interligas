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
