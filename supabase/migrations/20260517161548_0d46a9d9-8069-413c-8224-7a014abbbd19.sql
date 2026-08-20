REVOKE EXECUTE ON FUNCTION public.cleanup_push_subscription(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_push_subscription(text) TO service_role;