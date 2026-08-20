-- Ensure chat_attachments is private and add RLS policies scoped to authenticated users.
-- Bucket already exists; the bucket privacy flag is toggled via the storage tool.

-- Drop legacy public-read policies if any.
drop policy if exists "chat_attachments public read" on storage.objects;
drop policy if exists "Public read chat_attachments" on storage.objects;
drop policy if exists "chat_attachments read" on storage.objects;
drop policy if exists "chat_attachments insert" on storage.objects;
drop policy if exists "chat_attachments update" on storage.objects;
drop policy if exists "chat_attachments delete" on storage.objects;

-- Authenticated users can read any attachment (needed because chat messages are shared
-- with recipients / school members, and message-level RLS already gates who sees the
-- pointer to the file).
create policy "chat_attachments read"
on storage.objects
for select
to authenticated
using (bucket_id = 'chat_attachments');

-- Only the owner may upload/modify/delete their own files (path prefix must equal auth.uid()).
create policy "chat_attachments insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat_attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "chat_attachments update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'chat_attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'chat_attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "chat_attachments delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat_attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);