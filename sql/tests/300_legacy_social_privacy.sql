-- Legacy RPCs must honor the consent enforced by the newer social request API.
-- Synthetic identities only, restricted API role; all fixtures and reads rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
  d uuid:=gen_random_uuid(); e uuid:=gen_random_uuid();
begin
  perform set_config('titan.legacy_a',a::text,true);
  perform set_config('titan.legacy_b',b::text,true);
  perform set_config('titan.legacy_c',c::text,true);
  perform set_config('titan.legacy_d',d::text,true);
  perform set_config('titan.legacy_e',e::text,true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}'),(c,'{}'),(d,'{}'),(e,'{}');
  -- Server fixtures deliberately bypass write guards; calls below use authenticated.
  set local session_replication_role=replica;
  insert into public.profiles(id,username,level,friend_code,privacy,is_suspended)
  values
    (a,'qa_legacy_a',1,'TN-ZAAA2','{"publicProfile":true}',false),
    (b,'qa_legacy_private',42,'TN-ZABB3','{"publicProfile":false,"socialPresence":true}',false),
    (c,'qa_legacy_pending',43,'TN-ZACC4','{"publicProfile":true,"socialPresence":true,"showStats":true}',false),
    (d,'qa_legacy_suspended',44,'TN-ZADD5','{"publicProfile":true,"socialPresence":true}',true),
    (e,'qa_legacy_blocked',45,'TN-ZAEE6','{"publicProfile":true,"socialPresence":true}',false)
  on conflict(id) do update set username=excluded.username,level=excluded.level,
    friend_code=excluded.friend_code,privacy=excluded.privacy,is_suspended=excluded.is_suspended;
  insert into public.friendships(user_id_1,user_id_2,status) values(a,b,'accepted'),(a,c,'pending');
  insert into public.titan_user_blocks(blocker_id,blocked_id) values(e,a);
  insert into public.training_logs(user_id,sport,category,val,unit,xp,date,details)
  values(b,'running','cardio',5,'km',0,now()-interval '1 day','{}'),
    (c,'running','cardio',5,'km',0,now()-interval '1 day','{}');
  set local session_replication_role=origin;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.legacy_a'),'role','authenticated')::text,true);
do $$
declare failures text[]:='{}'; r record;
begin
  if exists(select 1 from public.titan_find_profile_by_friend_code('TN-ZABB3')) then
    failures:=array_append(failures,'lookup exposes private profile'); end if;
  if exists(select 1 from public.titan_find_profile_by_friend_code('TN-ZADD5')) then
    failures:=array_append(failures,'lookup exposes suspended profile'); end if;
  if exists(select 1 from public.titan_find_profile_by_friend_code('TN-ZAEE6')) then
    failures:=array_append(failures,'lookup bypasses target block'); end if;
  if not exists(select 1 from public.titan_find_profile_by_friend_code('tn-zacc4')
      where id=current_setting('titan.legacy_c')::uuid) then
    failures:=array_append(failures,'discoverable profile lookup broken'); end if;
  if exists(select 1 from public.titan_list_my_friends() where id=current_setting('titan.legacy_c')::uuid) then
    failures:=array_append(failures,'pending request exposes friend statistics before acceptance'); end if;
  select * into r from public.titan_list_my_friends() where id=current_setting('titan.legacy_b')::uuid;
  if not found or r.username<>'Agent prive' or r.friend_code is not null or r.avatar is not null
      or r.level<>1 or r.total_sessions<>0 or r.fav_sport is not null then
    failures:=array_append(failures,'private accepted friend or missing showStats exposes identity/statistics'); end if;
  assert cardinality(failures)=0,array_to_string(failures,'; ');
end $$;
reset role;
-- Acceptance opens the existing friend contract; block in either direction closes it.
set local session_replication_role=replica;
update public.friendships set status='accepted' where user_id_1=current_setting('titan.legacy_a')::uuid and user_id_2=current_setting('titan.legacy_c')::uuid;
set local session_replication_role=origin;
set local role authenticated;
do $$
begin
  assert exists(select 1 from public.titan_list_my_friends() where id=current_setting('titan.legacy_c')::uuid
    and level=43 and total_sessions=1 and fav_sport='running'),'accepted opted-in friend remains visible';
end $$;
reset role;
set local session_replication_role=replica;
update public.profiles set privacy='{"publicProfile":true,"socialPresence":true,"showStats":false}'
where id=current_setting('titan.legacy_c')::uuid;
set local session_replication_role=origin;
set local role authenticated;
do $$
begin
  assert exists(select 1 from public.titan_find_profile_by_friend_code('TN-ZACC4') where level=1),'lookup honors stats withdrawal';
  assert exists(select 1 from public.titan_list_my_friends() where id=current_setting('titan.legacy_c')::uuid
    and level=1 and total_sessions=0 and fav_sport is null),'friend list honors stats withdrawal';
end $$;
reset role;
set local session_replication_role=replica;
insert into public.titan_user_blocks(blocker_id,blocked_id)
values(current_setting('titan.legacy_a')::uuid,current_setting('titan.legacy_c')::uuid);
set local session_replication_role=origin;
set local role authenticated;
do $$
begin
  assert not exists(select 1 from public.titan_list_my_friends() where id=current_setting('titan.legacy_c')::uuid),'block hides accepted friend';
  assert not exists(select 1 from public.titan_find_profile_by_friend_code('TN-ZACC4')),'caller block hides lookup';
end $$;
reset role;
rollback;
