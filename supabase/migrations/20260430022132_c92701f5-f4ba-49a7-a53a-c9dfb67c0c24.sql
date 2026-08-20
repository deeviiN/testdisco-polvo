-- Adiciona coluna para armazenar o motivo da rejeição
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Comentário para documentação
COMMENT ON COLUMN public.profiles.rejection_reason IS 'Armazena a justificativa quando um cadastro é rejeitado pelo administrador ou gestor.';