-- Remove políticas antigas de SELECT (listagem) sobre school-logos, se existirem
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        policyname ILIKE '%school-logos%select%'
        OR policyname ILIKE '%school logos%public%'
        OR policyname IN (
          'School logos are publicly accessible',
          'Public can read school logos',
          'Anyone can view school logos',
          'school-logos public read'
        )
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END$$;

-- Restringe LISTAGEM (SELECT em storage.objects) do bucket school-logos a admins autenticados.
-- Observação: o acesso direto às imagens via URL pública continua funcionando porque
-- o bucket está marcado como public=true (servido pelo endpoint /object/public/...),
-- que NÃO depende desta policy de SELECT.
CREATE POLICY "school-logos: only admins can list"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'school-logos'
  AND public.has_role(auth.uid(), 'admin')
);
