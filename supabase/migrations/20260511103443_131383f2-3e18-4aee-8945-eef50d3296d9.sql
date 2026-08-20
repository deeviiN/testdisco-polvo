CREATE OR REPLACE FUNCTION public.get_plan_migration_quote(_school_id uuid DEFAULT NULL)
RETURNS TABLE (
  school_id uuid,
  valor_mensal numeric,
  meses_ciclo integer,
  meses_pagos integer,
  meses_restantes integer,
  valor_total numeric,
  cycle_start timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid;
  v_valor_mensal numeric := 169.90;
  v_meses_ciclo integer := 12;
  v_cycle_start timestamptz;
  v_pagos integer;
BEGIN
  v_school := COALESCE(_school_id, get_user_school_id(auth.uid()));
  IF v_school IS NULL THEN RETURN; END IF;

  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      v_school = get_user_school_id(auth.uid())
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.user_id = auth.uid()
          AND p.is_approved = true
          AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
      )
    )
  ) THEN RETURN; END IF;

  SELECT COALESCE(MIN(approved_at), now() - interval '12 months')
    INTO v_cycle_start
  FROM pagamentos
  WHERE pagamentos.school_id = v_school
    AND status = 'approved'
    AND approved_at >= now() - interval '12 months';

  SELECT COUNT(*)::int INTO v_pagos
  FROM pagamentos
  WHERE pagamentos.school_id = v_school
    AND status = 'approved'
    AND plano = 'mensal'
    AND approved_at >= v_cycle_start;

  IF v_pagos > v_meses_ciclo THEN v_pagos := v_meses_ciclo; END IF;

  RETURN QUERY SELECT
    v_school,
    v_valor_mensal,
    v_meses_ciclo,
    v_pagos,
    GREATEST(v_meses_ciclo - v_pagos, 0),
    ROUND(GREATEST(v_meses_ciclo - v_pagos, 0) * v_valor_mensal, 2),
    v_cycle_start;
END;
$$;