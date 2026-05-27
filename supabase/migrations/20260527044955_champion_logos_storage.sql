/*
  # Storage bucket for champion logos

  Creates the champion-logos bucket and policies for upload/read.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('champion-logos', 'champion-logos', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read champion logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'champion-logos');

CREATE POLICY "Authenticated upload champion logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'champion-logos');

CREATE POLICY "Authenticated update champion logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'champion-logos');
