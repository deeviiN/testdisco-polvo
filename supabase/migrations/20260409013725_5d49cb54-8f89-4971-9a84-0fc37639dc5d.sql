
-- Remove all client-side policies on webauthn_challenges
DROP POLICY IF EXISTS "Users can view own challenges" ON public.webauthn_challenges;
DROP POLICY IF EXISTS "Users can insert own challenges" ON public.webauthn_challenges;
DROP POLICY IF EXISTS "Users can delete own challenges" ON public.webauthn_challenges;
