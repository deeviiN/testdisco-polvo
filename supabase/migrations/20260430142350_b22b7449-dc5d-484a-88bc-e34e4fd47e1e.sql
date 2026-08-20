
CREATE OR REPLACE FUNCTION public.get_security_definer_functions()
RETURNS TABLE(name text, anon boolean, auth boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as name,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef = true;
$$;

-- Revogar acesso de todos e permitir apenas service_role
REVOKE EXECUTE ON FUNCTION public.get_security_definer_functions() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_security_definer_functions() TO service_role;
