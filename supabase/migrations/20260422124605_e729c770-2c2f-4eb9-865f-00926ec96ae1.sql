
-- 1) Tabela de decisões (mantém histórico mesmo após delete do profile)
CREATE TABLE IF NOT EXISTS public.profile_approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  school_id uuid NOT NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  intended_role text,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  reason text,
  decided_by uuid,
  decided_by_name text,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pad_user ON public.profile_approval_decisions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pad_school ON public.profile_approval_decisions(school_id, created_at DESC);

ALTER TABLE public.profile_approval_decisions ENABLE ROW LEVEL SECURITY;

-- RLS: somente leitura para envolvidos; escrita só via funções
DROP POLICY IF EXISTS "User views own decisions" ON public.profile_approval_decisions;
CREATE POLICY "User views own decisions"
  ON public.profile_approval_decisions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Manager views school decisions" ON public.profile_approval_decisions;
CREATE POLICY "Manager views school decisions"
  ON public.profile_approval_decisions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.school_id = profile_approval_decisions.school_id
        AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
        AND p.is_approved = true
    )
  );

DROP POLICY IF EXISTS "Admin views all decisions" ON public.profile_approval_decisions;
CREATE POLICY "Admin views all decisions"
  ON public.profile_approval_decisions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "User acknowledges own decision" ON public.profile_approval_decisions;
CREATE POLICY "User acknowledges own decision"
  ON public.profile_approval_decisions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Block direct insert decisions" ON public.profile_approval_decisions;
CREATE POLICY "Block direct insert decisions"
  ON public.profile_approval_decisions FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "Block direct delete decisions" ON public.profile_approval_decisions;
CREATE POLICY "Block direct delete decisions"
  ON public.profile_approval_decisions FOR DELETE TO authenticated
  USING (false);

-- 2) RPC: gestor decide (aprova ou rejeita) com justificativa
CREATE OR REPLACE FUNCTION public.manager_decide_profile(
  _profile_id uuid,
  _decision text,
  _reason text DEFAULT NULL,
  _approve_as_intended boolean DEFAULT false
) RETURNS profile_approval_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile public.profiles;
  _can boolean;
  _email text;
  _decider_name text;
  _target_role text;
  _decision_row public.profile_approval_decisions;
BEGIN
  IF _decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Invalid decision: must be approved or rejected';
  END IF;

  IF _decision = 'rejected' AND (_reason IS NULL OR length(trim(_reason)) < 5) THEN
    RAISE EXCEPTION 'Justificativa obrigatória ao rejeitar (mínimo 5 caracteres)';
  END IF;

  SELECT * INTO _profile FROM public.profiles WHERE id = _profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Permissão: admin OU gestor/chef da escola do profile
  _can := has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.school_id = _profile.school_id
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
      AND p.is_approved = true
  );
  IF NOT _can THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Captura email e nome do decisor
  SELECT email INTO _email FROM auth.users WHERE id = _profile.user_id;
  SELECT full_name INTO _decider_name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

  IF _decision = 'approved' THEN
    _target_role := CASE
      WHEN _approve_as_intended AND _profile.intended_role IS NOT NULL THEN _profile.intended_role
      ELSE _profile.role
    END;

    UPDATE public.profiles
    SET is_approved = true,
        role = _target_role,
        intended_role = NULL,
        updated_at = now()
    WHERE id = _profile_id;
  END IF;

  -- Grava decisão
  INSERT INTO public.profile_approval_decisions
    (user_id, school_id, full_name, email, phone, intended_role,
     decision, reason, decided_by, decided_by_name)
  VALUES
    (_profile.user_id, _profile.school_id, _profile.full_name, _email, _profile.phone,
     COALESCE(_profile.intended_role, _profile.role),
     _decision, NULLIF(trim(coalesce(_reason,'')),''),
     auth.uid(), _decider_name)
  RETURNING * INTO _decision_row;

  -- Em rejeição, remove o perfil pendente
  IF _decision = 'rejected' THEN
    DELETE FROM public.profiles WHERE id = _profile_id;
  END IF;

  -- Auditoria
  INSERT INTO public.audit_logs (action, table_name, record_id, new_data, performed_by, school_id)
  VALUES (
    CASE WHEN _decision = 'approved' THEN 'manager_approve_profile' ELSE 'manager_reject_profile' END,
    'profiles',
    _profile_id::text,
    jsonb_build_object(
      'user_id', _profile.user_id,
      'full_name', _profile.full_name,
      'reason', NULLIF(trim(coalesce(_reason,'')),''),
      'role', COALESCE(_target_role, _profile.role)
    ),
    auth.uid(),
    _profile.school_id
  );

  RETURN _decision_row;
END;
$$;

-- 3) Função: usuário consulta sua decisão mais recente não-acknowledgada
CREATE OR REPLACE FUNCTION public.get_my_latest_decision()
RETURNS profile_approval_decisions
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.profile_approval_decisions
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC
  LIMIT 1;
$$;
