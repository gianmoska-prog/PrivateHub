drop function if exists public.claim_private_hub();

create or replace function private_hub.claim_owner_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from private_hub.owner_registry
    where lower(email) = lower(coalesce(new.email, '')) and owner_id is null
  ) then return new; end if;
  update private_hub.owner_registry set owner_id = new.id, claimed_at = timezone('utc', now()) where lower(email) = lower(new.email) and owner_id is null;
  update public.accounts set owner_id = new.id where owner_id is null;
  update public.memberships set owner_id = new.id where owner_id is null;
  update public.documents set owner_id = new.id where owner_id is null;
  update public.integrations set owner_id = new.id where owner_id is null;
  return new;
end;
$$;
revoke all on function private_hub.claim_owner_on_signup() from public, anon, authenticated;

drop trigger if exists private_hub_claim_owner on auth.users;
create trigger private_hub_claim_owner
after insert on auth.users
for each row execute function private_hub.claim_owner_on_signup();

create index if not exists accounts_owner_id_idx on public.accounts(owner_id);
create index if not exists memberships_owner_id_idx on public.memberships(owner_id);
create index if not exists notes_owner_id_idx on public.notes(owner_id);
