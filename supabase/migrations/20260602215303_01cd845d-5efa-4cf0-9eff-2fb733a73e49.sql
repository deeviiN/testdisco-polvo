-- Permitir que assistentes de alunos também editem os tempos da escola
DROP POLICY IF EXISTS "Managers manage schedule_periods" ON public.schedule_periods;

CREATE POLICY "Managers manage schedule_periods"
ON public.schedule_periods
FOR ALL
TO authenticated
USING (
  (school_id = private_api.get_user_school_id(auth.uid()))
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico','coord_pedagogico','chef_projeto_vida','assistente_alunos'])
  )
)
WITH CHECK (
  (school_id = private_api.get_user_school_id(auth.uid()))
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role = ANY (ARRAY['gestor_pedagogico','coord_pedagogico','chef_projeto_vida','assistente_alunos'])
  )
);