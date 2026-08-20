-- ============================================================
-- 1) PRIVILEGE ESCALATION: Chef profile updates
-- ============================================================
DROP POLICY IF EXISTS "Chef can update profiles from same school" ON public.profiles;

CREATE POLICY "Chef can update profiles from same school"
ON public.profiles
FOR UPDATE
TO authenticated
USING (is_chef_of_school(auth.uid(), school_id))
WITH CHECK (
  is_chef_of_school(auth.uid(), school_id)
  -- Lock immutable identity fields
  AND school_id = (SELECT p.school_id FROM public.profiles p WHERE p.id = profiles.id)
  AND user_id   = (SELECT p.user_id   FROM public.profiles p WHERE p.id = profiles.id)
  AND role      = (SELECT p.role      FROM public.profiles p WHERE p.id = profiles.id)
  -- Chef may toggle is_approved ONLY for non-manager roles
  AND (
    role NOT IN ('chef_projeto_vida','gestor_pedagogico')
    OR is_approved = (SELECT p.is_approved FROM public.profiles p WHERE p.id = profiles.id)
  )
);

-- ============================================================
-- 2) Gestor external-events update: tighten WITH CHECK
-- ============================================================
DROP POLICY IF EXISTS "Gestors can respond to external events" ON public.bookings;

CREATE POLICY "Gestors can respond to external events"
ON public.bookings
FOR UPDATE
TO authenticated
USING (
  school_id = get_user_school_id(auth.uid())
  AND event_type = 'evento_externo'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('gestor_pedagogico','coord_pedagogico','supervisor','chef_projeto_vida')
  )
)
WITH CHECK (
  school_id    = get_user_school_id(auth.uid())
  AND event_type = 'evento_externo'
  -- Immutable booking identity / scheduling fields
  AND user_id      = (SELECT b.user_id      FROM public.bookings b WHERE b.id = bookings.id)
  AND school_id    = (SELECT b.school_id    FROM public.bookings b WHERE b.id = bookings.id)
  AND booking_date = (SELECT b.booking_date FROM public.bookings b WHERE b.id = bookings.id)
  AND start_time   = (SELECT b.start_time   FROM public.bookings b WHERE b.id = bookings.id)
  AND end_time     = (SELECT b.end_time     FROM public.bookings b WHERE b.id = bookings.id)
  AND sector       = (SELECT b.sector       FROM public.bookings b WHERE b.id = bookings.id)
  AND event_type   = (SELECT b.event_type   FROM public.bookings b WHERE b.id = bookings.id)
);

-- ============================================================
-- 3) REALTIME: restrict channel subscriptions to same school
-- ============================================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read same-school realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can read same-school realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Only allow reading messages for the user's own school topic
  -- Topic convention: "school:<school_id>"
  (realtime.topic() LIKE 'school:%' 
    AND substring(realtime.topic() FROM 8)::uuid = get_user_school_id(auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated users can broadcast same-school realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can broadcast same-school realtime"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (realtime.topic() LIKE 'school:%' 
    AND substring(realtime.topic() FROM 8)::uuid = get_user_school_id(auth.uid()))
);