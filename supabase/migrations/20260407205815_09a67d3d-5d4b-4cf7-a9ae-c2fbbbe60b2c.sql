-- Add signature_url column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- Create storage bucket for signatures
INSERT INTO storage.buckets (id, name, public) VALUES ('signatures', 'signatures', true)
ON CONFLICT (id) DO NOTHING;

-- Users can upload their own signature
CREATE POLICY "Users can upload own signature"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can update their own signature
CREATE POLICY "Users can update own signature"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete their own signature
CREATE POLICY "Users can delete own signature"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Anyone can view signatures (needed for PDF generation)
CREATE POLICY "Signatures are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'signatures');