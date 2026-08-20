
CREATE POLICY "Chef can delete profiles from same school"
ON public.profiles
FOR DELETE
TO authenticated
USING (
  is_chef_of_school(auth.uid(), school_id)
  AND role != 'chef_projeto_vida'
);
