-- 1) servidores_aniversariantes: remover leitura anônima direta
DROP POLICY IF EXISTS "Painel TV pode ler aniversariantes" ON public.servidores_aniversariantes;
REVOKE SELECT ON public.servidores_aniversariantes FROM anon;

CREATE OR REPLACE FUNCTION public.get_painel_aniversariantes(_school_id uuid, _ref_date date DEFAULT (now() AT TIME ZONE 'America/Boa_Vista')::date)
RETURNS TABLE (id uuid, nome text, cargo text, setor text, dia smallint, mes smallint, foto_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_dow int := EXTRACT(DOW FROM _ref_date);
  v_span int := CASE WHEN EXTRACT(DOW FROM _ref_date) = 5 THEN 3 ELSE 0 END;
BEGIN
  SELECT COALESCE(ps.mostrar_aniv_servidores, false) INTO v_enabled
  FROM public.panel_settings ps WHERE ps.school_id = _school_id;

  IF NOT COALESCE(v_enabled, false) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT sa.id, sa.nome, sa.cargo, sa.setor, sa.dia, sa.mes, sa.foto_url
  FROM public.servidores_aniversariantes sa
  WHERE sa.school_id = _school_id
    AND EXISTS (
      SELECT 1 FROM generate_series(0, v_span) g
      WHERE sa.dia = EXTRACT(DAY FROM (_ref_date + g))::smallint
        AND sa.mes = EXTRACT(MONTH FROM (_ref_date + g))::smallint
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_painel_aniversariantes(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_painel_aniversariantes(uuid, date) TO anon, authenticated, service_role;

-- 2) settings: leitura restrita a admins
DROP POLICY IF EXISTS "Settings are readable by authenticated users" ON public.settings;
REVOKE SELECT ON public.settings FROM anon;
