
-- Table to store WebAuthn credentials for biometric login
CREATE TABLE public.webauthn_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- Users can only see their own credentials
CREATE POLICY "Users can view own webauthn credentials"
  ON public.webauthn_credentials FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can register their own credentials
CREATE POLICY "Users can insert own webauthn credentials"
  ON public.webauthn_credentials FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own credentials
CREATE POLICY "Users can delete own webauthn credentials"
  ON public.webauthn_credentials FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Table to store temporary WebAuthn challenges
CREATE TABLE public.webauthn_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  type TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- Only the service role can manage challenges (edge function uses service role)
-- No public policies needed
