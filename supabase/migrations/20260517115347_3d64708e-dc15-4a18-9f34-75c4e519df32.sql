
-- 1) Colunas no profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS id_doc_front_path text,
  ADD COLUMN IF NOT EXISTS id_doc_back_path text,
  ADD COLUMN IF NOT EXISTS id_doc_uploaded_at timestamptz;

-- 2) Bucket privado
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-id-docs', 'community-id-docs', false)
ON CONFLICT (id) DO NOTHING;

-- 3) Policies de storage
-- Owner: full CRUD em sua pasta {user_id}/*
DROP POLICY IF EXISTS "community-id owner select" ON storage.objects;
CREATE POLICY "community-id owner select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'community-id-docs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "community-id owner insert" ON storage.objects;
CREATE POLICY "community-id owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'community-id-docs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "community-id owner update" ON storage.objects;
CREATE POLICY "community-id owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'community-id-docs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "community-id owner delete" ON storage.objects;
CREATE POLICY "community-id owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'community-id-docs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Gestor/chef da mesma escola podem ver as fotos
DROP POLICY IF EXISTS "community-id school staff select" ON storage.objects;
CREATE POLICY "community-id school staff select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'community-id-docs'
  AND EXISTS (
    SELECT 1
    FROM public.profiles target
    JOIN public.profiles staff ON staff.school_id = target.school_id
    WHERE target.user_id::text = (storage.foldername(name))[1]
      AND staff.user_id = auth.uid()
      AND staff.is_approved = true
      AND staff.role IN ('gestor_pedagogico','coord_pedagogico','chef_projeto_vida')
  )
);

-- Admin global pode ver tudo
DROP POLICY IF EXISTS "community-id admin select" ON storage.objects;
CREATE POLICY "community-id admin select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'community-id-docs'
  AND public.has_role(auth.uid(), 'admin')
);
