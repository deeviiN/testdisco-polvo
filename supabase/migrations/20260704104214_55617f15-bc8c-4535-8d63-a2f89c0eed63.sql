
CREATE TABLE public.room_reassignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL,
  reassignment_date date NOT NULL,
  class_name text NOT NULL,
  shift text NOT NULL,
  absent_roster_id uuid,
  absent_teacher_name text NOT NULL,
  absent_period_number int NOT NULL,
  covering_roster_id uuid,
  covering_teacher_name text NOT NULL,
  covering_original_period int NOT NULL,
  vacated_period_number int NOT NULL,
  vacated_end_time text,
  reason text NOT NULL DEFAULT 'ausencia',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by uuid
);

CREATE INDEX room_reassignments_school_date_idx
  ON public.room_reassignments(school_id, reassignment_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_reassignments TO authenticated;
GRANT ALL ON public.room_reassignments TO service_role;

ALTER TABLE public.room_reassignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school members read reassignments"
  ON public.room_reassignments
  FOR SELECT
  TO authenticated
  USING (
    school_id = private_api.get_user_school_id(auth.uid())
    OR private_api.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "school members insert reassignments"
  ON public.room_reassignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = private_api.get_user_school_id(auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "school members update reassignments"
  ON public.room_reassignments
  FOR UPDATE
  TO authenticated
  USING (
    school_id = private_api.get_user_school_id(auth.uid())
    OR private_api.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    school_id = private_api.get_user_school_id(auth.uid())
    OR private_api.has_role(auth.uid(), 'admin'::app_role)
  );

ALTER TABLE public.room_reassignments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_reassignments;
