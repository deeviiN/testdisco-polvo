-- Create settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on settings
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Only super_admin/admin can modify settings
CREATE POLICY "Admins can manage settings" ON public.settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin')
        )
    );

-- Everyone can read settings
CREATE POLICY "Settings are readable by everyone" ON public.settings
    FOR SELECT USING (true);

-- Insert default free trial days
INSERT INTO public.settings (key, value, description)
VALUES ('gestor_free_trial_days', '7'::jsonb, 'Number of free trial days for new gestors')
ON CONFLICT (key) DO NOTHING;

-- Add subscription related columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';

-- Create or update function to handle auto-approval on payment
CREATE OR REPLACE FUNCTION public.handle_gestor_payment_approval()
RETURNS TRIGGER AS $$
BEGIN
    -- If payment_status changes to 'paid', approve the gestor automatically
    IF NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') THEN
        NEW.is_approved := true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-approval
DROP TRIGGER IF EXISTS tr_gestor_payment_approval ON public.profiles;
CREATE TRIGGER tr_gestor_payment_approval
BEFORE UPDATE ON public.profiles
FOR EACH ROW
WHEN (NEW.role = 'gestor_pedagogico')
EXECUTE FUNCTION public.handle_gestor_payment_approval();
