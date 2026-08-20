UPDATE public.signed_contracts
SET status = 'awaiting_admin'
WHERE signer_role = 'gestor'
  AND status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM public.signed_contracts sc2
    WHERE sc2.school_id = signed_contracts.school_id
      AND sc2.signer_role = 'admin'
  );