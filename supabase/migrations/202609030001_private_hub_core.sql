create extension if not exists pgcrypto;
create schema if not exists private_hub;
revoke all on schema private_hub from public, anon, authenticated;

create table private_hub.owner_registry (
  email text primary key,
  owner_id uuid unique references auth.users(id) on delete cascade,
  claimed_at timestamptz
);
revoke all on private_hub.owner_registry from public, anon, authenticated;

create or replace function private_hub.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  institution text not null,
  product_name text,
  country text,
  identifier_type text,
  identifier_value text,
  status text not null default 'active' check (status in ('active','pending_application','inactive')),
  nickname text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  provider text not null,
  program_name text not null,
  member_number text,
  tier text,
  balance text,
  status text not null default 'active' check (status in ('active','inactive')),
  member_since text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  document_type text not null,
  country text not null check (country in ('Italy','Brazil')),
  status text not null default 'not_uploaded' check (status in ('not_uploaded','uploaded','pending')),
  storage_path text,
  filename text,
  mime_type text,
  uploaded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, country, document_type)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  content text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  provider text not null,
  connection_status text not null default 'not_connected' check (connection_status in ('connected','not_connected')),
  connected_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, provider)
);

do $$
declare target text;
begin
  foreach target in array array['accounts','memberships','documents','notes','integrations'] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);
    execute format('create trigger %I before update on public.%I for each row execute function private_hub.touch_updated_at()', target || '_touch', target);
  end loop;
end $$;

create policy accounts_owner_select on public.accounts for select to authenticated using ((select auth.uid()) = owner_id);
create policy accounts_owner_insert on public.accounts for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy accounts_owner_update on public.accounts for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy accounts_owner_delete on public.accounts for delete to authenticated using ((select auth.uid()) = owner_id);

create policy memberships_owner_select on public.memberships for select to authenticated using ((select auth.uid()) = owner_id);
create policy memberships_owner_insert on public.memberships for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy memberships_owner_update on public.memberships for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy memberships_owner_delete on public.memberships for delete to authenticated using ((select auth.uid()) = owner_id);

create policy documents_owner_select on public.documents for select to authenticated using ((select auth.uid()) = owner_id);
create policy documents_owner_insert on public.documents for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy documents_owner_update on public.documents for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy documents_owner_delete on public.documents for delete to authenticated using ((select auth.uid()) = owner_id);

create policy notes_owner_select on public.notes for select to authenticated using ((select auth.uid()) = owner_id);
create policy notes_owner_insert on public.notes for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy notes_owner_update on public.notes for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy notes_owner_delete on public.notes for delete to authenticated using ((select auth.uid()) = owner_id);

create policy integrations_owner_select on public.integrations for select to authenticated using ((select auth.uid()) = owner_id);
create policy integrations_owner_insert on public.integrations for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy integrations_owner_update on public.integrations for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy integrations_owner_delete on public.integrations for delete to authenticated using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.accounts, public.memberships, public.documents, public.notes, public.integrations to authenticated;
revoke all on public.accounts, public.memberships, public.documents, public.notes, public.integrations from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private-hub-documents', 'private-hub-documents', false, 15728640, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy private_hub_storage_select on storage.objects for select to authenticated
using (bucket_id = 'private-hub-documents' and (storage.foldername(name))[1] = (select auth.uid()::text) and owner_id = (select auth.uid()::text));
create policy private_hub_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'private-hub-documents' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy private_hub_storage_update on storage.objects for update to authenticated
using (bucket_id = 'private-hub-documents' and (storage.foldername(name))[1] = (select auth.uid()::text) and owner_id = (select auth.uid()::text))
with check (bucket_id = 'private-hub-documents' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy private_hub_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'private-hub-documents' and (storage.foldername(name))[1] = (select auth.uid()::text) and owner_id = (select auth.uid()::text));

create or replace function public.claim_private_hub()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_email text := lower(coalesce(auth.jwt()->>'email', ''));
  allowed boolean;
begin
  if caller is null or caller_email = '' then return false; end if;
  perform pg_advisory_xact_lock(hashtext('private-hub-owner-claim'));
  select exists (
    select 1 from private_hub.owner_registry
    where lower(email) = caller_email and (owner_id is null or owner_id = caller)
  ) into allowed;
  if not allowed then return false; end if;
  update private_hub.owner_registry set owner_id = caller, claimed_at = coalesce(claimed_at, timezone('utc', now())) where lower(email) = caller_email;
  update public.accounts set owner_id = caller where owner_id is null;
  update public.memberships set owner_id = caller where owner_id is null;
  update public.documents set owner_id = caller where owner_id is null;
  update public.integrations set owner_id = caller where owner_id is null;
  return true;
end;
$$;
revoke all on function public.claim_private_hub() from public, anon;
grant execute on function public.claim_private_hub() to authenticated;
