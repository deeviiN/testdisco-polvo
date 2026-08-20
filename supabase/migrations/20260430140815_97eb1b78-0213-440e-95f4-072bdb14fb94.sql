-- =========================================================
-- PARTE 1: FIXAR search_path EM FUNÇÕES SEM CONFIGURAÇÃO
-- =========================================================
ALTER FUNCTION public.bulk_set_schools_status(text) SET search_path = public;
ALTER FUNCTION public.cleanup_old_health_checks() SET search_path = public;
ALTER FUNCTION public.get_school_subscription_countdown(uuid) SET search_path = public;
ALTER FUNCTION public.log_payment_status_change() SET search_path = public;

-- =========================================================
-- PARTE 2: REVOGAR ACESSO ANON DE FUNÇÕES PRIVADAS / ADMIN
-- (mantendo apenas as públicas usadas no cadastro)
-- =========================================================

-- Funções administrativas e de manipulação de dados sensíveis
REVOKE EXECUTE ON FUNCTION public.activate_school_subscription(uuid, date) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_approve_gestor_trial(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_log_profile_deletion(uuid, uuid, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_profile_access(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_unlink_self_profile() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_school_transfer(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bulk_set_schools_status(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_health_checks() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_admin_profile() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_counts() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_mp_force_test_mode() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_assinatura() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_latest_decision() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_trial_status() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_school_access_info(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_school_access_level(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_school_subscription_admin(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_school_subscription_countdown(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_school_id(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_chef_of_school(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.liberar_assinatura(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_expiring_schools_admin(integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_prospect_schools_admin(integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_school_cities_admin(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_school_states_admin() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_schools_admin() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_schools_admin_paginated(text, text, text, text, integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_subscribed_schools_admin(integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_client_error(text, text, text, text, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.manager_decide_profile(uuid, text, text, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.preview_bulk_set_schools_status(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_school_transfer(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_minimum_supported_version(text, bigint) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_mp_force_test_mode(boolean) FROM anon, PUBLIC;

-- =========================================================
-- PARTE 3: GARANTIR EXECUÇÃO PARA usuários AUTENTICADOS
-- =========================================================
GRANT EXECUTE ON FUNCTION public.activate_school_subscription(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_gestor_trial(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_log_profile_deletion(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_profile_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unlink_self_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_school_transfer(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_set_schools_status(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_admin_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mp_force_test_mode() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_assinatura() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_latest_decision() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_trial_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_school_access_info(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_school_access_level(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_school_subscription_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_school_subscription_countdown(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_school_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chef_of_school(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_assinatura(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_expiring_schools_admin(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_prospect_schools_admin(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_school_cities_admin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_school_states_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_schools_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_schools_admin_paginated(text, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_subscribed_schools_admin(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manager_decide_profile(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_bulk_set_schools_status(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_school_transfer(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_minimum_supported_version(text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_mp_force_test_mode(boolean) TO authenticated;
