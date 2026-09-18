-- Character portraits: one image per character, in a private Storage bucket.
--
-- Run after 0001_init.sql: Supabase dashboard -> SQL Editor -> paste -> Run.
--
-- Portraits are private like everything else: each user has one folder, named
-- by their user id, and only they can read or write inside it. The API uploads
-- and signs links *as the signed-in user*, so these policies are what keep one
-- account's portraits away from another's.

alter table public.npcs add column if not exists portrait_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portraits', 'portraits', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Owners read their portraits"
  on storage.objects for select to authenticated
  using (bucket_id = 'portraits' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners add portraits"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'portraits' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Redrawing a portrait overwrites the file, which needs update as well as insert.
create policy "Owners replace their portraits"
  on storage.objects for update to authenticated
  using (bucket_id = 'portraits' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'portraits' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners delete their portraits"
  on storage.objects for delete to authenticated
  using (bucket_id = 'portraits' and (storage.foldername(name))[1] = (select auth.uid())::text);
