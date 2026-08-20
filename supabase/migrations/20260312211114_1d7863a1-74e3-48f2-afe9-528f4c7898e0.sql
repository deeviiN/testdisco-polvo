
-- Aprovar o perfil do Elberth
UPDATE profiles SET is_approved = true, role = 'admin' WHERE user_id = 'a1b6a609-621e-42c7-b5c0-c1c2b3ec9e9e';

-- Garantir role admin na tabela user_roles
INSERT INTO user_roles (user_id, role) VALUES ('a1b6a609-621e-42c7-b5c0-c1c2b3ec9e9e', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
