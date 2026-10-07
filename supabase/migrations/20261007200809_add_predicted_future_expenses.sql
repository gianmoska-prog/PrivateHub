create table public.predicted_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 160),
  amount numeric(12,2) check (amount >= 0 and amount <= 9999999999.99),
  amount_status text not null default 'estimated' check (amount_status in ('confirmed', 'estimated')),
  expected_date date check (expected_date between date '1900-01-01' and date '9999-12-31'),
  category text check (length(category) <= 80),
  notes text check (length(notes) <= 3000),
  status text not null default 'upcoming' check (status in ('upcoming', 'completed')),
  completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount is not null or amount_status = 'estimated'),
  check ((status = 'completed') = (completed_at is not null))
);

alter table public.predicted_expenses enable row level security;
revoke all on public.predicted_expenses from public, anon, authenticated;
grant select, insert, update on public.predicted_expenses to authenticated;

create policy predicted_expenses_owner_select on public.predicted_expenses
for select to authenticated using ((select auth.uid()) = owner_id);
create policy predicted_expenses_owner_insert on public.predicted_expenses
for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy predicted_expenses_owner_update on public.predicted_expenses
for update to authenticated using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create index predicted_expenses_owner_date_idx on public.predicted_expenses(owner_id, status, expected_date)
where deleted_at is null;

create function private_hub.prepare_predicted_expense()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.title := btrim(new.title);
  new.category := nullif(btrim(new.category), '');
  new.notes := nullif(btrim(new.notes), '');
  if new.status = 'upcoming' then
    new.completed_at := null;
  elsif tg_op = 'INSERT' then
    new.completed_at := now();
  elsif old.status <> 'completed' then
    new.completed_at := now();
  else
    new.completed_at := old.completed_at;
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.updated_at := clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function private_hub.prepare_predicted_expense() from public, anon, authenticated;

create trigger predicted_expenses_prepare before insert or update on public.predicted_expenses
for each row execute function private_hub.prepare_predicted_expense();
