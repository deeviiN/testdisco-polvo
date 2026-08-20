
-- ============================================================
-- Security hardening migration
-- ============================================================

-- 1) is_chef_of_school: require approved chef
CREATE OR REPLACE FUNCTION public.is_chef_of_school(_user_id uuid, _school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND school_id = _school_id
      AND role = 'chef_projeto_vida'
      AND is_approved = true
  )
$$;

-- 2) app_remote_commands: restrict SELECT to authenticated only
DROP POLICY IF EXISTS "Qualquer um pode ler comandos remotos" ON public.app_remote_commands;
CREATE POLICY "Authenticated can read remote commands"
ON public.app_remote_commands
FOR SELECT
TO authenticated
USING (true);

-- Remove from realtime publication (broadcasts global admin commands)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.app_remote_commands;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.app_remote_commands;
END $$;

-- 3) profiles: only approved members can read colleagues
DROP POLICY IF EXISTS "Users can view profiles from same school" ON public.profiles;
CREATE POLICY "Users can view profiles from same school"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    school_id = get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.user_id = auth.uid() AND me.is_approved = true
    )
  )
);

-- 4) pagamentos: only owner or admin can read
DROP POLICY IF EXISTS "View pagamentos same school" ON public.pagamentos;
CREATE POLICY "Owner or admin can view pagamentos"
ON public.pagamentos
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 5) signed_contracts: gestor/chef/admin (and uploader) only
DROP POLICY IF EXISTS "Users from same school can view signed contracts" ON public.signed_contracts;
CREATE POLICY "Privileged school roles can view signed contracts"
ON public.signed_contracts
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR uploaded_by = auth.uid()
  OR (
    school_id = get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
    )
  )
);

-- 6) assinaturas: gestor/chef/admin only
DROP POLICY IF EXISTS "View assinaturas same school" ON public.assinaturas;
CREATE POLICY "Privileged school roles can view assinaturas"
ON public.assinaturas
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR (
    school_id = get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
    )
  )
);

-- 7) pending_pix_payments: only owner or admin
DROP POLICY IF EXISTS "Users from same school can view pending pix" ON public.pending_pix_payments;
CREATE POLICY "Owner or admin can view pending pix"
ON public.pending_pix_payments
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 8) profile_approval_decisions: lock UPDATE to acknowledged_at column only
DROP POLICY IF EXISTS "User acknowledges own decision" ON public.profile_approval_decisions;
CREATE POLICY "User acknowledges own decision"
ON public.profile_approval_decisions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND decision      = (SELECT d.decision      FROM public.profile_approval_decisions d WHERE d.id = profile_approval_decisions.id)
  AND school_id     = (SELECT d.school_id     FROM public.profile_approval_decisions d WHERE d.id = profile_approval_decisions.id)
  AND full_name     = (SELECT d.full_name     FROM public.profile_approval_decisions d WHERE d.id = profile_approval_decisions.id)
  AND COALESCE(intended_role,'') = COALESCE((SELECT d.intended_role FROM public.profile_approval_decisions d WHERE d.id = profile_approval_decisions.id),'')
  AND COALESCE(email,'')         = COALESCE((SELECT d.email         FROM public.profile_approval_decisions d WHERE d.id = profile_approval_decisions.id),'')
  AND COALESCE(phone,'')         = COALESCE((SELECT d.phone         FROM public.profile_approval_decisions d WHERE d.id = profile_approval_decisions.id),'')
  AND COALESCE(reason,'')        = COALESCE((SELECT d.reason        FROM public.profile_approval_decisions d WHERE d.id = profile_approval_decisions.id),'')
  AND COALESCE(decided_by_name,'') = COALESCE((SELECT d.decided_by_name FROM public.profile_approval_decisions d WHERE d.id = profile_approval_decisions.id),'')
);
