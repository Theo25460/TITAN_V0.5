-- TITAN LIVE v1: settles a live-session journal (training_logs.details.live) into cosmetic world progression
-- (Camp de base, Marches, Chronicles, finds). Never XP, never credits, never an advantage. Gated by flag screens.live.
-- Additive/replayable. Caller owns transaction. Rollback: drop the private.titan_live_* objects and the two public
-- wrappers. Players' XP, credits and sessions are never touched by this migration. A session excluded after its
-- settlement keeps its cosmetic resources (nothing is clawed back, like the rest of TITAN).

-- Catalogue mirrored from js/core/live-*.js (generated seed at the end, checked by tools/build-live-sql.mjs --check).
create table if not exists private.titan_live_voies(
 voie text primary key check(voie ~ '^[a-z]{3,16}$'),
 essence text not null check(essence in('souffle','acier','prisme','ardeur','seve')),
 family text not null check(family in('endurance','force','technique','jeu','mobilite')));
create table if not exists private.titan_live_sports(
 sport text primary key check(sport ~ '^[a-z0-9_]{2,48}$'),
 voie text not null references private.titan_live_voies(voie));
create table if not exists private.titan_live_missions(
 id text primary key check(id ~ '^[a-z]+\.[a-z_]{2,32}$'),
 voie text not null references private.titan_live_voies(voie),
 verify text not null check(verify in('engine','log','report','declared')),
 field text check(field is null or field ~ '^[A-Za-z_]{2,32}$'),
 op text check(op is null or op in('gte','lte','per')),
 threshold numeric, requires text, per_field text, per_max numeric,
 check(split_part(id,'.',1)=voie));
create table if not exists private.titan_live_finds(
 voie text not null references private.titan_live_voies(voie), idx smallint not null check(idx between 0 and 15),
 name text not null check(length(name) between 2 and 60), rare boolean not null default false, primary key(voie,idx));

-- Per-player state. One settlement per session, ever (primary key = log id): replays return the stored result.
create table if not exists private.titan_live_settlements(
 log_id uuid primary key references public.training_logs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 day date not null, week date not null,
 sport text not null, voie text not null references private.titan_live_voies(voie),
 family text not null, essence text not null, intent text not null check(intent in('atteindre','depasser','explorer')),
 effort_minutes integer not null check(effort_minutes between 0 and 1440),
 essence_amount integer not null check(essence_amount between 0 and 90),
 eclats integer not null check(eclats between 0 and 100),
 missions text[] not null default '{}' check(cardinality(missions)<=3),
 missions_ignored boolean not null default false,
 find_key text check(find_key is null or find_key ~ '^[a-z]+:[0-9]{1,2}$'), find_new boolean not null default false);
create index if not exists titan_live_settlements_user_day_idx on private.titan_live_settlements(user_id,day);
create index if not exists titan_live_settlements_user_week_idx on private.titan_live_settlements(user_id,week,family);
create table if not exists private.titan_live_wallets(
 user_id uuid primary key references auth.users(id) on delete cascade,
 eclats integer not null default 0 check(eclats between 0 and 10000000),
 souffle integer not null default 0 check(souffle between 0 and 10000000),
 acier integer not null default 0 check(acier between 0 and 10000000),
 prisme integer not null default 0 check(prisme between 0 and 10000000),
 ardeur integer not null default 0 check(ardeur between 0 and 10000000),
 seve integer not null default 0 check(seve between 0 and 10000000),
 updated_at timestamptz not null default now());
create table if not exists private.titan_live_buildings(
 user_id uuid not null references auth.users(id) on delete cascade,
 building text not null check(building in('observatoire','halle','atelier','arene','jardin','phare')),
 level smallint not null check(level between 1 and 5), updated_at timestamptz not null default now(),
 primary key(user_id,building));
create table if not exists private.titan_live_collection(
 user_id uuid not null references auth.users(id) on delete cascade,
 find_key text not null check(find_key ~ '^[a-z]+:[0-9]{1,2}$'),
 log_id uuid references public.training_logs(id) on delete set null,
 created_at timestamptz not null default now(), primary key(user_id,find_key));
create index if not exists titan_live_collection_log_idx on private.titan_live_collection(log_id);

