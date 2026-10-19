-- Q-003: an administrator can moderate another account through the audited RPC, nobody else can,
-- and every moderation change is journaled with its author. Synthetic identities, full rollback.
begin;
do $$
declare a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); mo uuid:=gen_random_uuid(); u uuid:=gen_random_uuid();
begin
  perform set_config('titan.mod_admin',a::text,true); perform set_config('titan.mod_player',p::text,true);
  perform set_config('titan.mod_moderator',mo::text,true); perform set_config('titan.mod_user',u::text,true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(p,'{}'),(mo,'{}'),(u,'{}');
  update public.profiles set role='admin' where id=a;
  update public.profiles set role='moderator' where id=mo;
  update public.profiles set credits=700,xp=50,level=2 where id in (p,u);
end $$;

-- A signed-in administrator suspends, then restores, another account.
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.mod_admin'),'role','authenticated')::text,true);
do $$ declare p uuid:=current_setting('titan.mod_player')::uuid; a uuid:=current_setting('titan.mod_admin')::uuid; j jsonb; begin
  perform public.titan_admin_update_profile_v1(p,'{"status":"suspended"}','QA suspension');
  assert (select is_suspended and status='suspended' from public.profiles where id=p),'the admin suspended the account';
  assert (select credits=700 and xp=50 and level=2 from public.profiles where id=p),'moderation leaves progression untouched';
  perform public.titan_admin_update_profile_v1(p,'{"status":"active"}','QA restore');
  assert (select not is_suspended and status='active' from public.profiles where id=p),'the admin restored the account';
  j:=public.titan_economy_journal_v1(p,50);
  assert (select count(*)=2 from jsonb_array_elements(j->'entries') e
    where e->>'kind'='moderation' and e->>'actor_id'=a::text and e->>'actor_role'='authenticated'),
    'both actions are journaled with the administrator as author';
  assert exists(select 1 from jsonb_array_elements(j->'entries') e
    where e#>>'{changes,status,new}'='suspended' and e->>'actor_id'=a::text),'the suspension names the administrator';
end $$;

-- A moderator (not an administrator), a player, and a forged claim cannot touch another account.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.mod_moderator'),'role','authenticated')::text,true);
do $$ declare p uuid:=current_setting('titan.mod_player')::uuid; v int; begin
  begin perform public.titan_admin_update_profile_v1(p,'{"status":"banned"}','QA'); assert false,'moderator refused';
  exception when others then assert sqlerrm<>'moderator refused',sqlerrm; end;
  update public.profiles set status='banned',is_suspended=true where id=p; get diagnostics v=row_count;
  assert v=0 and (select status='active' from public.profiles where id=p),'direct moderation by a moderator has no effect';
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.mod_user'),'role','authenticated',
  'user_metadata',json_build_object('role','admin','is_admin',true),'app_metadata',json_build_object('role','admin'))::text,true);
do $$ declare p uuid:=current_setting('titan.mod_player')::uuid; v int; begin
  begin perform public.titan_admin_update_profile_v1(p,'{"status":"banned"}','QA'); assert false,'player refused';
  exception when others then assert sqlerrm<>'player refused',sqlerrm; end;
  update public.profiles set credits=0,status='banned' where id=p; get diagnostics v=row_count;
  assert v=0 and not exists(select 1 from public.profiles where id=p),'a player neither sees nor edits another profile';
  begin update public.profiles set id=id where id=current_setting('titan.mod_admin')::uuid;
  exception when others then null; end;
  assert not public.titan_is_admin(auth.uid()),'forged claims grant no admin right';
end $$;

-- Progression guards still bind administrators: an absurd balance jump is refused, not applied.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.mod_admin'),'role','authenticated')::text,true);
do $$ declare p uuid:=current_setting('titan.mod_player')::uuid; begin
  assert (select credits=700 and status='active' and not is_suspended from public.profiles where id=p),
    'the attempts by the moderator and the player changed nothing';
  perform public.titan_admin_update_profile_v1(p,'{"status":"active","credits":99999999}','QA absurd');
  assert (select credits=700 from public.profiles where id=p),'an administrator cannot bypass the credit jump guard';
end $$;
rollback;
