CREATE OR REPLACE FUNCTION public.get_contract_pending_counts()
RETURNS TABLE(
  awaiting_admin integer,
  awaiting_gestor integer,
  gestor_signed integer,
  completed integer,
  total_schools integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can read contract counts';
  END IF;

  RETURN QUERY
  WITH per_school AS (
    SELECT
      school_id,
      MAX(CASE WHEN signer_role = 'gestor' AND (file_path IS NULL OR file_path NOT LIKE '_/_request/_/%') THEN uploaded_at END) AS g_at,
      MAX(CASE WHEN signer_role = 'admin'  AND (file_path IS NULL OR file_path NOT LIKE '_/_request/_/%') THEN uploaded_at END) AS a_at,
      BOOL_OR(file_path LIKE '_/_request/_/%') AS has_request
    FROM public.signed_contracts
    GROUP BY school_id
  ),
  classified AS (
    SELECT
      CASE
        WHEN g_at IS NOT NULL AND a_at IS NOT NULL AND a_at >= g_at THEN 'completed'
        WHEN g_at IS NOT NULL AND (a_at IS NULL OR a_at < g_at) THEN 'awaiting_admin'
        WHEN a_at IS NOT NULL AND g_at IS NULL THEN 'awaiting_gestor'
        WHEN has_request AND g_at IS NULL AND a_at IS NULL THEN 'awaiting_gestor'
        ELSE 'other'
      END AS stage
    FROM per_school
  )
  SELECT
    COUNT(*) FILTER (WHERE stage = 'awaiting_admin')::int,
    COUNT(*) FILTER (WHERE stage = 'awaiting_gestor')::int,
    COUNT(*) FILTER (WHERE stage = 'awaiting_admin')::int,
    COUNT(*) FILTER (WHERE stage = 'completed')::int,
    COUNT(*)::int
  FROM classified;
END;
$$;