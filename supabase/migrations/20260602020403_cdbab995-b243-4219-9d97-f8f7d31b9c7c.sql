
-- 1. Fix direct_messages cross-school tautology
DROP POLICY IF EXISTS "Approved users send own DMs" ON public.direct_messages;
CREATE POLICY "Approved users send own DMs" ON public.direct_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND school_id = private_api.get_user_school_id(auth.uid())
  AND private_api.is_user_approved(auth.uid())
  AND recipient_id <> auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = direct_messages.recipient_id
      AND p.school_id = direct_messages.school_id
      AND p.is_approved = true
  )
);

-- 2. sector_labels: include chef_projeto_vida
DROP POLICY IF EXISTS "Gestors can insert sector labels" ON public.sector_labels;
DROP POLICY IF EXISTS "Gestors can update sector labels" ON public.sector_labels;
DROP POLICY IF EXISTS "Gestors can delete sector labels" ON public.sector_labels;

CREATE POLICY "Managers can insert sector labels" ON public.sector_labels
FOR INSERT TO authenticated
WITH CHECK (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('gestor_pedagogico','chef_projeto_vida')
  )
);

CREATE POLICY "Managers can update sector labels" ON public.sector_labels
FOR UPDATE TO authenticated
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('gestor_pedagogico','chef_projeto_vida')
  )
)
WITH CHECK (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('gestor_pedagogico','chef_projeto_vida')
  )
);

CREATE POLICY "Managers can delete sector labels" ON public.sector_labels
FOR DELETE TO authenticated
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('gestor_pedagogico','chef_projeto_vida')
  )
);

-- 3. signed_contracts: require uploader is_approved
DROP POLICY IF EXISTS "Users can upload signed contracts for their school" ON public.signed_contracts;
CREATE POLICY "Users can upload signed contracts for their school" ON public.signed_contracts
FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND school_id = private_api.get_user_school_id(auth.uid())
  AND private_api.is_user_approved(auth.uid())
);
