-- Allow chef_projeto_vida to update profiles from the same school (approve/reject)
CREATE OR REPLACE FUNCTION public.is_chef_of_school(_user_id uuid, _school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND school_id = _school_id
      AND role = 'chef_projeto_vida'
  )
$$;

-- Chef can update profiles from their school
CREATE POLICY "Chef can update profiles from same school"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  is_chef_of_school(auth.uid(), school_id)
);

-- Chef can view profiles from their school
CREATE POLICY "Chef can view profiles from same school"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  is_chef_of_school(auth.uid(), school_id)
);

-- Enable realtime for bookings so chef gets notified
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;