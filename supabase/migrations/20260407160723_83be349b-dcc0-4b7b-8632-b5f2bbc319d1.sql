-- Drop old permissive update policy
DROP POLICY IF EXISTS "Users can update their own bookings" ON public.bookings;

-- New: only owner or admin can update bookings
CREATE POLICY "Owner or admin can update bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
);