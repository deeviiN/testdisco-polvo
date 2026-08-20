-- Single-row table holding the version gate
CREATE TABLE IF NOT EXISTS public.app_version_manifest (
  id boolean PRIMARY KEY DEFAULT true,
  minimum_supported_version text NOT NULL DEFAULT '0000.0000',
  minimum_supported_build_time bigint NOT NULL DEFAULT 0,
  latest_version text NOT NULL DEFAULT '0000.0000',
  latest_build_time bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT app_version_manifest_singleton CHECK (id = true)
);

INSERT INTO public.app_version_manifest (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_version_manifest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "App version manifest is publicly readable" ON public.app_version_manifest;
CREATE POLICY "App version manifest is publicly readable"
  ON public.app_version_manifest
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Only admins can update app version manifest" ON public.app_version_manifest;
CREATE POLICY "Only admins can update app version manifest"
  ON public.app_version_manifest
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Block direct INSERT/DELETE on the singleton row
DROP POLICY IF EXISTS "Block insert on app version manifest" ON public.app_version_manifest;
CREATE POLICY "Block insert on app version manifest"
  ON public.app_version_manifest
  FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "Block delete on app version manifest" ON public.app_version_manifest;
CREATE POLICY "Block delete on app version manifest"
  ON public.app_version_manifest
  FOR DELETE
  USING (false);

-- Public RPC used by the client to check the version gate
CREATE OR REPLACE FUNCTION public.get_app_version_manifest()
RETURNS TABLE (
  minimum_supported_version text,
  minimum_supported_build_time bigint,
  latest_version text,
  latest_build_time bigint,
  updated_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.minimum_supported_version,
    m.minimum_supported_build_time,
    m.latest_version,
    m.latest_build_time,
    m.updated_at
  FROM public.app_version_manifest m
  WHERE m.id = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_app_version_manifest() TO anon, authenticated;

-- Admin-only RPC to bump the minimum supported version
CREATE OR REPLACE FUNCTION public.set_minimum_supported_version(
  _version text,
  _build_time bigint
)
RETURNS public.app_version_manifest
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.app_version_manifest;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can update the version manifest';
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
$$;

REVOKE ALL ON FUNCTION public.set_minimum_supported_version(text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_minimum_supported_version(text, bigint) TO authenticated;