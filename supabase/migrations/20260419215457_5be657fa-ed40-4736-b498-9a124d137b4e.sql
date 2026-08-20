-- 1) audit_logs: block client INSERT/DELETE (triggers run as SECURITY DEFINER and bypass RLS, so logging still works)
CREATE POLICY "Block client inserts on audit_logs"
ON public.audit_logs FOR INSERT TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "Block client deletes on audit_logs"
ON public.audit_logs FOR DELETE TO authenticated, anon
USING (false);

-- 2) profiles: lock down intended_role on self-update (admins/chef can still change it via their own policies)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND role = (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  AND is_approved = (SELECT p.is_approved FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  AND school_id = (SELECT p.school_id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  AND intended_role IS NOT DISTINCT FROM (SELECT p.intended_role FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
);

-- 3) Drop duplicate storage policies on signatures bucket
DROP POLICY IF EXISTS "Users can delete own signature" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own signature" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own signature" ON storage.objects;