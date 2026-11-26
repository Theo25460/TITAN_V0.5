-- V1.5.1 — Gardiens. The Veilleur de pierre becomes an encounter played in three phases (observe, prepare, resolve) at the
-- end of the V1.5.0 pilot arc (aube-arc1). Additive and idempotent. NEVER changes XP, credits, active days, campaign
-- objectives, rewards, the v300 effort or the V1.5.0 branch contract.
--
-- Where the guardian sits: arc 1 of the encounter engine (20261102140000). Ordinal 5 is the observation (the frozen v1
-- milestone: chapter 3, effort >= 5 x the journey's frozen target, 3 distinct active days), ordinal 6 (the arc's mini-boss)
-- is the resolution (chapter 3, effort >= 6 x target, 3 days, ordinal 5 earned). These are the campaign's frozen sport
-- thresholds, unchanged and identical for both routes: the guardian adds a preparation and an outcome, never effort.
--
--   observe   ordinal 5 is claimed as usual (claim 5): the Veilleur shows three signs. Needs the usable clue (ordinal 4).
--   prepare   the player matches the clue of the route to one sign. A wrong sign is recorded with its attempt count and can be
--             corrected; the right one stamps prepared_at, once. No sport, no reward.
--   resolve   once prepared and once milestone 6 is ready, the server reads the clue IT recorded (V1.5.0 branch state, never a
--             client value) and writes the route's outcome and the ordinal 6 reward in one transaction, under the per-account
--             profile lock: a double or simultaneous confirmation keeps one outcome.
--             corniche: clue "prise" + sign "fissure"  -> passage_rouvert   (the hold secures the wall, the passage reopens)
--             ruines:   clue "serment" + sign "gravure" -> serment_restitue (the fragment completes the oath)
--
-- What is new:
--   private.adventure_guardian_encounters   one row per account and guardian: version, route, attempts, last sign,
--                                            prepared_at, outcome, resolved_at. A running encounter keeps its version.
--   private.titan_adventure_guardian_config(guardian,version)  versioned contract, same JSON as js/core/adventure-guardian.js.
--   private.titan_adventure_guardian_state(uid,world,snapshot) phase, thresholds and resume facts, read from server facts only.
--   public.titan_adventure_guardian_snapshot_v1(world)          branch snapshot + "guardian".
--   public.titan_adventure_guardian_action_v1(world,action,…)   start|sync|claim|enter|confirm delegate to
--                                            titan_adventure_branch_action_v1; prepare|resolve are the guardian actions.
--   trigger adventure_guardian_gate          the ordinal 6 reward of a confirmed pilot route needs a recorded outcome, whichever
--                                            client asks (an old app calling v1 claim 6 gets ENCOUNTER_INCOMPLETE).
--
-- A pilot account that earned ordinal 6 before this migration keeps it ("legacy", no outcome invented).
--
-- Rollback: drop trigger adventure_guardian_gate on private.adventure_encounter_rewards; drop the two public functions;
-- restore private.titan_export_extras_v1 from titan_export_extras_before_guardian_v1. The table can stay (no reader left).

create table if not exists private.adventure_guardian_encounters (
  user_id uuid not null,
  world_id text not null,
  guardian text not null check (guardian ~ '^[a-z0-9-]{1,40}$'),
  version integer not null check (version between 1 and 1000),
  route text not null check (route ~ '^[a-z0-9-]{1,40}$'),
  attempts integer not null default 0 check (attempts between 0 and 1000),
  last_sign text check (last_sign ~ '^[a-z0-9-]{1,40}$'),
  prepared_at timestamptz,
  outcome text check (outcome ~ '^[a-z0-9_]{1,40}$'),
  resolved_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, world_id, guardian),
  foreign key (user_id, world_id) references private.adventure_journeys(user_id, world_id) on delete cascade,
  check ((outcome is null) = (resolved_at is null)),
  check (outcome is null or prepared_at is not null)
);
alter table private.adventure_guardian_encounters enable row level security;
revoke all on private.adventure_guardian_encounters from public, anon, authenticated;

