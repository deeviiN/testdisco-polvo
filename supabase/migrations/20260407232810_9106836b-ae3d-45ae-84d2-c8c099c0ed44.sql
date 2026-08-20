-- Fix booking UPDATE policy to prevent cross-tenant school_id manipulation
DROP POLICY IF EXISTS "Owner or admin can update bookings" ON bookings;

CREATE POLICY "Owner or admin can update bookings"
  ON bookings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (
    (auth.uid() = user_id AND school_id = public.get_user_school_id(auth.uid()))
    OR public.has_role(auth.uid(), 'admin')
  );