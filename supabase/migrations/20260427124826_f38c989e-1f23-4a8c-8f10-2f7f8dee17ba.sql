-- Permitir uploader excluir seu próprio registro
CREATE POLICY "Uploader can delete own signed contract"
ON public.signed_contracts FOR DELETE TO authenticated
USING (uploaded_by = auth.uid());

-- Permitir uploader excluir seu próprio arquivo no storage (mesma escola, primeiro segmento)
CREATE POLICY "Users can delete own signed contracts in storage"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'signed-contracts'
  AND (storage.foldername(name))[1] = public.get_user_school_id(auth.uid())::text
  AND owner = auth.uid()
);