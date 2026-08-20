
-- 1) Colunas novas em pagamentos para ciclo dia 5
ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS auto_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manually_marked_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marked_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS marked_paid_by uuid,
  ADD COLUMN IF NOT EXISTS cycle_month date;

CREATE UNIQUE INDEX IF NOT EXISTS pagamentos_school_cycle_method_idx
  ON public.pagamentos(school_id, cycle_month, metodo)
  WHERE cycle_month IS NOT NULL;

-- 2) Tabela de visualização de pastas (para "piscar até abrir")
CREATE TABLE IF NOT EXISTS public.user_document_views (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_key text NOT NULL,
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, folder_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_document_views TO authenticated;
GRANT ALL ON public.user_document_views TO service_role;

ALTER TABLE public.user_document_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own views select" ON public.user_document_views;
CREATE POLICY "own views select" ON public.user_document_views
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own views write" ON public.user_document_views;
CREATE POLICY "own views write" ON public.user_document_views
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) RPC: marcar boleto como pago manualmente (gestor da escola)
CREATE OR REPLACE FUNCTION public.mark_boleto_paid_manually(_pagamento_id uuid)
RETURNS public.pagamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_api
AS $$
DECLARE
  _pag public.pagamentos;
  _user_school uuid;
BEGIN
  SELECT * INTO _pag FROM public.pagamentos WHERE id = _pagamento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado';
  END IF;
  _user_school := private_api.get_user_school_id(auth.uid());
  IF NOT (private_api.has_role(auth.uid(), 'admin'::app_role) OR _user_school = _pag.school_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _pag.status = 'approved' THEN
    RETURN _pag;
  END IF;
  UPDATE public.pagamentos
     SET manually_marked_paid = true,
         marked_paid_at = now(),
         marked_paid_by = auth.uid(),
         updated_at = now()
   WHERE id = _pagamento_id
   RETURNING * INTO _pag;
  RETURN _pag;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_boleto_paid_manually(uuid) TO authenticated;

-- 4) RPC: quitação do restante do contrato à vista (ano corrente)
CREATE OR REPLACE FUNCTION public.get_remaining_year_quote(_school_id uuid DEFAULT NULL)
RETURNS TABLE(
  school_id uuid,
  valor_mensal numeric,
  meses_ciclo integer,
  meses_pagos integer,
  meses_restantes integer,
  desconto_pct numeric,
  valor_total numeric,
  cycle_start timestamptz
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
  v_desconto numeric := 0.05; -- 5% à vista
  v_valor_total numeric;
BEGIN
  IF v_school_id IS NULL THEN RETURN; END IF;
  IF NOT (
    private_api.has_role(auth.uid(), 'admin'::app_role)
    OR (private_api.get_user_school_id(auth.uid()) = v_school_id
        AND private_api.is_user_approved(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT MIN(created_at) INTO v_cycle_start
    FROM public.pagamentos
   WHERE pagamentos.school_id = v_school_id
     AND status = 'approved'
     AND plano IN ('mensal','quitacao_restante')
     AND created_at > now() - interval '12 months';
  IF v_cycle_start IS NULL THEN v_cycle_start := now(); END IF;

  SELECT COUNT(*) INTO v_meses_pagos
    FROM public.pagamentos
   WHERE pagamentos.school_id = v_school_id
     AND status = 'approved'
     AND plano = 'mensal'
     AND created_at >= v_cycle_start;

  v_meses_restantes := GREATEST(v_meses_ciclo - v_meses_pagos, 0);
  v_valor_total := round(v_meses_restantes * v_valor_mensal * (1 - v_desconto), 2);

  RETURN QUERY SELECT
    v_school_id, v_valor_mensal, v_meses_ciclo, v_meses_pagos,
    v_meses_restantes, v_desconto, v_valor_total, v_cycle_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_remaining_year_quote(uuid) TO authenticated;

-- 5) RPC: gera lista de escolas que precisam de boleto do próximo dia 5
CREATE OR REPLACE FUNCTION public.list_schools_needing_monthly_boleto()
RETURNS TABLE(school_id uuid, gestor_user_id uuid, due_date date, cycle_month date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Boa_Vista')::date;
  v_due date;
  v_cycle date;
BEGIN
  -- Próximo dia 5: se hoje >= dia 28, mira o dia 5 do MÊS SEGUINTE
  IF EXTRACT(DAY FROM v_today) >= 28 THEN
    v_due := (date_trunc('month', v_today) + interval '1 month' + interval '4 days')::date;
  ELSIF EXTRACT(DAY FROM v_today) < 5 THEN
    v_due := (date_trunc('month', v_today) + interval '4 days')::date;
  ELSE
    -- Entre dia 5 e 27: não gera nada (já passou o vencimento do mês corrente)
    RETURN;
  END IF;
  v_cycle := date_trunc('month', v_due)::date;

  RETURN QUERY
  SELECT s.id, p.user_id, v_due, v_cycle
    FROM public.schools s
    JOIN public.assinaturas a
      ON a.school_id = s.id AND a.status = 'ativo'
    JOIN public.profiles p
      ON p.school_id = s.id AND p.role = 'gestor_pedagogico'
   WHERE NOT EXISTS (
           SELECT 1 FROM public.pagamentos pg
            WHERE pg.school_id = s.id
              AND pg.cycle_month = v_cycle
              AND pg.metodo = 'boleto'
              AND pg.auto_generated = true
         );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_schools_needing_monthly_boleto() TO service_role;

-- 6) Realinha o subscription_deadline das escolas ativas para o próximo dia 5
DO $$
DECLARE
  v_today date := CURRENT_DATE;
  v_next_d5 date;
BEGIN
  IF EXTRACT(DAY FROM v_today) < 5 THEN
    v_next_d5 := (date_trunc('month', v_today) + interval '4 days')::date;
  ELSE
    v_next_d5 := (date_trunc('month', v_today) + interval '1 month' + interval '4 days')::date;
  END IF;

  UPDATE public.profiles p
     SET subscription_deadline = v_next_d5
   WHERE p.role = 'gestor_pedagogico'
     AND EXISTS (
       SELECT 1 FROM public.assinaturas a
        WHERE a.school_id = p.school_id AND a.status = 'ativo'
     );
END $$;
