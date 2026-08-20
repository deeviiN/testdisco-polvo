-- 1) Restrict admin-signatures SELECT to admins only
DROP POLICY IF EXISTS "admin signatures read" ON storage.objects;
CREATE POLICY "admin signatures read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'admin-signatures'
  AND private_api.has_role(auth.uid(), 'admin'::app_role)
);

-- 2) Allow public SELECT on school-logos (bucket is public)
CREATE POLICY "school-logos public read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'school-logos');