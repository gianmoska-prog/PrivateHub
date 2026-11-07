begin;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
insert into public.spending_category_rules(match_type, match_key, category) values ('merchant','qa merchant','groceries');
insert into public.spending_category_rules(match_type, match_key, category) values ('merchant','qa merchant','sport')
on conflict (owner_id,match_type,match_key) do update set category = excluded.category;
do $$ begin
  if (select category from public.spending_category_rules where match_key='qa merchant') <> 'sport' then raise exception 'Owner upsert failed'; end if;
  begin
    update public.spending_category_rules set owner_id='22222222-2222-2222-2222-222222222222';
    raise exception 'Owner reassignment permitted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.spending_category_rules(owner_id,match_type,match_key,category) values ('22222222-2222-2222-2222-222222222222','merchant','cross owner','sport');
    raise exception 'Cross-owner insert permitted';
  exception when insufficient_privilege then null; end;
  begin
    update public.spending_category_rules set category='invalid';
    raise exception 'Invalid category accepted';
  exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$ begin
  if exists(select 1 from public.spending_category_rules) then raise exception 'Cross-owner read permitted'; end if;
  update public.spending_category_rules set category='shopping';
  if found then raise exception 'Cross-owner update permitted'; end if;
end $$;
reset role;
do $$ begin
  if has_table_privilege('anon','public.spending_category_rules','select') then raise exception 'Anonymous access granted'; end if;
  if has_table_privilege('authenticated','public.spending_category_rules','delete') then raise exception 'Unnecessary delete privilege'; end if;
  if has_table_privilege('service_role','public.spending_category_rules','select') then raise exception 'Unnecessary service privilege'; end if;
end $$;
rollback;
