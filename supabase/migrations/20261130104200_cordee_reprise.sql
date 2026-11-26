-- V1.8.2 — Reprise et relais facultatifs (docs/V182_REPRISE_CORDEE.md). Applies after 20261124090000 (V1.8.1, the relay step).
-- The group keeps going when someone is unavailable or leaves. Everything stays on the Cordée and its relay: no new group, no new count.
--   * PRISE EN CHARGE (optional): once the passage is open, a member who may receive the relay (joined, not the opener, not suspended,
--     no block with the opener) can take it for 72 hours. While it is held, only the holder confirms; anyone else is refused RELAY_HELD.
--     Taking it is never required: an open passage that nobody holds can still be confirmed by any eligible member, as in V1.8.1.
--   * PASSATION (voluntary): the holder hands the relay over, either to one member they can see and who may receive it, or to the whole
--     cordée (« open »: the first eligible member who accepts). The offer lasts 48 hours (never past the end of the cordée) and the hold is
--     kept until then; the holder can withdraw it. Accepting makes the accepting member the holder for 72 hours. The challenge row is
--     locked, so two simultaneous acceptances give ONE holder; the other is refused RELAY_HANDOVER_TAKEN.
--   * NEVER ACCEPTED: an offer nobody accepted expires; its author's hold ends with it, and the passage is open to every eligible member
--     again. The opening, the longueurs and the history stay: the group loses nothing and is never stuck on one person.
--   * NO FREE ADVANCE: a hold, a handover, a departure or a block adds no longueur, no XP, no credit, no title and never confirms the relay:
--     the new holder confirms with their OWN confirmed session, on another day than the opening and recorded after it (V1.8.1 rule).
--   * DEPARTURE (leaving, or being cut by a block): the hold and any offer of or to that member become void at once (computed on every
--     read, then written by private.titan_cordee_relay_tidy). The longueurs a member brought BEFORE leaving stay acquired (confirmed sessions
--     recorded before the departure, capped at 1.5 × the share as always) with their sport families, and that member's part of the target
--     closes at what they brought (never more than one share): no debt left to the others, nothing counted that no confirmed session
--     brought. They still count as one of the « two contributors » when they brought a longueur. A member who leaves having brought nothing
--     drops out of the target as before (like an invitation never answered). Departures recorded before this migration keep the old rule.
--     A departed member earns no route title (titles go to members still roped in at the summit, unchanged) and is never named any more.
--   * SUSPENDED ACCOUNT: cannot take, hand over or accept (ACCOUNT_SUSPENDED); a suspended holder's hold is void.
--   * GROUP TOO SMALL: with nobody else roped in, the opener reads « alone » (invite by link, the passage stays open) and an open handover
--     is refused RELAY_GROUP_TOO_SMALL; the summit keeps the collective rule (two contributors as soon as two people took part).
--   * PRIVACY: no reason is ever asked or stored for a pause or a departure. Shared views show the game state only: who holds the relay
--     (under the Cordée naming rule), that a handover is pending (whom it is offered to only to its author and its recipient), never why.
--   * LIMITS: one hold and one pending offer per cordée, at most 8 holds and offers per cordée (RELAY_TURN_LIMIT), no automatic message:
--     the only prompts are the actions the server offers in state.relay.turn.
--   * Opens with the server flag screens.cordee_reprise (absent = closed, per-account rollout), checked here for take, handover and accept.
--     Withdrawing one's own offer is always possible. A hold already taken is honoured whatever the viewer's flag.
--   * Export: « cordeeRelayTurns » (one's own holds, offers and acceptances, without the other member) is added to
--     private.titan_social_export_v1 (cumulative). Erasure: rows keep the game history with no person (on delete set null).
--   * Measure: private.titan_cordee_reprise_measure() (service role): holds, offers, acceptances, expiries, relays confirmed after a
--     handover, departures with acquired longueurs. Counts only.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_cordee_relay_turn_v1(uuid, text, uuid), private.titan_cordee_reprise_measure(timestamptz),
-- private.titan_cordee_relay_tidy(uuid), private.titan_cordee_relay_offer(uuid), private.titan_cordee_relay_holder(uuid),
-- private.titan_cordee_relay_can_take(uuid, uuid, uuid, uuid), private.titan_cordee_member_until(uuid, uuid, timestamptz),
-- trigger titan_challenge_members_left_at and function private.titan_challenge_members_left_at(); re-apply public.titan_cordees_v1,
-- public.titan_cordee_relay_v1, private.titan_cordee_relay_state and private.titan_social_export_v1 from 20261124090000 and
-- private.titan_cordee_state from 20261120110000; drop table private.titan_cordee_relay_turns; alter table private.titan_cordee_relays drop
-- columns holder_id, held_at, hold_until; alter table public.titan_challenge_members drop column left_at.

-- ---------------------------------------------------------------------------------------------
-- 1. When a member left (the only new fact about a departure: no reason, no cause).
-- ---------------------------------------------------------------------------------------------
alter table public.titan_challenge_members add column if not exists left_at timestamptz;

create or replace function private.titan_challenge_members_left_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'left' and old.status = 'joined' then
    new.left_at := clock_timestamp();
  elsif new.status = 'joined' then
    new.left_at := null;
  end if;
  return new;
end;
$function$;
revoke all on function private.titan_challenge_members_left_at() from public, anon, authenticated;
drop trigger if exists titan_challenge_members_left_at on public.titan_challenge_members;
create trigger titan_challenge_members_left_at before update of status on public.titan_challenge_members
  for each row execute function private.titan_challenge_members_left_at();

-- ---------------------------------------------------------------------------------------------
-- 2. Who holds the relay, and the history of holds and handovers.
-- ---------------------------------------------------------------------------------------------
alter table private.titan_cordee_relays add column if not exists holder_id uuid references auth.users(id) on delete set null;
alter table private.titan_cordee_relays add column if not exists held_at timestamptz;
alter table private.titan_cordee_relays add column if not exists hold_until timestamptz;
create index if not exists titan_cordee_relays_holder_idx on private.titan_cordee_relays (holder_id);

create table if not exists private.titan_cordee_relay_turns (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.titan_challenges(id) on delete cascade,
  kind text not null check (kind in ('take', 'handover')),
  from_user uuid references auth.users(id) on delete set null,
  to_user uuid references auth.users(id) on delete set null,
  status text not null check (status in ('held', 'pending', 'accepted', 'withdrawn', 'expired', 'cancelled', 'closed')),
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz,
  resolved_at timestamptz,
  check (kind = 'handover' or status = 'held'),
  check (kind = 'take' or expires_at is not null)
);
-- One pending handover per cordée.
create unique index if not exists titan_cordee_relay_turns_pending_idx on private.titan_cordee_relay_turns (challenge_id) where status = 'pending';
create index if not exists titan_cordee_relay_turns_challenge_idx on private.titan_cordee_relay_turns (challenge_id, created_at);
create index if not exists titan_cordee_relay_turns_from_idx on private.titan_cordee_relay_turns (from_user);
create index if not exists titan_cordee_relay_turns_to_idx on private.titan_cordee_relay_turns (to_user);
create index if not exists titan_cordee_relay_turns_accepted_idx on private.titan_cordee_relay_turns (accepted_by);
alter table private.titan_cordee_relay_turns enable row level security;
revoke all on private.titan_cordee_relay_turns from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Eligibility, the effective holder and the effective offer (pure reads: a departure, a block or a suspension counts at once).
-- ---------------------------------------------------------------------------------------------
-- A member who may hold (and so receive) the relay: roped in, not the opener, not suspended, no block with the opener, and, when the relay
-- comes from a holder (p_from), no block with that holder either.
create or replace function private.titan_cordee_relay_can_take(p_challenge uuid, p_user uuid, p_opener uuid, p_from uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and p_user is distinct from p_opener
    and exists (select 1 from public.titan_challenge_members m where m.challenge_id = p_challenge and m.user_id = p_user and m.status = 'joined')
    and not exists (select 1 from public.profiles p where p.id = p_user and coalesce(p.is_suspended, false))
    and not exists (select 1 from public.titan_user_blocks k
                     where (p_opener is not null and ((k.blocker_id = p_user and k.blocked_id = p_opener) or (k.blocker_id = p_opener and k.blocked_id = p_user)))
                        or (p_from is not null and p_from <> p_user and ((k.blocker_id = p_user and k.blocked_id = p_from) or (k.blocker_id = p_from and k.blocked_id = p_user))));
$$;
revoke all on function private.titan_cordee_relay_can_take(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- The member who holds the relay now, or null: the hold is unexpired, the relay not yet received, the cordée running, the holder eligible.
create or replace function private.titan_cordee_relay_holder(p_challenge uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.holder_id
    from private.titan_cordee_relays r join public.titan_challenges c on c.id = r.challenge_id
   where r.challenge_id = p_challenge and r.confirmed_at is null and r.holder_id is not null and r.hold_until > now()
     and c.summited_at is null and now() <= c.ends_at
     and private.titan_cordee_relay_can_take(p_challenge, r.holder_id, r.opened_by, null);
$$;
revoke all on function private.titan_cordee_relay_holder(uuid) from public, anon, authenticated;

-- The pending handover that still stands: unexpired, offered by the current holder, to a member who may still take it (or to everyone).
create or replace function private.titan_cordee_relay_offer(p_challenge uuid)
returns setof private.titan_cordee_relay_turns
language sql
stable
security definer
set search_path = ''
as $$
  select t.* from private.titan_cordee_relay_turns t join private.titan_cordee_relays r on r.challenge_id = t.challenge_id
   where t.challenge_id = p_challenge and t.status = 'pending' and t.expires_at > now()
     and t.from_user is not distinct from private.titan_cordee_relay_holder(p_challenge) and t.from_user is not null
     and (t.to_user is null or private.titan_cordee_relay_can_take(p_challenge, t.to_user, r.opened_by, t.from_user))
   limit 1;
$$;
revoke all on function private.titan_cordee_relay_offer(uuid) from public, anon, authenticated;

-- Writes down what time, departures and blocks already decided (each read computes the same thing): expired offers end their author's
-- hold, void holds are cleared, offers that no longer stand are cancelled, everything pending closes with the relay or the cordée.
-- Locks the challenge row: every relay write on one cordée is serialised.
create or replace function private.titan_cordee_relay_tidy(p_challenge uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_c public.titan_challenges%rowtype;
  v_r private.titan_cordee_relays%rowtype;
  v_holder uuid;
  v_expired uuid;
begin
  select * into v_c from public.titan_challenges where id = p_challenge and kind = 'cordee' for update;
  if not found then return; end if;
  select * into v_r from private.titan_cordee_relays where challenge_id = p_challenge;
  if v_r.challenge_id is null then return; end if;
  if v_r.confirmed_at is not null or v_c.summited_at is not null or now() > v_c.ends_at then
    update private.titan_cordee_relay_turns set status = 'closed', resolved_at = now() where challenge_id = p_challenge and status = 'pending';
    if v_r.confirmed_at is null and v_r.holder_id is not null then
      update private.titan_cordee_relays set holder_id = null, held_at = null, hold_until = null where challenge_id = p_challenge;
    end if;
    return;
  end if;
  -- Never accepted: the offer expires and its author's hold ends with it, so the passage is open to every eligible member again.
  update private.titan_cordee_relay_turns set status = 'expired', resolved_at = expires_at
   where challenge_id = p_challenge and status = 'pending' and expires_at <= now()
  returning from_user into v_expired;
  if v_expired is not null and v_expired = v_r.holder_id then
    update private.titan_cordee_relays set holder_id = null, held_at = null, hold_until = null where challenge_id = p_challenge;
  end if;
  v_holder := private.titan_cordee_relay_holder(p_challenge);
  if v_holder is null then
    update private.titan_cordee_relays set holder_id = null, held_at = null, hold_until = null where challenge_id = p_challenge and holder_id is not null;
  end if;
  update private.titan_cordee_relay_turns t set status = 'cancelled', resolved_at = now()
   where t.challenge_id = p_challenge and t.status = 'pending'
     and (v_holder is null or t.from_user is distinct from v_holder
          or (t.to_user is not null and not private.titan_cordee_relay_can_take(p_challenge, t.to_user, v_r.opened_by, t.from_user)));
end;
$function$;
revoke all on function private.titan_cordee_relay_tidy(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. A departed member's acquired contribution: confirmed sessions recorded before the departure, in the cordée.
-- ---------------------------------------------------------------------------------------------
create or replace function private.titan_cordee_member_until(p_challenge uuid, p_user uuid, p_until timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select * from public.titan_challenges where id = p_challenge and kind = 'cordee'),
  s as (
    select x.day, x.effort_minutes, v.family
      from c, private.titan_confirmed_sessions(p_user, c.starts_at, least(coalesce(c.summited_at, c.ends_at), p_until), c.starts_at) x
      join public.training_logs l on l.id = x.log_id
      left join private.titan_live_sports ls on ls.sport = x.sport
      left join private.titan_live_voies v on v.voie = ls.voie
     where l.created_at < p_until
  ),
  d as (select day, least(90, sum(effort_minutes)) as minutes from s group by day)
  select jsonb_build_object(
    'pitches', coalesce((select sum(case when minutes >= 35 then 2 when minutes >= 12 then 1 else 0 end) from d), 0),
    'families', coalesce((select jsonb_agg(distinct s.family) from s join d on d.day = s.day
                           where s.family is not null and s.effort_minutes > 0 and d.minutes >= 12), '[]'::jsonb));
$$;
revoke all on function private.titan_cordee_member_until(uuid, uuid, timestamptz) from public, anon, authenticated;

-- The whole state as one viewer may see it (from 20261120110000), now with the acquired contribution of departed members (« kept »):
-- their longueurs count, their part of the target closes at what they brought, they count as contributors; never named, never listed.
create or replace function private.titan_cordee_state(p_challenge uuid, p_viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_c public.titan_challenges%rowtype;
  v_share integer; v_cap integer; v_joined integer; v_target integer;
  v_sum integer := 0; v_families jsonb := '[]'::jsonb; v_bonus integer; v_total integer; v_contributors integer := 0; v_pending integer;
  v_members jsonb := '[]'::jsonb; v_me jsonb := null; v_my_status text;
  v_kept integer := 0; v_kept_members integer := 0; v_kept_target integer := 0;
  r record; m jsonb; v_named boolean; v_counted integer;
begin
  select * into v_c from public.titan_challenges where id = p_challenge and kind = 'cordee';
  if not found then return null; end if;
  select status into v_my_status from public.titan_challenge_members where challenge_id = p_challenge and user_id = p_viewer;
  v_share := greatest(1, round(v_c.target))::integer;
  v_cap := ceil(v_share * 1.5)::integer;
  select count(*)::integer into v_joined from public.titan_challenge_members where challenge_id = p_challenge and status = 'joined';
  -- An invited friend who has not answered yet already counts in the target during the first 48 hours (the time to answer, in which no
  -- cordée summits): nobody summits alone while friends are on the way (declining lowers it at once). After that only joined members
  -- count, so a silent invitation never blocks the summit. A cordée formed alone, with no invitation, stays a solo climb.
  select count(*)::integer into v_pending from public.titan_challenge_members where challenge_id = p_challenge and status = 'invited'
     and now() < v_c.starts_at + interval '48 hours';
  for r in select mm.user_id, mm.status, p.username from public.titan_challenge_members mm left join public.profiles p on p.id = mm.user_id
            where mm.challenge_id = p_challenge and mm.status in ('joined', 'invited') order by mm.status, mm.joined_at nulls last, mm.user_id loop
    v_named := private.titan_member_named(p_viewer, r.user_id, p_challenge);
    if r.status = 'joined' then
      m := private.titan_cordee_member(p_challenge, r.user_id);
      v_counted := least(v_cap, (m->>'pitches')::integer);
      v_sum := v_sum + v_counted;
      if v_counted > 0 then v_contributors := v_contributors + 1; end if;
      select coalesce(jsonb_agg(distinct f), '[]'::jsonb) into v_families
        from (select jsonb_array_elements_text(v_families) as f union select jsonb_array_elements_text(m->'families')) u;
    else
      m := jsonb_build_object('pitches', 0, 'days', 0, 'families', '[]'::jsonb); v_counted := 0;
    end if;
    if r.user_id = p_viewer then
      v_me := jsonb_build_object('pitches', (m->>'pitches')::integer, 'counted', v_counted, 'days', (m->>'days')::integer,
        'families', m->'families', 'strand', v_counted >= v_share);
    end if;
    v_members := v_members || jsonb_build_array(case when v_named then jsonb_build_object(
        'id', r.user_id, 'name', coalesce(nullif(r.username, ''), 'Athlète'), 'status', r.status, 'me', r.user_id = p_viewer,
        'pitches', v_counted, 'strand', v_counted >= v_share, 'families', m->'families')
      -- Someone the viewer may not see (not a friend, not a link partner, or blocked): present, nothing personal.
      else jsonb_build_object('id', null, 'name', 'Membre de la cordée', 'status', r.status, 'me', false) end);
  end loop;
  -- V1.8.2: members who left (recorded departures only) keep what they brought before leaving; their part of the target is that much.
  for r in select mm.user_id, mm.left_at from public.titan_challenge_members mm
            where mm.challenge_id = p_challenge and mm.status = 'left' and mm.left_at is not null and mm.left_at > v_c.starts_at loop
    m := private.titan_cordee_member_until(p_challenge, r.user_id, r.left_at);
    v_counted := least(v_cap, (m->>'pitches')::integer);
    if v_counted > 0 then
      v_kept := v_kept + v_counted;
      v_kept_members := v_kept_members + 1;
      v_kept_target := v_kept_target + least(v_share, v_counted);
      v_sum := v_sum + v_counted;
      v_contributors := v_contributors + 1;
      select coalesce(jsonb_agg(distinct f), '[]'::jsonb) into v_families
        from (select jsonb_array_elements_text(v_families) as f union select jsonb_array_elements_text(m->'families')) u;
    end if;
  end loop;
  v_target := v_share * greatest(1, v_joined + v_pending) + v_kept_target;
  v_bonus := least(8, 2 * greatest(0, jsonb_array_length(v_families) - 1));
  v_total := v_sum + v_bonus;
  return jsonb_build_object(
    'id', v_c.id, 'title', v_c.title, 'route', v_c.route, 'pace', v_c.pace, 'startsAt', v_c.starts_at, 'endsAt', v_c.ends_at,
    'days', greatest(1, round(extract(epoch from (v_c.ends_at - v_c.starts_at)) / 86400))::integer,
    'status', case when v_c.summited_at is not null then 'summited' when now() > v_c.ends_at then 'ended' else 'active' end,
    'summitedAt', v_c.summited_at, 'mine', v_c.creator_id = p_viewer, 'myStatus', v_my_status,
    'share', v_share, 'cap', v_cap, 'target', v_target, 'longueurs', v_sum, 'variety', v_bonus, 'total', least(v_total, v_target),
    'pending', v_pending, 'contributors', v_contributors,
    -- With friends in it (joined, invited in the first 48 hours, or gone after bringing a longueur), two members must have brought one.
    'needs', least(2, v_joined + v_pending + v_kept_members),
    'kept', v_kept,
    'percent', least(100, floor(100.0 * v_total / greatest(1, v_target)))::integer,
    'camps', least(4, floor(4.0 * v_total / greatest(1, v_target)))::integer,
    'families', v_families, 'joined', v_joined, 'members', v_members, 'me', v_me,
    'title_key', 'cordee:' || v_c.route,
    'earned', v_c.summited_at is not null and exists (select 1 from private.titan_challenge_results x where x.challenge_id = v_c.id and x.user_id = p_viewer and x.reached));
end;
$function$;
revoke all on function private.titan_cordee_state(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. The relay as one viewer may see it (from 20261124090000), with the hold, the pending handover and the turn actions.
-- ---------------------------------------------------------------------------------------------
create or replace function private.titan_cordee_relay_state(p_challenge uuid, p_viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_c public.titan_challenges%rowtype;
  v_r private.titan_cordee_relays%rowtype;
  v_o private.titan_cordee_relay_turns%rowtype;
  v_my text;
  v_active boolean;
  v_status text;
  v_can text := null;
  v_hint text;
  v_has boolean;
  v_flag boolean;
  v_reprise boolean;
  v_holder uuid;
  v_for_me boolean := false;
  v_turn jsonb := '[]'::jsonb;
  v_handover jsonb := null;
  v_choices jsonb := null;
  v_others integer;
begin
  select * into v_c from public.titan_challenges where id = p_challenge and kind = 'cordee';
  if not found or v_c.route <> 'aube' then return null; end if;
  select * into v_r from private.titan_cordee_relays where challenge_id = p_challenge;
  v_flag := private.titan_flag_on('screens.cordee_relay');
  -- Closed flag: a relay already played stays readable, an unplayed one is not shown.
  if v_r.challenge_id is null and not v_flag then return null; end if;
  v_reprise := private.titan_flag_on('screens.cordee_reprise');
  select status into v_my from public.titan_challenge_members where challenge_id = p_challenge and user_id = p_viewer;
  v_active := v_c.summited_at is null and now() <= v_c.ends_at;
  v_status := case when v_r.confirmed_at is not null then 'confirmed' when v_r.challenge_id is not null then 'opened' else 'waiting' end;
  if v_status = 'opened' and v_active then
    v_holder := private.titan_cordee_relay_holder(p_challenge);
    select * into v_o from private.titan_cordee_relay_offer(p_challenge);
    if v_o.id is not null and p_viewer is distinct from v_o.from_user and v_my = 'joined'
       and (v_o.to_user is null or v_o.to_user = p_viewer)
       and private.titan_cordee_relay_can_take(p_challenge, p_viewer, v_r.opened_by, v_o.from_user) then
      v_for_me := true;
    end if;
  end if;
  if v_status = 'confirmed' then
    v_hint := 'done';
  elsif not v_active then
    v_hint := 'closed';
  elsif v_my is distinct from 'joined' then
    v_hint := 'join';
  elsif v_status = 'waiting' then
    v_has := exists (select 1 from private.titan_cordee_relay_session(p_challenge, p_viewer, null, null));
    v_hint := case when v_has then 'transmit' else 'session' end;
    if v_has and v_flag then v_can := 'transmit'; end if;
  elsif v_r.opened_by = p_viewer then
    -- The group became too small to pass the relay: nobody else is roped in (eligibility is not disclosed, only presence).
    select count(*)::integer into v_others from public.titan_challenge_members m
     where m.challenge_id = p_challenge and m.status = 'joined' and m.user_id <> p_viewer;
    v_hint := case when v_others = 0 then 'alone' else 'own' end;
  elsif v_holder is not null and v_holder <> p_viewer then
    v_hint := case when v_for_me then 'offered' else 'held' end;
  else
    v_has := exists (select 1 from private.titan_cordee_relay_session(p_challenge, p_viewer, v_r.opened_day, v_r.opened_at));
    if v_holder = p_viewer then
      v_hint := case when v_o.id is not null then 'paused' when v_has then 'holder' else 'holder_session' end;
    else
      v_hint := case when v_has then 'confirm' else 'other_day' end;
    end if;
    if v_has and v_flag and (v_holder is null or v_holder = p_viewer)
       and private.titan_cordee_relay_can_take(p_challenge, p_viewer, v_r.opened_by, null) then
      v_can := 'confirm';
    end if;
  end if;
  -- The optional turn actions: take a free relay, hand it over, withdraw one's offer, accept an offer. Nothing else is ever prompted.
  if v_status = 'opened' and v_active and v_my = 'joined' then
    if v_holder = p_viewer and v_o.id is not null and v_o.from_user = p_viewer then
      v_turn := '["withdraw"]'::jsonb;
    elsif v_reprise and v_for_me then
      v_turn := '["accept"]'::jsonb;
    elsif v_reprise and v_holder = p_viewer then
      v_turn := '["handover"]'::jsonb;
      select coalesce(jsonb_agg(jsonb_build_object('id', m.user_id, 'name', coalesce(nullif(p.username, ''), 'Athlète'))
                                order by lower(coalesce(p.username, '')), m.user_id), '[]'::jsonb)
        into v_choices
        from public.titan_challenge_members m left join public.profiles p on p.id = m.user_id
       where m.challenge_id = p_challenge and m.status = 'joined' and m.user_id <> p_viewer
         and private.titan_cordee_relay_can_take(p_challenge, m.user_id, v_r.opened_by, p_viewer)
         and private.titan_member_named(p_viewer, m.user_id, p_challenge);
    elsif v_reprise and v_holder is null and private.titan_cordee_relay_can_take(p_challenge, p_viewer, v_r.opened_by, null) then
      v_turn := '["take"]'::jsonb;
    end if;
  end if;
  -- A pending handover: everyone roped in sees that it is pending; whom it is offered to only its author and its recipient. No reason.
  if v_o.id is not null and v_my = 'joined' then
    v_handover := jsonb_build_object('pending', true, 'mine', v_o.from_user = p_viewer, 'forMe', v_for_me,
      'open', case when v_o.from_user = p_viewer or v_for_me then v_o.to_user is null end,
      'to', case when v_o.from_user = p_viewer and v_o.to_user is not null then private.titan_cordee_relay_person(p_challenge, p_viewer, v_o.to_user, null) end,
      'expiresAt', v_o.expires_at);
  end if;
  return jsonb_build_object(
    'step', 'sentinelle', 'status', v_status, 'active', v_active, 'can', v_can, 'hint', v_hint,
    'opener', case when v_r.challenge_id is null then null else private.titan_cordee_relay_person(p_challenge, p_viewer, v_r.opened_by, v_r.opened_family) end,
    'receiver', case when v_r.confirmed_at is null then null else private.titan_cordee_relay_person(p_challenge, p_viewer, v_r.confirmed_by, v_r.confirmed_family) end,
    'holder', case when v_holder is null then null else private.titan_cordee_relay_person(p_challenge, p_viewer, v_holder, null) end,
    'holdUntil', case when v_holder is null then null else (select r.hold_until from private.titan_cordee_relays r where r.challenge_id = p_challenge) end,
    'handover', v_handover, 'turn', v_turn, 'choices', v_choices);
end;
$function$;

-- A person of the relay under the Cordée naming rule (from 20261124090000), now only while still roped in: a member who left is no
-- longer named to anyone (the departure cuts what the others see of them), except to themselves.
create or replace function private.titan_cordee_relay_person(p_challenge uuid, p_viewer uuid, p_member uuid, p_family text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_member is not null and private.titan_member_named(p_viewer, p_member, p_challenge)
                   and (p_member = p_viewer or exists (select 1 from public.titan_challenge_members m
                                                        where m.challenge_id = p_challenge and m.user_id = p_member and m.status = 'joined'))
    then jsonb_build_object('name', coalesce(nullif((select p.username from public.profiles p where p.id = p_member), ''), 'Athlète'),
                            'me', p_member = p_viewer, 'family', p_family)
    else jsonb_build_object('name', 'Membre de la cordée', 'me', false, 'family', null) end;
$$;
revoke all on function private.titan_cordee_relay_person(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.titan_cordee_relay_state(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Transmit or confirm (from 20261124090000): a held relay is confirmed by its holder only; pending offers close with it.
-- ---------------------------------------------------------------------------------------------
create or replace function public.titan_cordee_relay_v1(p_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '8s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_c public.titan_challenges%rowtype;
  v_r private.titan_cordee_relays%rowtype;
  v_s record;
  v_holder uuid;
  v_changed boolean := false;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = v_uid and coalesce(is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  if not private.titan_flag_on('screens.cordee_relay') then raise exception 'FEATURE_DISABLED' using errcode = '42501'; end if;
  if p_id is null or p_action is null or p_action not in ('transmit', 'confirm') then raise exception 'RELAY_INVALID' using errcode = '22023'; end if;
  -- Only a joined member reaches the cordée at all (an invitee, a former member or a stranger reads « not found »).
  if not exists (select 1 from public.titan_challenge_members m join public.titan_challenges c on c.id = m.challenge_id
                  where m.challenge_id = p_id and m.user_id = v_uid and m.status = 'joined' and c.kind = 'cordee') then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.titan_cordee_settle(p_id);
  -- The row lock serialises every relay action on this cordée (and its summit): one opener, one receiver, one holder.
  select * into v_c from public.titan_challenges where id = p_id for update;
  if v_c.route <> 'aube' then raise exception 'RELAY_NOT_ON_ROUTE' using errcode = '22023'; end if;
  perform private.titan_cordee_relay_tidy(p_id);
  select * into v_r from private.titan_cordee_relays where challenge_id = p_id;
  if p_action = 'transmit' then
    if v_r.challenge_id is not null then
      if v_r.opened_by is distinct from v_uid then raise exception 'RELAY_ALREADY_OPEN' using errcode = '22023'; end if;
    else
      if v_c.summited_at is not null or now() > v_c.ends_at then raise exception 'CHALLENGE_ENDED' using errcode = '22023'; end if;
      select * into v_s from private.titan_cordee_relay_session(p_id, v_uid, null, null);
      if v_s.log_id is null then raise exception 'RELAY_NO_SESSION' using errcode = '22023'; end if;
      insert into private.titan_cordee_relays (challenge_id, opened_by, opened_log, opened_day, opened_family)
      values (p_id, v_uid, v_s.log_id, v_s.day, v_s.family) on conflict (challenge_id) do nothing;
      v_changed := found;
    end if;
  else
    if v_r.challenge_id is null then raise exception 'RELAY_NOT_OPEN' using errcode = '22023'; end if;
    if v_r.confirmed_at is not null then
      if v_r.confirmed_by is distinct from v_uid then raise exception 'RELAY_ALREADY_CONFIRMED' using errcode = '22023'; end if;
    else
      -- The first member alone can never pass and receive the same relay.
      if v_r.opened_by = v_uid then raise exception 'RELAY_OWN' using errcode = '22023'; end if;
      if v_c.summited_at is not null or now() > v_c.ends_at then raise exception 'CHALLENGE_ENDED' using errcode = '22023'; end if;
      if v_r.opened_by is not null and exists (select 1 from public.titan_user_blocks k
           where (k.blocker_id = v_uid and k.blocked_id = v_r.opened_by) or (k.blocker_id = v_r.opened_by and k.blocked_id = v_uid)) then
        raise exception 'RELAY_UNAVAILABLE' using errcode = '22023';
      end if;
      -- V1.8.2: a held relay is received by its holder only.
      v_holder := private.titan_cordee_relay_holder(p_id);
      if v_holder is not null and v_holder <> v_uid then raise exception 'RELAY_HELD' using errcode = '22023'; end if;
      select * into v_s from private.titan_cordee_relay_session(p_id, v_uid, v_r.opened_day, v_r.opened_at);
      if v_s.log_id is null then
        if exists (select 1 from private.titan_cordee_relay_session(p_id, v_uid, null, v_r.opened_at)) then
          raise exception 'RELAY_OTHER_DAY' using errcode = '22023';
        end if;
        raise exception 'RELAY_NO_SESSION' using errcode = '22023';
      end if;
      update private.titan_cordee_relays
         set confirmed_by = v_uid, confirmed_log = v_s.log_id, confirmed_day = v_s.day, confirmed_family = v_s.family, confirmed_at = now()
       where challenge_id = p_id and confirmed_at is null;
      v_changed := found;
      update private.titan_cordee_relay_turns set status = 'closed', resolved_at = now() where challenge_id = p_id and status = 'pending';
    end if;
  end if;
  return private.titan_cordee_relay_state(p_id, v_uid) || jsonb_build_object('changed', v_changed);
end;
$function$;
revoke all on function public.titan_cordee_relay_v1(uuid, text) from public, anon;
grant execute on function public.titan_cordee_relay_v1(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. Take, hand over, withdraw, accept. The server decides who may hold the relay and keeps one holder.
-- ---------------------------------------------------------------------------------------------
create or replace function public.titan_cordee_relay_turn_v1(p_id uuid, p_action text, p_to uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '8s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_c public.titan_challenges%rowtype;
  v_r private.titan_cordee_relays%rowtype;
  v_o private.titan_cordee_relay_turns%rowtype;
  v_last private.titan_cordee_relay_turns%rowtype;
  v_holder uuid;
  v_changed boolean := false;
  v_until timestamptz;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = v_uid and coalesce(is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  if p_id is null or p_action is null or p_action not in ('take', 'handover', 'withdraw', 'accept') then raise exception 'RELAY_INVALID' using errcode = '22023'; end if;
  -- Withdrawing one's own offer always works; the rest opens with the flag.
  if p_action <> 'withdraw' and not private.titan_flag_on('screens.cordee_reprise') then raise exception 'FEATURE_DISABLED' using errcode = '42501'; end if;
  if not exists (select 1 from public.titan_challenge_members m join public.titan_challenges c on c.id = m.challenge_id
                  where m.challenge_id = p_id and m.user_id = v_uid and m.status = 'joined' and c.kind = 'cordee') then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.titan_cordee_settle(p_id);
  select * into v_c from public.titan_challenges where id = p_id for update;
  if v_c.route <> 'aube' then raise exception 'RELAY_NOT_ON_ROUTE' using errcode = '22023'; end if;
  perform private.titan_cordee_relay_tidy(p_id);
  select * into v_r from private.titan_cordee_relays where challenge_id = p_id;
  if v_r.challenge_id is null then raise exception 'RELAY_NOT_OPEN' using errcode = '22023'; end if;
  if v_r.confirmed_at is not null then raise exception 'RELAY_ALREADY_CONFIRMED' using errcode = '22023'; end if;
  if v_c.summited_at is not null or now() > v_c.ends_at then raise exception 'CHALLENGE_ENDED' using errcode = '22023'; end if;
  v_holder := private.titan_cordee_relay_holder(p_id);
  select * into v_o from private.titan_cordee_relay_offer(p_id);
  v_until := least(v_c.ends_at, now() + interval '72 hours');

  if p_action = 'take' then
    if v_r.opened_by = v_uid then raise exception 'RELAY_OWN' using errcode = '22023'; end if;
    if v_holder = v_uid then
      null; -- already mine: nothing changes
    elsif v_holder is not null then
      raise exception 'RELAY_HELD' using errcode = '22023';
    elsif not private.titan_cordee_relay_can_take(p_id, v_uid, v_r.opened_by, null) then
      raise exception 'RELAY_UNAVAILABLE' using errcode = '22023';
    else
      if (select count(*) from private.titan_cordee_relay_turns t where t.challenge_id = p_id) >= 8 then raise exception 'RELAY_TURN_LIMIT' using errcode = '22023'; end if;
      update private.titan_cordee_relays set holder_id = v_uid, held_at = now(), hold_until = v_until where challenge_id = p_id;
      insert into private.titan_cordee_relay_turns (challenge_id, kind, from_user, to_user, status, accepted_by, resolved_at)
      values (p_id, 'take', null, v_uid, 'held', v_uid, now());
      v_changed := true;
    end if;

  elsif p_action = 'handover' then
    if v_holder is distinct from v_uid then raise exception 'RELAY_NOT_HOLDER' using errcode = '22023'; end if;
    if v_o.id is not null then
      if v_o.to_user is not distinct from p_to then
        null; -- the same offer again: nothing changes
      else
        raise exception 'RELAY_HANDOVER_PENDING' using errcode = '22023';
      end if;
    else
      if p_to is not null then
        -- Only a member the holder can see and who may take the relay; why another one cannot is never disclosed.
        if p_to = v_uid or not private.titan_cordee_relay_can_take(p_id, p_to, v_r.opened_by, v_uid)
           or not private.titan_member_named(v_uid, p_to, p_id) then
          raise exception 'RELAY_HANDOVER_TARGET' using errcode = '22023';
        end if;
      elsif not exists (select 1 from public.titan_challenge_members m where m.challenge_id = p_id and m.status = 'joined'
                          and m.user_id <> v_uid and m.user_id is distinct from v_r.opened_by) then
        raise exception 'RELAY_GROUP_TOO_SMALL' using errcode = '22023';
      end if;
      if (select count(*) from private.titan_cordee_relay_turns t where t.challenge_id = p_id) >= 8 then raise exception 'RELAY_TURN_LIMIT' using errcode = '22023'; end if;
      insert into private.titan_cordee_relay_turns (challenge_id, kind, from_user, to_user, status, expires_at)
      values (p_id, 'handover', v_uid, p_to, 'pending', least(v_c.ends_at, now() + interval '48 hours'))
      returning * into v_o;
      -- The relay stays reserved for the handover while it is offered.
      update private.titan_cordee_relays set hold_until = greatest(hold_until, v_o.expires_at) where challenge_id = p_id;
      v_changed := true;
    end if;

  elsif p_action = 'withdraw' then
    if v_o.id is not null and v_o.from_user = v_uid then
      update private.titan_cordee_relay_turns set status = 'withdrawn', resolved_at = now() where id = v_o.id;
      v_changed := true;
    elsif v_holder is distinct from v_uid then
      raise exception 'RELAY_NO_HANDOVER' using errcode = '22023';
    end if;

  else -- accept
    if v_o.id is null then
      -- Two simultaneous acceptances: the second one waited for the lock and finds the offer already taken.
      select * into v_last from private.titan_cordee_relay_turns t where t.challenge_id = p_id and t.kind = 'handover'
       order by t.created_at desc limit 1;
      if v_last.status = 'accepted' and v_last.accepted_by = v_uid and v_holder = v_uid then
        null; -- already accepted by me: nothing changes
      elsif v_last.status = 'accepted' and v_last.resolved_at > now() - interval '1 hour' then
        raise exception 'RELAY_HANDOVER_TAKEN' using errcode = '22023';
      else
        raise exception 'RELAY_NO_HANDOVER' using errcode = '22023';
      end if;
    else
      if v_o.from_user = v_uid then raise exception 'RELAY_HANDOVER_SELF' using errcode = '22023'; end if;
      if v_o.to_user is not null and v_o.to_user <> v_uid then raise exception 'RELAY_NO_HANDOVER' using errcode = '22023'; end if;
      if v_r.opened_by = v_uid then raise exception 'RELAY_OWN' using errcode = '22023'; end if;
      if not private.titan_cordee_relay_can_take(p_id, v_uid, v_r.opened_by, v_o.from_user) then raise exception 'RELAY_UNAVAILABLE' using errcode = '22023'; end if;
      update private.titan_cordee_relay_turns set status = 'accepted', accepted_by = v_uid, resolved_at = now() where id = v_o.id and status = 'pending';
      update private.titan_cordee_relays set holder_id = v_uid, held_at = now(), hold_until = v_until where challenge_id = p_id;
      v_changed := true;
    end if;
  end if;
  return private.titan_cordee_relay_state(p_id, v_uid) || jsonb_build_object('changed', v_changed);
end;
$function$;
revoke all on function public.titan_cordee_relay_turn_v1(uuid, text, uuid) from public, anon;
grant execute on function public.titan_cordee_relay_turn_v1(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 8. My cordées (from 20261124090000): each relay is tidied after the settlement, before it is read.
-- ---------------------------------------------------------------------------------------------
create or replace function public.titan_cordees_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '8s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  for v_id in select c.id from public.titan_challenges c join public.titan_challenge_members m on m.challenge_id = c.id and m.user_id = v_uid
               where c.kind = 'cordee' and c.summited_at is null and m.status in ('joined', 'invited') and c.ends_at > now() - interval '14 days' loop
    perform private.titan_cordee_settle(v_id);
    if exists (select 1 from private.titan_cordee_relays r where r.challenge_id = v_id) then perform private.titan_cordee_relay_tidy(v_id); end if;
  end loop;
  return jsonb_build_object(
    'cordees', coalesce((
      select jsonb_agg(private.titan_cordee_state(c.id, v_uid) || jsonb_build_object('relay', private.titan_cordee_relay_state(c.id, v_uid))
                       order by (c.summited_at is null and c.ends_at > now()) desc, c.ends_at desc)
        from public.titan_challenges c join public.titan_challenge_members m on m.challenge_id = c.id and m.user_id = v_uid
       where c.kind = 'cordee' and m.status in ('joined', 'invited') and c.ends_at > now() - interval '14 days'), '[]'::jsonb),
    'titles', coalesce((select jsonb_agg(t.route order by t.route) from private.titan_cordee_titles t where t.user_id = v_uid), '[]'::jsonb));
end;
$function$;
revoke all on function public.titan_cordees_v1() from public, anon;
grant execute on function public.titan_cordees_v1() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 9. The account export (cumulative): one's own holds, offers and acceptances, without the other member.
-- ---------------------------------------------------------------------------------------------
create or replace function private.titan_social_export_v1(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'friendInvites', coalesce((select jsonb_agg(jsonb_build_object('created_at', i.created_at, 'expires_at', i.expires_at, 'revoked_at', i.revoked_at,
                       'used_at', i.used_at) order by i.created_at) from private.titan_friend_invites i where i.created_by = p_uid), '[]'::jsonb),
    'cordeeTitles', coalesce((select jsonb_agg(jsonb_build_object('route', t.route, 'challenge_id', t.challenge_id, 'earned_at', t.earned_at)
                       order by t.earned_at, t.route) from private.titan_cordee_titles t where t.user_id = p_uid), '[]'::jsonb),
    'cordeeRelays', coalesce((select jsonb_agg(x.j order by x.at) from (
        select r.opened_at as at, jsonb_build_object('challenge_id', r.challenge_id, 'step', r.step, 'action', 'transmit', 'at', r.opened_at,
               'log_id', r.opened_log, 'day', r.opened_day) as j from private.titan_cordee_relays r where r.opened_by = p_uid
        union all
        select r.confirmed_at, jsonb_build_object('challenge_id', r.challenge_id, 'step', r.step, 'action', 'confirm', 'at', r.confirmed_at,
               'log_id', r.confirmed_log, 'day', r.confirmed_day) from private.titan_cordee_relays r where r.confirmed_by = p_uid) x), '[]'::jsonb),
    'cordeeRelayTurns', coalesce((select jsonb_agg(jsonb_build_object('challenge_id', t.challenge_id, 'kind', t.kind,
        'role', case when t.kind = 'take' then 'took' when t.from_user = p_uid then 'offered' when t.accepted_by = p_uid then 'accepted' else 'offered_to_me' end,
        'open', case when t.kind = 'handover' then t.to_user is null end, 'status', t.status, 'at', t.created_at, 'expires_at', t.expires_at,
        'resolved_at', t.resolved_at) order by t.created_at)
      from private.titan_cordee_relay_turns t where t.from_user = p_uid or t.to_user = p_uid or t.accepted_by = p_uid), '[]'::jsonb));
$$;
revoke all on function private.titan_social_export_v1(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 10. The measure: groups at a standstill that resume after a handover, departures with acquired longueurs. Counts only.
-- ---------------------------------------------------------------------------------------------
create or replace function private.titan_cordee_reprise_measure(p_since timestamptz default now() - interval '28 days')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select c.id from public.titan_challenges c where c.kind = 'cordee' and c.route = 'aube' and c.starts_at >= p_since),
  t as (select t.* from private.titan_cordee_relay_turns t join c on c.id = t.challenge_id),
  l as (select m.challenge_id, m.user_id, m.left_at from public.titan_challenge_members m join c on c.id = m.challenge_id
         where m.status = 'left' and m.left_at is not null)
  select jsonb_build_object('since', p_since,
    'takes', (select count(*) from t where t.kind = 'take'),
    'offers', (select count(*) from t where t.kind = 'handover'),
    'accepted', (select count(*) from t where t.kind = 'handover' and t.status = 'accepted'),
    'expired', (select count(*) from t where t.kind = 'handover' and t.status = 'expired'),
    'resumed', (select count(distinct r.challenge_id) from private.titan_cordee_relays r join t on t.challenge_id = r.challenge_id
                 where t.kind = 'handover' and t.status = 'accepted' and r.confirmed_by = t.accepted_by and r.confirmed_at >= t.resolved_at),
    'departures', (select count(*) from l),
    'departuresKept', (select count(*) from l where (private.titan_cordee_member_until(l.challenge_id, l.user_id, l.left_at)->>'pitches')::integer > 0));
$$;
revoke all on function private.titan_cordee_reprise_measure(timestamptz) from public, anon, authenticated;
grant execute on function private.titan_cordee_reprise_measure(timestamptz) to service_role;

notify pgrst, 'reload schema';