do $$declare t text;begin
 foreach t in array array['titan_live_voies','titan_live_sports','titan_live_missions','titan_live_finds','titan_live_settlements',
  'titan_live_wallets','titan_live_buildings','titan_live_collection'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('revoke all on table private.%I from public,anon,authenticated',t);
 end loop;
end $$;

-- FNV-1a 32 bits over UTF-8 bytes. Identical to TitanLiveEngine.hash for the ASCII seeds used here (uuid:word:word).
create or replace function private.titan_live_hash(p text)
returns bigint language plpgsql immutable strict set search_path='' as $$
declare h bigint:=2166136261; b bytea:=convert_to(p,'UTF8'); i integer;
begin
 for i in 0..length(b)-1 loop
  h:=h # get_byte(b,i);
  h:=(h*16777619)%4294967296;
 end loop;
 return h;
end $$;
revoke all on function private.titan_live_hash(text) from public,anon,authenticated;

-- A JSON number that is finite (NaN and ±Infinity are refused: they would defeat every comparison).
create or replace function private.titan_live_num(p jsonb, p_key text)
returns numeric language sql immutable set search_path='' as $$
 select case when x is null or x::text in ('NaN','Infinity','-Infinity') then null else x end
 from (select public.titan_numeric_from_json(p,p_key) x) v;
$$;
revoke all on function private.titan_live_num(jsonb,text) from public,anon,authenticated;

create or replace function private.titan_live_enabled()
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((public.titan_feature_flags_v1()->'flags'->>'screens.live')::boolean,false);
$$;
revoke all on function private.titan_live_enabled() from public,anon,authenticated;

-- Settle one session (by its client_event_id). Every number comes from the server row, never from the journal:
-- essence = server effort minutes (daily cap 90, shared by every sport), éclats from verified missions only.
create or replace function private.titan_live_settle_v1(p_event uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid(); v_log public.training_logs%rowtype; v_set private.titan_live_settlements%rowtype;
 v_j jsonb; v_voie text; v_essence text; v_family text; v_intent text; v_effort integer; v_day date; v_week date;
 v_today integer; v_sessions integer; v_amount integer; v_eclats integer:=0; v_missions text[]:='{}'; v_declared integer:=0;
 v_m jsonb; v_id text; v_rule private.titan_live_missions%rowtype; v_val numeric; v_req numeric; v_ok boolean;
 v_active numeric; v_duration numeric; v_beats numeric; v_ignored boolean:=false; v_hold text;
 v_seed text; v_chance numeric; v_idx integer; v_find text; v_find_new boolean:=false; v_n integer;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_event is null then raise exception 'LIVE_EVENT_REQUIRED' using errcode='22023'; end if;
 perform 1 from public.profiles where id=v_uid and not coalesce(is_suspended,false) for update;
 if not found then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
 if not private.titan_live_enabled() then raise exception 'LIVE_DISABLED' using errcode='42501'; end if;
 select * into v_log from public.training_logs where user_id=v_uid and client_event_id=p_event;
 if not found then raise exception 'LIVE_SESSION_NOT_FOUND' using errcode='P0002'; end if;
 select * into v_set from private.titan_live_settlements where log_id=v_log.id;
 if found then return private.titan_live_result(v_set,true); end if;
 v_j:=v_log.details->'live';
 if v_j is null or jsonb_typeof(v_j)<>'object' or coalesce(v_j->>'v','')<>'1' then return jsonb_build_object('status','no_journal'); end if;
 if v_log.archived_at is not null or coalesce(v_log.is_suspicious,false)
    or coalesce(v_log.status,'valid')<>'valid'
    or coalesce(v_log.details->>'historical','false')='true' or coalesce(v_log.details->>'serverReward','false')<>'true' then
  return jsonb_build_object('status','not_eligible');
 end if;
 select h.status into v_hold from private.titan_reward_holds h where h.log_id=v_log.id;
 if v_hold='held' then return jsonb_build_object('status','held'); end if;
 if v_hold='cancelled' then return jsonb_build_object('status','not_eligible'); end if;
 if v_log.created_at<now()-interval '3 days' then return jsonb_build_object('status','too_late'); end if;
 select s.voie,v.essence,v.family into v_voie,v_essence,v_family from private.titan_live_sports s join private.titan_live_voies v using(voie) where s.sport=v_log.sport;
 if v_voie is null then return jsonb_build_object('status','unknown_sport'); end if;
 v_intent:=case when v_j->>'intent' in('atteindre','depasser','explorer') then v_j->>'intent' else 'atteindre' end;
 v_effort:=least(1440,greatest(0,floor(coalesce(private.titan_live_num(v_log.details->'effort','effort_minutes'),0))))::integer;
 v_day:=(v_log.created_at at time zone 'Europe/Paris')::date;
 v_week:=date_trunc('week',v_day)::date;
 select coalesce(sum(essence_amount),0),count(*) into v_today,v_sessions from private.titan_live_settlements where user_id=v_uid and day=v_day;
 v_amount:=greatest(0,least(v_effort,90-v_today));
 -- Éclats from the base, missions and finds only for the first two settlements of the day: many tiny sessions earn nothing more.
 if v_sessions<2 then v_eclats:=v_eclats+10; end if;

 -- Missions: the journal may only claim missions of its own Voie, plausible against the stored session.
 -- Reference duration: the server's own stamp at submission (clamped 0..1440, never edited afterwards).
 v_duration:=least(1440,greatest(0,coalesce(private.titan_live_num(v_log.details->'effort','minutes'),0)));
 v_active:=private.titan_live_num(v_j,'activeMin');
 v_beats:=private.titan_live_num(v_j,'beats');
 if coalesce(v_j->>'voie','')<>v_voie or v_active is null or v_beats is null or v_active<0 or v_active>v_duration*1.1+2
    or v_beats>v_active*4+10 or v_beats<0 then v_ignored:=true; end if;
 if not v_ignored and v_sessions<2 and least(v_active,v_duration)>=5 and jsonb_typeof(v_j->'missions')='array' then
  for v_m in select value from jsonb_array_elements(v_j->'missions') with ordinality as e(value,n) order by n limit 6 loop
   exit when cardinality(v_missions)>=3;
   v_id:=v_m->>'id';
   continue when v_id is null or v_id!~'^[a-z]+\.[a-z_]{2,32}$' or v_id=any(v_missions);
   select * into v_rule from private.titan_live_missions where id=v_id and voie=v_voie;
   continue when not found;
   v_ok:=true;
   if v_rule.verify='declared' then
    v_ok:=v_declared<1; if v_ok then v_declared:=v_declared+1; end if;
   elsif v_rule.verify='report' then
    v_val:=private.titan_live_num(v_log.details->'extras',v_rule.field);
    v_ok:=v_val is not null;
    if v_ok and v_rule.requires is not null then v_ok:=private.titan_live_num(v_log.details->'extras',v_rule.requires) is not null; end if;
    if v_ok and v_rule.op='gte' then v_ok:=v_val>=v_rule.threshold; end if;
    if v_ok and v_rule.op='lte' then v_ok:=v_val<=v_rule.threshold; end if;
    if v_ok and v_rule.op='per' then v_req:=private.titan_live_num(v_log.details->'extras',v_rule.per_field); v_ok:=coalesce(v_req>0 and v_val<=v_req*v_rule.per_max,false); end if;
   elsif v_rule.verify='log' then
    if v_rule.field='elevationM' then v_ok:=coalesce(private.titan_live_num(v_log.details,'elevation'),0)>=coalesce(v_rule.threshold,1);
    elsif v_rule.field='distanceM' then v_ok:=v_log.unit='km' and v_log.val*1000>=coalesce(v_rule.threshold,1);
    else v_ok:=v_duration>=coalesce(v_rule.threshold,5); end if;
   end if;
   if v_ok then v_missions:=v_missions||v_id; end if;
  end loop;
 end if;
 v_n:=cardinality(v_missions);
 if v_n>0 then v_eclats:=v_eclats+5*v_n+10; end if;
 if not exists(select 1 from private.titan_live_settlements where user_id=v_uid and week=v_week and family=v_family) then v_eclats:=v_eclats+10; end if;

 -- Find: drawn from the session id, the same draw as TitanLiveWorld.findOf.
 v_seed:=v_log.client_event_id::text;
 v_chance:=case v_intent when 'explorer' then 0.4 else 0.25 end;
 if private.titan_live_hash(v_seed||':find:'||v_voie)<v_chance*4294967296 then
  select count(*) into v_n from private.titan_live_finds where voie=v_voie;
  if v_n>0 then
   v_idx:=(private.titan_live_hash(v_seed||':item:'||v_voie)%v_n)::integer;
   v_find:=v_voie||':'||v_idx;
   insert into private.titan_live_collection(user_id,find_key,log_id) values(v_uid,v_find,v_log.id) on conflict(user_id,find_key) do nothing;
   get diagnostics v_n=row_count;
   v_find_new:=v_n=1;
   if not v_find_new and v_sessions<2 then v_eclats:=v_eclats+3; end if;
  end if;
 end if;

 insert into private.titan_live_settlements(log_id,user_id,day,week,sport,voie,family,essence,intent,effort_minutes,essence_amount,eclats,missions,missions_ignored,find_key,find_new)
 values(v_log.id,v_uid,v_day,v_week,v_log.sport,v_voie,v_family,v_essence,v_intent,v_effort,v_amount,least(100,v_eclats),v_missions,v_ignored,v_find,v_find_new)
 returning * into v_set;
 insert into private.titan_live_wallets(user_id) values(v_uid) on conflict(user_id) do nothing;
 update private.titan_live_wallets set eclats=eclats+v_set.eclats,
  souffle=souffle+case when v_essence='souffle' then v_amount else 0 end, acier=acier+case when v_essence='acier' then v_amount else 0 end,
  prisme=prisme+case when v_essence='prisme' then v_amount else 0 end, ardeur=ardeur+case when v_essence='ardeur' then v_amount else 0 end,
  seve=seve+case when v_essence='seve' then v_amount else 0 end, updated_at=now()
 where user_id=v_uid;
 return private.titan_live_result(v_set,false);
end $$;

create or replace function private.titan_live_result(s private.titan_live_settlements, p_replay boolean)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('status','settled','replay',p_replay,'voie',s.voie,'essence',s.essence,'essenceAmount',s.essence_amount,
  'eclats',s.eclats,'missions',to_jsonb(s.missions),'missionsIgnored',s.missions_ignored,'find',s.find_key,'findNew',s.find_new,
  'findName',(select f.name from private.titan_live_finds f where s.find_key=f.voie||':'||f.idx));
$$;

-- Raise a Camp building one level: its own essence first, universal éclats for the remainder.
create or replace function private.titan_live_build_v1(p_building text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); w private.titan_live_wallets%rowtype; v_level integer; v_cost integer; v_ess text; v_own integer:=0; v_rest integer;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.profiles where id=v_uid and not coalesce(is_suspended,false) for update;
 if not found then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
 if not private.titan_live_enabled() then raise exception 'LIVE_DISABLED' using errcode='42501'; end if;
 if p_building is null or p_building not in('observatoire','halle','atelier','arene','jardin','phare') then raise exception 'LIVE_BUILDING_UNKNOWN' using errcode='22023'; end if;
 select coalesce((select level from private.titan_live_buildings where user_id=v_uid and building=p_building),0) into v_level;
 if v_level>=5 then raise exception 'LIVE_BUILDING_MAX' using errcode='22023'; end if;
 v_cost:=(array[80,220,480,900,1500])[v_level+1];
 v_ess:=case p_building when 'observatoire' then 'souffle' when 'halle' then 'acier' when 'atelier' then 'prisme' when 'arene' then 'ardeur' when 'jardin' then 'seve' end;
 insert into private.titan_live_wallets(user_id) values(v_uid) on conflict(user_id) do nothing;
 select * into w from private.titan_live_wallets where user_id=v_uid for update;
 v_own:=case v_ess when 'souffle' then w.souffle when 'acier' then w.acier when 'prisme' then w.prisme when 'ardeur' then w.ardeur when 'seve' then w.seve else 0 end;
 v_own:=least(v_cost,v_own); v_rest:=v_cost-v_own;
 if w.eclats<v_rest then raise exception 'LIVE_NOT_ENOUGH' using errcode='22023'; end if;
 update private.titan_live_wallets set eclats=eclats-v_rest,
  souffle=souffle-case when v_ess='souffle' then v_own else 0 end, acier=acier-case when v_ess='acier' then v_own else 0 end,
  prisme=prisme-case when v_ess='prisme' then v_own else 0 end, ardeur=ardeur-case when v_ess='ardeur' then v_own else 0 end,
  seve=seve-case when v_ess='seve' then v_own else 0 end, updated_at=now() where user_id=v_uid;
 insert into private.titan_live_buildings(user_id,building,level) values(v_uid,p_building,v_level+1)
 on conflict(user_id,building) do update set level=excluded.level,updated_at=now();
 return private.titan_live_world_v1();
end $$;

-- The player's world: wallet, buildings, collection, per-Voie sessions and active days (for lands and chronicles).
create or replace function private.titan_live_world_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 return jsonb_build_object('version',1,'enabled',private.titan_live_enabled(),
  'wallet',coalesce((select jsonb_build_object('eclats',w.eclats,'essences',jsonb_build_object('souffle',w.souffle,'acier',w.acier,'prisme',w.prisme,'ardeur',w.ardeur,'seve',w.seve))
    from private.titan_live_wallets w where w.user_id=v_uid),jsonb_build_object('eclats',0,'essences',jsonb_build_object('souffle',0,'acier',0,'prisme',0,'ardeur',0,'seve',0))),
  'buildings',coalesce((select jsonb_object_agg(b.building,b.level) from private.titan_live_buildings b where b.user_id=v_uid),'{}'::jsonb),
  'collection',coalesce((select jsonb_agg(c.find_key order by c.created_at) from private.titan_live_collection c where c.user_id=v_uid),'[]'::jsonb),
  'voies',coalesce((select jsonb_object_agg(x.voie,jsonb_build_object('sessions',x.n,'days',x.d)) from(
    select voie,least(count(*),2*count(distinct day)) n,count(distinct day) d from private.titan_live_settlements where user_id=v_uid group by voie)x),'{}'::jsonb),
  'days',(select count(distinct day) from private.titan_live_settlements where user_id=v_uid),
  'distinctVoies',(select count(distinct voie) from private.titan_live_settlements where user_id=v_uid));
end $$;

revoke all on function private.titan_live_settle_v1(uuid),private.titan_live_result(private.titan_live_settlements,boolean),
 private.titan_live_build_v1(text),private.titan_live_world_v1() from public,anon;
revoke all on function private.titan_live_result(private.titan_live_settlements,boolean) from authenticated;
grant execute on function private.titan_live_settle_v1(uuid),private.titan_live_build_v1(text),private.titan_live_world_v1() to authenticated;

create or replace function public.titan_live_settle_v1(p_event uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.titan_live_settle_v1(p_event);$$;
create or replace function public.titan_live_build_v1(p_building text)
returns jsonb language sql security invoker set search_path='' as $$select private.titan_live_build_v1(p_building);$$;
create or replace function public.titan_live_world_v1()
returns jsonb language sql stable security invoker set search_path='' as $$select private.titan_live_world_v1();$$;
revoke all on function public.titan_live_settle_v1(uuid),public.titan_live_build_v1(text),public.titan_live_world_v1() from public,anon;
grant execute on function public.titan_live_settle_v1(uuid),public.titan_live_build_v1(text),public.titan_live_world_v1() to authenticated;

-- No flag is seeded (see sql/tests/300_feature_flags.sql): screens.live is absent, hence off, until an administrator
-- creates it with titan_admin_feature_flag_set_v1.

-- Own-data export of the live world. The global export chain (private.titan_export_extras_v1) is deliberately left
-- untouched: the V1.1/V1.3 postflight gates pin its shape. Joining it is a merge-time step (docs/live/INTEGRATION.md).
create or replace function private.titan_live_export_v1(p_uid uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'liveSettlements',coalesce((select jsonb_agg(to_jsonb(s)-'user_id' order by s.created_at) from private.titan_live_settlements s where s.user_id=p_uid),'[]'::jsonb),
  'liveWallet',(select to_jsonb(w)-'user_id' from private.titan_live_wallets w where w.user_id=p_uid),
  'liveBuildings',coalesce((select jsonb_agg(to_jsonb(b)-'user_id' order by b.building) from private.titan_live_buildings b where b.user_id=p_uid),'[]'::jsonb),
  'liveCollection',coalesce((select jsonb_agg(to_jsonb(c)-'user_id' order by c.created_at) from private.titan_live_collection c where c.user_id=p_uid),'[]'::jsonb));
$$;
revoke all on function private.titan_live_export_v1(uuid) from public,anon,authenticated;
create or replace function public.titan_live_export_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 return private.titan_live_export_v1(auth.uid());
end $$;
revoke all on function public.titan_live_export_v1() from public,anon;
grant execute on function public.titan_live_export_v1() to authenticated;

-- BEGIN GENERATED SEED (node tools/build-live-sql.mjs) — do not edit by hand.
insert into private.titan_live_voies(voie,essence,family) values
('sentier','souffle','endurance'),
('roue','souffle','endurance'),
('flots','souffle','endurance'),
('nage','souffle','endurance'),
('altitude','souffle','endurance'),
('forge','acier','force'),
('corps','acier','force'),
('paroi','prisme','technique'),
('joute','ardeur','jeu'),
('escouade','ardeur','jeu'),
('dojo','ardeur','jeu'),
('sanctuaire','seve','mobilite'),
('cible','prisme','technique'),
('scene','prisme','technique'),
('brasier','ardeur','jeu'),
('stade','souffle','endurance'),
('elements','prisme','technique'),
('pilotage','prisme','technique'),
('lien','seve','mobilite'),
('odyssee','souffle','endurance')
on conflict(voie) do update set essence=excluded.essence,family=excluded.family;
insert into private.titan_live_sports(sport,voie) values
('abs_session','corps'),
('acrobatic_gymnastics','scene'),
('adventure_racing','odyssee'),
('aerobic_gymnastics','scene'),
('aikido','dojo'),
('alpine_skiing','elements'),
('alpinism','altitude'),
('american_football','escouade'),
('aquagym','brasier'),
('aquathlon','odyssee'),
('archery','cible'),
('arm_wrestling','forge'),
('arnis_eskrima','dojo'),
('artistic_cycling','scene'),
('artistic_gymnastics','scene'),
('artistic_swimming','scene'),
('athletics','stade'),
('australian_rules_football','escouade'),
('badminton','joute'),
('ballet','scene'),
('bandy','escouade'),
('baseball','escouade'),
('basketball','escouade'),
('basketball_3x3','escouade'),
('beach_handball','escouade'),
('beach_soccer','escouade'),
('beach_tennis','joute'),
('beach_volleyball','escouade'),
('biathlon','odyssee'),
('billiards_pool','cible'),
('bjj','dojo'),
('blind_football','escouade'),
('bmx','elements'),
('bmx_freestyle','elements'),
('bmx_racing','stade'),
('bobsleigh','pilotage'),
('bocce','cible'),
('boccia','cible'),
('bodyboarding','elements'),
('bodyweight','corps'),
('bouldering','paroi'),
('bowling','cible'),
('boxing','dojo'),
('breakdance','scene'),
('camogie','escouade'),
('canoe_polo','escouade'),
('canoe_slalom','elements'),
('canoe_sprint','flots'),
('canyoning','elements'),
('capoeira','dojo'),
('cheerleading','scene'),
('circus','scene'),
('climbing','paroi'),
('climbing_route','paroi'),
('coastal_rowing','flots'),
('cricket','escouade'),
('croquet','cible'),
('cross_country_skiing','sentier'),
('crossfit','brasier'),
('curling','cible'),
('cycle_ball','escouade'),
('cycle_polo','escouade'),
('cycling','roue'),
('cycling_indoor','roue'),
('cycling_road','roue'),
('cycling_track','roue'),
('cyclocross','roue'),
('dance','scene'),
('darts','cible'),
('dips','corps'),
('disc_golf','cible'),
('diving','elements'),
('dodgeball','escouade'),
('dragon_boat','flots'),
('dressage','lien'),
('duathlon','odyssee'),
('elliptical','sentier'),
('equestrian','lien'),
('eventing','lien'),
('farmers_walk','forge'),
('fell_running','sentier'),
('fencing','dojo'),
('field_hockey','escouade'),
('figure_skating','scene'),
('finswimming','nage'),
('fitness_class','brasier'),
('flag_football','escouade'),
('floorball','escouade'),
('football','escouade'),
('freediving','elements'),
('freestyle_skiing','elements'),
('freestyle_wrestling','dojo'),
('futnet','escouade'),
('futsal','escouade'),
('gaelic_football','escouade'),
('goalball','escouade'),
('golf','cible'),
('grappling','dojo'),
('gravel','roue'),
('greco_roman_wrestling','dojo'),
('grip_sport','forge'),
('gymnastics','scene'),
('handball','escouade'),
('handbike','roue'),
('hapkido','dojo'),
('highland_games','forge'),
('hiit','brasier'),
('hiking','altitude'),
('hiphop','scene'),
('horse_racing','lien'),
('hurdles','stade'),
('hurling','escouade'),
('hyrox','brasier'),
('ice_climbing','paroi'),
('ice_hockey','escouade'),
('ice_skating','sentier'),
('inline_hockey','escouade'),
('inline_speed_skating','sentier'),
('judo','dojo'),
('kabaddi','escouade'),
('karate','dojo'),
('karting','pilotage'),
('kayak','flots'),
('kendo','dojo'),
('kettlebell','forge'),
('kho_kho','escouade'),
('kickboxing','dojo'),
('kitesurf','elements'),
('korfball','escouade'),
('krav_maga','dojo'),
('kung_fu','dojo'),
('lacrosse','escouade'),
('lacrosse_sixes','escouade'),
('lifesaving_sport','stade'),
('luge','pilotage'),
('mma','dojo'),
('modern_pentathlon','odyssee'),
('motocross','pilotage'),
('mountain_bike','roue'),
('muscu_builder','forge'),
('muscu_gym','forge'),
('muscu_home','forge'),
('netball','escouade'),
('nordic_combined','odyssee'),
('nordic_walk','sentier'),
('obstacle_course','odyssee'),
('open_water_swimming','nage'),
('orienteering','sentier'),
('outrigger_canoe','flots'),
('paddle','flots'),
('padel','joute'),
('para_athletics','stade'),
('para_cycling','roue'),
('para_powerlifting','forge'),
('para_swimming','nage'),
('paragliding','elements'),
('parkour','elements'),
('petanque','cible'),
('pickleball','joute'),
('pilates','sanctuaire'),
('plank','corps'),
('platform_tennis','joute'),
('pole_dance','scene'),
('polo','escouade'),
('pompes','corps'),
('powerlifting','forge'),
('qigong','sanctuaire'),
('race_walking','sentier'),
('racketlon','joute'),
('racquetball','joute'),
('rafting','elements'),
('real_tennis','joute'),
('rhythmic_gymnastics','scene'),
('ringette','escouade'),
('rogaining','sentier'),
('roller','sentier'),
('roller_derby','escouade'),
('roller_ski','sentier'),
('rope_jump','brasier'),
('rowing','flots'),
('rowing_machine','flots'),
('rucking','sentier'),
('rugby','escouade'),
('rugby_sevens','escouade'),
('running','sentier'),
('sailing','elements'),
('salsa','scene'),
('sambo','dojo'),
('sandbag','forge'),
('savate','dojo'),
('sepak_takraw','escouade'),
('shooting','cible'),
('short_track_speed_skating','sentier'),
('show_jumping','lien'),
('sitting_volleyball','escouade'),
('skateboarding','elements'),
('skeleton','pilotage'),
('ski_jumping','elements'),
('ski_mountaineering','altitude'),
('ski_orienteering','sentier'),
('ski_touring','altitude'),
('skimboarding','elements'),
('skydiving','elements'),
('snooker','cible'),
('snorkeling','elements'),
('snowboard','elements'),
('snowshoeing','altitude'),
('softball','escouade'),
('speed_skating','sentier'),
('speed_skiing','pilotage'),
('spinning','roue'),
('sport_climbing','paroi'),
('springboard_diving','scene'),
('sprint','stade'),
('squash','joute'),
('squat','corps'),
('stair_climbing','brasier'),
('street_workout','corps'),
('stretching','sanctuaire'),
('strongman','forge'),
('sumo','dojo'),
('surfing','elements'),
('surfski','flots'),
('swimming','nage'),
('swimrun','odyssee'),
('table_tennis','joute'),
('taekwondo','dojo'),
('taichi','sanctuaire'),
('tchoukball','escouade'),
('telemark_skiing','elements'),
('tennis','joute'),
('thaiboxing','dojo'),
('tractions','corps'),
('trail','sentier'),
('trampoline_gymnastics','scene'),
('treadmill','sentier'),
('trekking','altitude'),
('triathlon','odyssee'),
('trx','forge'),
('tug_of_war','forge'),
('ultimate','escouade'),
('underwater_hockey','escouade'),
('underwater_rugby','escouade'),
('velotaf','roue'),
('via_ferrata','paroi'),
('volleyball','escouade'),
('wakeboard','elements'),
('walking','sentier'),
('water_polo','escouade'),
('water_skiing','elements'),
('weightlifting','forge'),
('wheelchair_basketball','escouade'),
('wheelchair_rugby','escouade'),
('wheelchair_tennis','joute'),
('windsurf','elements'),
('wrestling','dojo'),
('wushu','dojo'),
('yoga','sanctuaire'),
('yoga_mobility','sanctuaire'),
('zumba','scene')
on conflict(sport) do update set voie=excluded.voie;
insert into private.titan_live_missions(id,voie,verify,field,op,threshold,requires,per_field,per_max) values
('altitude.demi_tour','altitude','declared',null,null,null,null,null,null),
('altitude.denivele','altitude','log','elevationM','gte',null,null,null,null),
('altitude.panorama','altitude','declared',null,null,null,null,null,null),
('altitude.r_elevation','altitude','report','elevation','gte',100,null,null,null),
('altitude.r_max_altitude_m','altitude','report','max_altitude_m','gte',1,null,null,null),
('altitude.r_runs','altitude','report','runs','gte',3,null,null,null),
('altitude.refuges','altitude','engine','beats',null,null,null,null,null),
('brasier.format','brasier','declared',null,null,null,null,null,null),
('brasier.r_drills','brasier','report','drills','gte',1,null,null,null),
('brasier.r_elevation','brasier','report','elevation','gte',100,null,null,null),
('brasier.r_stations','brasier','report','stations','gte',8,null,null,null),
('brasier.remparts','brasier','engine','restsRespected',null,null,null,null,null),
('brasier.vague_plus','brasier','engine','beats',null,null,null,null,null),
('brasier.vagues','brasier','engine','beats',null,null,null,null,null),
('cible.constellation','cible','engine','field',null,null,null,null,null),
('cible.distance','cible','declared',null,null,null,null,null,null),
('cible.r_best_break','cible','report','best_break','gte',20,null,null,null),
('cible.r_checkout_pct','cible','report','checkout_pct','gte',30,null,null,null),
('cible.r_games','cible','report','games','gte',3,null,null,null),
('cible.r_holes','cible','report','holes','gte',9,null,null,null),
('cible.r_pointing_success','cible','report','pointing_success','gte',1,null,null,null),
('cible.r_putts','cible','report','putts','per',null,null,'holes',2),
('cible.r_safety_shots','cible','report','safety_shots','gte',3,null,null,null),
('cible.r_spares','cible','report','spares','gte',2,null,null,null),
('cible.r_successful_shots','cible','report','successful_shots','gte',3,null,null,null),
('cible.routine','cible','declared',null,null,null,null,null,null),
('cible.volees','cible','engine','beats',null,null,null,null,null),
('corps.paliers','corps','engine','beats',null,null,null,null,null),
('corps.propre','corps','engine','beatStreak',null,null,null,null,null),
('corps.r_hold_seconds','corps','report','hold_seconds','gte',30,null,null,null),
('corps.respiration','corps','declared',null,null,null,null,null,null),
('corps.variante','corps','engine','field',null,null,null,null,null),
('dojo.controle','dojo','declared',null,null,null,null,null,null),
('dojo.nouvelle','dojo','engine','field',null,null,null,null,null),
('dojo.r_bouts','dojo','report','bouts','gte',3,null,null,null),
('dojo.r_clean_strikes','dojo','report','clean_strikes','gte',10,null,null,null),
('dojo.r_combinations','dojo','report','combinations','gte',5,null,null,null),
('dojo.r_defensive_actions','dojo','report','defensive_actions','gte',10,null,null,null),
('dojo.r_escapes','dojo','report','escapes','gte',2,null,null,null),
('dojo.r_routines','dojo','report','routines','gte',1,null,null,null),
('dojo.r_takedowns','dojo','report','takedowns','gte',1,null,null,null),
('dojo.r_techniques','dojo','report','techniques','gte',5,null,null,null),
('dojo.r_touches','dojo','report','touches','gte',5,null,null,null),
('dojo.repos','dojo','engine','restsRespected',null,null,null,null,null),
('dojo.rounds','dojo','engine','beats',null,null,null,null,null),
('dojo.technique','dojo','engine','distinct',null,null,null,null,null),
('elements.lecture','elements','engine','field',null,null,null,null,null),
('elements.page','elements','engine','field',null,null,null,null,null),
('elements.r_distance_nm','elements','report','distance_nm','gte',2,null,null,null),
('elements.r_elevation','elements','report','elevation','gte',100,null,null,null),
('elements.r_flights','elements','report','flights','gte',1,null,null,null),
('elements.r_landings','elements','report','landings','gte',3,null,null,null),
('elements.r_laps','elements','report','laps','gte',5,null,null,null),
('elements.r_maneuvers','elements','report','maneuvers','gte',5,null,null,null),
('elements.r_max_altitude_m','elements','report','max_altitude_m','gte',1,null,null,null),
('elements.r_penalties','elements','report','penalties','lte',2,'gates',null,null),
('elements.r_planing_minutes','elements','report','planing_minutes','gte',5,null,null,null),
('elements.r_rapids','elements','report','rapids','gte',1,null,null,null),
('elements.r_rides','elements','report','rides','gte',1,null,null,null),
('elements.r_routines','elements','report','routines','gte',1,null,null,null),
('elements.r_runs','elements','report','runs','gte',3,null,null,null),
('elements.r_tricks','elements','report','tricks','gte',1,null,null,null),
('elements.r_vertical_m','elements','report','vertical_m','gte',500,null,null,null),
('elements.securite','elements','declared',null,null,null,null,null,null),
('elements.technique','elements','declared',null,null,null,null,null,null),
('escouade.match','escouade','engine','beats',null,null,null,null,null),
('escouade.poste','escouade','declared',null,null,null,null,null,null),
('escouade.r_aces','escouade','report','aces','gte',1,null,null,null),
('escouade.r_assists','escouade','report','assists','gte',1,null,null,null),
('escouade.r_balls_faced','escouade','report','balls_faced','gte',12,null,null,null),
('escouade.r_blocks','escouade','report','blocks','gte',2,null,null,null),
('escouade.r_defensive_stops','escouade','report','defensive_stops','gte',3,null,null,null),
('escouade.r_digs','escouade','report','digs','gte',3,null,null,null),
('escouade.r_elevation','escouade','report','elevation','gte',100,null,null,null),
('escouade.r_hits','escouade','report','hits','gte',1,null,null,null),
('escouade.r_jams','escouade','report','jams','gte',5,null,null,null),
('escouade.r_key_passes','escouade','report','key_passes','gte',2,null,null,null),
('escouade.r_meters_carried','escouade','report','meters_carried','gte',100,null,null,null),
('escouade.r_minutes_played','escouade','report','minutes_played','gte',10,null,null,null),
('escouade.r_rebounds','escouade','report','rebounds','gte',3,null,null,null),
('escouade.r_runs','escouade','report','runs','gte',3,null,null,null),
('escouade.r_saves','escouade','report','saves','gte',1,null,null,null),
('escouade.r_steals','escouade','report','steals','gte',1,null,null,null),
('escouade.r_successful_defences','escouade','report','successful_defences','gte',3,null,null,null),
('escouade.r_tackles','escouade','report','tackles','gte',3,null,null,null),
('escouade.r_turnovers','escouade','report','turnovers','lte',3,'minutes_played',null,null),
('escouade.rapport','escouade','engine','field',null,null,null,null,null),
('escouade.serment','escouade','declared',null,null,null,null,null,null),
('flots.amers','flots','engine','beats',null,null,null,null,null),
('flots.baie','flots','engine','field',null,null,null,null,null),
('flots.cadence','flots','engine','beats',null,null,null,null,null),
('flots.cote','flots','log','activeMin','gte',null,null,null,null),
('flots.r_intervals','flots','report','intervals','gte',4,null,null,null),
('flots.retour','flots','declared',null,null,null,null,null,null),
('forge.braise','forge','engine','restsRespected',null,null,null,null,null),
('forge.lame_neuve','forge','engine','field',null,null,null,null,null),
('forge.nettes','forge','engine','beatStreak',null,null,null,null,null),
('forge.plan','forge','engine','beats',null,null,null,null,null),
('forge.r_bouts','forge','report','bouts','gte',3,null,null,null),
('forge.r_hold_seconds','forge','report','hold_seconds','gte',30,null,null,null),
('forge.r_pulls','forge','report','pulls','gte',3,null,null,null),
('forge.r_warmup_sets','forge','report','warmup_sets','gte',2,null,null,null),
('forge.seuil','forge','engine','field',null,null,null,null,null),
('joute.manches','joute','engine','beats',null,null,null,null,null),
('joute.partenaire','joute','declared',null,null,null,null,null,null),
('joute.r_aces','joute','report','aces','gte',1,null,null,null),
('joute.r_double_faults','joute','report','double_faults','lte',2,'sets_won',null,null),
('joute.r_first_serve_pct','joute','report','first_serve_pct','gte',60,null,null,null),
('joute.r_rally_quality_score','joute','report','rally_quality_score','gte',7,null,null,null),
('joute.r_unforced_errors','joute','report','unforced_errors','lte',10,'sets_won',null,null),
('joute.remontee','joute','engine','field',null,null,null,null,null),
('joute.sequence','joute','engine','beatStreak',null,null,null,null,null),
('joute.service','joute','declared',null,null,null,null,null,null),
('lien.calme','lien','declared',null,null,null,null,null,null),
('lien.dehors','lien','declared',null,null,null,null,null,null),
('lien.figure','lien','declared',null,null,null,null,null,null),
('lien.r_faults','lien','report','faults','lte',0,'jumps',null,null),
('lien.r_figures','lien','report','figures','gte',1,null,null,null),
('lien.r_gaits_minutes','lien','report','gaits_minutes','gte',10,null,null,null),
('lien.reprises','lien','log','activeMin','gte',null,null,null,null),
('nage.eau_libre','nage','declared',null,null,null,null,null,null),
('nage.ilots','nage','engine','beats',null,null,null,null,null),
('nage.nages','nage','engine','distinct',null,null,null,null,null),
('nage.plan','nage','engine','beats',null,null,null,null,null),
('nage.r_drills','nage','report','drills','gte',1,null,null,null),
('nage.r_intervals','nage','report','intervals','gte',4,null,null,null),
('nage.technique','nage','engine','beats',null,null,null,null,null),
('odyssee.ordre','odyssee','declared',null,null,null,null,null,null),
('odyssee.r_elevation','odyssee','report','elevation','gte',100,null,null,null),
('odyssee.r_obstacles','odyssee','report','obstacles','gte',10,null,null,null),
('odyssee.r_obstacles_failed','odyssee','report','obstacles_failed','lte',2,'obstacles',null,null),
('odyssee.r_runs','odyssee','report','runs','gte',3,null,null,null),
('odyssee.r_stations','odyssee','report','stations','gte',8,null,null,null),
('odyssee.r_targets_hit','odyssee','report','targets_hit','gte',5,null,null,null),
('odyssee.r_transitions_s','odyssee','report','transitions_s','gte',1,null,null,null),
('odyssee.segments','odyssee','engine','beats',null,null,null,null,null),
('odyssee.transitions','odyssee','declared',null,null,null,null,null,null),
('paroi.flash','paroi','engine','beats',null,null,null,null,null),
('paroi.lecture','paroi','engine','beats',null,null,null,null,null),
('paroi.projet','paroi','engine','beats',null,null,null,null,null),
('paroi.r_pitches','paroi','report','pitches','gte',3,null,null,null),
('paroi.repos','paroi','engine','restsRespected',null,null,null,null,null),
('paroi.secteur','paroi','declared',null,null,null,null,null,null),
('pilotage.briefing','pilotage','declared',null,null,null,null,null,null),
('pilotage.constance','pilotage','declared',null,null,null,null,null,null),
('pilotage.nouveau','pilotage','declared',null,null,null,null,null,null),
('pilotage.r_elevation','pilotage','report','elevation','gte',100,null,null,null),
('pilotage.r_laps','pilotage','report','laps','gte',5,null,null,null),
('pilotage.r_runs','pilotage','report','runs','gte',3,null,null,null),
('pilotage.sessions','pilotage','declared',null,null,null,null,null,null),
('roue.cadence','roue','declared',null,null,null,null,null,null),
('roue.col','roue','log','elevationM','gte',150,null,null,null),
('roue.endurance','roue','log','activeMin','gte',null,null,null,null),
('roue.inconnu','roue','engine','field',null,null,null,null,null),
('roue.r_elevation','roue','report','elevation','gte',100,null,null,null),
('roue.r_laps','roue','report','laps','gte',5,null,null,null),
('roue.r_sprints','roue','report','sprints','gte',3,null,null,null),
('roue.relais','roue','engine','beats',null,null,null,null,null),
('roue.relier','roue','log','activeMin','gte',null,null,null,null),
('roue.variations','roue','declared',null,null,null,null,null,null),
('sanctuaire.nouvelle','sanctuaire','declared',null,null,null,null,null,null),
('sanctuaire.r_breath_minutes','sanctuaire','report','breath_minutes','gte',5,null,null,null),
('sanctuaire.r_hold_seconds','sanctuaire','report','hold_seconds','gte',30,null,null,null),
('sanctuaire.r_movements','sanctuaire','report','movements','gte',10,null,null,null),
('sanctuaire.r_pain_after','sanctuaire','report','pain_after','gte',0,'pain_before',null,null),
('sanctuaire.r_poses','sanctuaire','report','poses','gte',10,null,null,null),
('sanctuaire.souffle','sanctuaire','declared',null,null,null,null,null,null),
('sanctuaire.tenue','sanctuaire','declared',null,null,null,null,null,null),
('sanctuaire.terrasses','sanctuaire','log','activeMin','gte',null,null,null,null),
('scene.echauffement','scene','declared',null,null,null,null,null,null),
('scene.improvisation','scene','declared',null,null,null,null,null,null),
('scene.r_apparatus','scene','report','apparatus','gte',1,null,null,null),
('scene.r_elevation','scene','report','elevation','gte',100,null,null,null),
('scene.r_figures','scene','report','figures','gte',1,null,null,null),
('scene.r_landings','scene','report','landings','gte',3,null,null,null),
('scene.r_routines','scene','report','routines','gte',1,null,null,null),
('scene.r_runs','scene','report','runs','gte',3,null,null,null),
('scene.r_spins','scene','report','spins','gte',3,null,null,null),
('scene.r_tricks','scene','report','tricks','gte',1,null,null,null),
('scene.repetitions','scene','engine','beats',null,null,null,null,null),
('scene.representation','scene','engine','beats',null,null,null,null,null),
('sentier.brouillard','sentier','engine','field',null,null,null,null,null),
('sentier.cap_moitie','sentier','log','activeMin','gte',null,null,null,null),
('sentier.echo','sentier','engine','beats',null,null,null,null,null),
('sentier.final_souple','sentier','declared',null,null,null,null,null,null),
('sentier.halte','sentier','declared',null,null,null,null,null,null),
('sentier.r_controls_missed','sentier','report','controls_missed','lte',0,'controls',null,null),
('sentier.r_elevation','sentier','report','elevation','gte',100,null,null,null),
('sentier.r_intervals','sentier','report','intervals','gte',4,null,null,null),
('sentier.r_laps','sentier','report','laps','gte',5,null,null,null),
('sentier.r_max_altitude_m','sentier','report','max_altitude_m','gte',1,null,null,null),
('sentier.r_navigation_errors','sentier','report','navigation_errors','lte',1,'controls',null,null),
('sentier.r_runs','sentier','report','runs','gte',3,null,null,null),
('sentier.regulier','sentier','declared',null,null,null,null,null,null),
('stade.epreuve','stade','declared',null,null,null,null,null,null),
('stade.marque','stade','engine','field',null,null,null,null,null),
('stade.r_elevation','stade','report','elevation','gte',100,null,null,null),
('stade.r_runs','stade','report','runs','gte',3,null,null,null),
('stade.recuperation','stade','engine','restsRespected',null,null,null,null,null),
('stade.tentatives','stade','engine','beats',null,null,null,null,null)
on conflict(id) do update set voie=excluded.voie,verify=excluded.verify,field=excluded.field,op=excluded.op,threshold=excluded.threshold,requires=excluded.requires,per_field=excluded.per_field,per_max=excluded.per_max;
insert into private.titan_live_finds(voie,idx,name,rare) values
('sentier',0,'Borne gravée',false),
('sentier',1,'Lanterne de brume',false),
('sentier',2,'Carte froissée',false),
('sentier',3,'Bâton du passeur',false),
('sentier',4,'Boussole de brume',true),
('sentier',5,'Sceau du Passeur',true),
('roue',0,'Fanion de relais',false),
('roue',1,'Rayon d’argent',false),
('roue',2,'Carnet de route',false),
('roue',3,'Sacoche du messager',false),
('roue',4,'Plaque de col',true),
('roue',5,'Lanterne de la Dame',true),
('flots',0,'Amer miniature',false),
('flots',1,'Coquillage du portulan',false),
('flots',2,'Pagaie gravée',false),
('flots',3,'Fiole d’embruns',false),
('flots',4,'Compas de la Gardienne',true),
('flots',5,'Ancre de verre',true),
('nage',0,'Perle d’îlot',false),
('nage',1,'Écaille irisée',false),
('nage',2,'Lunettes anciennes',false),
('nage',3,'Bouée de corail',false),
('nage',4,'Lampe des abysses',true),
('nage',5,'Sceau du Veilleur',true),
('altitude',0,'Pierre de refuge',false),
('altitude',1,'Piolet miniature',false),
('altitude',2,'Carte des massifs',false),
('altitude',3,'Gourde d’ermite',false),
('altitude',4,'Cristal de sommet',true),
('altitude',5,'Sablier de demi-tour',true),
('forge',0,'Plaque du Colosse',false),
('forge',1,'Marteau d’apprenti',false),
('forge',2,'Pierre à aiguiser',false),
('forge',3,'Chaîne de trempe',false),
('forge',4,'Lame de reflet',true),
('forge',5,'Enclume du maître',true),
('corps',0,'Étoile de craie',false),
('corps',1,'Bandeau tressé',false),
('corps',2,'Carte du ciel corporel',false),
('corps',3,'Anneau de suspension',false),
('corps',4,'Étoile filante',true),
('corps',5,'Statuette de l’Acrobate',true),
('paroi',0,'Prise lue',false),
('paroi',1,'Mousqueton gravé',false),
('paroi',2,'Sac à magnésie',false),
('paroi',3,'Corde lovée',false),
('paroi',4,'Plaquette du projet',true),
('paroi',5,'Œil de granit',true),
('joute',0,'Balle de joute',false),
('joute',1,'Cordage d’honneur',false),
('joute',2,'Écusson du filet',false),
('joute',3,'Feuille de match',false),
('joute',4,'Blason de remontée',true),
('joute',5,'Gant du Chevalier',true),
('escouade',0,'Fanion d’escouade',false),
('escouade',1,'Brassard de serment',false),
('escouade',2,'Sifflet ancien',false),
('escouade',3,'Maillot brodé',false),
('escouade',4,'Bannière partagée',true),
('escouade',5,'Insigne du Capitaine',true),
('dojo',0,'Parchemin roulé',false),
('dojo',1,'Cloche de bronze',false),
('dojo',2,'Ceinture usée',false),
('dojo',3,'Bâton de pratique',false),
('dojo',4,'Sceau du contrôle',true),
('dojo',5,'Pinceau du Maître',true),
('sanctuaire',0,'Galet d’eau douce',false),
('sanctuaire',1,'Graine de terrasse',false),
('sanctuaire',2,'Lanterne de pierre',false),
('sanctuaire',3,'Bol de souffle',false),
('sanctuaire',4,'Fleur rare',true),
('sanctuaire',5,'Source miniature',true),
('cible',0,'Étoile de cible',false),
('cible',1,'Plume d’empennage',false),
('cible',2,'Craie de billard',false),
('cible',3,'Bouchon de mène',false),
('cible',4,'Constellation gravée',true),
('cible',5,'Lunette de l’Astronome',true),
('scene',0,'Ruban de scène',false),
('scene',1,'Programme plié',false),
('scene',2,'Chausson usé',false),
('scene',3,'Projecteur miniature',false),
('scene',4,'Rappel doré',true),
('scene',5,'Masque de la Danseuse',true),
('brasier',0,'Braise contenue',false),
('brasier',1,'Chronomètre de foyer',false),
('brasier',2,'Corde à sauter tressée',false),
('brasier',3,'Rempart miniature',false),
('brasier',4,'Cendre d’argent',true),
('brasier',5,'Cœur du Brasier',true),
('stade',0,'Plot de départ',false),
('stade',1,'Témoin de relais',false),
('stade',2,'Ruban de marque',false),
('stade',3,'Pointes usées',false),
('stade',4,'Couloir doré',true),
('stade',5,'Pistolet silencieux',true),
('elements',0,'Page de l’Atlas',false),
('elements',1,'Coquille de houle',false),
('elements',2,'Flocon de verre',false),
('elements',3,'Plume de vent',false),
('elements',4,'Rose des vents',true),
('elements',5,'Sceau du Vent sans nom',true),
('pilotage',0,'Drapeau à damier',false),
('pilotage',1,'Gant de piste',false),
('pilotage',2,'Carnet de réglages',false),
('pilotage',3,'Casque miniature',false),
('pilotage',4,'Trajectoire d’argent',true),
('pilotage',5,'Clé de l’Ingénieur',true),
('lien',0,'Fer à cheval',false),
('lien',1,'Brosse de pansage',false),
('lien',2,'Ruban de reprise',false),
('lien',3,'Carnet d’écurie',false),
('lien',4,'Étrier d’argent',true),
('lien',5,'Rose de la Cavalière',true),
('odyssee',0,'Portail miniature',false),
('odyssee',1,'Dossard tressé',false),
('odyssee',2,'Sablier de transition',false),
('odyssee',3,'Carte des segments',false),
('odyssee',4,'Clé des Portails',true),
('odyssee',5,'Masque du Héraut',true)
on conflict(voie,idx) do update set name=excluded.name,rare=excluded.rare;
-- END GENERATED SEED

notify pgrst,'reload schema';
