DROP FUNCTION IF EXISTS public.get_painel_tv_data(uuid);

GRANT EXECUTE ON FUNCTION public.get_painel_tv_data(uuid, smallint) TO anon, authenticated, service_role;