-- Social excellence, lot B — duos, challenges and clubs (mission « Opération Connexion », 20 November 2026). Applies after 20261120090000.
-- What the audit of the group features found, and what this file changes:
--   1. CONFIRMED SESSIONS ONLY. private.titan_effort_days feeds every collective count (TITAN Duo, friends' challenges, expeditions and their
--      titles, guild week and chronicle, common quest, seasons, world goal, factions, the « semaine tenue » that grants 50 cosmetic credits,
--      time capsules, life chapters). Its callers' comments promise that held sessions are excluded, but it never looked at the risk review:
--      a session whose reward is HELD (or was CANCELLED) by private.titan_reward_holds still counted, and so did a row that the server never
--      stamped. It now keeps exactly the sessions the periodic quests already trust (private.titan_eligible_sessions): status valid, not
--      suspicious, not archived, not history, details.serverReward = true, no held or cancelled reward. A held session starts counting the
--      moment its reward is released. Signature and return shape are unchanged.
--   2. A finished challenge named every participant to every other one (titan_challenge_result_v1), including strangers who joined an open
--      link and people one has blocked, while the live board already hid them. The result now names a participant to themselves, to their
--      accepted unblocked friends and to the other player of a link they shared, like the board; the others are « Participant ».
--   3. TITAN Duo forgot its outcome: when the 14 days ended, the pairing was closed silently and nothing told the two friends whether they
--      had reached their goal together. A pairing that reaches its end is now FROZEN once (each side's active days, the total, reached or
--      not) and titan_buddy_v1 returns the last result for 14 days (« last »), with the partner named only while they are still friends,
--      so the pair can celebrate and start again. A pairing ended early by either side or by a block is not frozen.
--   4. Clubs had no common goal. An administrator may set a weekly effort goal; every member reads the club's total of the week, the goal
--      and how many members were active — never a name or a share, as for the rest of the club space. The total and the active count are
--      given only from 3 members (the threshold of the club season trophies): in a club of two, the total minus one's own minutes would be
--      the other member's week. A smaller club reads the goal with null totals.
--   5. The risk review at recording (private.titan_session_risk, 20261020000000) ran only when the session earned XP or credits: a
--      session recorded past the daily or weekly cap was never scored, so an implausible one (100 km run in an hour) got no hold and
--      counted in every collective goal of point 1. titan_submit_training_session now scores every non-historical session and holds a
--      « review » one even with 0 XP and 0 credit (the hold table accepts zero amounts; release, exclusion and restoration credit 0).
--      Same body as 20261020000000 otherwise: same signature, columns and grants.
-- Nothing here grants XP or credits. Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: re-apply private.titan_effort_days from 20261005200000, titan_submit_training_session from 20261020000000 (create or replace,
-- same signature), titan_challenge_result_v1 from 20261029160000, titan_buddy_v1,
-- titan_buddy_invite_v1 from 20261029130000; drop functions public.titan_club_week_v1(uuid), public.titan_club_goal_set_v1(uuid, integer),
-- private.titan_buddy_close(uuid), private.titan_member_named(uuid, uuid, uuid); drop columns final_inviter_days, final_invitee_days, reached
-- of private.titan_buddies and weekly_goal of private.titan_clubs.

