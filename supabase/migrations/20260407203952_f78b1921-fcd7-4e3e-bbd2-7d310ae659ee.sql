-- Allow Chef to update their own school (logo_url specifically)
CREATE POLICY "Chef can update own school"
ON public.schools
FOR UPDATE
TO authenticated
USING (is_chef_of_school(auth.uid(), id))
WITH CHECK (is_chef_of_school(auth.uid(), id));