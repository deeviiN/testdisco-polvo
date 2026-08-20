CREATE TABLE public.school_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  sender_user_id uuid NOT NULL,
  sender_name text NOT NULL,
  content text NOT NULL CHECK (length(btrim(content)) > 0 AND length(content) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_school_messages_school_created ON public.school_messages (school_id, created_at DESC);

ALTER TABLE public.school_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users read school messages"
ON public.school_messages FOR SELECT TO authenticated
USING (
  school_id = private_api.get_user_school_id(auth.uid())
  AND private_api.is_user_approved(auth.uid())
);

CREATE POLICY "Approved users send own school messages"
ON public.school_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_user_id = auth.uid()
  AND school_id = private_api.get_user_school_id(auth.uid())
  AND private_api.is_user_approved(auth.uid())
);

CREATE POLICY "Senders delete own messages"
ON public.school_messages FOR DELETE TO authenticated
USING (sender_user_id = auth.uid());

CREATE POLICY "Block client updates school messages"
ON public.school_messages FOR UPDATE TO authenticated
USING (false) WITH CHECK (false);

ALTER PUBLICATION supabase_realtime ADD TABLE public.school_messages;