-- Versioned contract. A new version is ADDED here (never edited) and becomes current in titan_adventure_guardian_current.
create or replace function private.titan_adventure_guardian_config(p_guardian text, p_version integer)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case when p_guardian = 'veilleur' and p_version = 1 then
    $cfg${"id":"veilleur","version":1,"pilot":"aube-arc1","pilotVersions":[1],"world":"aube","observeOrdinal":5,"ordinal":6,"signs":["fissure","gravure","mousse"],"routes":[{"route":"corniche","clue":"prise","sign":"fissure","outcome":"passage_rouvert"},{"route":"ruines","clue":"serment","sign":"gravure","outcome":"serment_restitue"}]}$cfg$::jsonb
  end;
$$;
create or replace function private.titan_adventure_guardian_current(p_world text)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case when p_world = 'aube' then private.titan_adventure_guardian_config('veilleur', 1) end;
$$;
revoke all on function private.titan_adventure_guardian_config(text, integer), private.titan_adventure_guardian_current(text)
  from public, anon, authenticated;

-- p_snapshot is the branch snapshot of the same account (milestones already carry the frozen v1 readiness).
create or replace function private.titan_adventure_guardian_state(p_uid uuid, p_world text, p_snapshot jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  cfg jsonb := private.titan_adventure_guardian_current(p_world);
  b jsonb := p_snapshot->'branch';
  g private.adventure_guardian_encounters%rowtype;
  v_route jsonb; m_obs jsonb; m_res jsonb; m jsonb; v_state text; v_observed timestamptz;
  v_since_effort numeric := 0; v_since_sessions integer := 0; v_corr_effort numeric := 0; v_corr_sessions integer := 0;
begin
  if cfg is null or b is null or b->>'state' <> 'confirmed' or b->>'pilot' <> cfg->>'pilot'
     or not (cfg->'pilotVersions' @> to_jsonb((b->>'version')::integer)) then
    return jsonb_build_object('state', 'none');
  end if;
  select * into g from private.adventure_guardian_encounters where user_id = p_uid and world_id = p_world and guardian = cfg->>'id';
  if g.user_id is not null then cfg := private.titan_adventure_guardian_config(g.guardian, g.version); end if;
  if cfg is null then return jsonb_build_object('state', 'unknown', 'id', g.guardian, 'version', g.version); end if;
  select r into v_route from jsonb_array_elements(cfg->'routes') r where r->>'route' = b->>'route';
  if v_route is null then return jsonb_build_object('state', 'none'); end if;
  select x into m_obs from jsonb_array_elements(p_snapshot->'milestones') x where (x->>'ordinal')::integer = (cfg->>'observeOrdinal')::integer;
  select x into m_res from jsonb_array_elements(p_snapshot->'milestones') x where (x->>'ordinal')::integer = (cfg->>'ordinal')::integer;
  select (x->>'earnedAt')::timestamptz into v_observed from jsonb_array_elements(p_snapshot->'rewards') x
   where (x->>'ordinal')::integer = (cfg->>'observeOrdinal')::integer;
  if coalesce((m_res->>'earned')::boolean, false) and g.outcome is null then
    return jsonb_build_object('state', 'legacy', 'id', cfg->>'id', 'version', (cfg->>'version')::integer, 'route', b->>'route');
  end if;
  v_state := case
    when b->'clue' is null or b->'clue'->>'state' <> 'usable' or b->'clue'->>'id' <> v_route->>'clue' then 'locked'
    when not coalesce((m_obs->>'earned')::boolean, false) then 'observe'
    when g.prepared_at is null then 'prepare'
    when g.outcome is not null then 'resolved'
    when coalesce((m_res->>'ready')::boolean, false) then 'ready'
    else 'waiting' end;
  m := case when v_state in ('locked', 'observe') then m_obs else m_res end;
  if g.prepared_at is not null then
    -- Resume facts: eligible contributions confirmed since the preparation (same filters as the v1 snapshot).
    select coalesce(sum(l.effort), 0), count(*) filter (where l.effort > 0) into v_since_effort, v_since_sessions
      from private.adventure_effort_ledger l join public.training_logs t on t.id = l.source_id and t.user_id = l.user_id
     where l.user_id = p_uid and l.world_id = p_world and l.created_at >= g.prepared_at
       and t.archived_at is null and t.is_suspicious is not true and t.status not in ('rejected', 'flagged', 'pending_review')
       and t.details->>'serverReward' = 'true' and coalesce(t.details->>'historical', 'false') <> 'true';
  end if;
  -- A session attributed to this world and later archived, rejected or put on hold no longer counts (corrected session).
  select coalesce(sum(l.effort), 0), count(*) into v_corr_effort, v_corr_sessions
    from private.adventure_effort_ledger l join public.training_logs t on t.id = l.source_id and t.user_id = l.user_id
   where l.user_id = p_uid and l.world_id = p_world and l.effort > 0
     and (t.archived_at is not null or t.is_suspicious is true or t.status in ('rejected', 'flagged', 'pending_review'));
  return jsonb_build_object('state', v_state, 'id', cfg->>'id', 'version', (cfg->>'version')::integer, 'route', b->>'route',
    'clue', b->'clue'->>'id', 'observeOrdinal', (cfg->>'observeOrdinal')::integer, 'ordinal', (cfg->>'ordinal')::integer,
    'signs', cfg->'signs', 'observedAt', v_observed, 'attempts', coalesce(g.attempts, 0), 'lastSign', g.last_sign,
    'lastCorrect', case when g.last_sign is null then null else g.last_sign = v_route->>'sign' end,
    'preparedAt', g.prepared_at, 'outcome', g.outcome, 'resolvedAt', g.resolved_at,
    'threshold', jsonb_build_object('ordinal', (m->>'ordinal')::integer, 'effort', coalesce((p_snapshot->>'effort')::numeric, 0),
      'effortTarget', (m->>'effortTarget')::numeric, 'days', coalesce((p_snapshot->>'days')::integer, 0),
      'daysTarget', (m->>'daysTarget')::integer, 'chapter', coalesce((p_snapshot->>'chapter')::integer, 0),
      'chapterTarget', (m->>'chapter')::integer, 'ready', coalesce((m->>'ready')::boolean, false)),
    'sincePrepared', jsonb_build_object('effort', v_since_effort, 'sessions', v_since_sessions),
    'corrected', jsonb_build_object('effort', v_corr_effort, 'sessions', v_corr_sessions));
end $$;
revoke all on function private.titan_adventure_guardian_state(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.titan_adventure_guardian_snapshot_v1(p_world text)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '5s' as $$
declare s jsonb;
begin
  s := public.titan_adventure_branch_snapshot_v1(p_world); -- same authentication, suspension and world checks
  return s || jsonb_build_object('guardianContract', 1, 'guardian', private.titan_adventure_guardian_state(auth.uid(), p_world, s));
end $$;
revoke all on function public.titan_adventure_guardian_snapshot_v1(text) from public, anon;
grant execute on function public.titan_adventure_guardian_snapshot_v1(text) to authenticated;

create or replace function public.titan_adventure_guardian_action_v1(
  p_world text, p_action text, p_ordinal integer default null, p_choice integer default null,
  p_route text default null, p_sign text default null)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '10s' as $$
declare u uuid := auth.uid(); cfg jsonb; s jsonb; g jsonb; v_route jsonb;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  -- Same per-account serialization as the v1 and branch actions: two devices resolving at once queue here.
  perform 1 from public.profiles where id = u and is_suspended is not true for update;
  if not found then raise exception 'ACCOUNT_UNAVAILABLE' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('start', 'sync', 'claim', 'enter', 'confirm', 'prepare', 'resolve') then
    raise exception 'INVALID_ACTION';
  end if;
  if p_action in ('start', 'sync', 'claim', 'enter', 'confirm') then
    perform public.titan_adventure_branch_action_v1(p_world, p_action, p_ordinal, p_choice, p_route);
    return public.titan_adventure_guardian_snapshot_v1(p_world);
  end if;
  if not exists (select 1 from public.adventure_worlds where id = p_world) then raise exception 'INVALID_WORLD'; end if;
  if private.titan_adventure_guardian_current(p_world) is null then raise exception 'GUARDIAN_UNAVAILABLE'; end if;
  s := public.titan_adventure_guardian_snapshot_v1(p_world);
  g := s->'guardian';
  if g->>'state' = 'none' then raise exception 'GUARDIAN_UNAVAILABLE'; end if;
  if g->>'state' in ('legacy', 'unknown') then raise exception 'GUARDIAN_INCOMPATIBLE'; end if;
  if g->>'state' in ('locked', 'observe') then raise exception 'GUARDIAN_NOT_OBSERVED'; end if;
  cfg := private.titan_adventure_guardian_config(g->>'id', (g->>'version')::integer);
  select r into v_route from jsonb_array_elements(cfg->'routes') r where r->>'route' = g->>'route';
  if p_action = 'prepare' then
    -- Stable after preparation: a later or concurrent answer never undoes it.
    if g->>'state' <> 'prepare' then return s; end if;
    if p_sign is null or not (cfg->'signs' ? p_sign) then raise exception 'INVALID_SIGN'; end if;
    insert into private.adventure_guardian_encounters(user_id, world_id, guardian, version, route)
    values (u, p_world, cfg->>'id', (cfg->>'version')::integer, g->>'route') on conflict do nothing;
    update private.adventure_guardian_encounters
       set attempts = least(1000, attempts + 1), last_sign = p_sign,
           prepared_at = case when p_sign = v_route->>'sign' then clock_timestamp() end
     where user_id = u and world_id = p_world and guardian = cfg->>'id' and prepared_at is null;
    return public.titan_adventure_guardian_snapshot_v1(p_world);
  end if;
  -- resolve: one outcome per account, read back unchanged by any later or concurrent confirmation.
  if g->>'state' = 'resolved' then return s; end if;
  if g->>'state' = 'prepare' then raise exception 'GUARDIAN_NOT_PREPARED'; end if;
  if g->>'state' = 'waiting' then raise exception 'ENCOUNTER_INCOMPLETE'; end if;
  -- The clue that counts is the one the server recorded for the route (V1.5.0 branch state), never a client value.
  if s->'branch'->'clue'->>'id' is distinct from v_route->>'clue' or s->'branch'->'clue'->>'state' <> 'usable' then
    raise exception 'GUARDIAN_CLUE_MISSING';
  end if;
  update private.adventure_guardian_encounters set outcome = v_route->>'outcome', resolved_at = clock_timestamp()
   where user_id = u and world_id = p_world and guardian = cfg->>'id' and outcome is null and prepared_at is not null;
  if not found then raise exception 'GUARDIAN_NOT_PREPARED'; end if;
  -- Usual reward of the arc's mini-boss, through the unchanged v1 rules (raises and rolls the outcome back if not ready).
  perform public.titan_adventure_rpg_action_v1(p_world, 'claim', (cfg->>'ordinal')::integer, null);
  return public.titan_adventure_guardian_snapshot_v1(p_world);
end $$;
revoke all on function public.titan_adventure_guardian_action_v1(text, text, integer, integer, text, text) from public, anon;
grant execute on function public.titan_adventure_guardian_action_v1(text, text, integer, integer, text, text) to authenticated;

create or replace function private.titan_adventure_guardian_gate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cfg jsonb := private.titan_adventure_guardian_current(new.world_id); b jsonb;
begin
  if cfg is null or new.ordinal <> (cfg->>'ordinal')::integer then return new; end if;
  b := private.titan_adventure_branch_state(new.user_id, new.world_id);
  if b->>'state' = 'confirmed' and b->>'pilot' = cfg->>'pilot' and cfg->'pilotVersions' @> to_jsonb((b->>'version')::integer)
     and not exists (select 1 from private.adventure_guardian_encounters e
                      where e.user_id = new.user_id and e.world_id = new.world_id and e.outcome is not null) then
    raise exception 'ENCOUNTER_INCOMPLETE';
  end if;
  return new;
end $$;
revoke all on function private.titan_adventure_guardian_gate() from public, anon, authenticated;
drop trigger if exists adventure_guardian_gate on private.adventure_encounter_rewards;
create trigger adventure_guardian_gate before insert on private.adventure_encounter_rewards
  for each row execute function private.titan_adventure_guardian_gate();

-- Account export keeps every previous section and adds the guardian encounters.
do $$ begin
  if to_regprocedure('private.titan_export_extras_before_guardian_v1(uuid)') is null then
    alter function private.titan_export_extras_v1(uuid) rename to titan_export_extras_before_guardian_v1;
  end if;
end $$;
create or replace function private.titan_export_extras_v1(p_uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.titan_export_extras_before_guardian_v1(p_uid) || jsonb_build_object('adventureGuardians',
    coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by g.created_at) from private.adventure_guardian_encounters g where g.user_id = p_uid), '[]'));
$$;
revoke all on function private.titan_export_extras_before_guardian_v1(uuid), private.titan_export_extras_v1(uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
