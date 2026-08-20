
-- Create storage bucket for school logos
INSERT INTO storage.buckets (id, name, public) VALUES ('school-logos', 'school-logos', true);

-- Add logo_url column to schools
ALTER TABLE public.schools ADD COLUMN logo_url text DEFAULT NULL;

-- Allow authenticated users to upload to school-logos bucket
CREATE POLICY "Admins can upload school logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'school-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Allow public to view school logos
CREATE POLICY "Anyone can view school logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'school-logos');

-- Allow admins to delete school logos
CREATE POLICY "Admins can delete school logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'school-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Allow admins to update school logos
CREATE POLICY "Admins can update school logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'school-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role)
);
