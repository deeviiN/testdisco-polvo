REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_counts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_counts() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.list_subscribed_schools_admin(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_subscribed_schools_admin(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_subscribed_schools_admin(integer, integer) TO authenticated;