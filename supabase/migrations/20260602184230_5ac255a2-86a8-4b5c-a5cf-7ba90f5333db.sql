
-- Tempos por turno (configurável por escola)
CREATE TABLE IF NOT EXISTS public.schedule_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  shift text NOT NULL CHECK (shift IN ('manha','tarde','noite')),
  period_number smallint NOT NULL CHECK (period_number BETWEEN 1 AND 10),
  label text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, shift, period_number)
);

GRANT SELECT ON public.schedule_periods TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_periods TO authenticated;
GRANT ALL ON public.schedule_periods TO service_role;

ALTER TABLE public.schedule_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School staff view schedule_periods" ON public.schedule_periods
  FOR SELECT TO authenticated
  USING (school_id = private_api.get_user_school_id(auth.uid()) AND private_api.is_user_approved(auth.uid()));

CREATE POLICY "Managers manage schedule_periods" ON public.schedule_periods
  FOR ALL TO authenticated
  USING (
    school_id = private_api.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role IN ('gestor_pedagogico','coord_pedagogico','chef_projeto_vida')
    )
  )
  WITH CHECK (
    school_id = private_api.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.is_approved = true
        AND p.role IN ('gestor_pedagogico','coord_pedagogico','chef_projeto_vida')
    )
  );

CREATE POLICY "Admin manages schedule_periods" ON public.schedule_periods
  FOR ALL TO authenticated
  USING (private_api.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private_api.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_schedule_periods_updated_at
  BEFORE UPDATE ON public.schedule_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.schedule_periods REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_periods;

-- Novas colunas no roster
ALTER TABLE public.teacher_roster
  ADD COLUMN IF NOT EXISTS block_name text,
  ADD COLUMN IF NOT EXISTS room_name text,
  ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES public.schedule_periods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_teacher_roster_period ON public.teacher_roster(period_id);

-- Log de transferências
CREATE TABLE IF NOT EXISTS public.assistant_transfer_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  roster_ids uuid[] NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.assistant_transfer_logs TO authenticated;
GRANT ALL ON public.assistant_transfer_logs TO service_role;

ALTER TABLE public.assistant_transfer_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School staff read transfer logs" ON public.assistant_transfer_logs
  FOR SELECT TO authenticated
  USING (school_id = private_api.get_user_school_id(auth.uid()) AND private_api.is_user_approved(auth.uid()));

CREATE POLICY "Admin manages transfer logs" ON public.assistant_transfer_logs
  FOR ALL TO authenticated
  USING (private_api.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private_api.has_role(auth.uid(), 'admin'::app_role));

-- RPC para transferir responsabilidade
CREATE OR REPLACE FUNCTION public.transfer_assistant_responsibility(
  _to_user_id uuid,
  _roster_ids uuid[],
  _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid;
  v_target_school uuid;
  v_updated int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  v_school := private_api.get_user_school_id(auth.uid());
  IF v_school IS NULL THEN RAISE EXCEPTION 'no_school'; END IF;

  SELECT school_id INTO v_target_school FROM public.profiles WHERE user_id = _to_user_id AND is_approved = true LIMIT 1;
  IF v_target_school IS NULL OR v_target_school <> v_school THEN
    RAISE EXCEPTION 'target_not_in_school';
  END IF;

  UPDATE public.teacher_roster
    SET assistant_user_id = _to_user_id, updated_at = now()
    WHERE id = ANY(_roster_ids)
      AND school_id = v_school
      AND assistant_user_id = auth.uid();

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    INSERT INTO public.assistant_transfer_logs (school_id, from_user_id, to_user_id, roster_ids, note)
    VALUES (v_school, auth.uid(), _to_user_id, _roster_ids, _note);
  END IF;

  RETURN jsonb_build_object('ok', true, 'transferred', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_assistant_responsibility(uuid, uuid[], text) TO authenticated;
