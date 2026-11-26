-- V1.5.0 — Bifurcations. One pilot arc (Vallée de l'Aube, arc 1 of the encounter engine of 20261102140000).
-- Additive and idempotent. NEVER changes XP, credits, active days, campaign objectives, rewards or the v300 effort.
--
-- The decision is the existing canonical binary choice of the encounter engine: private.adventure_encounter_rewards,
-- ordinal 2, choice 0 = la corniche, choice 1 = les ruines. Nothing new stores a route: a route IS that reward row,
-- written once per account under the per-account profile lock, so it is stable after confirmation and a second device
-- (or a simultaneous tap) can only read it back.
--
-- What is new:
--   private.adventure_branch_entries   explicit entry into the pilot, stamped with the configuration version it entered
--                                      (a later version never rewrites a running arc). Entry is only possible at a
--                                      compatible point: journey started and the choice ordinal not yet earned. A journey
--                                      that already passed the choice keeps its original version ("legacy").
--   private.titan_adventure_branch_config(pilot,version)   the versioned server contract. Same JSON as
--                                      js/core/adventure-branches.js (contract()), checked by tests/adventure-branches.test.mjs.
--   private.titan_adventure_branch_state(uid,world)         route, steps and clue of an account, read from server facts only.
--   public.titan_adventure_branch_snapshot_v1(world)        snapshot v1 + "branch"; for a confirmed route the step milestones
--                                      are ready only when the branch condition also holds.
--   public.titan_adventure_branch_action_v1(world,action,…) start|sync|claim delegate to titan_adventure_rpg_action_v1;
--                                      enter|confirm are the pilot actions. Returns the branch snapshot.
--   trigger adventure_branch_gate      a step reward of a confirmed pilot route can be inserted only when the branch condition
--                                      holds, whichever function or client version asks (old apps keep calling v1 claim).
--
-- Branch condition of step k (both routes identical): effort and distinct active days counted on the existing effort ledger
-- (same eligibility filters, same 90-point daily cap, one attribution per session) from sessions both CREATED and DATED at or
-- after the confirmed decision: effort >= effortTargets(k) x the journey's frozen target, days >= daysTarget(k).
-- An activity before the decision never counts for the route. A session still pending review counts after its validation and
-- the next sync (import happens on sync/claim only). A duplicate import is linked to the existing session and adds nothing.
--
-- Rollback: drop trigger adventure_branch_gate on private.adventure_encounter_rewards; drop the two public functions; restore
-- private.titan_export_extras_v1 from titan_export_extras_before_branches_v1. The entries table can stay (no reader left).

create table if not exists private.adventure_branch_entries (
  user_id uuid not null,
  world_id text not null,
  pilot text not null check (pilot ~ '^[a-z0-9-]{1,40}$'),
  version integer not null check (version between 1 and 1000),
  entered_at timestamptz not null default clock_timestamp(),
  primary key (user_id, world_id, pilot),
  foreign key (user_id, world_id) references private.adventure_journeys(user_id, world_id) on delete cascade
);
alter table private.adventure_branch_entries enable row level security;
revoke all on private.adventure_branch_entries from public, anon, authenticated;

-- Versioned contract. A new version is ADDED here (never edited) and becomes current in titan_adventure_branch_current.
create or replace function private.titan_adventure_branch_config(p_pilot text, p_version integer)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case when p_pilot = 'aube-arc1' and p_version = 1 then
    $cfg${"id":"aube-arc1","version":1,"world":"aube","arc":1,"choiceOrdinal":2,"steps":[{"ordinal":3,"kind":"scene","effortTargets":1,"daysTarget":1},{"ordinal":4,"kind":"clue","effortTargets":2,"daysTarget":2}],"routes":[{"id":"corniche","choice":0,"clue":"prise"},{"id":"ruines","choice":1,"clue":"serment"}]}$cfg$::jsonb
  end;
$$;
create or replace function private.titan_adventure_branch_current(p_world text)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case when p_world = 'aube' then private.titan_adventure_branch_config('aube-arc1', 1) end;
$$;
revoke all on function private.titan_adventure_branch_config(text, integer), private.titan_adventure_branch_current(text)
  from public, anon, authenticated;

create or replace function private.titan_adventure_branch_state(p_uid uuid, p_world text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  cfg jsonb := private.titan_adventure_branch_current(p_world);
  j private.adventure_journeys%rowtype;
  e private.adventure_branch_entries%rowtype;
  c private.adventure_encounter_rewards%rowtype;
  v_route jsonb; v_effort numeric := 0; v_days integer := 0; v_steps jsonb; v_first integer; v_last integer;
  v_found timestamptz; v_usable timestamptz;
begin
  if cfg is null then return jsonb_build_object('state', 'none'); end if;
  select * into j from private.adventure_journeys where user_id = p_uid and world_id = p_world;
  if j.user_id is null then return jsonb_build_object('state', 'none'); end if;
  select * into e from private.adventure_branch_entries where user_id = p_uid and world_id = p_world and pilot = cfg->>'id';
  -- A running arc keeps the version it entered, whatever the current version is.
  if e.user_id is not null then cfg := private.titan_adventure_branch_config(e.pilot, e.version); end if;
  if cfg is null then return jsonb_build_object('state', 'unknown', 'pilot', e.pilot, 'version', e.version); end if;
  select * into c from private.adventure_encounter_rewards
   where user_id = p_uid and world_id = p_world and ordinal = (cfg->>'choiceOrdinal')::integer;
  if e.user_id is null then
    return jsonb_build_object('state', case when c.user_id is null then 'available' else 'legacy' end,
      'pilot', cfg->>'id', 'version', (cfg->>'version')::integer);
  end if;
  if c.user_id is null then
    return jsonb_build_object('state', 'entered', 'pilot', e.pilot, 'version', e.version, 'enteredAt', e.entered_at);
  end if;
  select r into v_route from jsonb_array_elements(cfg->'routes') r where (r->>'choice')::integer = c.choice;
  select coalesce(sum(l.effort), 0), count(distinct l.day) filter (where l.effort > 0) into v_effort, v_days
    from private.adventure_effort_ledger l
    join public.training_logs t on t.id = l.source_id and t.user_id = l.user_id
   where l.user_id = p_uid and l.world_id = p_world and t.created_at >= c.earned_at and t.date >= c.earned_at
     and t.archived_at is null and t.is_suspicious is not true and t.status not in ('rejected', 'flagged', 'pending_review')
     and t.details->>'serverReward' = 'true' and coalesce(t.details->>'historical', 'false') <> 'true';
  select jsonb_agg(jsonb_build_object(
      'ordinal', (s->>'ordinal')::integer, 'kind', s->>'kind',
      'effortTarget', (s->>'effortTargets')::integer * j.target, 'daysTarget', (s->>'daysTarget')::integer,
      'branchReady', v_effort >= (s->>'effortTargets')::integer * j.target and v_days >= (s->>'daysTarget')::integer,
      'earned', r.user_id is not null, 'earnedAt', r.earned_at) order by (s->>'ordinal')::integer),
    min((s->>'ordinal')::integer), max((s->>'ordinal')::integer)
    into v_steps, v_first, v_last
    from jsonb_array_elements(cfg->'steps') s
    left join private.adventure_encounter_rewards r
      on r.user_id = p_uid and r.world_id = p_world and r.ordinal = (s->>'ordinal')::integer;
  select earned_at into v_found from private.adventure_encounter_rewards where user_id = p_uid and world_id = p_world and ordinal = v_first;
  select earned_at into v_usable from private.adventure_encounter_rewards where user_id = p_uid and world_id = p_world and ordinal = v_last;
  return jsonb_build_object('state', 'confirmed', 'pilot', e.pilot, 'version', e.version, 'enteredAt', e.entered_at,
    'route', v_route->>'id', 'confirmedAt', c.earned_at, 'effortSince', v_effort, 'daysSince', v_days, 'steps', v_steps,
    'clue', case when v_found is null then null else jsonb_build_object('id', v_route->>'clue',
      'state', case when v_usable is null then 'found' else 'usable' end, 'foundAt', v_found, 'usableAt', v_usable) end);
end $$;
revoke all on function private.titan_adventure_branch_state(uuid, text) from public, anon, authenticated;

create or replace function public.titan_adventure_branch_snapshot_v1(p_world text)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '5s' as $$
declare s jsonb; b jsonb;
begin
  s := public.titan_adventure_rpg_snapshot_v1(p_world); -- same authentication, suspension and world checks
  b := private.titan_adventure_branch_state(auth.uid(), p_world);
  if b->>'state' = 'confirmed' then
    s := jsonb_set(s, '{milestones}', (
      select jsonb_agg(case when st.x is null then m
        else m || jsonb_build_object('ready', coalesce((m->>'ready')::boolean, false) and (st.x->>'branchReady')::boolean) end
        order by (m->>'ordinal')::integer)
      from jsonb_array_elements(s->'milestones') m
      left join lateral (select x from jsonb_array_elements(b->'steps') x where (x->>'ordinal')::integer = (m->>'ordinal')::integer) st on true));
  end if;
  return s || jsonb_build_object('branchContract', 1, 'branch', b);
end $$;
revoke all on function public.titan_adventure_branch_snapshot_v1(text) from public, anon;
grant execute on function public.titan_adventure_branch_snapshot_v1(text) to authenticated;

create or replace function public.titan_adventure_branch_action_v1(
  p_world text, p_action text, p_ordinal integer default null, p_choice integer default null, p_route text default null)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '10s' as $$
declare u uuid := auth.uid(); cfg jsonb; b jsonb; v_route jsonb;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  -- Same per-account serialization as titan_adventure_rpg_action_v1: two devices confirming at once queue here.
  perform 1 from public.profiles where id = u and is_suspended is not true for update;
  if not found then raise exception 'ACCOUNT_UNAVAILABLE' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('start', 'sync', 'claim', 'enter', 'confirm') then raise exception 'INVALID_ACTION'; end if;
  if p_action in ('start', 'sync', 'claim') then
    perform public.titan_adventure_rpg_action_v1(p_world, p_action, p_ordinal, p_choice);
    return public.titan_adventure_branch_snapshot_v1(p_world);
  end if;
  if not exists (select 1 from public.adventure_worlds where id = p_world) then raise exception 'INVALID_WORLD'; end if;
  if private.titan_adventure_branch_current(p_world) is null then raise exception 'BRANCH_UNAVAILABLE'; end if;
  if not exists (select 1 from private.adventure_journeys where user_id = u and world_id = p_world) then
    raise exception 'JOURNEY_NOT_STARTED';
  end if;
  b := private.titan_adventure_branch_state(u, p_world);
  if b->>'state' = 'legacy' then raise exception 'BRANCH_INCOMPATIBLE'; end if;
  if p_action = 'enter' then
    if b->>'state' = 'available' then
      cfg := private.titan_adventure_branch_current(p_world);
      insert into private.adventure_branch_entries(user_id, world_id, pilot, version)
      values (u, p_world, cfg->>'id', (cfg->>'version')::integer) on conflict do nothing;
    end if;
    return public.titan_adventure_branch_snapshot_v1(p_world);
  end if;
  -- confirm
  if b->>'state' = 'available' then raise exception 'BRANCH_NOT_ENTERED'; end if;
  cfg := private.titan_adventure_branch_config(b->>'pilot', (b->>'version')::integer);
  select r into v_route from jsonb_array_elements(cfg->'routes') r where r->>'id' = p_route;
  if v_route is null then raise exception 'INVALID_ROUTE'; end if;
  -- Stable after confirmation: a later or concurrent confirmation returns the canonical route unchanged.
  if b->>'state' = 'confirmed' then return public.titan_adventure_branch_snapshot_v1(p_world); end if;
  perform public.titan_adventure_rpg_action_v1(p_world, 'claim', (cfg->>'choiceOrdinal')::integer, (v_route->>'choice')::integer);
  return public.titan_adventure_branch_snapshot_v1(p_world);
end $$;
revoke all on function public.titan_adventure_branch_action_v1(text, text, integer, integer, text) from public, anon;
grant execute on function public.titan_adventure_branch_action_v1(text, text, integer, integer, text) to authenticated;

create or replace function private.titan_adventure_branch_gate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare b jsonb; st jsonb;
begin
  b := private.titan_adventure_branch_state(new.user_id, new.world_id);
  if b->>'state' = 'confirmed' then
    select x into st from jsonb_array_elements(b->'steps') x where (x->>'ordinal')::integer = new.ordinal;
    if st is not null and coalesce((st->>'branchReady')::boolean, false) is not true then
      raise exception 'ENCOUNTER_INCOMPLETE';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.titan_adventure_branch_gate() from public, anon, authenticated;
drop trigger if exists adventure_branch_gate on private.adventure_encounter_rewards;
create trigger adventure_branch_gate before insert on private.adventure_encounter_rewards
  for each row execute function private.titan_adventure_branch_gate();

-- Account export keeps every previous section and adds the pilot entries.
do $$ begin
  if to_regprocedure('private.titan_export_extras_before_branches_v1(uuid)') is null then
    alter function private.titan_export_extras_v1(uuid) rename to titan_export_extras_before_branches_v1;
  end if;
end $$;
create or replace function private.titan_export_extras_v1(p_uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.titan_export_extras_before_branches_v1(p_uid) || jsonb_build_object('adventureBranches',
    coalesce((select jsonb_agg(to_jsonb(b) - 'user_id' order by b.entered_at) from private.adventure_branch_entries b where b.user_id = p_uid), '[]'));
$$;
revoke all on function private.titan_export_extras_before_branches_v1(uuid), private.titan_export_extras_v1(uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
