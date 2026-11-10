-- V1.3. Restore of the CLI-generated migration. Cosmetic travel only: no economy/profile writes.
-- Daily activity imports are displayed separately from verified server-to-server step counts.
-- Additive/replayable. Caller owns transaction. No automatic backfill during install or GET.
create table if not exists private.titan_journey_configs (
 version integer primary key check(version>0),active boolean not null default false,
 goal bigint not null check(goal=30000000),daily_cap integer not null check(daily_cap between 1 and 200000),
 allowed_sources text[] not null default array['health_connect'],created_at timestamptz not null default now()
);
create unique index if not exists titan_journey_one_active_config on private.titan_journey_configs(active) where active;
create table if not exists private.titan_journey_discovery_config (
 config_version integer not null references private.titan_journey_configs(version),id text not null,
 steps bigint not null check(steps between 1 and 30000000),world text not null check(world in('aube','marees','forge','aurores')),
 name text not null,story text not null,kind text not null check(kind in('milestone','discovery')),
 primary key(config_version,id),unique(config_version,steps)
);
create table if not exists private.titan_journey_career_config (
 config_version integer not null references private.titan_journey_configs(version),id text not null,
 level integer not null check(level between 1 and 500),title text not null,description text not null,
 primary key(config_version,id),unique(config_version,level)
);
create table if not exists private.titan_journey_acquisitions (
 user_id uuid not null references auth.users(id) on delete cascade,track text not null check(track in('discovery','career')),
 id text not null,config_version integer not null references private.titan_journey_configs(version),
 payload jsonb not null check(jsonb_typeof(payload)='object'),earned_at timestamptz not null default statement_timestamp(),primary key(user_id,track,id)
);
alter table private.titan_journey_configs enable row level security;
alter table private.titan_journey_discovery_config enable row level security;
alter table private.titan_journey_career_config enable row level security;
alter table private.titan_journey_acquisitions enable row level security;
revoke all on private.titan_journey_configs,private.titan_journey_discovery_config,private.titan_journey_career_config,private.titan_journey_acquisitions from public,anon,authenticated;
insert into private.titan_journey_configs(version,active,goal,daily_cap,allowed_sources) values(1,true,30000000,200000,array['health_connect','garmin']) on conflict(version) do nothing;
insert into private.titan_journey_discovery_config(config_version,id,steps,world,name,story,kind)
select 1,'steps-'||v.steps,v.steps,v.world,v.name,v.story,'milestone' from(values
 (10000::bigint,'aube','La première lueur','Une lueur se dessine entre les arbres. Le sentier commence à prendre forme.'),
 (30000,'aube','La porte des clairières','Les branches dévoilent un passage. Votre carnet accueille sa première porte.'),
 (75000,'aube','Le refuge des veilleurs','Un refuge tranquille apparaît au bord du chemin. Il restera dans votre carnet.'),
 (150000,'aube','Le pont des racines','Des racines anciennes forment un pont vers les collines de l’Aube.'),
 (300000,'aube','La vallée éveillée','La vallée révèle ses contours. Chaque détour fait partie du voyage.'),
 (500000,'aube','Le sommet de l’Aube','Depuis le sommet, la lumière dessine les sentiers parcourus et ceux à découvrir.'),
 (1000000,'marees','L’appel des Marées','Une brise salée annonce les Marées. Un nouveau paysage rejoint votre carnet.'),
 (2000000,'marees','Le phare des passages','Un phare guide les voyageurs entre les îles. Sa lumière accompagne votre passage.'),
 (5000000,'forge','Les portes de la Forge','La roche garde une chaleur ancienne. Les portes de la Forge se révèlent.'),
 (10000000,'forge','Le cœur de braise','Une braise paisible éclaire le cœur de la montagne. Votre trace y trouve sa place.'),
 (15000000,'aurores','La traversée des Aurores','Au-delà des crêtes, le ciel s’ouvre sur les Aurores. Une autre lumière vous accueille.'),
 (20000000,'aurores','L’observatoire des horizons','L’observatoire offre un regard sur les quatre mondes et leurs chemins reliés.'),
 (30000000,'aurores','L’éveil des mondes','Les quatre horizons se répondent. Votre carnet garde ce voyage, libre de continuer à votre rythme.')
)v(steps,world,name,story) on conflict do nothing;
-- Intermediate discoveries keep every gap <=100k without daily pressure or purchases.
insert into private.titan_journey_discovery_config(config_version,id,steps,world,name,story,kind)
select 1,'steps-'||n,n,case when n<1000000 then 'aube' when n<5000000 then 'marees' when n<15000000 then 'forge' else 'aurores' end,
 format('%s · repère %s',case
 when n<1000000 then (array['La clairière silencieuse','Le ruisseau lumineux','Le jardin des racines','Le belvédère des feuilles'])[((n/100000-1)%4+1)::int]
 when n<5000000 then (array['La crique abritée','Le passage des écumes','L’île des murmures','Le rivage nacré'])[((n/100000-1)%4+1)::int]
 when n<15000000 then (array['La galerie de cuivre','La terrasse des braises','Le refuge de pierre','La faille lumineuse'])[((n/100000-1)%4+1)::int]
 else (array['La plaine étoilée','Le miroir des neiges','Le balcon des constellations','Le jardin des aurores'])[((n/100000-1)%4+1)::int] end,n/100000),
 case when n<1000000 then 'Un détail de la forêt se révèle. Ce lieu rejoint votre carnet des sentiers.'
 when n<5000000 then 'Le vent et l’eau dessinent un nouveau passage. Votre carnet en garde la trace.'
 when n<15000000 then 'Une lumière traverse la pierre. Ce repère de la Forge reste désormais dans votre carnet.'
 else 'Le ciel dévoile une nouvelle couleur. Ce paysage des Aurores accompagne la suite du voyage.' end,'discovery'
