-- Fix mutable search_path on remaining functions
ALTER FUNCTION public.get_school_subscription_countdown(uuid) SET search_path = public;
ALTER FUNCTION public.broadcast_app_refresh() SET search_path = public;
ALTER FUNCTION public.liberar_assinatura(uuid) SET search_path = public;

-- Tighten signatures bucket UPDATE policy: prevent renaming files into another user's folder
DROP POLICY IF EXISTS "Users can update their own signature" ON storage.objects;
CREATE POLICY "Users can update their own signature"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'signatures'
  AND (storage.foldername(name))[1] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'signatures'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);