begin;

-- TITAN OS v43 - sport specificity, progression balance, and security helpers.
-- Run after the previous RLS hotfixes. This script keeps user logs/profiles intact.

create extension if not exists pgcrypto;

alter table if exists public.sports add column if not exists extra_fields jsonb default '[]'::jsonb;
alter table if exists public.sports add column if not exists xp_rules jsonb default '{}'::jsonb;
alter table if exists public.sports add column if not exists validation_rules jsonb default '{}'::jsonb;
alter table if exists public.sports add column if not exists balance_profile text default 'generic';
alter table if exists public.sports add column if not exists updated_at timestamptz default now();

create or replace function public.titan_v43_sport_profile(
  p_id text,
  p_label text,
  p_category text,
  p_form_type text
) returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_id,'') || ' ' || coalesce(p_label,''))) = 'foot'
      or lower(coalesce(p_id,'') || ' ' || coalesce(p_label,'')) like any(array['%football%','%soccer%','%foot %','% foot%']) then 'football'
    when lower(coalesce(p_id,'') || ' ' || coalesce(p_label,'')) like any(array['%randon%','%hiking%','%trek%','%marche%']) then 'hiking'
    when lower(coalesce(p_id,'') || ' ' || coalesce(p_label,'')) like any(array['%trail%']) then 'trail'
    when lower(coalesce(p_id,'') || ' ' || coalesce(p_label,'')) like any(array['%course%','%running%','%jog%','%run%']) then 'running'
    when lower(coalesce(p_id,'') || ' ' || coalesce(p_label,'')) like any(array['%velo%','%cycl%','%bike%','%vtt%']) then 'cycling'
    when lower(coalesce(p_id,'') || ' ' || coalesce(p_label,'')) like any(array['%natation%','%swim%','%nage%']) then 'swimming'
    when lower(coalesce(p_id,'') || ' ' || coalesce(p_label,'')) like any(array['%tennis%','%badminton%','%padel%','%squash%','%ping%','%table%']) then 'racket'
    when lower(coalesce(p_id,'') || ' ' || coalesce(p_label,'')) like any(array['%basket%','%hand%','%rugby%','%volley%','%hockey%']) then 'team'
    when lower(coalesce(p_id,'') || ' ' || coalesce(p_label,'')) like any(array['%boxe%','%mma%','%judo%','%karate%','%kick%','%combat%','%lutte%']) then 'combat'
    when lower(coalesce(p_id,'') || ' ' || coalesce(p_label,'')) like any(array['%yoga%','%mobil%','%stretch%','%pilates%','%souplesse%']) then 'mobility'
    when lower(coalesce(p_id,'') || ' ' || coalesce(p_label,'')) like any(array['%muscu%','%force%','%pompe%','%traction%','%squat%','%bench%','%deadlift%','%body%']) then 'strength'
    when lower(coalesce(p_id,'') || ' ' || coalesce(p_label,'')) like any(array['%crossfit%','%hiit%','%wod%','%circuit%']) then 'mixed'
    when lower(coalesce(p_form_type,'')) like '%gym%' or lower(coalesce(p_category,'')) like any(array['%muscu%','%force%']) then 'strength'
    when lower(coalesce(p_form_type,'')) like '%gps%' or lower(coalesce(p_category,'')) like '%outdoor%' then 'outdoor'
    else 'generic'
  end;
$$;

