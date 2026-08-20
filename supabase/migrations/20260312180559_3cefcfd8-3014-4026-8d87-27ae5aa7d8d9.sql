
-- Create security definer function to get user's school_id without recursion
CREATE OR REPLACE FUNCTION public.get_user_school_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- Add is_approved column for admin approval workflow
ALTER TABLE public.profiles ADD COLUMN is_approved BOOLEAN NOT NULL DEFAULT false;

-- Drop old recursive policies
DROP POLICY IF EXISTS "Users can view profiles from same school" ON public.profiles;
DROP POLICY IF EXISTS "Users can view bookings from same school" ON public.bookings;
DROP POLICY IF EXISTS "Users can create bookings for their school" ON public.bookings;

-- Recreate profiles SELECT policy using security definer function
CREATE POLICY "Users can view profiles from same school" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- Recreate bookings SELECT policy
CREATE POLICY "Users can view bookings from same school" ON public.bookings
  FOR SELECT TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- Recreate bookings INSERT policy
CREATE POLICY "Users can create bookings for their school" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND school_id = public.get_user_school_id(auth.uid())
  );

-- Admin policies: admins can manage everything
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete bookings" ON public.bookings
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can manage schools
CREATE POLICY "Admins can insert schools" ON public.schools
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update schools" ON public.schools
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete schools" ON public.schools
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