from generate_series(100000::bigint,30000000::bigint,100000::bigint)n on conflict do nothing;
insert into private.titan_journey_career_config(config_version,id,level,title,description)
select 1,'career-'||v.level,v.level,v.title,v.description from(values
 (5,'Premiers horizons','Votre progression sportive ouvre un premier horizon dans le passeport.'),
 (10,'Compagnon des sentiers','Les expériences accumulées donnent une nouvelle couleur à votre parcours.'),
 (20,'Gardien des repères','Votre passeport conserve les repères d’une pratique qui vous ressemble.'),
 (35,'Passeur des mondes','Des chemins différents composent une même aventure. Ce titre en garde la trace.'),
 (50,'Mémoire des horizons','Votre expérience laisse une empreinte durable dans les quatre mondes.'),
 (75,'Éclat des constellations','Votre carrière dessine une constellation de repères, à votre rythme.'),
 (100,'Témoin de l’éveil','Ce titre célèbre le chemin parcouru et reste acquis pour la suite du voyage.')
)v(level,title,description) on conflict do nothing;
-- The calling adapter must authenticate the provider payload before attesting it.
-- No client import or existing webhook can write this store.
create table if not exists private.titan_journey_verified_days (
 user_id uuid not null references auth.users(id) on delete cascade,
 source text not null check(source='garmin'),
 provider_identity_hash bytea not null check(octet_length(provider_identity_hash)=32),
 day date not null check(isfinite(day) and day>=date '2000-01-01'),
 steps integer not null check(steps between 0 and 200000),
 attested_at timestamptz not null default statement_timestamp(),
 primary key(user_id,source,provider_identity_hash,day)
);
alter table private.titan_journey_verified_days enable row level security;
revoke all on private.titan_journey_verified_days from public,anon,authenticated;

create or replace function private.titan_journey_attest_day_v1(
 p_source text, p_provider_user_id text, p_day date, p_steps integer
)
returns void language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid;
 v_today date := (statement_timestamp() at time zone 'UTC')::date;
begin
 if p_source is distinct from 'garmin' or p_provider_user_id is null
    or p_provider_user_id !~ '^[A-Za-z0-9_-]{1,128}$' then
   raise exception 'VERIFIED_SOURCE_UNKNOWN' using errcode='22023';
 end if;
 if p_day is null or not isfinite(p_day) or p_day < v_today - 400 or p_day > v_today then
   raise exception 'DAY_OUT_OF_RANGE' using errcode='22023';
 end if;
 if p_steps is null or p_steps not between 0 and 200000 then
   raise exception 'STEPS_OUT_OF_RANGE' using errcode='22023';
 end if;

 select g.user_id into v_uid
 from private.titan_garmin_links g
 join private.titan_source_consents c on c.user_id = g.user_id and c.source = p_source
 join public.profiles p on p.id = g.user_id
 where g.garmin_user_id = p_provider_user_id and g.revoked_at is null
   and isfinite(g.linked_at) and g.linked_at <= statement_timestamp()
   and c.revoked_at is null and isfinite(c.granted_at) and c.granted_at <= statement_timestamp()
   and not coalesce(p.is_suspended, false)
 for share of g, c;
 if not found then raise exception 'VERIFIED_LINK_OR_CONSENT_REQUIRED' using errcode='42501'; end if;

 -- Scope the binding to the TITAN owner without storing another copy of the Garmin ID.
 insert into private.titan_journey_verified_days as d (user_id, source, provider_identity_hash, day, steps)
 values (v_uid, p_source, sha256(convert_to(v_uid::text||':'||p_provider_user_id,'UTF8')), p_day, p_steps)
 on conflict (user_id, source, provider_identity_hash, day) do update
   set steps = excluded.steps, attested_at = excluded.attested_at
   where d.steps is distinct from excluded.steps;
