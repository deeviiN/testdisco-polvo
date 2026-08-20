
insert into storage.buckets (id, name, public)
values ('chat_attachments', 'chat_attachments', true)
on conflict (id) do nothing;

create policy "Chat attachments are publicly readable"
on storage.objects for select
using (bucket_id = 'chat_attachments');

create policy "Approved users upload chat attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'chat_attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
  and private_api.is_user_approved(auth.uid())
);

create policy "Users delete own chat attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'chat_attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);
