
ALTER TABLE public.teacher_day_absence
  ADD COLUMN IF NOT EXISTS from_period integer;

CREATE OR REPLACE FUNCTION public.apply_teacher_day_absence(
  p_school_id uuid,
  p_teacher_name text,
  p_date date,
  p_marked_by uuid,
  p_from_period integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_weekday int;
  v_inserted int := 0;
BEGIN
  v_weekday := EXTRACT(DOW FROM p_date)::int;

  INSERT INTO public.teacher_roster_presence (
    roster_id, school_id, presence_date, period_number,
    status, notes, marked_by
  )
  SELECT
    r.id, r.school_id, p_date, sp.period_number,
    'ausente', 'Faltou o dia todo', p_marked_by
  FROM public.teacher_roster r
  JOIN public.schedule_periods sp
    ON sp.school_id = r.school_id
   AND (
     (r.shift IS NOT NULL AND lower(btrim(sp.shift)) = lower(btrim(r.shift)))
     OR r.shift IS NULL
   )
  WHERE r.school_id = p_school_id
    AND r.weekday = v_weekday
    AND lower(btrim(r.teacher_name)) = lower(btrim(p_teacher_name))
    AND sp.period_number >= COALESCE(p_from_period, 1)
    AND NOT EXISTS (
      SELECT 1 FROM public.teacher_roster_presence prp
      WHERE prp.roster_id = r.id
        AND prp.presence_date = p_date
        AND prp.period_number = sp.period_number
    )
  ON CONFLICT (roster_id, presence_date, period_number) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.teacher_day_absence_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.apply_teacher_day_absence(
    NEW.school_id,
    NEW.teacher_name,
    NEW.absence_date,
    NEW.marked_by,
    COALESCE(NEW.from_period, 1)
  );
  RETURN NEW;
END;
$function$;
