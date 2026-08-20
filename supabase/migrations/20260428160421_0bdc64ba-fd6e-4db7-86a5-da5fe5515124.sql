CREATE TABLE IF NOT EXISTS public.mp_settings (
  id boolean PRIMARY KEY DEFAULT true,
  force_test_mode boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT mp_settings_singleton CHECK (id = true)
);

INSERT INTO public.mp_settings (id, force_test_mode) VALUES (true, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.mp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage mp_settings" ON public.mp_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.get_mp_force_test_mode()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT force_test_mode FROM public.mp_settings WHERE id = true LIMIT 1), false);
$$;

CREATE OR REPLACE FUNCTION public.set_mp_force_test_mode(_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can change MP settings';
  END IF;

  INSERT INTO public.mp_settings (id, force_test_mode, updated_at, updated_by)
  VALUES (true, _enabled, now(), auth.uid())
  ON CONFLICT (id) DO UPDATE
    SET force_test_mode = EXCLUDED.force_test_mode,
        updated_at = now(),
        updated_by = auth.uid();

  INSERT INTO public.audit_logs (action, table_name, new_data, performed_by)
  VALUES ('mp_force_test_mode_changed', 'mp_settings',
          jsonb_build_object('force_test_mode', _enabled), auth.uid());

  RETURN _enabled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mp_force_test_mode() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_mp_force_test_mode(boolean) TO authenticated;