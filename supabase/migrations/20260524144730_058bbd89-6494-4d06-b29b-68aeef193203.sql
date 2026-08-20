
CREATE TABLE IF NOT EXISTS public.booking_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  school_id uuid NOT NULL,
  user_id uuid NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes integer,
  start_source text DEFAULT 'qr',
  end_source text DEFAULT 'qr',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS booking_usage_school_idx ON public.booking_usage(school_id);
CREATE INDEX IF NOT EXISTS booking_usage_user_idx ON public.booking_usage(user_id);

ALTER TABLE public.booking_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Block direct insert booking_usage"
  ON public.booking_usage FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block direct update booking_usage"
  ON public.booking_usage FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Block direct delete booking_usage"
  ON public.booking_usage FOR DELETE TO authenticated
  USING (false);

CREATE POLICY "View booking_usage same school"
  ON public.booking_usage FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private_api.has_role(auth.uid(), 'admin'::app_role)
    OR (
      school_id = private_api.get_user_school_id(auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND p.is_approved = true
          AND p.role IN ('gestor_pedagogico','chef_projeto_vida','coord_pedagogico','supervisor')
      )
    )
  );

CREATE TRIGGER trg_booking_usage_updated_at
  BEFORE UPDATE ON public.booking_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.register_booking_checkpoint(_booking_id uuid, _kind text)
RETURNS public.booking_usage
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_row public.booking_usage;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _kind NOT IN ('start','end') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;
  IF v_booking.user_id <> v_user THEN
    RAISE EXCEPTION 'not_owner';
  END IF;
  IF v_booking.booking_date <> current_date THEN
    RAISE EXCEPTION 'not_today';
  END IF;
  IF v_booking.school_id <> private_api.get_user_school_id(v_user) THEN
    RAISE EXCEPTION 'wrong_school';
  END IF;

  SELECT * INTO v_row FROM public.booking_usage WHERE booking_id = _booking_id;

  IF _kind = 'start' THEN
    IF FOUND AND v_row.started_at IS NOT NULL THEN
      RAISE EXCEPTION 'already_started';
    END IF;
    IF FOUND THEN
      UPDATE public.booking_usage
        SET started_at = v_now, start_source = 'qr', updated_at = v_now
        WHERE id = v_row.id
        RETURNING * INTO v_row;
    ELSE
      INSERT INTO public.booking_usage (booking_id, school_id, user_id, started_at, start_source)
        VALUES (_booking_id, v_booking.school_id, v_user, v_now, 'qr')
        RETURNING * INTO v_row;
    END IF;
  ELSE
    IF NOT FOUND OR v_row.started_at IS NULL THEN
      RAISE EXCEPTION 'not_started';
    END IF;
    IF v_row.ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'already_ended';
    END IF;
    UPDATE public.booking_usage
      SET ended_at = v_now,
          end_source = 'qr',
          duration_minutes = GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_row.started_at))::int / 60),
          updated_at = v_now
      WHERE id = v_row.id
      RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_booking_checkpoint(uuid, text) TO authenticated;
