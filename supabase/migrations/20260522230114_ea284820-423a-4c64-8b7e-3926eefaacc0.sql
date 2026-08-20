CREATE POLICY "Gestor can view school audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_approved = true
      AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
  )
);