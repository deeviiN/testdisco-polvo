-- Add signer role and status to signed_contracts
ALTER TABLE public.signed_contracts
  ADD COLUMN IF NOT EXISTS signer_role text NOT NULL DEFAULT 'gestor',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'awaiting_admin';

-- Validate values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signed_contracts_signer_role_check'
  ) THEN
    ALTER TABLE public.signed_contracts
      ADD CONSTRAINT signed_contracts_signer_role_check
      CHECK (signer_role IN ('gestor','admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signed_contracts_status_check'
  ) THEN
    ALTER TABLE public.signed_contracts
      ADD CONSTRAINT signed_contracts_status_check
      CHECK (status IN ('awaiting_admin','awaiting_gestor','completed'));
  END IF;
END $$;

-- Mark legacy rows as completed (single-signature flow)
UPDATE public.signed_contracts
SET status = 'completed'
WHERE status = 'awaiting_admin' AND signer_role = 'gestor';

-- Allow admins to insert contracts for any school
DROP POLICY IF EXISTS "Admins can insert signed contracts" ON public.signed_contracts;
CREATE POLICY "Admins can insert signed contracts"
ON public.signed_contracts
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin') AND uploaded_by = auth.uid());

-- Storage: allow admins to upload to signed-contracts bucket
DROP POLICY IF EXISTS "Admins can upload to signed-contracts" ON storage.objects;
CREATE POLICY "Admins can upload to signed-contracts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'signed-contracts' AND has_role(auth.uid(), 'admin'));

-- Storage: allow admins to read any signed contract
DROP POLICY IF EXISTS "Admins can read signed-contracts" ON storage.objects;
CREATE POLICY "Admins can read signed-contracts"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'signed-contracts' AND has_role(auth.uid(), 'admin'));

-- Storage: allow admins to delete any signed contract
DROP POLICY IF EXISTS "Admins can delete signed-contracts" ON storage.objects;
CREATE POLICY "Admins can delete signed-contracts"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'signed-contracts' AND has_role(auth.uid(), 'admin'));