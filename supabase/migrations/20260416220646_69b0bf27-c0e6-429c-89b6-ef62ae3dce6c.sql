
-- Remove broad SELECT policy that allowed enumeration of all objects in the school-logos bucket.
-- Public download via public URL still works (bucket remains public=true; CDN serves objects by path).
DROP POLICY IF EXISTS "Anyone can view school logos" ON storage.objects;
