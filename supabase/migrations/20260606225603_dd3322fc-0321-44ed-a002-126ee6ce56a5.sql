
-- =========================================================================
-- Console do Administrador Global — RPCs seguras
-- Todas exigem has_role(auth.uid(),'admin'). SECURITY DEFINER.
-- =========================================================================

-- Helper: registra auditoria
CREATE OR REPLACE FUNCTION public.admin_log_action(
  _action text,
  _school_id uuid DEFAULT NULL,
  _record_id text DEFAULT NULL,
  _table_name text DEFAULT 'admin_console',
  _old jsonb DEFAULT NULL,
  _new jsonb DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;
  INSERT INTO public.audit_logs(action, table_name, record_id, old_data, new_data, performed_by, school_id)
  VALUES (
    _action, _table_name, _record_id,
    _old,
    coalesce(_new,'{}'::jsonb) || jsonb_build_object('reason', _reason),
    auth.uid(), _school_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- KPIs globais
CREATE OR REPLACE FUNCTION public.admin_global_kpis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;
  SELECT jsonb_build_object(
    'schools_total', (SELECT count(*) FROM schools),
    'schools_active', (SELECT count(*) FROM schools WHERE subscription_status='active' AND is_active=true),
    'schools_blocked', (SELECT count(*) FROM schools WHERE is_active=false OR subscription_status='blocked'),
    'schools_grace', (SELECT count(*) FROM schools WHERE subscription_status='grace'),
    'users_total', (SELECT count(*) FROM profiles),
    'users_pending', (SELECT count(*) FROM profiles WHERE is_approved=false),
    'gestores_total', (SELECT count(*) FROM profiles WHERE role IN ('gestor_pedagogico','chef_projeto_vida')),
    'errors_24h', (SELECT count(*) FROM audit_logs WHERE action='client_error_log' AND created_at > now() - interval '24 hours'),
    'payments_pending', (SELECT count(*) FROM pagamentos WHERE status IN ('pending','in_process'))
  ) INTO v;
  RETURN v;
END;
$$;

-- Lista escolas com contagens (Nível 1)
CREATE OR REPLACE FUNCTION public.admin_list_schools_console(
  _state text DEFAULT NULL,
  _city text DEFAULT NULL,
  _network text DEFAULT NULL,
  _status text DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
) RETURNS TABLE(
  id uuid, name text, inep_code text, city text, state text, network text,
  is_active boolean, subscription_status text, subscription_end_date date,
  days_left int, users_count bigint, gestores_count bigint, pending_count bigint,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT s.* FROM schools s
    WHERE (_state IS NULL OR s.state = _state)
      AND (_city IS NULL OR s.city = _city)
      AND (_network IS NULL OR s.network = _network)
      AND (_status IS NULL OR s.subscription_status = _status)
      AND (_search IS NULL OR s.name ILIKE '%'||_search||'%' OR s.inep_code ILIKE '%'||_search||'%')
  ),
  counted AS (
    SELECT b.*,
      (SELECT count(*) FROM profiles p WHERE p.school_id=b.id) AS users_count,
      (SELECT count(*) FROM profiles p WHERE p.school_id=b.id AND p.role IN ('gestor_pedagogico','chef_projeto_vida')) AS gestores_count,
      (SELECT count(*) FROM profiles p WHERE p.school_id=b.id AND p.is_approved=false) AS pending_count
    FROM base b
  ),
  total AS (SELECT count(*) AS c FROM base)
  SELECT c.id, c.name, c.inep_code, c.city, c.state, c.network,
         c.is_active, c.subscription_status, c.subscription_end_date,
         CASE WHEN c.subscription_end_date IS NULL THEN NULL
              ELSE (c.subscription_end_date - current_date) END AS days_left,
         c.users_count, c.gestores_count, c.pending_count,
         (SELECT c FROM total)
  FROM counted c
  ORDER BY c.state, c.city, c.name
  LIMIT _limit OFFSET _offset;
END;
$$;

-- Usuários por escola com dados seguros de auth (sem senha/hash)
CREATE OR REPLACE FUNCTION public.admin_list_users_with_auth(
  _school_id uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _role text DEFAULT NULL,
  _approved boolean DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
) RETURNS TABLE(
  user_id uuid, profile_id uuid, full_name text, role text, intended_role text,
  is_approved boolean, school_id uuid, school_name text, phone text,
  email text, providers text[], created_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed_at timestamptz, discipline_status text, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT p.*, s.name AS s_name
    FROM profiles p
    LEFT JOIN schools s ON s.id = p.school_id
    WHERE (_school_id IS NULL OR p.school_id = _school_id)
      AND (_role IS NULL OR p.role = _role)
      AND (_approved IS NULL OR p.is_approved = _approved)
      AND (_search IS NULL OR p.full_name ILIKE '%'||_search||'%' OR p.phone ILIKE '%'||_search||'%')
  ),
  total AS (SELECT count(*) AS c FROM base)
  SELECT b.user_id, b.id, b.full_name, b.role, b.intended_role,
         b.is_approved, b.school_id, b.s_name, b.phone,
         u.email::text,
         COALESCE((u.raw_app_meta_data->'providers')::jsonb, '[]'::jsonb)::jsonb #>> '{}'::text[],
         NULL::text[], -- placeholder fix below
         u.created_at, u.last_sign_in_at, u.email_confirmed_at,
         b.discipline_status,
         (SELECT c FROM total)
  FROM base b
  LEFT JOIN auth.users u ON u.id = b.user_id
  ORDER BY b.full_name
  LIMIT _limit OFFSET _offset;
END;
$$;

-- Versão corrigida (a anterior tinha placeholder). Recriamos limpo:
DROP FUNCTION IF EXISTS public.admin_list_users_with_auth(uuid,text,text,boolean,int,int);
CREATE OR REPLACE FUNCTION public.admin_list_users_with_auth(
  _school_id uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _role text DEFAULT NULL,
  _approved boolean DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
) RETURNS TABLE(
  user_id uuid, profile_id uuid, full_name text, role text, intended_role text,
  is_approved boolean, school_id uuid, school_name text, phone text,
  email text, providers jsonb, created_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed_at timestamptz, discipline_status text, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT p.*, s.name AS s_name
    FROM profiles p
    LEFT JOIN schools s ON s.id = p.school_id
    WHERE (_school_id IS NULL OR p.school_id = _school_id)
      AND (_role IS NULL OR p.role = _role)
      AND (_approved IS NULL OR p.is_approved = _approved)
      AND (_search IS NULL OR p.full_name ILIKE '%'||_search||'%' OR p.phone ILIKE '%'||_search||'%')
  ),
  total AS (SELECT count(*) AS c FROM base)
  SELECT b.user_id, b.id, b.full_name, b.role, b.intended_role,
         b.is_approved, b.school_id, b.s_name, b.phone,
         u.email::text,
         COALESCE(u.raw_app_meta_data->'providers', '[]'::jsonb),
         u.created_at, u.last_sign_in_at, u.email_confirmed_at,
         b.discipline_status,
         (SELECT c FROM total)
  FROM base b
  LEFT JOIN auth.users u ON u.id = b.user_id
  ORDER BY b.full_name
  LIMIT _limit OFFSET _offset;
END;
$$;

-- Detalhe completo do usuário (Nível 3)
CREATE OR REPLACE FUNCTION public.admin_get_user_console(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;
  SELECT jsonb_build_object(
    'profile', to_jsonb(p) - 'signature_url',
    'school', to_jsonb(s),
    'auth', jsonb_build_object(
      'email', u.email,
      'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed_at', u.email_confirmed_at,
      'providers', COALESCE(u.raw_app_meta_data->'providers','[]'::jsonb),
      'phone', u.phone
    ),
    'recent_actions', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC)
      FROM (
        SELECT action, table_name, record_id, created_at, school_id, new_data
        FROM audit_logs
        WHERE performed_by = _user_id OR record_id = _user_id::text
        ORDER BY created_at DESC LIMIT 50
      ) a
    ),'[]'::jsonb),
    'recent_bookings', COALESCE((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.booking_date DESC)
      FROM (
        SELECT id, booking_date, start_time, end_time, sector, status, topic
        FROM bookings WHERE user_id = _user_id
        ORDER BY booking_date DESC LIMIT 30
      ) b
    ),'[]'::jsonb),
    'recent_payments', COALESCE((
      SELECT jsonb_agg(to_jsonb(pg) ORDER BY pg.created_at DESC)
      FROM (
        SELECT id, plano, metodo, status, valor, created_at, approved_at
        FROM pagamentos WHERE user_id = _user_id
        ORDER BY created_at DESC LIMIT 20
      ) pg
    ),'[]'::jsonb)
  ) INTO v
  FROM profiles p
  LEFT JOIN schools s ON s.id = p.school_id
  LEFT JOIN auth.users u ON u.id = p.user_id
  WHERE p.user_id = _user_id;
  RETURN v;
