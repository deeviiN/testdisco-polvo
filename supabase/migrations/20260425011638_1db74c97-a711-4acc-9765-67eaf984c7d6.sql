CREATE TABLE public.pending_pix_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  payment_id TEXT NOT NULL,
  qr_code TEXT,
  qr_code_base64 TEXT,
  ticket_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_pix_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users from same school can view pending pix"
ON public.pending_pix_payments
FOR SELECT
TO authenticated
USING (school_id = get_user_school_id(auth.uid()) OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Block client inserts on pending_pix"
ON public.pending_pix_payments
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Block client updates on pending_pix"
ON public.pending_pix_payments
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Block client deletes on pending_pix"
ON public.pending_pix_payments
FOR DELETE
TO authenticated
USING (false);

CREATE TRIGGER update_pending_pix_updated_at
BEFORE UPDATE ON public.pending_pix_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();