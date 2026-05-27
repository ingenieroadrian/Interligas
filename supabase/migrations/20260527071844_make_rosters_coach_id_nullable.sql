/*
  # Make rosters.coach_id nullable

  Allows admins to create rosters without an active coach assigned.
  The coach_id column previously had a NOT NULL constraint which blocked
  admin-created rosters when no active coach exists for a league.
*/

ALTER TABLE rosters ALTER COLUMN coach_id DROP NOT NULL;
