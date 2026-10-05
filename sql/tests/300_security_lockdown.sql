-- TITAN 300 — security lockdown checks. Synthetic identities only; everything is rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); g uuid;
begin
  perform set_config('titan.qa_user',a::text,true); perform set_config('titan.qa_other',b::text,true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
  insert into public.profiles(id,username,credits,level,xp) values(a,'qa_a',0,1,0),(b,'qa_b',5000,1,0)
    on conflict (id) do update set credits=excluded.credits;
  insert into public.guilds(name,owner_id,code,motto,weekly_target,level,xp) values('QA guild',b,'QA0000','',5,1,0) returning id into g;
  insert into public.guild_members(guild_id,user_id,role) values(g,b,'owner');
  perform set_config('titan.qa_guild',g::text,true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_user'),'role','authenticated')::text,true);
do $$
declare denied boolean:=false; g uuid:=current_setting('titan.qa_guild')::uuid;
begin
  -- Guild creation must go through the paid RPC.
  begin insert into public.guilds(name,owner_id,code) values('free guild',auth.uid(),'FREE01');
  exception when insufficient_privilege then denied:=true; end;
  assert denied,'direct guild insert denied'; denied:=false;
  -- Joining another guild without its code, with an owner role.
  begin insert into public.guild_members(guild_id,user_id,role) values(g,auth.uid(),'owner');
  exception when insufficient_privilege then denied:=true; end;
  assert denied,'direct guild membership denied'; denied:=false;
  -- Self-granted achievements, inventory and challenges.
  begin insert into public.user_achievements(user_id,achievement_id) values(auth.uid(),'lvl_10');
  exception when insufficient_privilege then denied:=true; end;
  assert denied,'direct achievement denied'; denied:=false;
  begin insert into public.social_challenges(challenger_id,opponent_id) values(auth.uid(),current_setting('titan.qa_other')::uuid);
  exception when insufficient_privilege then denied:=true; end;
  assert denied,'direct challenge denied'; denied:=false;
  assert not has_table_privilege('authenticated','public.training_logs','TRUNCATE'),'no truncate for users';
end $$;

-- The guild owner cannot rewrite guild counters directly.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_other'),'role','authenticated')::text,true);
do $$
declare denied boolean:=false;
begin
  begin update public.guilds set xp=999999, level=99 where owner_id=auth.uid();
  exception when insufficient_privilege then denied:=true; end;
  assert denied,'owner cannot rewrite guild counters';
  assert (select count(*)=1 from public.guilds where owner_id=auth.uid()),'owner still reads own guild';
end $$;
reset role;

-- Anonymous role: intake inserts only, no updates or deletes anywhere.
do $$
begin
  assert not has_table_privilege('anon','public.premium_access','INSERT'),'anon cannot insert premium access';
  assert not has_table_privilege('anon','public.site_settings','UPDATE'),'anon cannot update settings';
  assert not has_table_privilege('anon','public.dynamic_pages','DELETE'),'anon cannot delete pages';
  assert has_table_privilege('anon','public.contact_messages','INSERT'),'contact form still open';
  assert not has_table_privilege('anon','public.contact_messages','UPDATE'),'contact form append-only';
  assert not has_function_privilege('anon','private.titan_admin_grant_premium_v1(uuid,text,text,timestamptz,boolean,text)','EXECUTE'),'anon cannot reach admin functions';
  assert has_function_privilege('authenticated','private.titan_adventure_action(text,text,text,text,integer,integer,text)','EXECUTE'),'adventure still callable';
  assert (select count(*)=1 from pg_policies where schemaname='public' and tablename='achievements_config' and cmd='SELECT'),'single catalog read policy';
  assert not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and 'search_path=public'=any(coalesce(p.proconfig,'{}'))),'definer search_path pinned';
end $$;
rollback;
