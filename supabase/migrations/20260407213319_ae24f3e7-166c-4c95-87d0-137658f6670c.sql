-- Fix schools table: restrict SELECT to authenticated users only
DROP POLICY "Schools are viewable by everyone" ON public.schools;

CREATE POLICY "Schools viewable by authenticated users"
ON public.schools
FOR SELECT
TO authenticated
USING (true);