create or replace function public.titan_v43_extra_fields(profile text) returns jsonb
language sql
immutable
as $$
  select case profile
    when 'football' then jsonb_build_array(
      jsonb_build_object('id','position','label','Poste','type','select','options',jsonb_build_array('Gardien','Defenseur','Milieu','Attaquant')),
      jsonb_build_object('id','goals','label','Buts','type','number','min',0,'max',20,'step',1,'xpWeight',18,'xpCap',90),
      jsonb_build_object('id','assists','label','Passes decisives','type','number','min',0,'max',20,'step',1,'xpWeight',12,'xpCap',72),
      jsonb_build_object('id','shots_on_target','label','Tirs cadres','type','number','min',0,'max',30,'step',1,'xpWeight',3,'xpCap',45),
      jsonb_build_object('id','successful_tackles','label','Tacles/interceptions','type','number','min',0,'max',60,'step',1,'xpWeight',2,'xpCap',55),
      jsonb_build_object('id','saves','label','Arrets','type','number','min',0,'max',40,'step',1,'xpWeight',4,'xpCap',80,'visibleWhen',jsonb_build_object('field','position','equals','Gardien')),
      jsonb_build_object('id','clean_sheet','label','Clean sheet','type','checkbox','xpWeight',35,'visibleWhen',jsonb_build_object('field','position','equals','Gardien'))
    )
    when 'hiking' then jsonb_build_array(
      jsonb_build_object('id','pack_weight','label','Sac porte','type','number','min',0,'max',35,'step',0.5,'unit','kg','xpWeight',2,'xpCap',45),
      jsonb_build_object('id','technicality','label','Technicite','type','select','options',jsonb_build_array('Facile','Sentier','Technique','Alpin'),'xpWeight',8),
      jsonb_build_object('id','surface','label','Terrain dominant','type','select','options',jsonb_build_array('Route','Sentier','Boue','Neige','Rocaille')),
      jsonb_build_object('id','pause_count','label','Pauses longues','type','number','min',0,'max',20,'step',1),
      jsonb_build_object('id','navigation','label','Navigation autonome','type','checkbox','xpWeight',25)
    )
    when 'trail' then jsonb_build_array(
      jsonb_build_object('id','technicality','label','Technicite','type','select','options',jsonb_build_array('Roulant','Sentier','Technique','Alpin'),'xpWeight',10),
      jsonb_build_object('id','avg_hr','label','FC moyenne','type','number','min',60,'max',230,'step',1,'unit','bpm'),
      jsonb_build_object('id','cadence','label','Cadence','type','number','min',80,'max',230,'step',1,'unit','ppm'),
      jsonb_build_object('id','downhill_focus','label','Descente travaillee','type','checkbox','xpWeight',20),
      jsonb_build_object('id','fueling_count','label','Ravitaillements','type','number','min',0,'max',20,'step',1,'xpWeight',4,'xpCap',30)
    )
    when 'running' then jsonb_build_array(
      jsonb_build_object('id','session_type','label','Type de seance','type','select','options',jsonb_build_array('Endurance','Tempo','Fractionne','Cote','Recuperation'),'xpWeight',6),
      jsonb_build_object('id','avg_hr','label','FC moyenne','type','number','min',60,'max',230,'step',1,'unit','bpm'),
      jsonb_build_object('id','cadence','label','Cadence','type','number','min',80,'max',230,'step',1,'unit','ppm'),
      jsonb_build_object('id','intervals','label','Repetitions','type','number','min',0,'max',80,'step',1,'xpWeight',3,'xpCap',45),
      jsonb_build_object('id','surface','label','Surface','type','select','options',jsonb_build_array('Route','Piste','Chemin','Tapis'))
    )
    when 'cycling' then jsonb_build_array(
      jsonb_build_object('id','bike_type','label','Type de velo','type','select','options',jsonb_build_array('Route','VTT','Gravel','Home trainer')),
      jsonb_build_object('id','avg_power','label','Puissance moyenne','type','number','min',0,'max',700,'step',1,'unit','W','xpWeight',0.08,'xpCap',45),
      jsonb_build_object('id','avg_hr','label','FC moyenne','type','number','min',60,'max',230,'step',1,'unit','bpm'),
      jsonb_build_object('id','cadence','label','Cadence','type','number','min',30,'max',160,'step',1,'unit','rpm'),
      jsonb_build_object('id','sprints','label','Sprints','type','number','min',0,'max',60,'step',1,'xpWeight',4,'xpCap',45)
    )
    when 'swimming' then jsonb_build_array(
      jsonb_build_object('id','stroke','label','Nage dominante','type','select','options',jsonb_build_array('Crawl','Brasse','Dos','Papillon','Mixte')),
      jsonb_build_object('id','pool_length','label','Longueur bassin','type','select','options',jsonb_build_array('25m','50m','Eau libre')),
      jsonb_build_object('id','drills','label','Educatifs','type','number','min',0,'max',40,'step',1,'xpWeight',4,'xpCap',45),
      jsonb_build_object('id','breath_pattern','label','Respiration','type','select','options',jsonb_build_array('2 temps','3 temps','5 temps','Hypoxie')),
      jsonb_build_object('id','swolf','label','SWOLF','type','number','min',10,'max',120,'step',1)
    )
    when 'strength' then jsonb_build_array(
      jsonb_build_object('id','focus','label','Focus','type','select','options',jsonb_build_array('Haut du corps','Bas du corps','Full body','Core','Tirage','Poussee')),
      jsonb_build_object('id','top_set_weight','label','Top set','type','number','min',0,'max',500,'step',0.5,'unit','kg','xpWeight',0.18,'xpCap',55),
      jsonb_build_object('id','failure_sets','label','Series a l echec','type','number','min',0,'max',30,'step',1,'xpWeight',5,'xpCap',50),
      jsonb_build_object('id','tempo','label','Tempo controle','type','select','options',jsonb_build_array('Normal','Lent','Explosif','Pause')),
      jsonb_build_object('id','mobility_prep','label','Echauffement mobilite','type','checkbox','xpWeight',18)
    )
    when 'combat' then jsonb_build_array(
      jsonb_build_object('id','discipline_mode','label','Travail','type','select','options',jsonb_build_array('Technique','Sparring','Sac','Pao','Sol','Competition'),'xpWeight',8),
      jsonb_build_object('id','rounds','label','Rounds','type','number','min',0,'max',40,'step',1,'xpWeight',5,'xpCap',70),
      jsonb_build_object('id','significant_strikes','label','Frappes propres','type','number','min',0,'max',500,'step',1,'xpWeight',0.35,'xpCap',60),
      jsonb_build_object('id','takedowns','label','Projections/takedowns','type','number','min',0,'max',80,'step',1,'xpWeight',3,'xpCap',55),
      jsonb_build_object('id','submissions','label','Soumissions','type','number','min',0,'max',50,'step',1,'xpWeight',4,'xpCap',55)
    )
    when 'racket' then jsonb_build_array(
      jsonb_build_object('id','match_result','label','Resultat','type','select','options',jsonb_build_array('Victoire','Defaite','Nul','Entrainement'),'xpWeight',8),
      jsonb_build_object('id','sets_won','label','Sets gagnes','type','number','min',0,'max',10,'step',1,'xpWeight',10,'xpCap',45),
      jsonb_build_object('id','aces','label','Aces / points directs','type','number','min',0,'max',80,'step',1,'xpWeight',2,'xpCap',50),
      jsonb_build_object('id','unforced_errors','label','Fautes directes','type','number','min',0,'max',120,'step',1),
      jsonb_build_object('id','rally_quality','label','Qualite echanges','type','select','options',jsonb_build_array('Basse','Stable','Haute','Elite'))
    )
    when 'team' then jsonb_build_array(
      jsonb_build_object('id','role','label','Role','type','select','options',jsonb_build_array('Defense','Milieu','Attaque','Polyvalent','Gardien')),
      jsonb_build_object('id','score_for','label','Score equipe','type','number','min',0,'max',200,'step',1),
      jsonb_build_object('id','score_against','label','Score adverse','type','number','min',0,'max',200,'step',1),
      jsonb_build_object('id','decisive_actions','label','Actions decisives','type','number','min',0,'max',80,'step',1,'xpWeight',5,'xpCap',70),
      jsonb_build_object('id','defensive_actions','label','Actions defensives','type','number','min',0,'max',120,'step',1,'xpWeight',2,'xpCap',55)
    )
    when 'mobility' then jsonb_build_array(
      jsonb_build_object('id','focus_area','label','Zone cible','type','select','options',jsonb_build_array('Hanches','Dos','Epaules','Chevilles','Full body')),
      jsonb_build_object('id','hold_seconds','label','Maintiens longs','type','number','min',0,'max',3600,'step',5,'unit','s','xpWeight',0.03,'xpCap',40),
      jsonb_build_object('id','breathing','label','Respiration guidee','type','checkbox','xpWeight',15),
      jsonb_build_object('id','pain_before','label','Douleur avant','type','number','min',0,'max',10,'step',1),
      jsonb_build_object('id','pain_after','label','Douleur apres','type','number','min',0,'max',10,'step',1)
    )
    when 'mixed' then jsonb_build_array(
      jsonb_build_object('id','format','label','Format','type','select','options',jsonb_build_array('AMRAP','EMOM','For time','Circuit','Tabata'),'xpWeight',8),
      jsonb_build_object('id','rounds','label','Rounds','type','number','min',0,'max',60,'step',1,'xpWeight',4,'xpCap',55),
      jsonb_build_object('id','movements','label','Mouvements','type','number','min',1,'max',30,'step',1,'xpWeight',3,'xpCap',40),
      jsonb_build_object('id','rx','label','Format RX','type','checkbox','xpWeight',35),
      jsonb_build_object('id','score','label','Score','type','number','min',0,'max',10000,'step',1)
    )
    else jsonb_build_array(
      jsonb_build_object('id','session_type','label','Type de seance','type','select','options',jsonb_build_array('Technique','Endurance','Intensite','Recuperation','Competition'),'xpWeight',6),
      jsonb_build_object('id','quality','label','Qualite execution','type','select','options',jsonb_build_array('Basse','Correcte','Bonne','Excellente'),'xpWeight',8),
      jsonb_build_object('id','successful_actions','label','Actions reussies','type','number','min',0,'max',500,'step',1,'xpWeight',0.8,'xpCap',60),
      jsonb_build_object('id','mistakes','label','Erreurs majeures','type','number','min',0,'max',200,'step',1)
    )
  end;
