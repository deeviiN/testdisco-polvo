CREATE OR REPLACE FUNCTION public.preview_bulk_set_schools_status(_status text)
RETURNS TABLE(
  total_schools integer,
  would_update integer,
  preserved_subscribers integer,
  already_in_status integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer := 0;
  v_update integer := 0;
  v_preserved integer := 0;
  v_already integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _status NOT IN ('active','blocked','grace_period') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  WITH subscribed AS (
    SELECT DISTINCT school_id
    FROM public.assinaturas
    WHERE status IN ('ativo','active','paid','trialing','trial')
      AND validade > now()
  )
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (
      WHERE s.id NOT IN (SELECT school_id FROM subscribed)
        AND s.subscription_status IS DISTINCT FROM _status
    )::int,
    COUNT(*) FILTER (WHERE s.id IN (SELECT school_id FROM subscribed))::int,
    COUNT(*) FILTER (
      WHERE s.id NOT IN (SELECT school_id FROM subscribed)
        AND s.subscription_status = _status
    )::int
  INTO v_total, v_update, v_preserved, v_already
  FROM public.schools s;

  RETURN QUERY SELECT v_total, v_update, v_preserved, v_already;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_bulk_set_schools_status(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.preview_bulk_set_schools_status(text) TO authenticated;