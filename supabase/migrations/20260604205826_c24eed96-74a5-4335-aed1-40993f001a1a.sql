DROP POLICY IF EXISTS "managers write reduced days" ON public.schedule_reduced_days;
DROP POLICY IF EXISTS "school members read reduced days" ON public.schedule_reduced_days;

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
  (school_id = private_api.get_user_school_id(auth.uid()))
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico'::text, 'coord_pedagogico'::text, 'chef_projeto_vida'::text, 'assistente_alunos'::text])
  )
)
WITH CHECK (
  (school_id = private_api.get_user_school_id(auth.uid()))
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico'::text, 'coord_pedagogico'::text, 'chef_projeto_vida'::text, 'assistente_alunos'::text])
  )
);

CREATE POLICY "School staff view schedule_reduced_days"
ON public.schedule_reduced_days
FOR SELECT
TO authenticated
USING (
  (school_id = private_api.get_user_school_id(auth.uid()))
  AND private_api.is_user_approved(auth.uid())
);