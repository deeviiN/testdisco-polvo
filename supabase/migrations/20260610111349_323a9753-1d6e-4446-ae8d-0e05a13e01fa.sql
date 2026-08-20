
CREATE OR REPLACE FUNCTION private_api.get_plan_migration_quote(_school_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  school_id uuid,
  valor_mensal numeric,
  meses_ciclo integer,
  meses_pagos integer,
  meses_restantes integer,
  valor_total numeric,
  cycle_start timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_api
AS $$
DECLARE
  v_school_id uuid := COALESCE(_school_id, private_api.get_user_school_id(auth.uid()));
  v_valor_mensal numeric := 199.90;
  v_meses_ciclo integer := 12;
  v_cycle_start timestamptz;
  v_meses_pagos integer := 0;
  v_meses_restantes integer;
  v_valor_total numeric;
  v_is_admin boolean;
  v_is_school_user boolean;
BEGIN
  IF v_school_id IS NULL THEN RETURN; END IF;

  SELECT private_api.has_role(auth.uid(), 'admin'::app_role) INTO v_is_admin;
  v_is_school_user := (private_api.get_user_school_id(auth.uid()) = v_school_id)
                      AND private_api.is_user_approved(auth.uid());

  IF NOT (v_is_admin OR v_is_school_user) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Primeiro pagamento aprovado nos últimos 12 meses, ou now()-12m
  SELECT MIN(created_at) INTO v_cycle_start
    FROM public.pagamentos
   WHERE school_id = v_school_id
     AND status = 'approved'
     AND plano = 'mensal'
     AND created_at > now() - interval '12 months';

  IF v_cycle_start IS NULL THEN v_cycle_start := now() - interval '12 months'; END IF;

  SELECT COUNT(*) INTO v_meses_pagos
    FROM public.pagamentos
   WHERE school_id = v_school_id
     AND status = 'approved'
     AND plano = 'mensal'
     AND created_at >= v_cycle_start;

  v_meses_restantes := GREATEST(v_meses_ciclo - v_meses_pagos, 0);
  v_valor_total := v_meses_restantes * v_valor_mensal;

  RETURN QUERY SELECT
    v_school_id, v_valor_mensal, v_meses_ciclo, v_meses_pagos,
    v_meses_restantes, v_valor_total, v_cycle_start;
END;
$$;
