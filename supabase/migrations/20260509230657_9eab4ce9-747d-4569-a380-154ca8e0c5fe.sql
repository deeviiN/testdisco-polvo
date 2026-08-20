-- Revert: realtime refresh broadcast requires authenticated SELECT.
-- The payload jsonb is used ONLY for global refresh signals and never carries sensitive data.
DROP POLICY IF EXISTS "Admins can read remote commands" ON public.app_remote_commands;
CREATE POLICY "Authenticated can read remote commands"
ON public.app_remote_commands
FOR SELECT
TO authenticated
USING (true);

COMMENT ON TABLE public.app_remote_commands IS 'Broadcast-only table for global app refresh signals. payload column MUST NOT contain sensitive data — readable by every authenticated user via Realtime.';