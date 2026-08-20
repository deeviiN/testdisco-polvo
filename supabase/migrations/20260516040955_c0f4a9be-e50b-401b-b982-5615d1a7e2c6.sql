CREATE TABLE public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  sender_name text NOT NULL,
  recipient_id uuid NOT NULL,
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dm_pair ON public.direct_messages (
  LEAST(sender_id, recipient_id),
  GREATEST(sender_id, recipient_id),
  created_at DESC
);
CREATE INDEX idx_dm_recipient_unread ON public.direct_messages (recipient_id) WHERE read_at IS NULL;

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DM participants can read"
ON public.direct_messages FOR SELECT TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Approved users send own DMs"
ON public.direct_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND school_id = private_api.get_user_school_id(auth.uid())
  AND private_api.is_user_approved(auth.uid())
  AND recipient_id <> auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = recipient_id
      AND p.school_id = school_id
      AND p.is_approved = true
  )
);

CREATE POLICY "Recipient marks as read"
ON public.direct_messages FOR UPDATE TO authenticated
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Sender deletes own DM"
ON public.direct_messages FOR DELETE TO authenticated
USING (sender_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;