end $$;
revoke all on function private.titan_journey_attest_day_v1(text,text,date,integer) from public,anon,authenticated;
grant execute on function private.titan_journey_attest_day_v1(text,text,date,integer) to service_role;

create or replace function public.titan_journey_attest_day_v1(
 p_source text, p_provider_user_id text, p_day date, p_steps integer
)
returns void language sql security invoker set search_path='' as $$
 select private.titan_journey_attest_day_v1(p_source,p_provider_user_id,p_day,p_steps);
$$;
revoke all on function public.titan_journey_attest_day_v1(text,text,date,integer) from public,anon,authenticated;
grant execute on function public.titan_journey_attest_day_v1(text,text,date,integer) to service_role;

-- Lifetime observations are bounded against their actual import date.
create or replace function private.titan_journey_observed_days_v1()
returns table(day date,steps bigint,sources jsonb,updated_at timestamptz)
language sql stable security definer set search_path='' as $$
 select d.day,max(d.steps)::bigint,jsonb_agg(d.source order by d.source),max(d.updated_at)
 from private.titan_daily_activity d join private.titan_source_consents c on c.user_id=d.user_id and c.source=d.source cross join private.titan_journey_configs cfg
 where cfg.active and d.user_id=auth.uid() and d.source in('health_connect','garmin') and d.source=any(cfg.allowed_sources)
 and c.revoked_at is null and isfinite(c.granted_at) and c.granted_at<=statement_timestamp()
 and d.steps between 0 and cfg.daily_cap and isfinite(d.day) and d.day>=date '2000-01-01' and d.day<=(statement_timestamp() at time zone 'UTC')::date
 and isfinite(d.updated_at) and d.updated_at<=statement_timestamp()
 and d.day between (d.updated_at at time zone 'UTC')::date-400 and (d.updated_at at time zone 'UTC')::date+1 group by d.day;
$$;
revoke all on function private.titan_journey_observed_days_v1() from public,anon,authenticated;
-- There is no path from client-imported observations to the verified totals.
create or replace function private.titan_journey_days_v1()
returns table(day date,steps bigint,sources jsonb,updated_at timestamptz)
language sql stable security definer set search_path='' as $$
 select d.day,max(d.steps)::bigint,jsonb_agg(d.source order by d.source),max(d.attested_at)
 from private.titan_journey_verified_days d
 join private.titan_source_consents c on c.user_id=d.user_id and c.source=d.source
 cross join private.titan_journey_configs cfg
 where cfg.active and d.user_id=auth.uid() and d.source=any(cfg.allowed_sources)
   and c.revoked_at is null and isfinite(c.granted_at) and c.granted_at<=statement_timestamp()
   and d.steps between 0 and cfg.daily_cap
   and d.day<=(statement_timestamp() at time zone 'UTC')::date
   and isfinite(d.attested_at) and d.attested_at<=statement_timestamp()
   and d.day between (d.attested_at at time zone 'UTC')::date-400 and (d.attested_at at time zone 'UTC')::date
   and exists(select 1 from private.titan_garmin_links g
    where g.user_id=d.user_id and g.revoked_at is null
      and isfinite(g.linked_at) and g.linked_at<=statement_timestamp()
      and d.provider_identity_hash=sha256(convert_to(g.user_id::text||':'||g.garmin_user_id,'UTF8')))
 group by d.day;
