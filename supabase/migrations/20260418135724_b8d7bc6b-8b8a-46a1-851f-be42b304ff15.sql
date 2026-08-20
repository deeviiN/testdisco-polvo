CREATE OR REPLACE FUNCTION public.set_minimum_supported_version(_version text, _build_time bigint)
 RETURNS app_version_manifest
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.app_version_manifest;
  _is_gestor boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND role IN ('gestor_pedagogico', 'chef_projeto_vida')
  ) INTO _is_gestor;

  IF NOT (public.has_role(auth.uid(), 'admin') OR _is_gestor) THEN
    RAISE EXCEPTION 'Only admins or school managers can update the version manifest';
  END IF;

  IF _version IS NULL OR length(trim(_version)) = 0 THEN
    RAISE EXCEPTION 'Version is required';
  END IF;

  IF _build_time IS NULL OR _build_time < 0 THEN
    RAISE EXCEPTION 'Build time must be a positive integer';
  END IF;

  UPDATE public.app_version_manifest
  SET minimum_supported_version = trim(_version),
      minimum_supported_build_time = _build_time,
      latest_version = GREATEST(latest_version, trim(_version)),
      latest_build_time = GREATEST(latest_build_time, _build_time),
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = true
  RETURNING * INTO _row;

  RETURN _row;
END;
$function$;

DROP POLICY IF EXISTS "Only admins can update app version manifest" ON public.app_version_manifest;

CREATE POLICY "Admins and managers can update app version manifest"
ON public.app_version_manifest
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND role IN ('gestor_pedagogico', 'chef_projeto_vida')
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND role IN ('gestor_pedagogico', 'chef_projeto_vida')
  )
);