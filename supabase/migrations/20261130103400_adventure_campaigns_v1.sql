-- V1.5.3 — Quatre mondes, quatre mécaniques. One common, versioned configuration for the first arc of the three worlds that
-- had none (Les Îles des Marées, La Forge des Titans, Les Hauts des Aurores), played on the SAME engine as the Vallée pilot:
-- the V1.5.0 branch (explicit entry, one canonical choice, route steps counted from the decision) and the V1.5.1 guardian
-- (observe, prepare, resolve, one outcome under the per-account lock). Additive and idempotent. NEVER changes XP, credits,
-- active days, campaign objectives, rewards, the v300 effort, nor the Vallée contracts (aube-arc1 v1, veilleur v1,
-- veilleur-retour v1), which are kept literally.
--
-- Conditions (identical in the four worlds and on both routes, so one admissible history plays four distinct arcs):
--   step 3 (scene)  1 x the journey's frozen target and 1 active day, counted from the decision (V1.5.0 rules);
--   step 4 (clue)   2 x target, 2 active days, from the decision;
--   observe (5)     the frozen v1 milestone 5; resolve (6) the frozen v1 milestone 6 (the arc's mini-boss).
--   A condition only knows effort points and active days of the existing ledger: no real time window, no discipline.
-- Mechanics: one per world, all on ONE primitive of the encounter engine, checked here by titan_adventure_mechanic_check:
--   a list of slots, each answered with one token of its pool (distinct tokens for sequence and link).
--   marees  chart     report the current observed north and south, then the passage they point to
--   forge   sequence  the order of three pieces among four
--   aurores link      a chain of three beacons among four (departure, stage, arrival)
--   (aube   pick      the Veilleur's sign, unchanged: V1.5.1 prepare)
-- A wrong answer is recorded with its attempt count and its first wrong slot, and corrected without effort; the right one
-- stamps prepared_at once. resolve is the unchanged V1.5.1 resolve: the server reads the clue IT recorded and writes the
-- route's outcome and the usual mini-boss reward in one transaction.
--
-- What is new:
--   private.titan_adventure_campaign_config(id,version)   the shared contract, same JSON as js/core/adventure-campaigns.js
--                                                          (CAMPAIGNS), checked by tests/adventure-campaigns.test.mjs.
--   private.titan_adventure_campaign_current(world) / _by_guardian(guardian,version) / _branch(cfg) / _guardian(cfg)
--   private.titan_adventure_branch_config/_current and private.titan_adventure_guardian_config/_current are re-declared with
--     the Vallée literals unchanged and the three new arcs derived from the common configuration: every V1.5.0/V1.5.1
--     function, trigger and gate (entry, legacy, route steps, observe, resolve) now serves the four worlds.
--   private.adventure_guardian_encounters.last_answer      the last answer of a slot mechanic (the sign stays in last_sign).
--   private.titan_adventure_mechanic_check(primitive,route,answer)   {valid, correct, firstWrong}
--   private.titan_adventure_mechanic_state(uid,world,guardian)       slots and pools of the route, attempts, last answer and
--                                                          its first wrong slot (never the expected answer).
--   public.titan_adventure_campaign_snapshot_v1(world)    guardian snapshot + "mechanic".
--   public.titan_adventure_campaign_action_v1(world,action,ordinal,choice,route,answer)
--     start|sync|claim|enter|confirm|resolve delegate to titan_adventure_guardian_action_v1; solve answers the mechanic
--     (in the Vallée, solve [sign] is the V1.5.1 prepare).
--
-- Compatibility: a journey of these three worlds that already passed the choice ordinal keeps its original version
-- ("legacy", acquired rewards and chapters untouched); an account that never enters keeps the v1 journal; a running arc keeps
-- the version it entered. An old client sees the new arcs as "unknown" and can neither enter nor skip a gated step.
--
-- Rollback: re-run the four config/current functions of 20261123090000 and 20261124090000 (Vallée only); drop the two public
-- functions and the private campaign/mechanic functions. The last_answer column can stay (no reader left).

alter table private.adventure_guardian_encounters add column if not exists last_answer text[];
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'adventure_guardian_last_answer_bounds') then
    alter table private.adventure_guardian_encounters add constraint adventure_guardian_last_answer_bounds
      check (last_answer is null or (cardinality(last_answer) between 1 and 12 and array_position(last_answer, null) is null));
  end if;
end $$;

-- Versioned contract. A new version is ADDED here (never edited) and becomes current in titan_adventure_campaign_current.
create or replace function private.titan_adventure_campaign_config(p_id text, p_version integer)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case
    when p_id = 'marees-arc1' and p_version = 1 then
      $cfg${"id":"marees-arc1","version":1,"world":"marees","arc":1,"choiceOrdinal":2,"steps":[{"ordinal":3,"kind":"scene","effortTargets":1,"daysTarget":1},{"ordinal":4,"kind":"clue","effortTargets":2,"daysTarget":2}],"guardian":{"id":"gardienne","observeOrdinal":5,"ordinal":6,"primitive":"chart"},"routes":[{"id":"carte","choice":0,"clue":"releve","outcome":"chenal_ouvert","slots":[{"id":"nord","pool":["est","ouest","calme"]},{"id":"sud","pool":["est","ouest","calme"]},{"id":"passage","pool":["chenal","recifs","large"]}],"answer":["est","ouest","chenal"]},{"id":"gardienne","choice":1,"clue":"chant","outcome":"large_franchi","slots":[{"id":"nord","pool":["est","ouest","calme"]},{"id":"sud","pool":["est","ouest","calme"]},{"id":"passage","pool":["chenal","recifs","large"]}],"answer":["calme","est","large"]}]}$cfg$::jsonb
    when p_id = 'forge-arc1' and p_version = 1 then
      $cfg${"id":"forge-arc1","version":1,"world":"forge","arc":1,"choiceOrdinal":2,"steps":[{"ordinal":3,"kind":"scene","effortTargets":1,"daysTarget":1},{"ordinal":4,"kind":"clue","effortTargets":2,"daysTarget":2}],"guardian":{"id":"artisan","observeOrdinal":5,"ordinal":6,"primitive":"sequence"},"routes":[{"id":"soufflet","choice":0,"clue":"plan","outcome":"foyer_ranime","slots":[{"id":"p1","pool":["charniere","cuir","buse","ressort"]},{"id":"p2","pool":["charniere","cuir","buse","ressort"]},{"id":"p3","pool":["charniere","cuir","buse","ressort"]}],"answer":["charniere","cuir","buse"]},{"id":"artisans","choice":1,"clue":"chanson","outcome":"enclume_chantante","slots":[{"id":"p1","pool":["axe","ressort","tete","cuir"]},{"id":"p2","pool":["axe","ressort","tete","cuir"]},{"id":"p3","pool":["axe","ressort","tete","cuir"]}],"answer":["axe","ressort","tete"]}]}$cfg$::jsonb
    when p_id = 'aurores-arc1' and p_version = 1 then
      $cfg${"id":"aurores-arc1","version":1,"world":"aurores","arc":1,"choiceOrdinal":2,"steps":[{"ordinal":3,"kind":"scene","effortTargets":1,"daysTarget":1},{"ordinal":4,"kind":"clue","effortTargets":2,"daysTarget":2}],"guardian":{"id":"sentinelle","observeOrdinal":5,"ordinal":6,"primitive":"link"},"routes":[{"id":"constellations","choice":0,"clue":"carte-ciel","outcome":"balises_rallumees","slots":[{"id":"depart","pool":["cairn","lac","rocher","col"]},{"id":"etape","pool":["cairn","lac","rocher","col"]},{"id":"arrivee","pool":["cairn","lac","rocher","col"]}],"answer":["cairn","lac","col"]},{"id":"histoire","choice":1,"clue":"recit","outcome":"recit_transmis","slots":[{"id":"depart","pool":["rocher","pin","cairn","col"]},{"id":"etape","pool":["rocher","pin","cairn","col"]},{"id":"arrivee","pool":["rocher","pin","cairn","col"]}],"answer":["rocher","pin","col"]}]}$cfg$::jsonb
  end;
$$;
create or replace function private.titan_adventure_campaign_current(p_world text)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case p_world
    when 'marees' then private.titan_adventure_campaign_config('marees-arc1', 1)
    when 'forge' then private.titan_adventure_campaign_config('forge-arc1', 1)
    when 'aurores' then private.titan_adventure_campaign_config('aurores-arc1', 1)
  end;
$$;
-- The guardian version is the campaign version (one contract per arc version).
create or replace function private.titan_adventure_campaign_by_guardian(p_guardian text, p_version integer)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case p_guardian
    when 'gardienne' then private.titan_adventure_campaign_config('marees-arc1', p_version)
    when 'artisan' then private.titan_adventure_campaign_config('forge-arc1', p_version)
    when 'sentinelle' then private.titan_adventure_campaign_config('aurores-arc1', p_version)
  end;
$$;
-- Projections read by the V1.5.0 branch and V1.5.1 guardian functions (js: branchContract / guardianContract).
create or replace function private.titan_adventure_campaign_branch(p_cfg jsonb)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case when p_cfg is not null then jsonb_build_object('id', p_cfg->'id', 'version', p_cfg->'version', 'world', p_cfg->'world',
    'arc', p_cfg->'arc', 'choiceOrdinal', p_cfg->'choiceOrdinal', 'steps', p_cfg->'steps',
    'routes', (select jsonb_agg(jsonb_build_object('id', r->'id', 'choice', r->'choice', 'clue', r->'clue') order by n)
                 from jsonb_array_elements(p_cfg->'routes') with ordinality x(r, n))) end;
$$;
create or replace function private.titan_adventure_campaign_guardian(p_cfg jsonb)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case when p_cfg is not null then jsonb_build_object('id', p_cfg->'guardian'->'id', 'version', p_cfg->'version',
    'pilot', p_cfg->'id', 'pilotVersions', jsonb_build_array(p_cfg->'version'), 'world', p_cfg->'world',
    'observeOrdinal', p_cfg->'guardian'->'observeOrdinal', 'ordinal', p_cfg->'guardian'->'ordinal',
    'primitive', p_cfg->'guardian'->'primitive', 'signs', '[]'::jsonb,
    'routes', (select jsonb_agg(jsonb_build_object('route', r->'id', 'clue', r->'clue', 'outcome', r->'outcome',
                 'slots', r->'slots', 'answer', r->'answer') order by n)
                 from jsonb_array_elements(p_cfg->'routes') with ordinality x(r, n))) end;
$$;

-- The V1.5.0 and V1.5.1 contracts: the Vallée literals are those of 20261123090000 and 20261124090000, unchanged.
create or replace function private.titan_adventure_branch_config(p_pilot text, p_version integer)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case when p_pilot = 'aube-arc1' and p_version = 1 then
    $cfg${"id":"aube-arc1","version":1,"world":"aube","arc":1,"choiceOrdinal":2,"steps":[{"ordinal":3,"kind":"scene","effortTargets":1,"daysTarget":1},{"ordinal":4,"kind":"clue","effortTargets":2,"daysTarget":2}],"routes":[{"id":"corniche","choice":0,"clue":"prise"},{"id":"ruines","choice":1,"clue":"serment"}]}$cfg$::jsonb
  else private.titan_adventure_campaign_branch(private.titan_adventure_campaign_config(p_pilot, p_version)) end;
$$;
create or replace function private.titan_adventure_branch_current(p_world text)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case when p_world = 'aube' then private.titan_adventure_branch_config('aube-arc1', 1)
    else private.titan_adventure_campaign_branch(private.titan_adventure_campaign_current(p_world)) end;
$$;
create or replace function private.titan_adventure_guardian_config(p_guardian text, p_version integer)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case when p_guardian = 'veilleur' and p_version = 1 then
    $cfg${"id":"veilleur","version":1,"pilot":"aube-arc1","pilotVersions":[1],"world":"aube","observeOrdinal":5,"ordinal":6,"signs":["fissure","gravure","mousse"],"routes":[{"route":"corniche","clue":"prise","sign":"fissure","outcome":"passage_rouvert"},{"route":"ruines","clue":"serment","sign":"gravure","outcome":"serment_restitue"}]}$cfg$::jsonb
  else private.titan_adventure_campaign_guardian(private.titan_adventure_campaign_by_guardian(p_guardian, p_version)) end;
$$;
create or replace function private.titan_adventure_guardian_current(p_world text)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case when p_world = 'aube' then private.titan_adventure_guardian_config('veilleur', 1)
    else private.titan_adventure_campaign_guardian(private.titan_adventure_campaign_current(p_world)) end;
$$;
revoke all on function private.titan_adventure_campaign_config(text, integer), private.titan_adventure_campaign_current(text),
  private.titan_adventure_campaign_by_guardian(text, integer), private.titan_adventure_campaign_branch(jsonb),
  private.titan_adventure_campaign_guardian(jsonb), private.titan_adventure_branch_config(text, integer),
  private.titan_adventure_branch_current(text), private.titan_adventure_guardian_config(text, integer),
  private.titan_adventure_guardian_current(text) from public, anon, authenticated;

-- The common primitive. Same algorithm as check() in js/core/adventure-campaigns.js.
create or replace function private.titan_adventure_mechanic_check(p_primitive text, p_route jsonb, p_answer text[])
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare n integer := coalesce(jsonb_array_length(p_route->'slots'), 0); i integer; v_first integer;
begin
  if n = 0 or p_answer is null or cardinality(p_answer) <> n or array_ndims(p_answer) <> 1 then
    return jsonb_build_object('valid', false, 'correct', false, 'firstWrong', null);
  end if;
  for i in 1..n loop
    if p_answer[i] is null or not ((p_route->'slots'->(i - 1)->'pool') ? p_answer[i]) then
      return jsonb_build_object('valid', false, 'correct', false, 'firstWrong', null);
    end if;
  end loop;
  if p_primitive in ('sequence', 'link') and (select count(distinct x) from unnest(p_answer) x) <> n then
    return jsonb_build_object('valid', false, 'correct', false, 'firstWrong', null);
  end if;
  select min(k) into v_first from generate_series(1, n) k where p_answer[k] is distinct from p_route->'answer'->>(k - 1);
  return jsonb_build_object('valid', true, 'correct', v_first is null, 'firstWrong', v_first);
end $$;
revoke all on function private.titan_adventure_mechanic_check(text, jsonb, text[]) from public, anon, authenticated;

-- What the clients show of the mechanic: the route's slots and pools, attempts and the last answer with its first wrong slot.
-- The expected answer itself never leaves the server through this block.
create or replace function private.titan_adventure_mechanic_state(p_uid uuid, p_world text, p_guardian jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare cfg jsonb; v_route jsonb; e private.adventure_guardian_encounters%rowtype; v_check jsonb; v_primitive text; v_slots jsonb;
begin
  if p_guardian is null or p_guardian->>'state' in ('none', 'legacy', 'unknown') then return jsonb_build_object('state', 'none'); end if;
  cfg := private.titan_adventure_guardian_config(p_guardian->>'id', (p_guardian->>'version')::integer);
  if cfg is null then return jsonb_build_object('state', 'none'); end if;
  select r into v_route from jsonb_array_elements(cfg->'routes') r where r->>'route' = p_guardian->>'route';
  if v_route is null then return jsonb_build_object('state', 'none'); end if;
  select * into e from private.adventure_guardian_encounters where user_id = p_uid and world_id = p_world and guardian = cfg->>'id';
  if jsonb_array_length(coalesce(cfg->'signs', '[]')) > 0 then
    -- The Vallée: the V1.5.1 sign is the one-slot "pick" primitive.
    v_primitive := 'pick'; v_slots := jsonb_build_array(jsonb_build_object('id', 'signe', 'pool', cfg->'signs'));
    v_route := jsonb_build_object('slots', v_slots, 'answer', jsonb_build_array(v_route->'sign'));
    if e.last_sign is not null then v_check := private.titan_adventure_mechanic_check(v_primitive, v_route, array[e.last_sign]); end if;
    return jsonb_build_object('state', p_guardian->>'state', 'primitive', v_primitive, 'route', p_guardian->>'route', 'slots', v_slots,
      'attempts', coalesce(e.attempts, 0), 'lastAnswer', case when e.last_sign is null then null else jsonb_build_array(e.last_sign) end,
      'lastCorrect', v_check->'correct', 'firstWrong', v_check->'firstWrong', 'solved', e.prepared_at is not null);
  end if;
  v_primitive := cfg->>'primitive';
  if e.last_answer is not null then v_check := private.titan_adventure_mechanic_check(v_primitive, v_route, e.last_answer); end if;
  return jsonb_build_object('state', p_guardian->>'state', 'primitive', v_primitive, 'route', p_guardian->>'route', 'slots', v_route->'slots',
    'attempts', coalesce(e.attempts, 0), 'lastAnswer', to_jsonb(e.last_answer),
    'lastCorrect', v_check->'correct', 'firstWrong', v_check->'firstWrong', 'solved', e.prepared_at is not null);
end $$;
revoke all on function private.titan_adventure_mechanic_state(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.titan_adventure_campaign_snapshot_v1(p_world text)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '5s' as $$
declare s jsonb;
begin
  s := public.titan_adventure_guardian_snapshot_v1(p_world); -- same authentication, suspension and world checks
  return s || jsonb_build_object('campaignContract', 1,
    'campaign', case when p_world = 'aube' then 'aube-arc1' else private.titan_adventure_campaign_current(p_world)->>'id' end,
    'mechanic', private.titan_adventure_mechanic_state(auth.uid(), p_world, s->'guardian'));
end $$;
revoke all on function public.titan_adventure_campaign_snapshot_v1(text) from public, anon;
grant execute on function public.titan_adventure_campaign_snapshot_v1(text) to authenticated;

create or replace function public.titan_adventure_campaign_action_v1(
  p_world text, p_action text, p_ordinal integer default null, p_choice integer default null,
  p_route text default null, p_answer text[] default null)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '10s' as $$
declare u uuid := auth.uid(); cfg jsonb; s jsonb; g jsonb; v_route jsonb; v_check jsonb;
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  -- Same per-account serialization as every adventure action: two devices answering at once queue here.
  perform 1 from public.profiles where id = u and is_suspended is not true for update;
  if not found then raise exception 'ACCOUNT_UNAVAILABLE' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('start', 'sync', 'claim', 'enter', 'confirm', 'resolve', 'solve') then
    raise exception 'INVALID_ACTION';
  end if;
  if p_action <> 'solve' then
    perform public.titan_adventure_guardian_action_v1(p_world, p_action, p_ordinal, p_choice, p_route, null);
    return public.titan_adventure_campaign_snapshot_v1(p_world);
  end if;
  if not exists (select 1 from public.adventure_worlds where id = p_world) then raise exception 'INVALID_WORLD'; end if;
  cfg := private.titan_adventure_guardian_current(p_world);
  if cfg is null then raise exception 'GUARDIAN_UNAVAILABLE'; end if;
  if jsonb_array_length(coalesce(cfg->'signs', '[]')) > 0 then
    -- The Vallée: one sign, through the unchanged V1.5.1 preparation.
    if p_answer is null or cardinality(p_answer) <> 1 then raise exception 'INVALID_ANSWER'; end if;
    perform public.titan_adventure_guardian_action_v1(p_world, 'prepare', null, null, null, p_answer[1]);
    return public.titan_adventure_campaign_snapshot_v1(p_world);
  end if;
  s := public.titan_adventure_campaign_snapshot_v1(p_world);
  g := s->'guardian';
  if g->>'state' = 'none' then raise exception 'GUARDIAN_UNAVAILABLE'; end if;
  if g->>'state' in ('legacy', 'unknown') then raise exception 'GUARDIAN_INCOMPATIBLE'; end if;
  if g->>'state' in ('locked', 'observe') then raise exception 'GUARDIAN_NOT_OBSERVED'; end if;
  -- Stable once solved: a later or concurrent answer (another device left on the board) never undoes it nor is counted.
  if g->>'state' <> 'prepare' then return s; end if;
  cfg := private.titan_adventure_guardian_config(g->>'id', (g->>'version')::integer);
  select r into v_route from jsonb_array_elements(cfg->'routes') r where r->>'route' = g->>'route';
  v_check := private.titan_adventure_mechanic_check(cfg->>'primitive', v_route, p_answer);
  -- A malformed answer (wrong length, unknown token, a piece or beacon used twice) is refused and not counted.
  if not (v_check->>'valid')::boolean then raise exception 'INVALID_ANSWER'; end if;
  insert into private.adventure_guardian_encounters(user_id, world_id, guardian, version, route)
  values (u, p_world, cfg->>'id', (cfg->>'version')::integer, g->>'route') on conflict do nothing;
  update private.adventure_guardian_encounters
     set attempts = least(1000, attempts + 1), last_answer = p_answer,
         prepared_at = case when (v_check->>'correct')::boolean then clock_timestamp() end
   where user_id = u and world_id = p_world and guardian = cfg->>'id' and prepared_at is null;
  return public.titan_adventure_campaign_snapshot_v1(p_world);
end $$;
revoke all on function public.titan_adventure_campaign_action_v1(text, text, integer, integer, text, text[]) from public, anon;
grant execute on function public.titan_adventure_campaign_action_v1(text, text, integer, integer, text, text[]) to authenticated;
notify pgrst, 'reload schema';
