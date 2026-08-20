
CREATE OR REPLACE FUNCTION public.admin_purge_contracts(_school_id uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_contracts int := 0; v_gestores int := 0; v_schools int := 0;
  v_assinaturas int := 0; v_pagamentos int := 0; v_notifs int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;

  DELETE FROM public.signed_contracts
   WHERE _school_id IS NULL OR school_id = _school_id;
  GET DIAGNOSTICS v_contracts = ROW_COUNT;

  DELETE FROM public.inbox_requests
   WHERE type IN ('contrato_assinado','contrato_admin_assinou','contrato_aguardando_gestor')
     AND (_school_id IS NULL OR school_id = _school_id);

  DELETE FROM public.assinaturas
   WHERE _school_id IS NULL OR school_id = _school_id;
  GET DIAGNOSTICS v_assinaturas = ROW_COUNT;

  DELETE FROM public.pagamentos
   WHERE _school_id IS NULL OR school_id = _school_id;
  GET DIAGNOSTICS v_pagamentos = ROW_COUNT;

  DELETE FROM public.subscription_notifications
   WHERE _school_id IS NULL OR school_id = _school_id;
  GET DIAGNOSTICS v_notifs = ROW_COUNT;

  -- Volta a escola para o estado de trial
  UPDATE public.schools
     SET subscription_status = 'trial',
         subscription_end_date = NULL,
         is_active = true
   WHERE _school_id IS NULL OR id = _school_id;
  GET DIAGNOSTICS v_schools = ROW_COUNT;

  -- Recoloca gestores em trial (10 dias)
  UPDATE public.profiles
     SET approved_until = now() + interval '10 days',
         subscription_deadline = NULL,
         subscription_blocked_at = NULL,
         updated_at = now()
   WHERE role IN ('gestor_pedagogico','chef_projeto_vida')
     AND (_school_id IS NULL OR school_id = _school_id);
  GET DIAGNOSTICS v_gestores = ROW_COUNT;

  PERFORM public.admin_log_action(
    'admin_purge_contracts', _school_id, NULL, 'signed_contracts', NULL,
    jsonb_build_object(
      'contracts_deleted', v_contracts,
      'assinaturas_deleted', v_assinaturas,
      'pagamentos_deleted', v_pagamentos,
      'schools_reset', v_schools,
      'gestores_reset', v_gestores,
      'notifications_deleted', v_notifs
    ),
    'reset_contratos_teste'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'contracts_deleted', v_contracts,
    'assinaturas_deleted', v_assinaturas,
    'pagamentos_deleted', v_pagamentos,
    'schools_reset', v_schools,
    'gestores_reset', v_gestores
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_purge_contracts(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_purge_profiles(_school_id uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_profiles int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;

  -- Dados ligados a usuários/escola que dependem dos profiles
  DELETE FROM public.bookings                  WHERE _school_id IS NULL OR school_id = _school_id;
  DELETE FROM public.booking_usage             WHERE _school_id IS NULL OR school_id = _school_id;
  DELETE FROM public.booking_gestor_history    WHERE _school_id IS NULL OR school_id = _school_id;
  DELETE FROM public.user_infractions          WHERE _school_id IS NULL OR school_id = _school_id;
  DELETE FROM public.inbox_requests            WHERE _school_id IS NULL OR school_id = _school_id;
  DELETE FROM public.direct_messages           WHERE _school_id IS NULL OR school_id = _school_id;
  DELETE FROM public.profile_approval_decisions WHERE _school_id IS NULL OR school_id = _school_id;
  DELETE FROM public.responsibility_transfers  WHERE _school_id IS NULL OR school_id = _school_id;
  DELETE FROM public.teacher_presence          WHERE _school_id IS NULL OR school_id = _school_id;
  DELETE FROM public.teacher_roster_presence   WHERE _school_id IS NULL OR school_id = _school_id;
  DELETE FROM public.teacher_roster            WHERE _school_id IS NULL OR school_id = _school_id;
  DELETE FROM public.assistant_classes         WHERE _school_id IS NULL OR school_id = _school_id;
  DELETE FROM public.assistant_transfer_logs   WHERE _school_id IS NULL OR school_id = _school_id;
  DELETE FROM public.school_messages           WHERE _school_id IS NULL OR school_id = _school_id;
  DELETE FROM public.school_transfer_requests  WHERE _school_id IS NULL OR to_school_id = _school_id OR from_school_id = _school_id;

  DELETE FROM public.profiles p
   WHERE NOT public.has_role(p.user_id,'admin')
     AND (_school_id IS NULL OR p.school_id = _school_id);
  GET DIAGNOSTICS v_profiles = ROW_COUNT;

  PERFORM public.admin_log_action(
    'admin_purge_profiles', _school_id, NULL, 'profiles', NULL,
    jsonb_build_object('profiles_deleted', v_profiles),
    'reset_cadastros_teste'
  );

  RETURN jsonb_build_object('ok', true, 'profiles_deleted', v_profiles);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_purge_profiles(uuid) TO authenticated;