END;
$$;

-- Logs de auditoria com filtros
CREATE OR REPLACE FUNCTION public.admin_list_audit_logs(
  _school_id uuid DEFAULT NULL,
  _user_id uuid DEFAULT NULL,
  _action text DEFAULT NULL,
  _table_name text DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
) RETURNS TABLE(
  id uuid, action text, table_name text, record_id text,
  old_data jsonb, new_data jsonb, performed_by uuid,
  performed_by_name text, school_id uuid, school_name text,
  created_at timestamptz, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT l.* FROM audit_logs l
    WHERE (_school_id IS NULL OR l.school_id = _school_id)
      AND (_user_id IS NULL OR l.performed_by = _user_id OR l.record_id = _user_id::text)
      AND (_action IS NULL OR l.action = _action)
      AND (_table_name IS NULL OR l.table_name = _table_name)
      AND (_from IS NULL OR l.created_at >= _from)
      AND (_to IS NULL OR l.created_at <= _to)
  ),
  total AS (SELECT count(*) AS c FROM base)
  SELECT b.id, b.action, b.table_name, b.record_id,
         b.old_data, b.new_data, b.performed_by,
         (SELECT full_name FROM profiles WHERE user_id = b.performed_by LIMIT 1),
         b.school_id,
         (SELECT name FROM schools WHERE id = b.school_id LIMIT 1),
         b.created_at,
         (SELECT c FROM total)
  FROM base b
  ORDER BY b.created_at DESC
  LIMIT _limit OFFSET _offset;
