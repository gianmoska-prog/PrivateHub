create table public.savings_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  recorded_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.savings_history enable row level security;
alter table public.savings_history force row level security;
revoke all on table public.savings_history from public, anon, authenticated;
grant select on table public.savings_history to authenticated;

create policy savings_history_owner_select
on public.savings_history for select
to authenticated
using ((select auth.uid()) = owner_id);

create index savings_history_owner_recorded_idx
on public.savings_history(owner_id, recorded_at desc);

create index savings_history_account_recorded_idx
on public.savings_history(account_id, recorded_at desc);

create or replace function private_hub.record_manual_balance_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.balance_mode = 'manual'
    and new.manual_balance is not null
    and (old.manual_balance is distinct from new.manual_balance
      or old.manual_currency is distinct from new.manual_currency) then
    insert into public.savings_history (owner_id, account_id, amount, currency)
    values (new.owner_id, new.id, new.manual_balance, new.manual_currency);
  end if;
  return new;
end;
$$;

revoke execute on function private_hub.record_manual_balance_snapshot() from public, anon, authenticated;

create trigger accounts_record_manual_balance_snapshot
after update of manual_balance, manual_currency on public.accounts
for each row execute function private_hub.record_manual_balance_snapshot();

insert into public.savings_history (owner_id, account_id, amount, currency, recorded_at)
select owner_id, id, manual_balance, manual_currency, timezone('utc', now())
from public.accounts
where owner_id is not null
  and balance_mode = 'manual'
  and manual_balance is not null
  and not exists (
    select 1 from public.savings_history history where history.account_id = accounts.id
  );
