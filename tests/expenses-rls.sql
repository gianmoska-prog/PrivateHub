-- Run against the dedicated project. Every fixture and mutation is rolled back.
begin;
select set_config('private_hub.qa_owner', (select owner_id::text from public.accounts where owner_id is not null limit 1), true);
select set_config('private_hub.qa_id', gen_random_uuid()::text, true);
select set_config('request.jwt.claim.sub', current_setting('private_hub.qa_owner'), true);
set local role authenticated;

insert into public.predicted_expenses(id, title, amount, amount_status, expected_date)
values (current_setting('private_hub.qa_id')::uuid, 'QA rolled-back expense', 300, 'estimated', current_date);

do $$ begin
  if (select count(*) from public.predicted_expenses where id = current_setting('private_hub.qa_id')::uuid) <> 1 then raise exception 'Owner SELECT failed'; end if;
  update public.predicted_expenses set status = 'completed' where id = current_setting('private_hub.qa_id')::uuid;
  if not exists (select 1 from public.predicted_expenses where id = current_setting('private_hub.qa_id')::uuid and completed_at is not null) then raise exception 'Completion timestamp failed'; end if;
  update public.predicted_expenses set status = 'upcoming' where id = current_setting('private_hub.qa_id')::uuid;
  if not exists (select 1 from public.predicted_expenses where id = current_setting('private_hub.qa_id')::uuid and completed_at is null) then raise exception 'Reopen failed'; end if;
  begin
    update public.predicted_expenses set amount = -1 where id = current_setting('private_hub.qa_id')::uuid;
    raise exception 'Negative amount incorrectly accepted';
  exception when check_violation then null; end;
  begin
    update public.predicted_expenses set amount = null, amount_status = 'confirmed' where id = current_setting('private_hub.qa_id')::uuid;
    raise exception 'Unknown confirmed amount incorrectly accepted';
  exception when check_violation then null; end;
  begin
    update public.predicted_expenses set owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' where id = current_setting('private_hub.qa_id')::uuid;
    raise exception 'Ownership reassignment incorrectly accepted';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
do $$ declare affected integer; begin
  if exists(select 1 from public.predicted_expenses where id = current_setting('private_hub.qa_id')::uuid) then raise exception 'Cross-owner SELECT leaked a row'; end if;
  update public.predicted_expenses set title='Wrong owner' where id=current_setting('private_hub.qa_id')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-owner UPDATE affected a row'; end if;
  begin
    insert into public.predicted_expenses(owner_id,title,amount) values(current_setting('private_hub.qa_owner')::uuid,'Wrong owner insert',100);
    raise exception 'Cross-owner INSERT incorrectly accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.predicted_expenses where id=current_setting('private_hub.qa_id')::uuid;
    raise exception 'Hard delete incorrectly allowed';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin
    perform 1 from public.predicted_expenses;
    raise exception 'Anonymous SELECT incorrectly allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: owner CRUD, completion/reopening, constraints, cross-owner isolation and anonymous denial' as result;
rollback;
