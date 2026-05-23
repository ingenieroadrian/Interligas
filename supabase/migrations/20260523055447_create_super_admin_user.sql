/*
  # Create Super Admin user

  Creates the initial Super Admin account in auth.users and links it
  to a system_users record with the Super Admin role.

  Credentials:
    Email:    admin@interligas.com
    Password: Interligas2026!
*/

-- Create the auth user with confirmed email
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  aud,
  role
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'admin@interligas.com',
  crypt('Interligas2026!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now(),
  'authenticated',
  'authenticated'
);

-- Link to system_users with Super Admin role
INSERT INTO system_users (auth_id, full_name, unique_code, email, role_id, active)
SELECT
  u.id,
  'Administrador Principal',
  'SA-001',
  'admin@interligas.com',
  r.id,
  true
FROM auth.users u, roles r
WHERE u.email = 'admin@interligas.com'
  AND r.name = 'Super Admin';
