-- Create private schema not exposed via PostgREST
CREATE SCHEMA IF NOT EXISTS private_api;
REVOKE ALL ON SCHEMA private_api FROM PUBLIC;
GRANT USAGE ON SCHEMA private_api TO anon, authenticated, service_role;

-- ===== Move definer implementations to private_api =====

CREATE OR REPLACE FUNCTION private_api.find_school_by_inep(_inep_code text, _network text DEFAULT NULL)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.name, s.city, s.state, s.inep_code
  FROM public.schools s
  WHERE s.inep_code = _inep_code
    AND s.is_active = true
    AND (_network IS NULL OR s.network = _network)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private_api.get_app_version_manifest()
RETURNS TABLE(minimum_supported_version text, minimum_supported_build_time bigint,
              latest_version text, latest_build_time bigint, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.minimum_supported_version, m.minimum_supported_build_time,
         m.latest_version, m.latest_build_time, m.updated_at
  FROM public.app_version_manifest m WHERE m.id = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private_api.get_school_bookings_public(_school_id uuid)
RETURNS TABLE(id uuid, booking_date date, start_time time, end_time time,
              sector text, event_type text, description text, topic text,
              discipline text, status text, user_full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT b.id, b.booking_date, b.start_time, b.end_time, b.sector, b.event_type,
         b.description, b.topic, b.discipline, b.status,
         COALESCE(p.full_name, 'Usuário')
  FROM public.bookings b
  LEFT JOIN public.profiles p ON p.user_id = b.user_id
  WHERE b.school_id = _school_id AND b.status = 'confirmed'
  ORDER BY b.booking_date ASC, b.start_time ASC LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION private_api.get_school_gestor_public(_school_id uuid)
RETURNS TABLE(full_name text, phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.full_name, p.phone FROM public.profiles p
  WHERE p.school_id = _school_id
    AND p.role IN ('gestor_pedagogico','chef_projeto_vida')
    AND p.is_approved = true
  ORDER BY CASE WHEN p.role='gestor_pedagogico' THEN 0 ELSE 1 END
  LIMIT 2;
$$;

CREATE OR REPLACE FUNCTION private_api.get_school_public_info(_school_id uuid)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text,
              network text, is_active boolean, logo_url text, address text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.name, s.city, s.state, s.inep_code, s.network,
         s.is_active, s.logo_url, s.address
  FROM public.schools s WHERE s.id = _school_id;
$$;

CREATE OR REPLACE FUNCTION private_api.list_school_cities(_state text)
RETURNS TABLE(city text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT s.city FROM public.schools s
  WHERE s.state = _state AND s.is_active = true ORDER BY s.city;
$$;

-- For list_school_cities_public / list_school_states_public, fetch their existing bodies
CREATE OR REPLACE FUNCTION private_api.list_school_cities_public(_state text, _network text DEFAULT NULL)
RETURNS TABLE(city text, school_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.city, COUNT(*)::bigint FROM public.schools s
  WHERE s.state = _state AND s.is_active = true
    AND (_network IS NULL OR s.network = _network)
  GROUP BY s.city ORDER BY s.city;
$$;

CREATE OR REPLACE FUNCTION private_api.list_school_states_public(_network text DEFAULT NULL)
RETURNS TABLE(state text, school_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.state, COUNT(*)::bigint FROM public.schools s
  WHERE s.is_active = true
    AND (_network IS NULL OR s.network = _network)
  GROUP BY s.state ORDER BY s.state;
$$;

CREATE OR REPLACE FUNCTION private_api.list_schools_by_location(_state text, _city text, _network text DEFAULT NULL)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text,
              network text, is_active boolean, logo_url text, address text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.name, s.city, s.state, s.inep_code, s.network,
         s.is_active, s.logo_url, s.address
  FROM public.schools s
  WHERE s.state = _state AND s.city = _city AND s.is_active = true
    AND (_network IS NULL OR s.network = _network)
  ORDER BY s.name;
$$;

CREATE OR REPLACE FUNCTION private_api.search_schools_public(search_query text)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text,
              network text, is_active boolean, logo_url text, address text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.name, s.city, s.state, s.inep_code, s.network,
         s.is_active, s.logo_url, s.address
  FROM public.schools s
  WHERE s.is_active = true
    AND (
      coalesce(search_query,'') = ''
      OR s.name ILIKE '%' || search_query || '%'
      OR s.city ILIKE '%' || search_query || '%'
      OR s.state ILIKE '%' || search_query || '%'
      OR coalesce(s.inep_code,'') ILIKE '%' || search_query || '%'
    )
  ORDER BY s.name LIMIT 30;
$$;

-- Grant EXECUTE on private definer fns to anon/auth (needed for wrapper invokers)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private_api TO anon, authenticated, service_role;

-- ===== Replace public definer fns with SECURITY INVOKER wrappers =====

CREATE OR REPLACE FUNCTION public.find_school_by_inep(_inep_code text, _network text DEFAULT NULL)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT * FROM private_api.find_school_by_inep(_inep_code, _network); $$;

CREATE OR REPLACE FUNCTION public.get_app_version_manifest()
RETURNS TABLE(minimum_supported_version text, minimum_supported_build_time bigint,
              latest_version text, latest_build_time bigint, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT * FROM private_api.get_app_version_manifest(); $$;

CREATE OR REPLACE FUNCTION public.get_school_bookings_public(_school_id uuid)
RETURNS TABLE(id uuid, booking_date date, start_time time, end_time time,
              sector text, event_type text, description text, topic text,
              discipline text, status text, user_full_name text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT * FROM private_api.get_school_bookings_public(_school_id); $$;

CREATE OR REPLACE FUNCTION public.get_school_gestor_public(_school_id uuid)
RETURNS TABLE(full_name text, phone text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT * FROM private_api.get_school_gestor_public(_school_id); $$;

CREATE OR REPLACE FUNCTION public.get_school_public_info(_school_id uuid)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text,
              network text, is_active boolean, logo_url text, address text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT * FROM private_api.get_school_public_info(_school_id); $$;

CREATE OR REPLACE FUNCTION public.list_school_cities(_state text)
RETURNS TABLE(city text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT * FROM private_api.list_school_cities(_state); $$;

CREATE OR REPLACE FUNCTION public.list_school_cities_public(_state text, _network text DEFAULT NULL)
RETURNS TABLE(city text, school_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT * FROM private_api.list_school_cities_public(_state, _network); $$;

CREATE OR REPLACE FUNCTION public.list_school_states_public(_network text DEFAULT NULL)
RETURNS TABLE(state text, school_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT * FROM private_api.list_school_states_public(_network); $$;

CREATE OR REPLACE FUNCTION public.list_schools_by_location(_state text, _city text, _network text DEFAULT NULL)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text,
              network text, is_active boolean, logo_url text, address text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT * FROM private_api.list_schools_by_location(_state, _city, _network); $$;

CREATE OR REPLACE FUNCTION public.search_schools_public(search_query text)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text,
              network text, is_active boolean, logo_url text, address text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT * FROM private_api.search_schools_public(search_query); $$;

GRANT EXECUTE ON FUNCTION public.find_school_by_inep(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_app_version_manifest() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_school_bookings_public(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_school_gestor_public(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_school_public_info(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_school_cities(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_school_cities_public(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_school_states_public(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_schools_by_location(text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_schools_public(text) TO anon, authenticated;