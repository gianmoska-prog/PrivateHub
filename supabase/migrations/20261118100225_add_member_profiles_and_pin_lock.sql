-- Member identity is independent of financial records. No existing owner data is copied.
alter table private_hub.owner_registry add column display_name text not null default 'Private Hub';
alter table private_hub.owner_registry add column language text not null default 'en' check (language in ('en','it','es'));
alter table private_hub.owner_registry add column initial_pin_hash text;
alter table private_hub.owner_registry add column document_preset text not null default 'general' check (document_preset in ('general','peruvian'));
alter table private_hub.owner_registry add column show_w212_goal boolean not null default false;
alter table public.documents drop constraint documents_country_check;
alter table public.documents add constraint documents_country_check check (country in ('Italy','Brazil','Peru','General'));

create table public.user_profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  language text not null default 'en' check (language in ('en','it','es')),
  show_w212_goal boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from public, anon, authenticated, service_role;
grant select on public.user_profiles to authenticated;
grant update (display_name, language) on public.user_profiles to authenticated;
grant select, insert, update, delete on public.user_profiles to service_role;
create policy profiles_select on public.user_profiles for select to authenticated using ((select auth.uid()) = owner_id);
create policy profiles_update on public.user_profiles for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create table private_hub.user_security (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text,
  failed_attempts integer not null default 0,
  locked_until timestamptz
);
create table private_hub.unlocked_sessions (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
create index unlocked_sessions_owner_idx on private_hub.unlocked_sessions(owner_id);
alter table private_hub.user_security enable row level security;
alter table private_hub.unlocked_sessions enable row level security;
revoke all on private_hub.user_security, private_hub.unlocked_sessions from public, anon, authenticated;

-- Private, narrow helpers: no caller-supplied user/session IDs, no raw PIN returned.
create function private_hub.pin_is_unlocked() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private_hub.unlocked_sessions u
    join auth.sessions s on s.id = u.session_id and s.user_id = u.owner_id
    join private_hub.user_security p on p.owner_id = u.owner_id
    where u.owner_id = (select auth.uid())
      and u.session_id = nullif(auth.jwt()->>'session_id','')::uuid
      and u.expires_at > now() and (p.locked_until is null or p.locked_until <= now())
  );
$$;
revoke all on function private_hub.pin_is_unlocked() from public, anon, authenticated;
grant usage on schema private_hub to authenticated;
grant execute on function private_hub.pin_is_unlocked() to authenticated;