$$;

create or replace function public.titan_v43_xp_rules(profile text) returns jsonb
language sql
immutable
as $$
  select case profile
    when 'hiking' then jsonb_build_object('durationCoeff',0.13,'elevationCoeff',3.2,'intensityCoeff',0.010,'extraCap',0.30,'softCap',980,'hardMax',2200)
    when 'trail' then jsonb_build_object('durationCoeff',0.14,'elevationCoeff',2.7,'intensityCoeff',0.014,'extraCap',0.28,'softCap',980,'hardMax',2150)
    when 'running' then jsonb_build_object('durationCoeff',0.10,'elevationCoeff',1.4,'intensityCoeff',0.012,'extraCap',0.24,'softCap',900,'hardMax',1900)
    when 'cycling' then jsonb_build_object('durationCoeff',0.11,'elevationCoeff',1.8,'intensityCoeff',0.011,'extraCap',0.26,'softCap',960,'hardMax',2050)
    when 'strength' then jsonb_build_object('durationCoeff',0.08,'elevationCoeff',0,'intensityCoeff',0.012,'extraCap',0.24,'softCap',850,'hardMax',1750)
    when 'combat' then jsonb_build_object('durationCoeff',0.22,'elevationCoeff',0,'intensityCoeff',0.014,'extraCap',0.32,'softCap',820,'hardMax',1650)
    when 'football' then jsonb_build_object('durationCoeff',0.20,'elevationCoeff',0,'intensityCoeff',0.012,'extraCap',0.34,'softCap',780,'hardMax',1550)
    when 'mobility' then jsonb_build_object('durationCoeff',0.20,'elevationCoeff',0,'intensityCoeff',0.006,'extraCap',0.16,'softCap',520,'hardMax',950)
    else jsonb_build_object('durationCoeff',0.12,'elevationCoeff',0.8,'intensityCoeff',0.010,'extraCap',0.22,'softCap',780,'hardMax',1550)
  end;