$$;
revoke all on function private.titan_journey_days_v1() from public,anon,authenticated;
create or replace function private.titan_journey_snapshot_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_config integer; v_goal bigint; v_level integer; v_total bigint; v_today jsonb;
 v_observed_total bigint; v_observed_today jsonb;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select greatest(1,coalesce(p.level,1)) into v_level from public.profiles p where p.id=v_uid and not coalesce(p.is_suspended,false);
 if not found then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
 select version,goal into v_config,v_goal from private.titan_journey_configs where active;
 if not found then raise exception 'JOURNEY_CONFIG_UNAVAILABLE' using errcode='55000'; end if;
 select coalesce(sum(d.steps),0),(jsonb_agg(jsonb_build_object('day',d.day,'steps',d.steps,'sources',d.sources,'updatedAt',d.updated_at)) filter(where d.day=(statement_timestamp() at time zone 'UTC')::date))->0 into v_total,v_today from private.titan_journey_days_v1()d;
 select coalesce(sum(d.steps),0),(jsonb_agg(jsonb_build_object('day',d.day,'steps',d.steps,'sources',d.sources,'updatedAt',d.updated_at)) filter(where d.day=(statement_timestamp() at time zone 'UTC')::date))->0
 into v_observed_total,v_observed_today from private.titan_journey_observed_days_v1()d;
 return jsonb_build_object('version',1,'owner',v_uid,'configVersion',v_config,'totalSteps',v_total,'today',v_today,'goal',v_goal,
 'observedSteps',v_observed_total,'observedToday',v_observed_today,
 'discoveries',coalesce((select jsonb_agg(x.payload||jsonb_build_object('earnedAt',x.earned_at) order by (x.payload->>'steps')::bigint,x.payload->>'id') from(
 select coalesce(a.payload,jsonb_build_object('id',d.id,'steps',d.steps,'world',d.world,'name',d.name,'story',d.story,'kind',d.kind)) payload,a.earned_at from private.titan_journey_discovery_config d
 left join private.titan_journey_acquisitions a on a.user_id=v_uid and a.track='discovery' and a.id=d.id where d.config_version=v_config
 union all select a.payload,a.earned_at from private.titan_journey_acquisitions a where a.user_id=v_uid and a.track='discovery' and not exists(select 1 from private.titan_journey_discovery_config d where d.config_version=v_config and d.id=a.id))x),'[]'::jsonb),
 'career',jsonb_build_object('level',v_level,'milestones',coalesce((select jsonb_agg(x.payload||jsonb_build_object('earnedAt',x.earned_at) order by (x.payload->>'level')::int,x.payload->>'id') from(
 select coalesce(a.payload,jsonb_build_object('id',c.id,'level',c.level,'title',c.title,'description',c.description)) payload,a.earned_at from private.titan_journey_career_config c
 left join private.titan_journey_acquisitions a on a.user_id=v_uid and a.track='career' and a.id=c.id where c.config_version=v_config
 union all select a.payload,a.earned_at from private.titan_journey_acquisitions a where a.user_id=v_uid and a.track='career' and not exists(select 1 from private.titan_journey_career_config c where c.config_version=v_config and c.id=a.id))x),'[]'::jsonb)));
end $$;
revoke all on function private.titan_journey_snapshot_v1() from public,anon;
grant execute on function private.titan_journey_snapshot_v1() to authenticated;
create or replace function private.titan_journey_sync_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); s jsonb;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 -- Per-owner lock, no mutation of profile/economy.
 perform 1 from public.profiles where id=v_uid and not coalesce(is_suspended,false) for update;
 if not found then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
 s:=private.titan_journey_snapshot_v1();
 insert into private.titan_journey_acquisitions(user_id,track,id,config_version,payload)
 select v_uid,'discovery',d->>'id',(s->>'configVersion')::integer,d-'earnedAt' from jsonb_array_elements(s->'discoveries')d where d->>'earnedAt' is null and (d->>'steps')::bigint<=(s->>'totalSteps')::bigint on conflict(user_id,track,id) do nothing;
 insert into private.titan_journey_acquisitions(user_id,track,id,config_version,payload)
 select v_uid,'career',c->>'id',(s->>'configVersion')::integer,c-'earnedAt' from jsonb_array_elements(s->'career'->'milestones')c where c->>'earnedAt' is null and (c->>'level')::integer<=(s->'career'->>'level')::integer on conflict(user_id,track,id) do nothing;
 return private.titan_journey_snapshot_v1();
end $$;
revoke all on function private.titan_journey_sync_v1() from public,anon;
grant execute on function private.titan_journey_sync_v1() to authenticated;
create or replace function public.titan_journey_snapshot_v1()
returns jsonb language sql stable security invoker set search_path='' as $$select private.titan_journey_snapshot_v1();$$;
create or replace function public.titan_journey_sync_v1()
returns jsonb language sql security invoker set search_path='' as $$select private.titan_journey_sync_v1();$$;
revoke all on function public.titan_journey_snapshot_v1(),public.titan_journey_sync_v1() from public,anon;
grant execute on function public.titan_journey_snapshot_v1(),public.titan_journey_sync_v1() to authenticated;
do $$begin
 if to_regprocedure('private.titan_export_extras_before_journey_v1(uuid)') is null then alter function private.titan_export_extras_v1(uuid) rename to titan_export_extras_before_journey_v1; end if;
end $$;
create or replace function private.titan_export_extras_v1(p_uid uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select private.titan_export_extras_before_journey_v1(p_uid)||jsonb_build_object('journey',coalesce((select jsonb_agg(to_jsonb(a)-'user_id' order by a.track,a.id) from private.titan_journey_acquisitions a where a.user_id=p_uid),'[]'::jsonb),
  'journeyVerifiedDailyActivity',coalesce((select jsonb_agg(
   jsonb_build_object('source',d.source,'day',d.day,'steps',d.steps,'attested_at',d.attested_at)
   order by d.day,d.source,d.attested_at,d.provider_identity_hash) from private.titan_journey_verified_days d where d.user_id=p_uid),'[]'::jsonb));
$$;
revoke all on function private.titan_export_extras_before_journey_v1(uuid),private.titan_export_extras_v1(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
