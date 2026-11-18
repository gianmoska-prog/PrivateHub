import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

test('full migration replay: PIN enforcement, member isolation, recovery and onboarding', async () => {
  const db = new PGlite({ extensions: { pgcrypto } })
  const a='11111111-1111-1111-1111-111111111111', b='22222222-2222-2222-2222-222222222222'
  const sa='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', sb='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  const scalar=async sql=>(await db.query(sql)).rows[0].v
  const asUser=async (id,sid,amr=[])=> {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:id,session_id:sid,amr})])
    await db.exec('set role authenticated')
  }
  const rpc=async (action,pin=null,newPin=null)=>(await db.query('select public.private_hub_access($1,$2,$3) v',[action,pin,newPin])).rows[0].v
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema extensions; create extension pgcrypto with schema extensions;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
      create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
      grant usage on schema auth to authenticated,anon;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
      grant usage on schema storage to authenticated;
      grant select,insert,update,delete on storage.objects to authenticated;
      insert into auth.users values ('${a}','first@example.test');
    `)
    for(const file of (await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort()) {
      await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'))
    }
    await db.exec(`
      insert into private_hub.owner_registry(email,owner_id,display_name) values ('first@example.test','${a}','First');
      insert into public.user_profiles(owner_id,display_name) values ('${a}','First');
      insert into private_hub.user_security(owner_id) values ('${a}');
      insert into private_hub.owner_registry(email,display_name,language,initial_pin_hash,document_preset)
      values ('second@example.test','Second','es',extensions.crypt('9753',extensions.gen_salt('bf',4)),'peruvian');
      insert into public.accounts(owner_id,institution) values ('${a}','First bank'),(null,'Orphan');
      insert into auth.users values ('${b}','second@example.test');
      insert into auth.sessions values ('${sa}','${a}'),('${sb}','${b}');
      insert into storage.objects(bucket_id,name,owner_id) values ('private-hub-documents','${a}/test.pdf','${a}'),('private-hub-documents','${b}/test.pdf','${b}');
    `)
    assert.equal(await scalar(`select count(*)::int v from public.accounts where owner_id='${b}'`),0,'new member gets no existing accounts')
    assert.equal(await scalar(`select count(*)::int v from public.accounts where owner_id is null`),1,'orphan records remain untouched')
    assert.equal(await scalar(`select count(*)::int v from public.documents where owner_id='${b}' and status='not_uploaded' and country='General'`),2)
    assert.equal(await scalar(`select count(*)::int v from public.documents where owner_id='${b}' and country='Peru'`),3)
    assert.equal(await scalar(`select count(*)::int v from public.documents where owner_id='${b}' and country='Italy' and document_type='Tessera Sanitaria'`),1)
    assert.equal(await scalar(`select show_w212_goal v from public.user_profiles where owner_id='${b}'`),false)
    assert.equal(await scalar(`select initial_pin_hash is null v from private_hub.owner_registry where owner_id='${b}'`),true)
    await db.exec('set role anon')
    await assert.rejects(db.query('select * from public.user_profiles'),/permission denied/)
    await assert.rejects(rpc('status'),/permission denied/)
    await asUser(a,sa)
    assert.equal(await scalar('select count(*)::int v from public.user_profiles'),1)
    await assert.rejects(db.query('select * from private_hub.user_security'),/permission denied/)
    await assert.rejects(db.query(`update public.user_profiles set owner_id='${b}'`),/permission denied/)
    assert.equal(await scalar('select count(*)::int v from public.accounts'),0)
    assert.equal(await scalar('select count(*)::int v from storage.objects'),0)
    await assert.rejects(db.query(`insert into public.notes(owner_id,title) values ('${a}','Locked')`),/row-level security/)
    assert.equal((await rpc('setup',null,'2468')).unlocked,true)
    assert.equal(await scalar('select count(*)::int v from public.accounts'),1)
    assert.equal(await scalar('select count(*)::int v from storage.objects'),1)
    await db.query(`insert into public.notes(owner_id,title) values ($1,'Private')`,[a])
    assert.equal((await rpc('lock')).unlocked,false)
    for(let i=0;i<5;i++) await rpc('unlock','0000')
    assert.equal((await rpc('unlock','2468')).error,'PIN_COOLDOWN')
    await db.exec('reset role')
    assert.equal(await scalar(`select failed_attempts v from private_hub.user_security where owner_id='${a}'`),5)
    await db.exec(`update private_hub.user_security set locked_until=now()-interval '1 minute' where owner_id='${a}'`)
    await asUser(a,sa)
    assert.equal((await rpc('unlock','2468')).unlocked,true)
    assert.equal((await rpc('reset',null,'8642')).error,'EMAIL_VERIFICATION_REQUIRED')
    await asUser(a,sa,[{method:'otp',timestamp:Math.floor(Date.now()/1000)-900}])
    assert.equal((await rpc('reset',null,'8642')).error,'EMAIL_VERIFICATION_REQUIRED')
    await asUser(a,sa,[{method:'otp',timestamp:Math.floor(Date.now()/1000)}])
    assert.equal((await rpc('reset',null,'8642')).unlocked,true)
    await rpc('lock')
    assert.equal((await rpc('unlock','2468')).error,'INCORRECT_PIN')
    assert.equal((await rpc('unlock','8642')).unlocked,true)
    await asUser(b,sb)
    assert.equal((await rpc('unlock','9753')).unlocked,true)
    assert.equal(await scalar('select count(*)::int v from public.accounts'),0)
    assert.equal(await scalar('select count(*)::int v from public.notes'),0)
    assert.equal(await scalar(`select language v from public.user_profiles`),'es')
    assert.equal(await scalar('select count(*)::int v from storage.objects'),1)
    await db.query(`insert into public.accounts(owner_id,institution) values ($1,'Second bank')`,[b])
    assert.equal(await scalar('select count(*)::int v from public.accounts'),1)
    await assert.rejects(db.query(`insert into public.accounts(owner_id,institution) values ($1,'Wrong owner')`,[a]),/row-level security/)
    await asUser(a,sa)
    assert.equal(await scalar(`select institution v from public.accounts`),'First bank')
    await db.exec('reset role')
    await db.exec(`delete from auth.sessions where id='${sa}'`)
    await asUser(a,sa)
    assert.equal(await scalar('select count(*)::int v from public.accounts'),0)
    await assert.rejects(rpc('status'),/UNAUTHORISED/)
  } finally { await db.close() }
})
