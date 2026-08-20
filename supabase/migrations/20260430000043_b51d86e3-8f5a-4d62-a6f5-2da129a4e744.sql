-- Permite que school_id seja nulo na tabela profiles para suportar admins globais sem escola
ALTER TABLE public.profiles ALTER COLUMN school_id DROP NOT NULL;

-- Atualiza perfis de quem tem role 'admin' para serem admins puros
UPDATE public.profiles
SET school_id = NULL,
    role = 'admin'
WHERE user_id IN (
  SELECT user_id 
  FROM public.user_roles 
  WHERE role = 'admin'
);