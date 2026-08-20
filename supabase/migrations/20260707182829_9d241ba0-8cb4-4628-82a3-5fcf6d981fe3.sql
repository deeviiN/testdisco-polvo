
CREATE TABLE public.reassignment_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  invite_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Boa_Vista')::date,
  class_name text,
  shift text,
  absent_roster_id uuid NOT NULL,
  absent_teacher_name text,
  absent_period_number int NOT NULL,
  covering_roster_id uuid NOT NULL,
  covering_teacher_name text,
  covering_period_number int NOT NULL,
  covering_end_time time,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','expired','cancelled','no_candidate')),
  attempt int NOT NULL DEFAULT 1,
  excluded_roster_ids uuid[] NOT NULL DEFAULT '{}',
  reason text NOT NULL DEFAULT 'ausencia_auto',
  created_by uuid,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reassignment_invites_school_date_idx
  ON public.reassignment_invites (school_id, invite_date);
CREATE INDEX reassignment_invites_covering_name_idx
  ON public.reassignment_invites (school_id, invite_date, lower(covering_teacher_name), status);

GRANT SELECT ON public.reassignment_invites TO authenticated;
GRANT ALL ON public.reassignment_invites TO service_role;

ALTER TABLE public.reassignment_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school members can read invites"
  ON public.reassignment_invites
  FOR SELECT
  TO authenticated
  USING (school_id = public.get_user_school_id(auth.uid()));

ALTER TABLE public.reassignment_invites REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reassignment_invites;

