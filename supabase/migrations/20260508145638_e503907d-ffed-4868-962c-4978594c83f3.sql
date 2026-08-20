
REVOKE EXECUTE ON FUNCTION public.get_my_subscription_deadline() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_subscription_deadline() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_schools_deadlines_admin() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.list_schools_deadlines_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_gestor_subscription_deadlines() FROM anon, public;
