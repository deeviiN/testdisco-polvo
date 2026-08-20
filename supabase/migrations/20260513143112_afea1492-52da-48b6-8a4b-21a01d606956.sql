REVOKE ALL ON FUNCTION public.inbox_on_booking_decision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inbox_on_booking_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inbox_on_profile_approved() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inbox_on_profile_pending() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inbox_on_signed_contract() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inbox_on_transfer_decision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inbox_on_transfer_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_gestores_admin_contract_signed() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.activate_school_subscription(_school_id uuid, _new_end_date date) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.activate_school_subscription(_school_id uuid, _new_end_date date)
RETURNS void LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.activate_school_subscription(_school_id, _new_end_date) $$;
REVOKE ALL ON FUNCTION public.activate_school_subscription(_school_id uuid, _new_end_date date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_school_subscription(_school_id uuid, _new_end_date date) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.activate_school_subscription(_school_id uuid, _new_end_date date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.activate_school_subscription(_school_id uuid, _new_end_date date) TO anon, authenticated, service_role;

ALTER FUNCTION public.admin_approve_gestor_trial(_profile_id uuid) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.admin_approve_gestor_trial(_profile_id uuid)
RETURNS profiles LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.admin_approve_gestor_trial(_profile_id) $$;
REVOKE ALL ON FUNCTION public.admin_approve_gestor_trial(_profile_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_gestor_trial(_profile_id uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.admin_approve_gestor_trial(_profile_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.admin_approve_gestor_trial(_profile_id uuid) TO anon, authenticated, service_role;

ALTER FUNCTION public.admin_log_profile_deletion(_profile_id uuid, _user_id uuid, _full_name text, _reason text) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.admin_log_profile_deletion(_profile_id uuid, _user_id uuid, _full_name text, _reason text DEFAULT NULL::text)
RETURNS void LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.admin_log_profile_deletion(_profile_id, _user_id, _full_name, _reason) $$;
REVOKE ALL ON FUNCTION public.admin_log_profile_deletion(_profile_id uuid, _user_id uuid, _full_name text, _reason text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_log_profile_deletion(_profile_id uuid, _user_id uuid, _full_name text, _reason text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.admin_log_profile_deletion(_profile_id uuid, _user_id uuid, _full_name text, _reason text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.admin_log_profile_deletion(_profile_id uuid, _user_id uuid, _full_name text, _reason text) TO anon, authenticated, service_role;

ALTER FUNCTION public.admin_revoke_profile_access(_profile_id uuid, _reason text) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.admin_revoke_profile_access(_profile_id uuid, _reason text DEFAULT NULL::text)
RETURNS profiles LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.admin_revoke_profile_access(_profile_id, _reason) $$;
REVOKE ALL ON FUNCTION public.admin_revoke_profile_access(_profile_id uuid, _reason text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_profile_access(_profile_id uuid, _reason text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.admin_revoke_profile_access(_profile_id uuid, _reason text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.admin_revoke_profile_access(_profile_id uuid, _reason text) TO anon, authenticated, service_role;

ALTER FUNCTION public.admin_unlink_self_profile() SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.admin_unlink_self_profile()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.admin_unlink_self_profile() $$;
REVOKE ALL ON FUNCTION public.admin_unlink_self_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_unlink_self_profile() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.admin_unlink_self_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.admin_unlink_self_profile() TO anon, authenticated, service_role;

ALTER FUNCTION public.approve_school_transfer(_request_id uuid, _note text) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.approve_school_transfer(_request_id uuid, _note text DEFAULT NULL::text)
RETURNS school_transfer_requests LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.approve_school_transfer(_request_id, _note) $$;
REVOKE ALL ON FUNCTION public.approve_school_transfer(_request_id uuid, _note text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_school_transfer(_request_id uuid, _note text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.approve_school_transfer(_request_id uuid, _note text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.approve_school_transfer(_request_id uuid, _note text) TO anon, authenticated, service_role;

ALTER FUNCTION public.broadcast_app_refresh() SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.broadcast_app_refresh()
RETURNS void LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.broadcast_app_refresh() $$;
REVOKE ALL ON FUNCTION public.broadcast_app_refresh() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broadcast_app_refresh() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.broadcast_app_refresh() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.broadcast_app_refresh() TO anon, authenticated, service_role;

ALTER FUNCTION public.bulk_set_schools_status(_status text) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.bulk_set_schools_status(_status text)
RETURNS SETOF jsonb LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.bulk_set_schools_status(_status) $$;
REVOKE ALL ON FUNCTION public.bulk_set_schools_status(_status text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_set_schools_status(_status text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.bulk_set_schools_status(_status text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.bulk_set_schools_status(_status text) TO anon, authenticated, service_role;

ALTER FUNCTION public.cleanup_old_health_checks() SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.cleanup_old_health_checks()
RETURNS void LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.cleanup_old_health_checks() $$;
REVOKE ALL ON FUNCTION public.cleanup_old_health_checks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_health_checks() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.cleanup_old_health_checks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.cleanup_old_health_checks() TO anon, authenticated, service_role;

ALTER FUNCTION public.cleanup_old_linter_reports() SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.cleanup_old_linter_reports()
RETURNS void LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.cleanup_old_linter_reports() $$;
REVOKE ALL ON FUNCTION public.cleanup_old_linter_reports() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_linter_reports() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.cleanup_old_linter_reports() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.cleanup_old_linter_reports() TO anon, authenticated, service_role;

ALTER FUNCTION public.ensure_admin_profile() SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.ensure_admin_profile()
RETURNS profiles LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.ensure_admin_profile() $$;
REVOKE ALL ON FUNCTION public.ensure_admin_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_admin_profile() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.ensure_admin_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.ensure_admin_profile() TO anon, authenticated, service_role;

ALTER FUNCTION public.get_admin_dashboard_counts() SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_counts()
RETURNS TABLE(total_users bigint, approved_users bigint, pending_users bigint, total_schools bigint, total_bookings bigint, subscribed_schools bigint) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.get_admin_dashboard_counts() $$;
REVOKE ALL ON FUNCTION public.get_admin_dashboard_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_counts() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.get_admin_dashboard_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.get_admin_dashboard_counts() TO anon, authenticated, service_role;

ALTER FUNCTION public.get_mp_force_test_mode() SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.get_mp_force_test_mode()
RETURNS boolean LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.get_mp_force_test_mode() $$;
REVOKE ALL ON FUNCTION public.get_mp_force_test_mode() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mp_force_test_mode() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.get_mp_force_test_mode() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.get_mp_force_test_mode() TO anon, authenticated, service_role;

ALTER FUNCTION public.get_my_assinatura() SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.get_my_assinatura()
RETURNS assinaturas LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.get_my_assinatura() $$;
REVOKE ALL ON FUNCTION public.get_my_assinatura() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_assinatura() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.get_my_assinatura() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.get_my_assinatura() TO anon, authenticated, service_role;

ALTER FUNCTION public.get_my_latest_decision() SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.get_my_latest_decision()
RETURNS profile_approval_decisions LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.get_my_latest_decision() $$;
REVOKE ALL ON FUNCTION public.get_my_latest_decision() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_latest_decision() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.get_my_latest_decision() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.get_my_latest_decision() TO anon, authenticated, service_role;

ALTER FUNCTION public.get_my_subscription_deadline() SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.get_my_subscription_deadline()
RETURNS TABLE(subscription_deadline timestamp with time zone, days_remaining integer, grace_period_days integer, is_blocked boolean, in_grace boolean, school_name text, school_phone text) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.get_my_subscription_deadline() $$;
REVOKE ALL ON FUNCTION public.get_my_subscription_deadline() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_subscription_deadline() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.get_my_subscription_deadline() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.get_my_subscription_deadline() TO anon, authenticated, service_role;

ALTER FUNCTION public.get_my_trial_status() SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.get_my_trial_status()
RETURNS TABLE(is_approved boolean, approved_until timestamp with time zone, trial_expired boolean, school_subscription_status text, school_subscription_end_date date, subscription_source text) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.get_my_trial_status() $$;
REVOKE ALL ON FUNCTION public.get_my_trial_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_trial_status() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.get_my_trial_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.get_my_trial_status() TO anon, authenticated, service_role;

ALTER FUNCTION public.get_plan_migration_quote(_school_id uuid) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.get_plan_migration_quote(_school_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(school_id uuid, valor_mensal numeric, meses_ciclo integer, meses_pagos integer, meses_restantes integer, valor_total numeric, cycle_start timestamp with time zone) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.get_plan_migration_quote(_school_id) $$;
REVOKE ALL ON FUNCTION public.get_plan_migration_quote(_school_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_plan_migration_quote(_school_id uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.get_plan_migration_quote(_school_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.get_plan_migration_quote(_school_id uuid) TO anon, authenticated, service_role;

ALTER FUNCTION public.get_school_access_info(_school_id uuid) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.get_school_access_info(_school_id uuid)
RETURNS TABLE(access_level text, subscription_status text, subscription_end_date date, grace_period_days integer, days_remaining integer) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.get_school_access_info(_school_id) $$;
REVOKE ALL ON FUNCTION public.get_school_access_info(_school_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_access_info(_school_id uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.get_school_access_info(_school_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.get_school_access_info(_school_id uuid) TO anon, authenticated, service_role;

ALTER FUNCTION public.get_school_access_level(_school_id uuid) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.get_school_access_level(_school_id uuid)
RETURNS text LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.get_school_access_level(_school_id) $$;
REVOKE ALL ON FUNCTION public.get_school_access_level(_school_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_access_level(_school_id uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.get_school_access_level(_school_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.get_school_access_level(_school_id uuid) TO anon, authenticated, service_role;

ALTER FUNCTION public.get_school_subscription_admin(_school_id uuid) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.get_school_subscription_admin(_school_id uuid)
RETURNS TABLE(subscription_status text, subscription_end_date date, grace_period_days integer) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.get_school_subscription_admin(_school_id) $$;
REVOKE ALL ON FUNCTION public.get_school_subscription_admin(_school_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_subscription_admin(_school_id uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.get_school_subscription_admin(_school_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.get_school_subscription_admin(_school_id uuid) TO anon, authenticated, service_role;

ALTER FUNCTION public.get_user_school_id(_user_id uuid) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.get_user_school_id(_user_id uuid)
RETURNS uuid LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.get_user_school_id(_user_id) $$;
REVOKE ALL ON FUNCTION public.get_user_school_id(_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_school_id(_user_id uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.get_user_school_id(_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.get_user_school_id(_user_id uuid) TO anon, authenticated, service_role;

ALTER FUNCTION public.has_role(_user_id uuid, _role app_role) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.has_role(_user_id, _role) $$;
REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.has_role(_user_id uuid, _role app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.has_role(_user_id uuid, _role app_role) TO anon, authenticated, service_role;

ALTER FUNCTION public.is_chef_of_school(_user_id uuid, _school_id uuid) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.is_chef_of_school(_user_id uuid, _school_id uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.is_chef_of_school(_user_id, _school_id) $$;
REVOKE ALL ON FUNCTION public.is_chef_of_school(_user_id uuid, _school_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_chef_of_school(_user_id uuid, _school_id uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.is_chef_of_school(_user_id uuid, _school_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.is_chef_of_school(_user_id uuid, _school_id uuid) TO anon, authenticated, service_role;

ALTER FUNCTION public.is_user_approved(_uid uuid) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.is_user_approved(_uid uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.is_user_approved(_uid) $$;
REVOKE ALL ON FUNCTION public.is_user_approved(_uid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_user_approved(_uid uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.is_user_approved(_uid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.is_user_approved(_uid uuid) TO anon, authenticated, service_role;

ALTER FUNCTION public.list_expiring_schools_admin(_limit integer, _offset integer) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.list_expiring_schools_admin(_limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text, network text, is_active boolean, subscription_status text, subscription_end_date timestamp with time zone, days_left integer) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.list_expiring_schools_admin(_limit, _offset) $$;
REVOKE ALL ON FUNCTION public.list_expiring_schools_admin(_limit integer, _offset integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_expiring_schools_admin(_limit integer, _offset integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.list_expiring_schools_admin(_limit integer, _offset integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.list_expiring_schools_admin(_limit integer, _offset integer) TO anon, authenticated, service_role;

ALTER FUNCTION public.list_prospect_schools_admin(_limit integer, _offset integer) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.list_prospect_schools_admin(_limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text, network text, is_active boolean, subscription_status text, created_at timestamp with time zone) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.list_prospect_schools_admin(_limit, _offset) $$;
REVOKE ALL ON FUNCTION public.list_prospect_schools_admin(_limit integer, _offset integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_prospect_schools_admin(_limit integer, _offset integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.list_prospect_schools_admin(_limit integer, _offset integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.list_prospect_schools_admin(_limit integer, _offset integer) TO anon, authenticated, service_role;

ALTER FUNCTION public.list_school_cities_admin(_state text) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.list_school_cities_admin(_state text)
RETURNS TABLE(city text, school_count bigint) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.list_school_cities_admin(_state) $$;
REVOKE ALL ON FUNCTION public.list_school_cities_admin(_state text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_school_cities_admin(_state text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.list_school_cities_admin(_state text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.list_school_cities_admin(_state text) TO anon, authenticated, service_role;

ALTER FUNCTION public.list_school_states_admin() SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.list_school_states_admin()
RETURNS TABLE(state text, school_count bigint) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.list_school_states_admin() $$;
REVOKE ALL ON FUNCTION public.list_school_states_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_school_states_admin() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.list_school_states_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.list_school_states_admin() TO anon, authenticated, service_role;

ALTER FUNCTION public.list_schools_admin() SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.list_schools_admin()
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text, network text, is_active boolean, logo_url text, address text, created_at timestamp with time zone, subscription_status text, subscription_end_date date, grace_period_days integer) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.list_schools_admin() $$;
REVOKE ALL ON FUNCTION public.list_schools_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_schools_admin() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.list_schools_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.list_schools_admin() TO anon, authenticated, service_role;

ALTER FUNCTION public.list_schools_admin_paginated(_state text, _city text, _network text, _search text, _limit integer, _offset integer) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.list_schools_admin_paginated(_state text DEFAULT NULL::text, _city text DEFAULT NULL::text, _network text DEFAULT NULL::text, _search text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text, network text, is_active boolean, logo_url text, address text, created_at timestamp with time zone, subscription_status text, subscription_end_date date, grace_period_days integer, total_count bigint) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.list_schools_admin_paginated(_state, _city, _network, _search, _limit, _offset) $$;
REVOKE ALL ON FUNCTION public.list_schools_admin_paginated(_state text, _city text, _network text, _search text, _limit integer, _offset integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_schools_admin_paginated(_state text, _city text, _network text, _search text, _limit integer, _offset integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.list_schools_admin_paginated(_state text, _city text, _network text, _search text, _limit integer, _offset integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.list_schools_admin_paginated(_state text, _city text, _network text, _search text, _limit integer, _offset integer) TO anon, authenticated, service_role;

ALTER FUNCTION public.list_schools_deadlines_admin() SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.list_schools_deadlines_admin()
RETURNS TABLE(school_id uuid, school_name text, city text, state text, network text, gestor_name text, gestor_phone text, gestor_email text, subscription_deadline timestamp with time zone, days_remaining integer, status text) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.list_schools_deadlines_admin() $$;
REVOKE ALL ON FUNCTION public.list_schools_deadlines_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_schools_deadlines_admin() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.list_schools_deadlines_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.list_schools_deadlines_admin() TO anon, authenticated, service_role;

ALTER FUNCTION public.list_schools_simple(_search text, _limit integer, _offset integer) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.list_schools_simple(_search text DEFAULT NULL::text, _limit integer DEFAULT 100, _offset integer DEFAULT 0)
RETURNS TABLE(id uuid, nome text, cidade text) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.list_schools_simple(_search, _limit, _offset) $$;
REVOKE ALL ON FUNCTION public.list_schools_simple(_search text, _limit integer, _offset integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_schools_simple(_search text, _limit integer, _offset integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.list_schools_simple(_search text, _limit integer, _offset integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.list_schools_simple(_search text, _limit integer, _offset integer) TO anon, authenticated, service_role;

ALTER FUNCTION public.list_schools_simple_filtered(_state text, _city text, _network text, _search text, _limit integer, _offset integer) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.list_schools_simple_filtered(_state text DEFAULT NULL::text, _city text DEFAULT NULL::text, _network text DEFAULT NULL::text, _search text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS TABLE(id uuid, nome text, cidade text, total_count bigint) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.list_schools_simple_filtered(_state, _city, _network, _search, _limit, _offset) $$;
REVOKE ALL ON FUNCTION public.list_schools_simple_filtered(_state text, _city text, _network text, _search text, _limit integer, _offset integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_schools_simple_filtered(_state text, _city text, _network text, _search text, _limit integer, _offset integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.list_schools_simple_filtered(_state text, _city text, _network text, _search text, _limit integer, _offset integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.list_schools_simple_filtered(_state text, _city text, _network text, _search text, _limit integer, _offset integer) TO anon, authenticated, service_role;

ALTER FUNCTION public.list_subscribed_schools_admin(_limit integer, _offset integer) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.list_subscribed_schools_admin(_limit integer DEFAULT 1000, _offset integer DEFAULT 0)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text, network text, is_active boolean, subscription_status text, subscription_end_date timestamp with time zone, grace_period_days integer) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.list_subscribed_schools_admin(_limit, _offset) $$;
REVOKE ALL ON FUNCTION public.list_subscribed_schools_admin(_limit integer, _offset integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_subscribed_schools_admin(_limit integer, _offset integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.list_subscribed_schools_admin(_limit integer, _offset integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.list_subscribed_schools_admin(_limit integer, _offset integer) TO anon, authenticated, service_role;

ALTER FUNCTION public.list_subscription_notifications_admin() SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.list_subscription_notifications_admin()
RETURNS TABLE(id uuid, school_id uuid, school_name text, channel text, event_type text, recipient text, subject text, message text, status text, error_message text, scheduled_at timestamp with time zone, sent_at timestamp with time zone, created_at timestamp with time zone) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.list_subscription_notifications_admin() $$;
REVOKE ALL ON FUNCTION public.list_subscription_notifications_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_subscription_notifications_admin() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.list_subscription_notifications_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.list_subscription_notifications_admin() TO anon, authenticated, service_role;

ALTER FUNCTION public.log_client_error(_rpc text, _code text, _message text, _details text, _hint text, _context text) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.log_client_error(_rpc text, _code text DEFAULT NULL::text, _message text DEFAULT NULL::text, _details text DEFAULT NULL::text, _hint text DEFAULT NULL::text, _context text DEFAULT NULL::text)
RETURNS uuid LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.log_client_error(_rpc, _code, _message, _details, _hint, _context) $$;
REVOKE ALL ON FUNCTION public.log_client_error(_rpc text, _code text, _message text, _details text, _hint text, _context text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_client_error(_rpc text, _code text, _message text, _details text, _hint text, _context text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.log_client_error(_rpc text, _code text, _message text, _details text, _hint text, _context text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.log_client_error(_rpc text, _code text, _message text, _details text, _hint text, _context text) TO anon, authenticated, service_role;

ALTER FUNCTION public.manager_decide_profile(_profile_id uuid, _decision text, _reason text, _approve_as_intended boolean) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.manager_decide_profile(_profile_id uuid, _decision text, _reason text DEFAULT NULL::text, _approve_as_intended boolean DEFAULT false)
RETURNS profile_approval_decisions LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.manager_decide_profile(_profile_id, _decision, _reason, _approve_as_intended) $$;
REVOKE ALL ON FUNCTION public.manager_decide_profile(_profile_id uuid, _decision text, _reason text, _approve_as_intended boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manager_decide_profile(_profile_id uuid, _decision text, _reason text, _approve_as_intended boolean) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.manager_decide_profile(_profile_id uuid, _decision text, _reason text, _approve_as_intended boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.manager_decide_profile(_profile_id uuid, _decision text, _reason text, _approve_as_intended boolean) TO anon, authenticated, service_role;

ALTER FUNCTION public.notify_school_gestores_communique(_school_id uuid, _author_name text, _author_role text, _booking_id uuid, _summary text) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.notify_school_gestores_communique(_school_id uuid, _author_name text, _author_role text, _booking_id uuid, _summary text)
RETURNS integer LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.notify_school_gestores_communique(_school_id, _author_name, _author_role, _booking_id, _summary) $$;
REVOKE ALL ON FUNCTION public.notify_school_gestores_communique(_school_id uuid, _author_name text, _author_role text, _booking_id uuid, _summary text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_school_gestores_communique(_school_id uuid, _author_name text, _author_role text, _booking_id uuid, _summary text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.notify_school_gestores_communique(_school_id uuid, _author_name text, _author_role text, _booking_id uuid, _summary text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.notify_school_gestores_communique(_school_id uuid, _author_name text, _author_role text, _booking_id uuid, _summary text) TO anon, authenticated, service_role;

ALTER FUNCTION public.preview_bulk_set_schools_status(_status text) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.preview_bulk_set_schools_status(_status text)
RETURNS TABLE(total_schools integer, would_update integer, preserved_subscribers integer, already_in_status integer) LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT * FROM private_api.preview_bulk_set_schools_status(_status) $$;
REVOKE ALL ON FUNCTION public.preview_bulk_set_schools_status(_status text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_bulk_set_schools_status(_status text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.preview_bulk_set_schools_status(_status text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.preview_bulk_set_schools_status(_status text) TO anon, authenticated, service_role;

ALTER FUNCTION public.reject_school_transfer(_request_id uuid, _note text) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.reject_school_transfer(_request_id uuid, _note text DEFAULT NULL::text)
RETURNS school_transfer_requests LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.reject_school_transfer(_request_id, _note) $$;
REVOKE ALL ON FUNCTION public.reject_school_transfer(_request_id uuid, _note text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_school_transfer(_request_id uuid, _note text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.reject_school_transfer(_request_id uuid, _note text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.reject_school_transfer(_request_id uuid, _note text) TO anon, authenticated, service_role;

ALTER FUNCTION public.set_minimum_supported_version(_version text, _build_time bigint) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.set_minimum_supported_version(_version text, _build_time bigint)
RETURNS app_version_manifest LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.set_minimum_supported_version(_version, _build_time) $$;
REVOKE ALL ON FUNCTION public.set_minimum_supported_version(_version text, _build_time bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_minimum_supported_version(_version text, _build_time bigint) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.set_minimum_supported_version(_version text, _build_time bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.set_minimum_supported_version(_version text, _build_time bigint) TO anon, authenticated, service_role;

ALTER FUNCTION public.set_mp_force_test_mode(_enabled boolean) SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.set_mp_force_test_mode(_enabled boolean)
RETURNS boolean LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.set_mp_force_test_mode(_enabled) $$;
REVOKE ALL ON FUNCTION public.set_mp_force_test_mode(_enabled boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_mp_force_test_mode(_enabled boolean) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_api.set_mp_force_test_mode(_enabled boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_api.set_mp_force_test_mode(_enabled boolean) TO anon, authenticated, service_role;

ALTER FUNCTION public.sync_gestor_subscription_deadlines() SET SCHEMA private_api;
CREATE OR REPLACE FUNCTION public.sync_gestor_subscription_deadlines()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER VOLATILE SET search_path = public, private_api
AS $$ SELECT private_api.sync_gestor_subscription_deadlines() $$;
REVOKE ALL ON FUNCTION public.sync_gestor_subscription_deadlines() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_gestor_subscription_deadlines() TO anon, authenticated, service_role;