-- ---------------------------------------------------------------------------------------------
-- 1. Confirmed sessions only.
-- ---------------------------------------------------------------------------------------------
create or replace function private.titan_effort_days(p_user uuid, p_from timestamptz, p_to timestamptz, p_created_after timestamptz, p_cap numeric default 90)
returns table (day date, minutes numeric, sessions integer, distance_km numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select (l.date at time zone 'Europe/Paris')::date as day,
         least(p_cap, sum(coalesce(public.titan_numeric_from_json(l.details -> 'effort', 'effort_minutes'), 0))) as minutes,
         least(2, count(*))::integer as sessions,
         sum(case when l.unit = 'km' then least(l.val, 300) else 0 end) as distance_km
  from public.training_logs l
  where l.user_id = p_user
    and l.archived_at is null
    and l.is_suspicious is not true
    and coalesce(l.status, 'valid') = 'valid'
    and l.details ->> 'serverReward' = 'true'
    and coalesce(l.details ->> 'historical', 'false') <> 'true'
    and not exists (select 1 from private.titan_reward_holds h where h.log_id = l.id and h.status in ('held', 'cancelled'))
    and l.date >= p_from and l.date < p_to and l.date <= now()
    and l.created_at >= p_created_after
  group by 1;
$$;
revoke all on function private.titan_effort_days(uuid, timestamptz, timestamptz, timestamptz, numeric) from public, anon, authenticated;

-- The challenge distance count follows the same rule.
create or replace function private.titan_challenge_progress(p_challenge uuid, p_user uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select * from public.titan_challenges where id = p_challenge),
  d as (
    select e.* from c, private.titan_effort_days(p_user, c.starts_at, c.ends_at, c.starts_at, 90) e
  ),
  dist as (
    select coalesce(sum(least(l.val, 300)), 0) as km
    from c join public.training_logs l on l.user_id = p_user and l.sport = c.sport and l.unit = 'km'
    where l.archived_at is null and l.is_suspicious is not true
      and coalesce(l.status, 'valid') = 'valid' and l.details ->> 'serverReward' = 'true'
      and coalesce(l.details ->> 'historical', 'false') <> 'true'
      and not exists (select 1 from private.titan_reward_holds h where h.log_id = l.id and h.status in ('held', 'cancelled'))
      and l.date >= c.starts_at and l.date < c.ends_at and l.date <= now() and l.created_at >= c.starts_at
  )
  select round(case c.metric
    when 'effort_minutes' then coalesce((select sum(minutes) from d), 0)
    when 'active_days' then coalesce((select count(*) from d), 0)
    when 'sessions' then coalesce((select sum(sessions) from d), 0)
    else (select km from dist) end, 1)
  from c;
$$;
revoke all on function private.titan_challenge_progress(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Who may be named to whom in a challenge (the rule of the live board, shared by the result).
-- ---------------------------------------------------------------------------------------------
create or replace function private.titan_member_named(p_viewer uuid, p_member uuid, p_challenge uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_member = p_viewer or private.titan_are_friends(p_viewer, p_member) or (
    exists (select 1 from private.titan_challenge_invites i
             where i.challenge_id = p_challenge and i.used_at is not null
               and ((i.created_by = p_viewer and i.used_by = p_member) or (i.created_by = p_member and i.used_by = p_viewer)))
    and not exists (select 1 from public.titan_user_blocks k
                     where (k.blocker_id = p_viewer and k.blocked_id = p_member) or (k.blocker_id = p_member and k.blocked_id = p_viewer)));
$$;
revoke all on function private.titan_member_named(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.titan_challenge_result_v1(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '15s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_c public.titan_challenges%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_c from public.titan_challenges where id = p_id;
  if not found or not exists (select 1 from public.titan_challenge_members m where m.challenge_id = p_id and m.user_id = v_uid and m.status = 'joined') then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_c.ends_at > now() then raise exception 'CHALLENGE_RUNNING' using errcode = '22023'; end if;
  insert into private.titan_challenge_results (challenge_id, user_id, final_progress, reached)
  select p_id, m.user_id, private.titan_challenge_progress(p_id, m.user_id), private.titan_challenge_progress(p_id, m.user_id) >= v_c.target
    from public.titan_challenge_members m where m.challenge_id = p_id and m.status = 'joined'
  on conflict do nothing;
  return jsonb_build_object('title', v_c.title, 'metric', v_c.metric, 'target', v_c.target, 'endedAt', v_c.ends_at, 'results', coalesce((
    select jsonb_agg(jsonb_build_object(
        'name', case when x.named then coalesce(p.username, 'Athlète') else 'Participant' end,
        'progress', r.final_progress, 'reached', r.reached, 'me', r.user_id = v_uid)
      order by r.final_progress desc, case when x.named then p.username end)
      from private.titan_challenge_results r left join public.profiles p on p.id = r.user_id
      cross join lateral (select private.titan_member_named(v_uid, r.user_id, p_id) as named) x
     where r.challenge_id = p_id), '[]'::jsonb));
end;
$function$;
revoke all on function public.titan_challenge_result_v1(uuid) from public, anon;
grant execute on function public.titan_challenge_result_v1(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. TITAN Duo keeps its outcome.
-- ---------------------------------------------------------------------------------------------
alter table private.titan_buddies add column if not exists final_inviter_days smallint;
alter table private.titan_buddies add column if not exists final_invitee_days smallint;
alter table private.titan_buddies add column if not exists reached boolean;

-- Closes a lapsed pairing. Only a pairing that reached the end of its 14 days is frozen with its result; one stopped by a lapse of the
-- friendship, a block or a suspension is closed without reading the other side again.
create or replace function private.titan_buddy_close(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_b private.titan_buddies%rowtype;
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_a integer; v_i integer;
begin
  select * into v_b from private.titan_buddies where id = p_id and status in ('pending', 'active') for update;
  if not found then return; end if;
  if v_b.status = 'active' and v_b.ends_on < v_today and private.titan_are_friends(v_b.inviter_id, v_b.invitee_id) then
    v_a := private.titan_buddy_days(v_b.inviter_id, v_b.starts_on, v_b.ends_on, v_b.accepted_at);
    v_i := private.titan_buddy_days(v_b.invitee_id, v_b.starts_on, v_b.ends_on, v_b.accepted_at);
    update private.titan_buddies set status = 'ended', ended_at = coalesce(ended_at, now()),
      final_inviter_days = v_a, final_invitee_days = v_i, reached = (v_a + v_i) >= target_days
     where id = p_id;
  else
    update private.titan_buddies set status = 'ended', ended_at = coalesce(ended_at, now()) where id = p_id;
  end if;
end;
$function$;
revoke all on function private.titan_buddy_close(uuid) from public, anon, authenticated;

create or replace function private.titan_buddy_last(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select (select jsonb_build_object('id', b.id, 'endsOn', b.ends_on, 'target', b.target_days, 'reached', b.reached,
            'myDays', case when b.inviter_id = p_uid then b.final_inviter_days else b.final_invitee_days end,
            'together', b.final_inviter_days + b.final_invitee_days,
            'partner', case when private.titan_are_friends(b.inviter_id, b.invitee_id)
              then jsonb_build_object('id', case when b.inviter_id = p_uid then b.invitee_id else b.inviter_id end,
                     'name', coalesce((select p.username from public.profiles p where p.id = case when b.inviter_id = p_uid then b.invitee_id else b.inviter_id end), 'Ami'))
              else null end)
     from private.titan_buddies b
    where p_uid in (b.inviter_id, b.invitee_id) and b.status = 'ended' and b.reached is not null
      and b.ends_on >= (now() at time zone 'Europe/Paris')::date - 14
    order by b.ends_on desc limit 1);
$function$;
revoke all on function private.titan_buddy_last(uuid) from public, anon, authenticated;

create or replace function public.titan_buddy_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_b private.titan_buddies%rowtype;
  v_partner uuid;
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_mine integer := 0;
  v_theirs integer := 0;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_b from private.titan_buddies b where (b.inviter_id = v_uid or b.invitee_id = v_uid) and b.status in ('pending', 'active') limit 1;
  if found and not private.titan_buddy_live(v_b.id) then
    -- The relationship has lapsed (period over, friendship gone, a block, a suspension): it ends here; a completed period is frozen.
    perform private.titan_buddy_close(v_b.id);
    v_b := null;
  end if;
  if v_b.id is null then
    return jsonb_build_object('status', 'none', 'last', private.titan_buddy_last(v_uid), 'friends', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.username, 'Ami')) order by p.username)
        from public.friendships f join public.profiles p on p.id = case when f.user_id_1 = v_uid then f.user_id_2 else f.user_id_1 end
       where (f.user_id_1 = v_uid or f.user_id_2 = v_uid) and coalesce(f.status, 'accepted') = 'accepted' and not coalesce(p.is_suspended, false)
         and private.titan_are_friends(v_uid, p.id)
         and not exists (select 1 from private.titan_buddies x where x.status in ('pending', 'active') and p.id in (x.inviter_id, x.invitee_id))), '[]'::jsonb));
  end if;
  v_partner := case when v_b.inviter_id = v_uid then v_b.invitee_id else v_b.inviter_id end;
  if v_b.status = 'pending' then
    return jsonb_build_object('status', 'pending', 'id', v_b.id, 'role', case when v_b.inviter_id = v_uid then 'inviter' else 'invitee' end,
      'partner', jsonb_build_object('id', v_partner, 'name', coalesce((select p.username from public.profiles p where p.id = v_partner), 'Ami')));
  end if;
  v_mine := private.titan_buddy_days(v_uid, v_b.starts_on, least(v_today, v_b.ends_on), v_b.accepted_at);
  v_theirs := private.titan_buddy_days(v_partner, v_b.starts_on, least(v_today, v_b.ends_on), v_b.accepted_at);
  return jsonb_build_object('status', 'active', 'id', v_b.id, 'role', case when v_b.inviter_id = v_uid then 'inviter' else 'invitee' end,
    'partner', jsonb_build_object('id', v_partner, 'name', coalesce((select p.username from public.profiles p where p.id = v_partner), 'Ami')),
    'startsOn', v_b.starts_on, 'endsOn', v_b.ends_on, 'daysLeft', greatest(0, v_b.ends_on - v_today + 1), 'target', v_b.target_days,
    'myDays', v_mine, 'partnerDays', v_theirs, 'together', v_mine + v_theirs,
    'nudgedToday', exists (select 1 from private.titan_buddy_nudges n where n.buddy_id = v_b.id and n.from_user = v_uid and n.day = v_today),
    'nudgesReceived', (select count(*) from private.titan_buddy_nudges n where n.buddy_id = v_b.id and n.from_user = v_partner));
end;
$function$;

create or replace function public.titan_buddy_invite_v1(p_friend uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_lapsed uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_friend is null or p_friend = v_uid then raise exception 'BUDDY_NOT_ALLOWED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id in (v_uid, p_friend) and coalesce(p.is_suspended, false)) then raise exception 'BUDDY_NOT_ALLOWED' using errcode = '42501'; end if;
  if not private.titan_are_friends(v_uid, p_friend) then raise exception 'BUDDY_NOT_ALLOWED' using errcode = '42501'; end if;
  -- Lapsed pairings are closed (a completed one keeps its result) before the one-at-a-time rule applies.
  for v_lapsed in select b.id from private.titan_buddies b
     where b.status in ('pending', 'active') and (v_uid in (b.inviter_id, b.invitee_id) or p_friend in (b.inviter_id, b.invitee_id)) and not private.titan_buddy_live(b.id) loop
    perform private.titan_buddy_close(v_lapsed);
  end loop;
  if exists (select 1 from private.titan_buddies b where b.status in ('pending', 'active') and (v_uid in (b.inviter_id, b.invitee_id) or p_friend in (b.inviter_id, b.invitee_id))) then
    raise exception 'BUDDY_ALREADY_PAIRED' using errcode = '22023';
  end if;
  perform public.titan_social_rate_limit(v_uid, 'buddy_invite', interval '1 day', 10);
  insert into private.titan_buddies (inviter_id, invitee_id) values (v_uid, p_friend) returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', 'pending');
end;
$function$;
revoke all on function public.titan_buddy_v1(), public.titan_buddy_invite_v1(uuid) from public, anon;
grant execute on function public.titan_buddy_v1(), public.titan_buddy_invite_v1(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. A club's common goal of the week (anonymous by construction).
-- ---------------------------------------------------------------------------------------------
alter table private.titan_clubs add column if not exists weekly_goal integer check (weekly_goal is null or weekly_goal between 60 and 100000);

create or replace function public.titan_club_week_v1(p_club uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_c private.titan_clubs%rowtype;
  v_from timestamptz := date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  v_minutes numeric := 0;
  v_active integer := 0;
  v_members integer := 0;
  v_role text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select m.role into v_role from private.titan_club_members m join private.titan_clubs c on c.id = m.club_id
   where m.club_id = p_club and m.user_id = v_uid and c.archived_at is null;
  if v_role is null then raise exception 'CLUB_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into v_c from private.titan_clubs where id = p_club;
  select count(*)::integer, coalesce(sum(x.minutes), 0), count(*) filter (where x.minutes > 0)::integer into v_members, v_minutes, v_active
    from (select m.user_id, coalesce((select sum(d.minutes) from private.titan_effort_days(m.user_id, v_from, v_from + interval '7 days', greatest(v_from, m.joined_at), 90) d), 0) as minutes
            from private.titan_club_members m where m.club_id = p_club) x;
  -- Totals from 3 members only (header, point 4): below, they would give away another member's minutes.
  return jsonb_build_object('club', p_club, 'weekStart', v_from, 'goal', v_c.weekly_goal, 'minutes', case when v_members >= 3 then round(v_minutes) end,
    'members', v_members, 'active', case when v_members >= 3 then v_active end, 'canSet', v_role = 'admin');
end;
$function$;

create or replace function public.titan_club_goal_set_v1(p_club uuid, p_minutes integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from private.titan_club_members m join private.titan_clubs c on c.id = m.club_id
                  where m.club_id = p_club and m.user_id = v_uid and m.role = 'admin' and c.archived_at is null) then
    raise exception 'CLUB_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_minutes is not null and p_minutes not between 60 and 100000 then raise exception 'CLUB_GOAL_INVALID' using errcode = '22023'; end if;
  perform private.titan_rate_limit(v_uid, 'club_goal', 30);
  update private.titan_clubs set weekly_goal = p_minutes where id = p_club;
  return public.titan_club_week_v1(p_club);
end;
$function$;
revoke all on function public.titan_club_week_v1(uuid), public.titan_club_goal_set_v1(uuid, integer) from public, anon;
grant execute on function public.titan_club_week_v1(uuid), public.titan_club_goal_set_v1(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Every non-historical session is risk-scored, whatever it earned (body of 20261020000000, one condition changed).
-- ---------------------------------------------------------------------------------------------
create or replace function public.titan_submit_training_session(
  p_sport text, p_category text, p_val numeric, p_unit text default ''::text,
  p_details jsonb default '{}'::jsonb, p_date timestamptz default now()
)
returns table(log_id text, xp integer, credits integer, credits_after integer, xp_after integer, level_after integer,
  level_bonus integer, leveled_up integer, requested_xp integer, requested_credits integer,
  weekly_xp_remaining integer, weekly_credits_remaining integer, server_version text,
  reward_held boolean, held_xp integer, held_credits integer, release_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_sport text := left(regexp_replace(trim(coalesce(p_sport, 'unknown')), '[[:cntrl:]]', '', 'g'), 80);
  v_category text := lower(left(regexp_replace(trim(coalesce(p_category, 'training')), '[[:cntrl:]]', '', 'g'), 80));
  v_unit text := lower(left(regexp_replace(trim(coalesce(p_unit, '')), '[[:cntrl:]]', '', 'g'), 24));
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_val numeric := coalesce(p_val, 0);
  v_effort jsonb;
  v_historical boolean;
  v_raw_xp integer := 0;
  v_daily_xp integer := 0;
  v_day_used integer := 0;
  v_xp integer := 0;
  v_credits integer := 0;
  v_log_id text;
  v_progress record;
  v_cap record;
  v_event uuid := coalesce(nullif(v_details ->> 'client_event_id', '')::uuid, gen_random_uuid());
  v_request jsonb := jsonb_build_object('sport', p_sport, 'category', p_category, 'val', p_val, 'unit', p_unit, 'details', p_details, 'date', p_date);
  v_receipt public.training_receipts%rowtype;
  v_response jsonb;
  v_version constant text := 'sport-effort-v300';
  v_held boolean := false;
  v_release_at timestamptz;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  perform 1 from public.profiles where id = v_user_id and not coalesce(is_suspended, false) for update;
  if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode = '42501'; end if;

  select * into v_receipt from public.training_receipts where user_id = v_user_id and client_event_id = v_event;
  if found then
    if v_receipt.request <> v_request then raise exception 'EVENT_CONTENT_CONFLICT' using errcode = '23505'; end if;
    return query select r.* from jsonb_to_record(v_receipt.response) as r(log_id text, xp integer, credits integer,
      credits_after integer, xp_after integer, level_after integer, level_bonus integer, leveled_up integer,
      requested_xp integer, requested_credits integer, weekly_xp_remaining integer, weekly_credits_remaining integer,
      server_version text, reward_held boolean, held_xp integer, held_credits integer, release_at timestamptz);
    return;
  end if;

  if jsonb_typeof(v_details) <> 'object' or octet_length(v_details::text) > 100000 then
    raise exception 'TRAINING_DETAILS_INVALID' using errcode = '22023';
  end if;
  if p_date is null then raise exception 'TRAINING_DATE_REQUIRED' using errcode = '22023'; end if;
  if v_val <= 0 or v_val > 300000 then raise exception 'TRAINING_VALUE_OUT_OF_RANGE' using errcode = '22023'; end if;
  if p_date > now() + interval '10 minutes' or p_date < timestamptz '1990-01-01' then
    raise exception 'TRAINING_DATE_OUT_OF_RANGE' using errcode = '22023';
  end if;
  if coalesce(public.titan_numeric_from_json(v_details, 'duration'), 0) > 1440
     or coalesce(public.titan_numeric_from_json(v_details, 'val2'), 0) > 1440
     or (v_unit = 'min' and v_val > 1440) then
    raise exception 'TRAINING_DURATION_OUT_OF_RANGE' using errcode = '22023';
  end if;

  v_historical := p_date < now() - interval '30 days';
  v_effort := public.titan_effort_v300(v_sport, v_unit, v_val, v_details);
  v_raw_xp := case when v_historical then 0 else (v_effort ->> 'xp')::integer end;

  if not v_historical then
    select coalesce(sum(l.xp), 0)::integer into v_day_used
      from public.training_logs l
     where l.user_id = v_user_id
       and l.created_at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris');
    v_daily_xp := least(v_raw_xp, greatest(0, 1800 - v_day_used));
  end if;

  select * into v_cap from public.titan_apply_weekly_reward_cap(v_user_id, v_daily_xp, floor(v_daily_xp * 0.1)::integer);
  v_xp := coalesce(v_cap.xp_awarded, 0);
  v_credits := coalesce(v_cap.credits_awarded, 0);

  insert into public.training_logs(client_event_id, user_id, sport, category, val, unit, xp, date, details)
  values (v_event, v_user_id, v_sport, v_category, v_val, v_unit, v_xp, p_date,
    v_details || jsonb_build_object(
      'serverReward', not v_historical,
      'serverVersion', v_version,
      'historical', v_historical,
      'rewardEligible', not v_historical,
      'balanceProfile', v_effort ->> 'profile',
      'effort', v_effort,
      'requestedXp', v_raw_xp,
      'requestedCredits', floor(v_raw_xp * 0.1)::integer,
      'credits', v_credits,
      'creditRatio', 0.1,
      'dailyXpCap', 1800,
      'dailyCapped', v_daily_xp < v_raw_xp,
      'weeklyXpCap', v_cap.xp_cap,
      'weeklyCreditCap', v_cap.credit_cap,
      'weeklyXpRemaining', greatest(0, coalesce(v_cap.xp_cap, 0) - coalesce(v_cap.xp_used, 0)),
      'weeklyCreditsRemaining', greatest(0, coalesce(v_cap.credit_cap, 0) - coalesce(v_cap.credits_used, 0)),
      'weeklyCapped', coalesce(v_cap.is_capped, false)))
  returning id::text into v_log_id;
  if v_log_id is null then raise exception 'TRAINING_REJECTED' using errcode = '23514'; end if;

  -- CHEAT15: a session whose risk at recording reaches "review" (score >= 8) has its reward held for at most 24 hours
  -- (released by private.titan_release_due_reward_holds, cancelled by an exclusion, granted by a restoration).
  -- Nothing already granted is ever taken back; the weekly allowance stays consumed.
  -- Every non-historical session is scored, whatever it earned: a session past the daily or weekly cap (0 XP, 0 credit) is held
  -- too, with zero amounts, so that it stays out of every collective count (private.titan_confirmed_sessions) until it is released.
  if not v_historical then
    -- A session missing from the 100 most recent scored ones (a back-dated entry among many newer sessions) cannot be
    -- scored: it is held out of caution rather than rewarded unchecked.
    v_held := coalesce((select max(case when e ->> 'id' = v_log_id then (e ->> 'score')::integer end) >= 8
                          from jsonb_array_elements(private.titan_session_risk(v_user_id, 100)) e), true);
  end if;
  if v_held then
    v_release_at := now() + interval '24 hours';
    insert into private.titan_reward_holds(log_id, user_id, xp, credits, release_at)
    values (v_log_id::uuid, v_user_id, v_xp, v_credits, v_release_at);
    select greatest(0, coalesce(p.credits, 0)) as credits_after, greatest(0, coalesce(p.xp, 0)) as xp_after,
           greatest(1, coalesce(p.level, 1)) as level_after, 0 as level_bonus, 0 as leveled_up
      into v_progress from public.profiles p where p.id = v_user_id;
  else
    select * into v_progress from public.titan_apply_progression_reward(v_user_id, v_xp, v_credits);
  end if;

  v_response := jsonb_build_object('log_id', v_log_id, 'xp', case when v_held then 0 else v_xp end,
    'credits', case when v_held then 0 else v_credits end,
    'credits_after', v_progress.credits_after, 'xp_after', v_progress.xp_after, 'level_after', v_progress.level_after,
    'level_bonus', v_progress.level_bonus, 'leveled_up', v_progress.leveled_up,
    'requested_xp', v_raw_xp, 'requested_credits', floor(v_raw_xp * 0.1)::integer,
    'weekly_xp_remaining', greatest(0, coalesce(v_cap.xp_cap, 0) - coalesce(v_cap.xp_used, 0)),
    'weekly_credits_remaining', greatest(0, coalesce(v_cap.credit_cap, 0) - coalesce(v_cap.credits_used, 0)),
    'server_version', v_version,
    'reward_held', v_held, 'held_xp', case when v_held then v_xp else 0 end,
    'held_credits', case when v_held then v_credits else 0 end, 'release_at', v_release_at);
  insert into public.training_receipts(user_id, client_event_id, request, response) values (v_user_id, v_event, v_request, v_response);

  return query select v_log_id, case when v_held then 0 else v_xp end, case when v_held then 0 else v_credits end,
    v_progress.credits_after::integer, v_progress.xp_after::integer,
    v_progress.level_after::integer, v_progress.level_bonus::integer, v_progress.leveled_up::integer,
    v_raw_xp, floor(v_raw_xp * 0.1)::integer,
    greatest(0, coalesce(v_cap.xp_cap, 0) - coalesce(v_cap.xp_used, 0))::integer,
    greatest(0, coalesce(v_cap.credit_cap, 0) - coalesce(v_cap.credits_used, 0))::integer,
    v_version, v_held, case when v_held then v_xp else 0 end, case when v_held then v_credits else 0 end, v_release_at;
end;
$function$;

revoke all on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) from public, anon;
grant execute on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) to authenticated;
grant execute on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) to service_role;

notify pgrst, 'reload schema';
