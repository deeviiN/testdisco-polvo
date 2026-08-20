-- Função para alterar em massa o subscription_status de escolas,
-- preservando aquelas que possuem assinatura ATIVA na tabela assinaturas.
CREATE OR REPLACE FUNCTION public.bulk_set_schools_status(_status text)
RETURNS TABLE(updated_count integer, preserved_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
  v_preserved integer := 0;
BEGIN
  -- Apenas admin
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _status NOT IN ('active','blocked','grace_period') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  -- Conjunto de school_ids com assinatura válida (status ativo e validade futura)
  WITH subscribed AS (
    SELECT DISTINCT school_id
    FROM public.assinaturas
    WHERE status IN ('ativo','active','paid','trialing','trial')
      AND validade > now()
  ),
  upd AS (
    UPDATE public.schools s
    SET subscription_status = _status
    WHERE s.id NOT IN (SELECT school_id FROM subscribed)
      AND s.subscription_status IS DISTINCT FROM _status
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_updated FROM upd;

  SELECT COUNT(*)::int INTO v_preserved
  FROM public.assinaturas
  WHERE status IN ('ativo','active','paid','trialing','trial')
    AND validade > now();

  -- Audit log
  INSERT INTO public.audit_logs(action, table_name, performed_by, new_data)
  VALUES (
    'bulk_set_schools_status',
    'schools',
    auth.uid(),
    jsonb_build_object('status', _status, 'updated', v_updated, 'preserved', v_preserved)
  );

  RETURN QUERY SELECT v_updated, v_preserved;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_set_schools_status(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bulk_set_schools_status(text) TO authenticated;