-- Read-only Enable Banking data model. Provider credentials stay in Edge Function
-- secrets. Session metadata is backend-only; the frontend sees normalized records.
alter table private_hub.owner_registry enable row level security;
alter table private_hub.owner_registry force row level security;

create table public.enable_banking_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  canonical_account_id uuid not null references public.accounts(id) on delete cascade,
  session_id text,
  authorization_id text,
  state_hash text not null unique,
  provider_name text not null,
  provider_country text not null default 'IT',
  status text not null default 'connecting' check (status in ('connecting','selection_required','connected','action_required','reconnect_required','temporarily_unavailable','disconnected')),
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.enable_banking_sessions enable row level security;
alter table public.enable_banking_sessions force row level security;
revoke all on public.enable_banking_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.enable_banking_sessions to service_role;

create table public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  canonical_account_id uuid not null references public.accounts(id) on delete cascade,
  institution text not null,
  provider text not null default 'Enable Banking',
  provider_account_uid text,
  provider_identification_hash text,
  currency text,
  current_balance numeric,
  available_balance numeric,
  status text not null default 'connecting' check (status in ('connecting','selection_required','connected','action_required','reconnect_required','temporarily_unavailable','disconnected')),
  last_successful_sync timestamptz,
  last_attempted_sync timestamptz,
  last_error_code text,
  consent_expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, canonical_account_id)
);

create table public.bank_account_candidates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  canonical_account_id uuid not null references public.accounts(id) on delete cascade,
  provider_account_uid text not null,
  institution text not null,
  display_name text,
  masked_identifier text,
  currency text,
  identification_hash text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, canonical_account_id, provider_account_uid)
);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  bank_connection_id uuid not null references public.bank_connections(id) on delete cascade,
  external_transaction_id text not null,
  transaction_date date,
  booking_date date,
  description text not null default '',
  counterparty text,
  amount numeric not null,
  currency text not null,
  status text not null default 'booked' check (status in ('pending','booked')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (bank_connection_id, external_transaction_id)
);

do $$
declare target text;
begin
  foreach target in array array['bank_connections','bank_account_candidates','bank_transactions'] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);
    execute format('create trigger %I before update on public.%I for each row execute function private_hub.touch_updated_at()', target || '_touch', target);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = owner_id)', target || '_owner_select', target);
  end loop;
end $$;

grant select on public.bank_connections, public.bank_account_candidates, public.bank_transactions to authenticated;
revoke all on public.bank_connections, public.bank_account_candidates, public.bank_transactions from anon;

create index bank_connections_owner_idx on public.bank_connections(owner_id);
create index bank_candidates_owner_idx on public.bank_account_candidates(owner_id, canonical_account_id);
create index bank_transactions_connection_date_idx on public.bank_transactions(bank_connection_id, booking_date desc);
create index bank_transactions_owner_idx on public.bank_transactions(owner_id);
create index enable_banking_sessions_state_idx on public.enable_banking_sessions(state_hash);

insert into public.integrations (owner_id, provider, connection_status)
select null, 'Enable Banking', 'not_connected'
where not exists (select 1 from public.integrations where owner_id is null and provider = 'Enable Banking');

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
