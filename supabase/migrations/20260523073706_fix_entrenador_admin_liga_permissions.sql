/*
  # Fix missing permissions for Entrenador and Administrador de Liga roles

  ## Problem
  - "Entrenador" role had zero permissions → navigation showed nothing
  - "Administrador de Liga" role had zero permissions → could not create confrontations

  ## Changes
  - Entrenador: add rosters:view
  - Administrador de Liga: add rosters (view/create/edit/delete), results (view/create/edit),
    leagues:view, players:view, coaches:view
*/

-- Entrenador: rosters view
INSERT INTO roles_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Entrenador'
  AND p.module = 'rosters' AND p.action = 'view'
ON CONFLICT DO NOTHING;

-- Administrador de Liga: rosters (all), results (view/create/edit), leagues/players/coaches (view)
INSERT INTO roles_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Administrador de Liga'
  AND (
    (p.module = 'rosters' AND p.action IN ('view','create','edit','delete'))
    OR (p.module = 'results' AND p.action IN ('view','create','edit'))
    OR (p.module = 'leagues' AND p.action = 'view')
    OR (p.module = 'players' AND p.action = 'view')
    OR (p.module = 'coaches' AND p.action = 'view')
  )
ON CONFLICT DO NOTHING;
