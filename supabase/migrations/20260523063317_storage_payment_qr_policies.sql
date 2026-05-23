/*
  # Storage RLS policies for payment-qr bucket

  - Any authenticated user can read (needed for pre-landing)
  - Only Super Admin can upload/update
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'payment-qr public read'
  ) THEN
    EXECUTE 'CREATE POLICY "payment-qr public read"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = ''payment-qr'')';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'payment-qr super admin upload'
  ) THEN
    EXECUTE 'CREATE POLICY "payment-qr super admin upload"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = ''payment-qr'' AND
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
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'payment-qr super admin update'
  ) THEN
    EXECUTE 'CREATE POLICY "payment-qr super admin update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = ''payment-qr'' AND
        EXISTS (
          SELECT 1 FROM system_users su
          JOIN roles r ON r.id = su.role_id
          WHERE su.auth_id = auth.uid() AND r.name = ''Super Admin''
        )
      )';
  END IF;
END $$;