$$;

with profiled as (
  select
    id,
    titan_v43_sport_profile(id::text, label::text, category::text, form_type::text) as profile
  from public.sports
)
update public.sports s
set
  balance_profile = p.profile,
  extra_fields = public.titan_v43_extra_fields(p.profile),
  xp_rules = public.titan_v43_xp_rules(p.profile),
  validation_rules = jsonb_build_object(
    'maxVal1', case when coalesce(s.unit,'') = 'kg' then 1000000 when coalesce(s.unit,'') = 'km' then 250 else 1440 end,
    'maxDurationMin', 2880,
    'maxElevationM', 12000,
    'maxExtrasBytes', 4096
  ),
  updated_at = now()
from profiled p
where s.id = p.id;

-- Progression refs planned in TITAN_REPRISE_CONTEXTE.md.
create table if not exists public.weekly_quests (
  id text primary key,
  title text not null,
  description text,
  target integer not null default 1 check (target > 0 and target <= 100000),
  reward_xp integer not null default 0 check (reward_xp >= 0 and reward_xp <= 5000),
  reward_credits integer not null default 0 check (reward_credits >= 0 and reward_credits <= 5000),
  sport text,
  category text,
  quest_type text default 'weekly',
  active_from timestamptz default now(),
  active_to timestamptz,
  elite_only boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table if exists public.mobs add column if not exists rarity text default 'common';
alter table if exists public.mobs add column if not exists weakness text default 'general';
alter table if exists public.mobs add column if not exists hp_mult numeric default 1 check (hp_mult > 0 and hp_mult <= 10);
alter table if exists public.mobs add column if not exists reward_mult numeric default 1 check (reward_mult > 0 and reward_mult <= 10);
alter table if exists public.mobs add column if not exists zone_id text;

alter table if exists public.bosses add column if not exists weakness text default 'general';
alter table if exists public.bosses add column if not exists zone_id text;
alter table if exists public.bosses add column if not exists reward_mult numeric default 1 check (reward_mult > 0 and reward_mult <= 10);

create table if not exists public.user_bestiary (
  user_id uuid not null references auth.users(id) on delete cascade,
  enemy_key text not null,
  enemy_type text not null check (enemy_type in ('MOB','BOSS')),
  enemy_id text,
  name text,
  defeats integer not null default 0 check (defeats >= 0),
  weakness text,
  rarity jsonb default '{}'::jsonb,
  first_seen_at timestamptz default now(),
  last_defeated_at timestamptz,
  primary key (user_id, enemy_key)
);

create table if not exists public.combat_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  enemy_key text not null,
  enemy_type text not null check (enemy_type in ('MOB','BOSS')),
  result text not null default 'victory' check (result in ('victory','defeat','escape')),
  damage integer not null default 0 check (damage >= 0),
  reward_xp integer not null default 0 check (reward_xp >= 0 and reward_xp <= 10000),
  reward_credits integer not null default 0 check (reward_credits >= 0 and reward_credits <= 10000),
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists combat_logs_user_date_idx on public.combat_logs(user_id, created_at desc);

alter table if exists public.weekly_quests enable row level security;
alter table if exists public.user_bestiary enable row level security;
alter table if exists public.combat_logs enable row level security;

grant select on public.weekly_quests to anon, authenticated;
grant select, insert, update on public.user_bestiary to authenticated;
grant select, insert on public.combat_logs to authenticated;

drop policy if exists "weekly_quests_public_read" on public.weekly_quests;
create policy "weekly_quests_public_read"
on public.weekly_quests
for select
to anon, authenticated
using (is_active = true and (active_to is null or active_to >= now()));

drop policy if exists "user_bestiary_select_own" on public.user_bestiary;
drop policy if exists "user_bestiary_insert_own" on public.user_bestiary;
drop policy if exists "user_bestiary_update_own" on public.user_bestiary;

create policy "user_bestiary_select_own"
on public.user_bestiary
for select
to authenticated
using (user_id = auth.uid());

create policy "user_bestiary_insert_own"
on public.user_bestiary
for insert
to authenticated
with check (user_id = auth.uid());

create policy "user_bestiary_update_own"
on public.user_bestiary
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "combat_logs_select_own" on public.combat_logs;
drop policy if exists "combat_logs_insert_own" on public.combat_logs;

create policy "combat_logs_select_own"
on public.combat_logs
for select
to authenticated
using (user_id = auth.uid());

create policy "combat_logs_insert_own"
on public.combat_logs
for insert
to authenticated
with check (user_id = auth.uid());

-- Do not add hard training_logs constraints here.
-- Older deployed front versions can still generate uncapped XP before js/titan_features.js v43 is live,
-- and PostgreSQL applies NOT VALID constraints to new rows. Keep anti-cheat enforcement for a server/RPC pass.

grant select on public.sports to anon, authenticated;
grant select on public.mobs to anon, authenticated;
grant select on public.bosses to anon, authenticated;

commit;