CREATE TRIGGER reassignment_invites_touch
  BEFORE UPDATE ON public.reassignment_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_reassignment_invite(
  p_absent_roster_id uuid,
  p_absent_period int,
  p_excluded uuid[] DEFAULT '{}'::uuid[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_absent record;
  v_cand record;
  v_invite_id uuid;
  v_date date := (now() AT TIME ZONE 'America/Boa_Vista')::date;
  v_weekday int := EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Boa_Vista'))::int;
BEGIN
  SELECT r.*
    INTO v_absent
    FROM public.teacher_roster r
   WHERE r.id = p_absent_roster_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT r.id AS roster_id,
         r.teacher_name,
         COALESCE(sp.period_number, 0) AS period_number,
         COALESCE(sp.end_time, r.end_time) AS end_time,
         COALESCE(r.shift, sp.shift) AS shift
    INTO v_cand
    FROM public.teacher_roster r
    LEFT JOIN public.schedule_periods sp ON sp.id = r.period_id
   WHERE r.school_id = v_absent.school_id
     AND r.weekday = v_weekday
     AND lower(regexp_replace(coalesce(r.class_name,''), '\s+', '', 'g'))
       = lower(regexp_replace(coalesce(v_absent.class_name,''), '\s+', '', 'g'))
     AND r.id <> p_absent_roster_id
     AND NOT (r.id = ANY(p_excluded))
     AND COALESCE(sp.period_number, 0) > p_absent_period
     AND NOT EXISTS (
       SELECT 1 FROM public.teacher_roster_presence tp
        WHERE tp.roster_id = r.id
          AND tp.presence_date = v_date
          AND tp.period_number = COALESCE(sp.period_number, 0)
          AND tp.status = 'ausente'
     )
   ORDER BY COALESCE(sp.period_number, 0) DESC
   LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.reassignment_invites (
      school_id, invite_date, class_name, shift,
      absent_roster_id, absent_teacher_name, absent_period_number,
      covering_roster_id, covering_teacher_name, covering_period_number,
      covering_end_time, status, attempt, excluded_roster_ids, reason
    ) VALUES (
      v_absent.school_id, v_date, v_absent.class_name, v_absent.shift,
      p_absent_roster_id, v_absent.teacher_name, p_absent_period,
      p_absent_roster_id, NULL, 0,
      NULL, 'no_candidate', COALESCE(array_length(p_excluded,1),0)+1, p_excluded, 'ausencia_auto'
    ) RETURNING id INTO v_invite_id;
    RETURN v_invite_id;
  END IF;

  INSERT INTO public.reassignment_invites (
    school_id, invite_date, class_name, shift,
    absent_roster_id, absent_teacher_name, absent_period_number,
    covering_roster_id, covering_teacher_name, covering_period_number,
    covering_end_time, status, attempt, excluded_roster_ids, reason
  ) VALUES (
    v_absent.school_id, v_date, v_absent.class_name, v_cand.shift,
    p_absent_roster_id, v_absent.teacher_name, p_absent_period,
    v_cand.roster_id, v_cand.teacher_name, v_cand.period_number,
    v_cand.end_time, 'pending', COALESCE(array_length(p_excluded,1),0)+1, p_excluded, 'ausencia_auto'
  ) RETURNING id INTO v_invite_id;

  RETURN v_invite_id;
END $$;

REVOKE ALL ON FUNCTION public.create_reassignment_invite(uuid,int,uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.create_reassignment_invite(uuid,int,uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_auto_reassignment_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists int;
BEGIN
  IF NEW.status <> 'ausente' THEN RETURN NEW; END IF;
  IF NEW.period_number < 2 THEN RETURN NEW; END IF;

  SELECT 1 INTO v_exists
    FROM public.reassignment_invites
   WHERE absent_roster_id = NEW.roster_id
     AND invite_date = NEW.presence_date
     AND absent_period_number = NEW.period_number
     AND status IN ('pending','accepted')
   LIMIT 1;
  IF FOUND THEN RETURN NEW; END IF;

  PERFORM public.create_reassignment_invite(NEW.roster_id, NEW.period_number, '{}'::uuid[]);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS teacher_roster_presence_auto_invite ON public.teacher_roster_presence;
CREATE TRIGGER teacher_roster_presence_auto_invite
  AFTER INSERT OR UPDATE OF status ON public.teacher_roster_presence
  FOR EACH ROW EXECUTE FUNCTION public.trg_auto_reassignment_invite();

CREATE OR REPLACE FUNCTION public.respond_reassignment_invite(
  p_invite_id uuid,
  p_accept boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
  v_uid uuid := auth.uid();
  v_new_excluded uuid[];
  v_next uuid;
BEGIN
  SELECT * INTO v_inv FROM public.reassignment_invites WHERE id = p_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF v_inv.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason','already_'||v_inv.status);
  END IF;

  IF p_accept THEN
    UPDATE public.reassignment_invites
       SET status='accepted', responded_at = now()
     WHERE id = p_invite_id;

    INSERT INTO public.room_reassignments (
      school_id, reassignment_date, class_name, shift,
      absent_roster_id, absent_teacher_name, absent_period_number,
      covering_roster_id, covering_teacher_name, covering_original_period,
      vacated_period_number, vacated_end_time, reason, created_by
    ) VALUES (
      v_inv.school_id, v_inv.invite_date, v_inv.class_name, v_inv.shift,
      v_inv.absent_roster_id, v_inv.absent_teacher_name, v_inv.absent_period_number,
      v_inv.covering_roster_id, v_inv.covering_teacher_name, v_inv.covering_period_number,
      v_inv.covering_period_number, v_inv.covering_end_time, 'ausencia', v_uid
    );

    RETURN jsonb_build_object('ok', true, 'status','accepted');
  ELSE
    v_new_excluded := v_inv.excluded_roster_ids || v_inv.covering_roster_id;
    UPDATE public.reassignment_invites
       SET status='declined', responded_at = now(),
           excluded_roster_ids = v_new_excluded
     WHERE id = p_invite_id;

    v_next := public.create_reassignment_invite(v_inv.absent_roster_id, v_inv.absent_period_number, v_new_excluded);
    RETURN jsonb_build_object('ok', true, 'status','declined', 'next_invite_id', v_next);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.respond_reassignment_invite(uuid,boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.respond_reassignment_invite(uuid,boolean) TO authenticated;
