/*
  # Add results:view permission to Entrenador role

  Coaches (Entrenador) need read-only access to the results page so they
  can follow match results for their league. This migration inserts the
  results:view permission into roles_permissions for the Entrenador role.
*/

INSERT INTO roles_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Entrenador'
  AND p.module = 'results'
  AND p.action = 'view'
ON CONFLICT DO NOTHING;
