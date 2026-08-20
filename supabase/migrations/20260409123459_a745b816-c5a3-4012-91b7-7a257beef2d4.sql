-- Add UNIQUE constraint on profiles.user_id to prevent duplicate profiles
-- This closes a privilege escalation vector where multiple profile rows
-- for the same user could bypass the WITH CHECK subquery in the UPDATE policy
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);