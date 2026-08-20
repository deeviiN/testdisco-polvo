-- Remove the overly broad SELECT policy
DROP POLICY IF EXISTS "Schools viewable by authenticated users" ON public.schools;

-- Users can only view their own school (full data including billing)
CREATE POLICY "Users can view own school"
ON public.schools
FOR SELECT
TO authenticated
USING (
  id = get_user_school_id(auth.uid())
  OR has_role(auth.uid(), 'admin')
  OR is_chef_of_school(auth.uid(), id)
);

-- Search function for registration flow (no billing data)
CREATE OR REPLACE FUNCTION public.search_schools_public(search_query text)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text, network text, is_active boolean, logo_url text, address text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.city, s.state, s.inep_code, s.network, s.is_active, s.logo_url, s.address
  FROM public.schools s
  WHERE s.is_active = true
  AND (s.name ILIKE '%' || search_query || '%' OR s.city ILIKE '%' || search_query || '%')
  ORDER BY s.name
  LIMIT 10;
$$;

-- Get school public info by ID (no billing data)
CREATE OR REPLACE FUNCTION public.get_school_public_info(_school_id uuid)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text, network text, is_active boolean, logo_url text, address text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.city, s.state, s.inep_code, s.network, s.is_active, s.logo_url, s.address
  FROM public.schools s
  WHERE s.id = _school_id;
$$;

-- List cities by state (for registration dropdown)
CREATE OR REPLACE FUNCTION public.list_school_cities(_state text)
RETURNS TABLE(city text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT s.city
  FROM public.schools s
  WHERE s.state = _state AND s.is_active = true
  ORDER BY s.city;
$$;

-- List schools by state/city/network (for registration)
CREATE OR REPLACE FUNCTION public.list_schools_by_location(_state text, _city text, _network text DEFAULT NULL)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text, network text, is_active boolean, logo_url text, address text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.city, s.state, s.inep_code, s.network, s.is_active, s.logo_url, s.address
  FROM public.schools s
  WHERE s.state = _state
  AND s.city = _city
  AND s.is_active = true
  AND (_network IS NULL OR s.network = _network)
  ORDER BY s.name;
$$;

-- Find school by INEP code (for subscription flow)
CREATE OR REPLACE FUNCTION public.find_school_by_inep(_inep_code text, _network text DEFAULT NULL)
RETURNS TABLE(id uuid, name text, city text, state text, inep_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.city, s.state, s.inep_code
  FROM public.schools s
  WHERE s.inep_code = _inep_code
  AND s.is_active = true
  AND (_network IS NULL OR s.network = _network)
  LIMIT 1;
$$;