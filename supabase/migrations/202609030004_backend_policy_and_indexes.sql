-- Explicit backend-only policies document the intended access boundary and keep
-- foreign-key maintenance efficient without exposing any rows to app users.
create policy owner_registry_service_role on private_hub.owner_registry
for all to service_role using (true) with check (true);

create policy enable_banking_sessions_service_role on public.enable_banking_sessions
for all to service_role using (true) with check (true);

create index bank_connections_canonical_account_idx on public.bank_connections(canonical_account_id);
create index bank_candidates_canonical_account_idx on public.bank_account_candidates(canonical_account_id);
create index enable_banking_sessions_owner_idx on public.enable_banking_sessions(owner_id);
create index enable_banking_sessions_canonical_account_idx on public.enable_banking_sessions(canonical_account_id);
