-- Make signatures bucket private
UPDATE storage.buckets SET public = false WHERE id = 'signatures';

-- Drop the existing public SELECT policy
DROP POLICY IF EXISTS "Signatures are publicly readable" ON storage.objects;

-- Add authenticated owner-only SELECT policy
CREATE POLICY "Owners can view their own signatures"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'signatures' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Ensure upload policy exists for owners
DROP POLICY IF EXISTS "Users can upload their own signature" ON storage.objects;
CREATE POLICY "Users can upload their own signature"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'signatures' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Ensure update policy exists for owners
DROP POLICY IF EXISTS "Users can update their own signature" ON storage.objects;
CREATE POLICY "Users can update their own signature"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'signatures' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Ensure delete policy exists for owners
DROP POLICY IF EXISTS "Users can delete their own signature" ON storage.objects;
CREATE POLICY "Users can delete their own signature"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'signatures' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );