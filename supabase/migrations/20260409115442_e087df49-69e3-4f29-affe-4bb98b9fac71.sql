
CREATE OR REPLACE FUNCTION public.get_school_gestor_public(_school_id uuid)
RETURNS TABLE(full_name text, phone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.full_name, p.phone
  FROM profiles p
  WHERE p.school_id = _school_id
    AND p.role IN ('gestor_pedagogico', 'chef_projeto_vida')
    AND p.is_approved = true
  ORDER BY
    CASE WHEN p.role = 'gestor_pedagogico' THEN 0 ELSE 1 END
  LIMIT 2;
$$;
