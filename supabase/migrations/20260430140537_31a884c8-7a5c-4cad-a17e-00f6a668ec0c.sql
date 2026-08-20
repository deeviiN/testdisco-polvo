-- Revogar acesso público (anon) das funções SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.list_expiring_schools_admin(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_expiring_schools_admin(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_subscribed_schools_admin(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_subscribed_schools_admin(integer, integer) FROM anon;

-- Garantir que apenas usuários autenticados possam executar (a verificação de admin é feita internamente)
GRANT EXECUTE ON FUNCTION public.list_expiring_schools_admin(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_subscribed_schools_admin(integer, integer) TO authenticated;
