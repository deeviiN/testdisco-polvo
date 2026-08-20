-- 1) Bucket privado para contratos assinados
INSERT INTO storage.buckets (id, name, public)
VALUES ('signed-contracts', 'signed-contracts', false)
ON CONFLICT (id) DO NOTHING;

-- 2) Tabela de metadados
CREATE TABLE IF NOT EXISTS public.signed_contracts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  gestor_cpf text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signed_contracts_school ON public.signed_contracts(school_id);
CREATE INDEX IF NOT EXISTS idx_signed_contracts_user ON public.signed_contracts(uploaded_by);

ALTER TABLE public.signed_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users from same school can view signed contracts"
ON public.signed_contracts FOR SELECT TO authenticated
USING (school_id = public.get_user_school_id(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can upload signed contracts for their school"
ON public.signed_contracts FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND school_id = public.get_user_school_id(auth.uid())
);

CREATE POLICY "Block client updates on signed contracts"
ON public.signed_contracts FOR UPDATE TO authenticated
USING (false) WITH CHECK (false);

CREATE POLICY "Admins can delete signed contracts"
ON public.signed_contracts FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3) Políticas no bucket: arquivos em pasta com school_id como primeiro segmento
CREATE POLICY "Users can view signed contracts from their school"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'signed-contracts'
  AND (
    (storage.foldername(name))[1] = public.get_user_school_id(auth.uid())::text
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Users can upload signed contracts for their school"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'signed-contracts'
  AND (storage.foldername(name))[1] = public.get_user_school_id(auth.uid())::text
);

CREATE POLICY "Admins can delete signed contracts in storage"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'signed-contracts'
  AND public.has_role(auth.uid(), 'admin')
);