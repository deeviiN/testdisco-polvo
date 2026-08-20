DROP POLICY IF EXISTS "managers manage siren settings" ON public.school_siren_settings;

CREATE POLICY "managers manage siren settings"
ON public.school_siren_settings
FOR ALL
TO authenticated
USING (
  private_api.has_role(auth.uid(), 'admin'::app_role)
  OR (
    school_id = private_api.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role = ANY (ARRAY['gestor_pedagogico','coord_pedagogico','chef_projeto_vida'])
    )
  )
)
WITH CHECK (
  private_api.has_role(auth.uid(), 'admin'::app_role)
  OR (
    school_id = private_api.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role = ANY (ARRAY['gestor_pedagogico','coord_pedagogico','chef_projeto_vida'])
    )
  )
);