END;
$$;

-- Aprovar/reprovar usuário (auditado)
CREATE OR REPLACE FUNCTION public.admin_set_user_approval(
  _user_id uuid, _approved boolean, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_old jsonb; v_new jsonb; v_school uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  SELECT to_jsonb(p), p.school_id INTO v_old, v_school FROM profiles p WHERE p.user_id = _user_id;
  UPDATE profiles SET is_approved = _approved, updated_at = now() WHERE user_id = _user_id
  RETURNING to_jsonb(profiles.*) INTO v_new;
  PERFORM public.admin_log_action(
    CASE WHEN _approved THEN 'admin_approve_user' ELSE 'admin_reject_user' END,
    v_school, _user_id::text, 'profiles', v_old, v_new, _reason
  );
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Alterar função (auditado)
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  _user_id uuid, _role text, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_old jsonb; v_new jsonb; v_school uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  SELECT to_jsonb(p), p.school_id INTO v_old, v_school FROM profiles p WHERE p.user_id = _user_id;
  UPDATE profiles SET role = _role, updated_at = now() WHERE user_id = _user_id
  RETURNING to_jsonb(profiles.*) INTO v_new;
  PERFORM public.admin_log_action('admin_set_user_role', v_school, _user_id::text, 'profiles', v_old, v_new, _reason);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Bloquear/desbloquear via discipline_status (auditado)
CREATE OR REPLACE FUNCTION public.admin_set_user_blocked(
  _user_id uuid, _blocked boolean, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_old jsonb; v_new jsonb; v_school uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  SELECT to_jsonb(p), p.school_id INTO v_old, v_school FROM profiles p WHERE p.user_id = _user_id;
  IF _blocked THEN
    UPDATE profiles SET discipline_status='blocked_manager', discipline_blocked_at=now(), updated_at=now()
    WHERE user_id = _user_id RETURNING to_jsonb(profiles.*) INTO v_new;
  ELSE
    UPDATE profiles SET discipline_status='ok', discipline_blocked_at=NULL, updated_at=now()
    WHERE user_id = _user_id RETURNING to_jsonb(profiles.*) INTO v_new;
  END IF;
  PERFORM public.admin_log_action(
    CASE WHEN _blocked THEN 'admin_block_user' ELSE 'admin_unblock_user' END,
    v_school, _user_id::text, 'profiles', v_old, v_new, _reason
  );
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Corrigir assinatura da escola (auditado)
CREATE OR REPLACE FUNCTION public.admin_fix_school_subscription(
  _school_id uuid, _status text, _end_date date, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_old jsonb; v_new jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  SELECT to_jsonb(s) INTO v_old FROM schools s WHERE s.id = _school_id;
  UPDATE schools SET subscription_status = COALESCE(_status, subscription_status),
                     subscription_end_date = COALESCE(_end_date, subscription_end_date)
  WHERE id = _school_id
  RETURNING to_jsonb(schools.*) INTO v_new;
  PERFORM public.admin_log_action('admin_fix_school_subscription', _school_id, _school_id::text, 'schools', v_old, v_new, _reason);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Registra impersonação (start/end)
CREATE OR REPLACE FUNCTION public.admin_log_impersonation(
  _school_id uuid, _phase text, _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;
  IF _phase NOT IN ('start','end') THEN
    RAISE EXCEPTION 'invalid_phase';
  END IF;
  PERFORM public.admin_log_action(
    CASE WHEN _phase='start' THEN 'admin_impersonation_start' ELSE 'admin_impersonation_end' END,
    _school_id, _school_id::text, 'schools', NULL,
    jsonb_build_object('school_id', _school_id), _reason
  );
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- GRANTS — todas as funções acessíveis apenas a usuários autenticados;
-- a checagem de admin acontece dentro de cada função.
REVOKE ALL ON FUNCTION public.admin_log_action(text,uuid,text,text,jsonb,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_global_kpis() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_schools_console(text,text,text,text,text,int,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users_with_auth(uuid,text,text,boolean,int,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_user_console(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_audit_logs(uuid,uuid,text,text,timestamptz,timestamptz,int,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_approval(uuid,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_blocked(uuid,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_fix_school_subscription(uuid,text,date,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_log_impersonation(uuid,text,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_log_action(text,uuid,text,text,jsonb,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_global_kpis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_schools_console(text,text,text,text,text,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users_with_auth(uuid,text,text,boolean,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_console(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_logs(uuid,uuid,text,text,timestamptz,timestamptz,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_approval(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_blocked(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fix_school_subscription(uuid,text,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_log_impersonation(uuid,text,text) TO authenticated;
