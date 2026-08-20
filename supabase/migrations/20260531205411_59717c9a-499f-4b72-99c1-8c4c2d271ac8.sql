DROP POLICY IF EXISTS "Assistant/gestor insert attendance" ON public.attendance_records;
CREATE POLICY "Assistant/gestor insert attendance"
  ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private_api.get_user_school_id(auth.uid())
    AND recorded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role IN ('assistente','secretario_escolar','gestor_pedagogico','chef_projeto_vida','coord_pedagogico','supervisor')
    )
  );