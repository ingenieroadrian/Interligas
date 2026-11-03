-- Ejecutar UNA vez, después de crear el usuario en Supabase:
--   Authentication > Users > Add user (email + contraseña propia, "Auto Confirm User").
-- Cambia el correo abajo por el que usaste. No guardes contraseñas en este archivo.

INSERT INTO system_users (auth_id, full_name, unique_code, email, role_id, active)
SELECT u.id, 'Administrador Principal', 'SA-001', u.email, r.id, true
FROM auth.users u, roles r
WHERE u.email = 'admin@interligas.com'   -- <- tu correo
  AND r.name = 'Super Admin'
ON CONFLICT DO NOTHING;
