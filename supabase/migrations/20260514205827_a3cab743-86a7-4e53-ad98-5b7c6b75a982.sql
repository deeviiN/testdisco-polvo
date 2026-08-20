CREATE OR REPLACE FUNCTION public.list_contract_pending_stages(_stage text DEFAULT NULL)
RETURNS TABLE(
  school_id uuid,
  school_name text,
  stage text,
  gestor_uploaded_at timestamptz,
  admin_uploaded_at timestamptz,
  has_request boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can read contract stages';
  END IF;

  RETURN QUERY
  WITH per_school AS (
    SELECT
      sc.school_id,
      MAX(CASE WHEN sc.signer_role = 'gestor'
               AND sc.file_name <> '__request__'
               AND (sc.file_path IS NULL OR sc.file_path NOT LIKE '__request__/%')
               THEN sc.uploaded_at END) AS g_at,
      MAX(CASE WHEN sc.signer_role = 'admin'
               AND sc.file_name <> '__request__'
               AND (sc.file_path IS NULL OR sc.file_path NOT LIKE '__request__/%')
               THEN sc.uploaded_at END) AS a_at,
      BOOL_OR(sc.file_name = '__request__' OR sc.file_path LIKE '__request__/%') AS req
    FROM public.signed_contracts sc
    GROUP BY sc.school_id
  ),
  classified AS (
    SELECT
      ps.school_id,
      ps.g_at,
      ps.a_at,
      ps.req,
      CASE
        WHEN ps.g_at IS NOT NULL AND ps.a_at IS NOT NULL AND ps.a_at >= ps.g_at THEN 'completed'
        WHEN ps.g_at IS NOT NULL THEN 'gestor_signed'
        WHEN ps.a_at IS NOT NULL THEN 'awaiting_gestor'
        WHEN ps.req THEN 'awaiting_admin'
        ELSE 'other'
      END AS stage
    FROM per_school ps
  )
  SELECT
    c.school_id,
    s.name,
    c.stage,
    c.g_at,
    c.a_at,
    c.req
  FROM classified c
  LEFT JOIN public.schools s ON s.id = c.school_id
  WHERE _stage IS NULL OR c.stage = _stage
  ORDER BY c.stage, s.name NULLS LAST;
END;
$$;