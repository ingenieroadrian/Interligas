/*
  # Fix Super Admin auth identity

  Supabase Auth requires a record in auth.identities for email/password login.
  This migration adds the missing identity and resets the password using
  a compatible hash method.
*/

-- Insert the missing identity record
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  provider,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  u.email,
  'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  now(),
  now(),
  now()
FROM auth.users u
WHERE u.email = 'admin@interligas.com'
ON CONFLICT DO NOTHING;

-- Reset password with correct bcrypt cost (10) that Supabase expects
UPDATE auth.users
SET
  encrypted_password = crypt('Interligas2026!', gen_salt('bf', 10)),
  updated_at = now()
WHERE email = 'admin@interligas.com';
