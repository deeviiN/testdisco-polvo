ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS intended_role text;

-- Allow chef to also update intended_role clearing on approval (already covered by chef update policy on non-protected fields).
-- No change in RLS needed; intended_role is a non-sensitive field.