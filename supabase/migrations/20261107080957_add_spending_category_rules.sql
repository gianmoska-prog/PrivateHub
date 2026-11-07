create table public.spending_category_rules (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  match_type text not null check (match_type in ('transaction', 'merchant')),
  match_key text not null check (length(btrim(match_key)) between 1 and 200),
  category text not null check (category in ('groceries','dining','transport','shopping','bills','health','sport','fees','cash','transfers','other')),
  created_at timestamptz not null default now(),
  primary key (owner_id, match_type, match_key)
);
alter table public.spending_category_rules enable row level security;
revoke all on public.spending_category_rules from public, anon, authenticated, service_role;
grant select, insert, update on public.spending_category_rules to authenticated;
create policy spending_rules_select on public.spending_category_rules for select to authenticated
using ((select auth.uid()) = owner_id);
create policy spending_rules_insert on public.spending_category_rules for insert to authenticated
with check ((select auth.uid()) = owner_id);
create policy spending_rules_update on public.spending_category_rules for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
