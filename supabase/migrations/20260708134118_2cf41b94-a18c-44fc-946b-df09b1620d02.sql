-- teacher_presence: exigir que assistente tenha turmas atribuídas em assistant_classes
DROP POLICY IF EXISTS "Assistant/gestor insert teacher_presence" ON public.teacher_presence;
CREATE POLICY "Assistant/gestor insert teacher_presence"
ON public.teacher_presence
FOR INSERT
WITH CHECK (
  school_id = private_api.get_user_school_id(auth.uid())
  AND marked_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND (
        p.role IN ('gestor_pedagogico','chef_projeto_vida','coord_pedagogico','supervisor','secretario_escolar')
        OR (
          p.role = 'assistente'
          AND EXISTS (
            SELECT 1 FROM public.assistant_classes ac
            WHERE ac.assistant_user_id = auth.uid()
              AND ac.school_id = public.teacher_presence.school_id
          )
        )
      )
  )
);

DROP POLICY IF EXISTS "Assistant/gestor update teacher_presence" ON public.teacher_presence;
CREATE POLICY "Assistant/gestor update teacher_presence"
ON public.teacher_presence
FOR UPDATE
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND (
        p.role IN ('gestor_pedagogico','chef_projeto_vida','coord_pedagogico','supervisor','secretario_escolar')
        OR (
          p.role = 'assistente'
          AND EXISTS (
            SELECT 1 FROM public.assistant_classes ac
            WHERE ac.assistant_user_id = auth.uid()
              AND ac.school_id = public.teacher_presence.school_id
          )
        )
      )
  )
)
WITH CHECK (
  school_id = private_api.get_user_school_id(auth.uid())
);