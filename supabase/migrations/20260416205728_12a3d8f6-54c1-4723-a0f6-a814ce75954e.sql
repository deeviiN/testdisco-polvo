-- Add gestor approval fields to bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS gestor_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS gestor_response text,
  ADD COLUMN IF NOT EXISTS gestor_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS gestor_responded_by uuid;

-- Validation trigger for gestor_status values
CREATE OR REPLACE FUNCTION public.validate_gestor_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.gestor_status NOT IN ('pending','approved','denied') THEN
    RAISE EXCEPTION 'Invalid gestor_status: %', NEW.gestor_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_gestor_status_trg ON public.bookings;
CREATE TRIGGER validate_gestor_status_trg
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.validate_gestor_status();

-- Allow gestors/coords/supervisors/chefs from same school to update gestor_status fields
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
  school_id = get_user_school_id(auth.uid())
);

-- Enable realtime for bookings table
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;