/*
  # Add write permissions for admins on rosters

  ## Problem
  Admins could only SELECT rosters (read-only policy), but INSERT and UPDATE
  were blocked by RLS. Only coaches could write via the coach_own_rosters policy.

  ## Changes
  - Add INSERT policy for Super Admin and Administrador de Liga on rosters
  - Add UPDATE policy for Super Admin and Administrador de Liga on rosters
*/

CREATE POLICY "Admins can insert rosters"
  ON rosters
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

CREATE POLICY "Admins can update rosters"
  ON rosters
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
