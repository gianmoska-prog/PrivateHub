create table public.document_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  storage_path text not null unique,
  filename text not null,
  mime_type text,
  uploaded_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.document_files enable row level security;
alter table public.document_files force row level security;

create policy document_files_owner_select on public.document_files
for select to authenticated
using ((select auth.uid()) = owner_id);

create policy document_files_owner_insert on public.document_files
for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.documents
    where documents.id = document_files.document_id
      and documents.owner_id = (select auth.uid())
  )
);

create policy document_files_owner_update on public.document_files
for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.documents
    where documents.id = document_files.document_id
      and documents.owner_id = (select auth.uid())
  )
);

create policy document_files_owner_delete on public.document_files
for delete to authenticated
using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.document_files to authenticated;
revoke all on public.document_files from anon;

create index document_files_document_uploaded_idx
on public.document_files (document_id, uploaded_at, id);

insert into public.document_files (owner_id, document_id, storage_path, filename, mime_type, uploaded_at)
select
  owner_id,
  id,
  storage_path,
  coalesce(filename, 'document'),
  mime_type,
  coalesce(uploaded_at, updated_at)
from public.documents
where owner_id is not null
  and storage_path is not null
on conflict (storage_path) do nothing;
