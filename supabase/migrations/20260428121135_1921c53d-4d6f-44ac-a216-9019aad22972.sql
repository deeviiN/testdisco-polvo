
REVOKE EXECUTE ON FUNCTION public.liberar_assinatura(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.liberar_assinatura(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_assinatura() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_assinatura() TO authenticated, service_role;
