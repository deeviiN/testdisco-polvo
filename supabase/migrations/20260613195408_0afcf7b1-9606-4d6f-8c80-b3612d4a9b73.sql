DROP POLICY IF EXISTS "Managers manage schedule_periods" ON public.schedule_periods;
DROP POLICY IF EXISTS "Admin manages schedule_periods" ON public.schedule_periods;

CREATE POLICY "Admin manages schedule_periods"
ON public.schedule_periods
FOR ALL
TO authenticated
USING (private_api.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private_api.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers manage schedule_periods"
ON public.schedule_periods
FOR ALL
TO authenticated
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.school_id = public.schedule_periods.school_id
      AND p.is_approved = true
      AND p.role = ANY (ARRAY[
        'gestor_pedagogico'::text,
        'coord_pedagogico'::text,
        'coordenador_pedagogico'::text,
        'chef_projeto_vida'::text,
        'supervisor'::text
      ])
  )
)
WITH CHECK (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.school_id = public.schedule_periods.school_id
      AND p.is_approved = true
      AND p.role = ANY (ARRAY[
        'gestor_pedagogico'::text,
        'coord_pedagogico'::text,
        'coordenador_pedagogico'::text,
        'chef_projeto_vida'::text,
        'supervisor'::text
      ])
  )
);

DROP POLICY IF EXISTS "Managers manage schedule_reduced_days" ON public.schedule_reduced_days;
DROP POLICY IF EXISTS "Admin manages schedule_reduced_days" ON public.schedule_reduced_days;

CREATE POLICY "Admin manages schedule_reduced_days"
ON public.schedule_reduced_days
FOR ALL
TO authenticated
USING (private_api.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private_api.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers manage schedule_reduced_days"
ON public.schedule_reduced_days
FOR ALL
TO authenticated
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.school_id = public.schedule_reduced_days.school_id
      AND p.is_approved = true
      AND p.role = ANY (ARRAY[
        'gestor_pedagogico'::text,
        'coord_pedagogico'::text,
        'coordenador_pedagogico'::text,
        'chef_projeto_vida'::text,
        'supervisor'::text
      ])
  )
)
WITH CHECK (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.school_id = public.schedule_reduced_days.school_id
      AND p.is_approved = true
      AND p.role = ANY (ARRAY[
        'gestor_pedagogico'::text,
        'coord_pedagogico'::text,
        'coordenador_pedagogico'::text,
        'chef_projeto_vida'::text,
        'supervisor'::text
      ])
  )
);