create function private_hub.access_pin(action text, pin text, new_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  sid uuid := nullif(auth.jwt()->>'session_id','')::uuid;
  security private_hub.user_security%rowtype;
  recent_email boolean;
begin
  if caller is null or sid is null or not exists (select 1 from auth.sessions where id=sid and user_id=caller)
    or not exists (select 1 from private_hub.owner_registry where owner_id=caller)
  then raise exception 'UNAUTHORISED' using errcode='42501'; end if;
  select * into security from private_hub.user_security where owner_id=caller for update;
  if not found then raise exception 'UNAUTHORISED' using errcode='42501'; end if;
  if action = 'lock' then
    delete from private_hub.unlocked_sessions where session_id=sid;
  elsif action in ('setup','unlock','change','reset') then
    if action in ('setup','change','reset') and (new_pin is null or new_pin !~ '^[0-9]{4}$') then
      return jsonb_build_object('error','INVALID_PIN');
    end if;
    if action = 'reset' then
      -- Token refresh alone does not satisfy recovery. A fresh email OTP must have been verified.
      select exists (select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a
        where a->>'method'='otp' and (a->>'timestamp')::numeric between extract(epoch from now())-300 and extract(epoch from now())+30)
        into recent_email;
      if not recent_email then return jsonb_build_object('error','EMAIL_VERIFICATION_REQUIRED'); end if;
    elsif action='setup' then
      if security.pin_hash is not null then return jsonb_build_object('error','PIN_ALREADY_SET'); end if;
    else
      if security.locked_until > now() then
        return jsonb_build_object('error','PIN_COOLDOWN','retry_at',security.locked_until);
      end if;
      if pin is null or pin !~ '^[0-9]{4}$' or security.pin_hash is null or extensions.crypt(pin,security.pin_hash) <> security.pin_hash then
        update private_hub.user_security set
          failed_attempts = case when locked_until <= now() then 1 else failed_attempts+1 end,
          locked_until = case when (case when locked_until <= now() then 1 else failed_attempts+1 end) >= 5 then now()+interval '15 minutes' else null end
        where owner_id=caller returning * into security;
        return jsonb_build_object('error',case when security.locked_until > now() then 'PIN_COOLDOWN' else 'INCORRECT_PIN' end,'retry_at',security.locked_until);
      end if;
    end if;
    if action in ('setup','change','reset') then
      update private_hub.user_security set pin_hash=extensions.crypt(new_pin,extensions.gen_salt('bf',10)) where owner_id=caller;
      delete from private_hub.unlocked_sessions where owner_id=caller;
    end if;
    update private_hub.user_security set failed_attempts=0,locked_until=null where owner_id=caller;
    insert into private_hub.unlocked_sessions(session_id,owner_id,expires_at) values(sid,caller,now()+interval '12 hours')
      on conflict(session_id) do update set expires_at=excluded.expires_at;
  elsif action <> 'status' then
    return jsonb_build_object('error','INVALID_ACTION');
  end if;
  select * into security from private_hub.user_security where owner_id=caller;
  return jsonb_build_object('configured',security.pin_hash is not null,'unlocked',private_hub.pin_is_unlocked(),
    'retry_at',case when security.locked_until > now() then security.locked_until else null end,
    'expires_at',(select expires_at from private_hub.unlocked_sessions where session_id=sid));
end;
$$;
revoke all on function private_hub.access_pin(text,text,text) from public, anon, authenticated;
grant execute on function private_hub.access_pin(text,text,text) to authenticated;
create function public.private_hub_access(action text default 'status', pin text default null, new_pin text default null) returns jsonb
language sql security invoker set search_path = '' as $$ select private_hub.access_pin(action,pin,new_pin); $$;
revoke all on function public.private_hub_access(text,text,text) from public, anon, authenticated;
grant execute on function public.private_hub_access(text,text,text) to authenticated;

-- Restrictive policies are ANDed with all existing owner policies.
do $$ declare target text; begin
  foreach target in array array['accounts','memberships','documents','document_files','notes','integrations','bank_connections','bank_account_candidates','bank_transactions','savings_history','predicted_expenses','spending_category_rules'] loop
    execute format('create policy pin_required on public.%I as restrictive for all to authenticated using ((select private_hub.pin_is_unlocked())) with check ((select private_hub.pin_is_unlocked()))', target);
  end loop;
end $$;
create policy private_hub_storage_pin on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'private-hub-documents' or (select private_hub.pin_is_unlocked()))
  with check (bucket_id <> 'private-hub-documents' or (select private_hub.pin_is_unlocked()));

-- Future signups can never claim orphaned records belonging to the original owner.
create or replace function private_hub.claim_owner_on_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare member private_hub.owner_registry%rowtype;
begin
  select * into member from private_hub.owner_registry where lower(email)=lower(coalesce(new.email,'')) and owner_id is null for update;
  if not found then return new; end if;
  update private_hub.owner_registry set owner_id=new.id,claimed_at=now(),initial_pin_hash=null where email=member.email;
  insert into public.user_profiles(owner_id,display_name,language,show_w212_goal) values(new.id,member.display_name,member.language,member.show_w212_goal);
  insert into private_hub.user_security(owner_id,pin_hash) values(new.id,member.initial_pin_hash);
  insert into public.documents(owner_id,document_type,country,status) values
    (new.id,'Payslips','General','not_uploaded'),(new.id,'Miscellaneous','General','not_uploaded');
  if member.document_preset='peruvian' then
    insert into public.documents(owner_id,document_type,country,status) values
      (new.id,'DNI','Peru','not_uploaded'),(new.id,'Licencia de conducir','Peru','not_uploaded'),
      (new.id,'Pasaporte','Peru','not_uploaded'),(new.id,'Tessera Sanitaria','Italy','not_uploaded');
  end if;
  return new;
end;
$$;
revoke all on function private_hub.claim_owner_on_signup() from public,anon,authenticated;

-- Existing members receive profiles only; all financial/document history stays untouched.
insert into public.user_profiles(owner_id,display_name,language,show_w212_goal)
select owner_id,display_name,language,show_w212_goal from private_hub.owner_registry where owner_id is not null on conflict do nothing;
insert into private_hub.user_security(owner_id) select owner_id from private_hub.owner_registry where owner_id is not null on conflict do nothing;
