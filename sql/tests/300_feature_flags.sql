-- IDEA10 / ADS17: server feature flags. The public function resolves per caller and reveals nothing else; only administrators
-- write, and every write is audited. Synthetic identities, real RPCs with API roles, full rollback.
begin;
do $$
declare a uuid:=gen_random_uuid(); m uuid:=gen_random_uuid();
begin
  assert to_regprocedure('public.titan_feature_flags_v1()') is not null,'public RPC exists';
  assert to_regprocedure('public.titan_admin_feature_flags_v1()') is not null,'admin list RPC exists';
  assert to_regprocedure('public.titan_admin_feature_flag_set_v1(text,boolean,integer,text)') is not null,'admin set RPC exists';
  assert not exists(select 1 from private.titan_feature_flags),'no flag is seeded: nothing changes until an administrator sets one';
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(m,'{}');
  update public.profiles set role='admin' where id=a;
  perform set_config('titan.ff_a',a::text,true); perform set_config('titan.ff_m',m::text,true);
end $$;

set local role authenticated;
do $$
declare ok boolean; r jsonb; n integer; i integer; uid uuid;
begin
  -- Only administrators write and list.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ff_m'),'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_admin_feature_flag_set_v1('ads.web',true,100,null); exception when others then ok:=sqlerrm='ADMIN_ONLY'; end; assert ok,'a player cannot write a flag';
  ok:=false; begin perform public.titan_admin_feature_flags_v1(); exception when others then ok:=sqlerrm='ADMIN_ONLY'; end; assert ok,'a player cannot list flags';
  ok:=false; begin perform 1 from private.titan_feature_flags; exception when insufficient_privilege then ok:=true; end; assert ok,'table closed to the API';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_admin_feature_flag_set_v1('ads.web',true,100,null); exception when others then ok:=true; end; assert ok,'anonymous cannot write';

  -- Validation.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ff_a'),'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_admin_feature_flag_set_v1('X',true,100,null); exception when others then ok:=sqlerrm='KEY_INVALID'; end; assert ok,'key too short or badly formed';
  ok:=false; begin perform public.titan_admin_feature_flag_set_v1('bad key!',true,100,null); exception when others then ok:=sqlerrm='KEY_INVALID'; end; assert ok,'key with forbidden characters';
  ok:=false; begin perform public.titan_admin_feature_flag_set_v1('ads.web',null,100,null); exception when others then ok:=sqlerrm='STATE_REQUIRED'; end; assert ok,'state required';
  ok:=false; begin perform public.titan_admin_feature_flag_set_v1('ads.web',true,101,null); exception when others then ok:=sqlerrm='ROLLOUT_INVALID'; end; assert ok,'rollout above 100';
  ok:=false; begin perform public.titan_admin_feature_flag_set_v1('ads.web',true,-1,null); exception when others then ok:=sqlerrm='ROLLOUT_INVALID'; end; assert ok,'rollout below 0';
  ok:=false; begin perform public.titan_admin_feature_flag_set_v1('ads.web',true,100,repeat('x',201)); exception when others then ok:=sqlerrm='DESCRIPTION_TOO_LONG'; end; assert ok,'description too long';

  -- Set, read back, audited.
  r:=public.titan_admin_feature_flag_set_v1('Ads.Web',true,100,'Publicités du site'); assert r->>'key'='ads.web','key normalised';
  perform public.titan_admin_feature_flag_set_v1('rpg.rollout',true,0,'Déploiement progressif du RPG');
  perform public.titan_admin_feature_flag_set_v1('screens.new',false,100,null);
  r:=public.titan_admin_feature_flags_v1(); assert jsonb_array_length(r->'flags')=3,'administrator lists three flags';
  assert (select e->>'description' from jsonb_array_elements(r->'flags') e where e->>'key'='ads.web')='Publicités du site','description kept';
  r:=public.titan_admin_feature_flag_set_v1('ads.web',false,100,null);
  assert (select e->>'description' from jsonb_array_elements(public.titan_admin_feature_flags_v1()->'flags') e where e->>'key'='ads.web')='Publicités du site','an update without description keeps the previous one';
  assert exists(select 1 from public.titan_admin_audit where action='flag.set' and payload->>'key'='ads.web' and payload->'was'->>'enabled'='true' and (payload->>'enabled')='false'),'switch-off audited with the previous state';
  perform public.titan_admin_feature_flag_set_v1('ads.web',true,100,null);

  -- What a visitor and a player see: resolved booleans only.
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  r:=public.titan_feature_flags_v1();
  assert r->'flags'='{"ads.web": true, "rpg.rollout": false, "screens.new": false}'::jsonb,'a visitor gets true only for flags on for everybody: '||r::text;
  assert not (r::text like '%Publicités%' or r::text like '%progressif%' or r::text like '%updatedAt%' or r::text ~ '[0-9]{2,}'),'no rollout figure, description or date is exposed';
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ff_m'),'role','authenticated')::text,true);
  r:=public.titan_feature_flags_v1();
  assert r->'flags'='{"ads.web": true, "rpg.rollout": false, "screens.new": false}'::jsonb,'a player at 0% does not get rpg.rollout and a disabled flag is false: '||r::text;

  -- A partial rollout is stable per player and lands near its share.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ff_a'),'role','authenticated')::text,true);
  perform public.titan_admin_feature_flag_set_v1('rpg.rollout',true,100,null);
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ff_m'),'role','authenticated')::text,true);
  assert (public.titan_feature_flags_v1()->'flags'->>'rpg.rollout')::boolean,'at 100% every player gets it';
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ff_a'),'role','authenticated')::text,true);
  perform public.titan_admin_feature_flag_set_v1('rpg.rollout',true,30,null);
  n:=0;
  for i in 1..400 loop
    uid:=gen_random_uuid();
    perform set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
    if (public.titan_feature_flags_v1()->'flags'->>'rpg.rollout')::boolean then n:=n+1; end if;
    assert (public.titan_feature_flags_v1()->'flags'->>'rpg.rollout')::boolean=(public.titan_feature_flags_v1()->'flags'->>'rpg.rollout')::boolean,'stable for one player';
  end loop;
  assert n between 80 and 160,'about 30% of 400 players, got '||n;
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  assert (public.titan_feature_flags_v1()->'flags'->>'rpg.rollout')::boolean is false,'a visitor is never in a partial rollout';
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ff_a'),'role','authenticated')::text,true);
  perform public.titan_admin_feature_flag_set_v1('rpg.rollout',true,99,null);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  assert (public.titan_feature_flags_v1()->'flags'->>'rpg.rollout')::boolean is false,'even at 99% a visitor is not in the rollout';
  -- Switching off wins over any rollout.
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.ff_a'),'role','authenticated')::text,true);
  perform public.titan_admin_feature_flag_set_v1('rpg.rollout',false,100,null);
  perform public.titan_admin_feature_flag_set_v1('ads.web',false,100,null);
  assert public.titan_feature_flags_v1()->'flags'='{"ads.web": false, "rpg.rollout": false, "screens.new": false}'::jsonb,'everything switched off: every flag is false and wins over any default';
  assert public.titan_feature_flags_v1()->'flags' ? 'ads.web' and not (public.titan_feature_flags_v1()->'flags' ? 'unknown.flag'),'an unknown flag is absent so the client keeps its default';
end $$;
reset role;
-- Deleting the administrator keeps the flag and detaches it.
do $$
begin
  delete from auth.users where id=current_setting('titan.ff_a')::uuid;
  assert (select count(*) from private.titan_feature_flags)=3,'flags survive the account of the administrator who set them';
  assert (select count(*) from private.titan_feature_flags where updated_by is not null)=0,'and are detached from it';
end $$;
rollback;
