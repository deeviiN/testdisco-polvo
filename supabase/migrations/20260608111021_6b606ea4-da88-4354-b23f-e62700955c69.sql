CREATE OR REPLACE FUNCTION public.get_school_public_info(_school_id uuid)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text, network text, is_active boolean, logo_url text, address text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private_api'
AS $function$ SELECT * FROM private_api.get_school_public_info(_school_id); $function$;
GRANT EXECUTE ON FUNCTION public.get_school_public_info(uuid) TO anon, authenticated, service_role;