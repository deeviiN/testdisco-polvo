-- Remove políticas amplas de leitura do bucket privado chat_attachments.
DROP POLICY IF EXISTS "Chat attachments are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments read" ON storage.objects;

-- Nova política de SELECT: apenas dono do arquivo, participantes da conversa
-- privada que referencia o arquivo, ou membros da mesma escola em avisos
-- institucionais que referenciam o arquivo.
CREATE POLICY "chat_attachments read scoped"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat_attachments'
  AND (
    -- Dono do arquivo (o path começa com o próprio user_id).
    (storage.foldername(name))[1] = (auth.uid())::text
    -- Participante da conversa 1-a-1 que contém este anexo.
    OR EXISTS (
      SELECT 1
      FROM public.direct_messages dm
      WHERE (dm.sender_id = auth.uid() OR dm.recipient_id = auth.uid())
        AND position(storage.objects.name IN dm.content) > 0
    )
    -- Colega da mesma escola em um aviso institucional que contém o anexo.
    OR EXISTS (
      SELECT 1
      FROM public.school_messages sm
      JOIN public.profiles me ON me.user_id = auth.uid()
      WHERE sm.school_id = me.school_id
        AND position(storage.objects.name IN sm.content) > 0
    )
  )
);