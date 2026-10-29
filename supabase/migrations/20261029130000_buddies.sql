-- V11-63 (COM-C2): progress buddies. Two accepted, unblocked friends may agree to support each other for 14 days. Strictly voluntary: the
-- invited friend accepts or declines, and either side may stop at any time (consent withdrawn = access ends at once). A player has at most one
-- buddy at a time. The shared goal is a number of ACTIVE DAYS together (12 over the 14 days); each side sees the other's count of active days
-- and nothing else (no sport, no minutes, no place). A day of encouragement may be sent once a day per side; the receiver sees a count.
-- No partner is ever assigned, no XP, credit, quest, record or ranking is granted. After the end (or if the friendship stops or one of them is
-- blocked or suspended) the other side's data is no longer readable.
-- Own pairings are exported (extras helper) and erased with the account (foreign keys on delete cascade).
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_buddy_v1(), public.titan_buddy_invite_v1(uuid), public.titan_buddy_respond_v1(uuid,boolean),
-- public.titan_buddy_end_v1(uuid), public.titan_buddy_nudge_v1(uuid); drop tables private.titan_buddy_nudges, private.titan_buddies;
-- then re-apply the extras helper of migration 45 (20261029120000_common_quest.sql).

create table if not exists private.titan_buddies (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  target_days smallint not null default 12 check (target_days between 4 and 28),
  starts_on date,
  ends_on date,
  accepted_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (inviter_id <> invitee_id),
  check ((status = 'pending' and starts_on is null) or (status <> 'pending' and starts_on is not null) or status = 'ended')
);
-- At most one pending or active pairing per player, on either side.
create unique index if not exists titan_buddies_one_open_inviter on private.titan_buddies (inviter_id) where status in ('pending', 'active');
create unique index if not exists titan_buddies_one_open_invitee on private.titan_buddies (invitee_id) where status in ('pending', 'active');
create index if not exists titan_buddies_invitee_idx on private.titan_buddies (invitee_id);
create table if not exists private.titan_buddy_nudges (
  buddy_id uuid not null references private.titan_buddies(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  day date not null,
  primary key (buddy_id, from_user, day)
);
create index if not exists titan_buddy_nudges_from_idx on private.titan_buddy_nudges (from_user);
alter table private.titan_buddies enable row level security;
alter table private.titan_buddy_nudges enable row level security;
revoke all on private.titan_buddies, private.titan_buddy_nudges from public, anon, authenticated;

-- A pairing is "live" while it is pending or active, the friendship holds (accepted, unblocked) and the period has not ended.
create or replace function private.titan_buddy_live(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1 from private.titan_buddies b
     where b.id = p_id and b.status in ('pending', 'active')
       and (b.ends_on is null or b.ends_on >= (now() at time zone 'Europe/Paris')::date)
       and private.titan_are_friends(b.inviter_id, b.invitee_id)
       and not exists (select 1 from public.profiles p where p.id in (b.inviter_id, b.invitee_id) and coalesce(p.is_suspended, false)));
$function$;
revoke all on function private.titan_buddy_live(uuid) from public, anon, authenticated;

-- Active days of one player inside the period: sessions recorded after the pairing started, dated inside the period, history and held sessions excluded.
create or replace function private.titan_buddy_days(p_user uuid, p_from date, p_to date, p_since timestamptz)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select count(*)::integer from private.titan_effort_days(p_user, p_from::timestamp at time zone 'Europe/Paris', (p_to + 1)::timestamp at time zone 'Europe/Paris', p_since, 90) d where d.minutes > 0;
$function$;
revoke all on function private.titan_buddy_days(uuid, date, date, timestamptz) from public, anon, authenticated;

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
  if not found then
    return jsonb_build_object('status', 'none', 'friends', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.username, 'Ami')) order by p.username)
        from public.friendships f join public.profiles p on p.id = case when f.user_id_1 = v_uid then f.user_id_2 else f.user_id_1 end
       where (f.user_id_1 = v_uid or f.user_id_2 = v_uid) and coalesce(f.status, 'accepted') = 'accepted' and not coalesce(p.is_suspended, false)
         and private.titan_are_friends(v_uid, p.id)
         and not exists (select 1 from private.titan_buddies x where x.status in ('pending', 'active') and p.id in (x.inviter_id, x.invitee_id))), '[]'::jsonb));
  end if;
  v_partner := case when v_b.inviter_id = v_uid then v_b.invitee_id else v_b.inviter_id end;
  -- The relationship has lapsed (period over, friendship gone, a block, a suspension): it ends here and nothing of the other side is read.
  if not private.titan_buddy_live(v_b.id) then
    update private.titan_buddies set status = 'ended', ended_at = coalesce(ended_at, now()) where id = v_b.id;
    return jsonb_build_object('status', 'none', 'friends', '[]'::jsonb);
  end if;
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
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_friend is null or p_friend = v_uid then raise exception 'BUDDY_NOT_ALLOWED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id in (v_uid, p_friend) and coalesce(p.is_suspended, false)) then raise exception 'BUDDY_NOT_ALLOWED' using errcode = '42501'; end if;
  if not private.titan_are_friends(v_uid, p_friend) then raise exception 'BUDDY_NOT_ALLOWED' using errcode = '42501'; end if;
  -- Lapsed pairings are closed before the one-at-a-time rule applies.
  update private.titan_buddies b set status = 'ended', ended_at = coalesce(b.ended_at, now())
   where b.status in ('pending', 'active') and (v_uid in (b.inviter_id, b.invitee_id) or p_friend in (b.inviter_id, b.invitee_id)) and not private.titan_buddy_live(b.id);
  if exists (select 1 from private.titan_buddies b where b.status in ('pending', 'active') and (v_uid in (b.inviter_id, b.invitee_id) or p_friend in (b.inviter_id, b.invitee_id))) then
    raise exception 'BUDDY_ALREADY_PAIRED' using errcode = '22023';
  end if;
  perform public.titan_social_rate_limit(v_uid, 'buddy_invite', interval '1 day', 10);
  insert into private.titan_buddies (inviter_id, invitee_id) values (v_uid, p_friend) returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', 'pending');
end;
$function$;

create or replace function public.titan_buddy_respond_v1(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_b private.titan_buddies%rowtype;
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_b from private.titan_buddies where id = p_id and invitee_id = v_uid and status = 'pending';
  if not found then raise exception 'BUDDY_NOT_FOUND' using errcode = '22023'; end if;
  if not private.titan_buddy_live(p_id) then
    update private.titan_buddies set status = 'ended', ended_at = now() where id = p_id;
    raise exception 'BUDDY_NOT_ALLOWED' using errcode = '42501';
  end if;
  if coalesce(p_accept, false) then
    update private.titan_buddies set status = 'active', starts_on = v_today, ends_on = v_today + 13, accepted_at = now() where id = p_id;
    return jsonb_build_object('id', p_id, 'status', 'active', 'startsOn', v_today, 'endsOn', v_today + 13);
  end if;
  update private.titan_buddies set status = 'ended', ended_at = now(), ended_by = v_uid where id = p_id;
  return jsonb_build_object('id', p_id, 'status', 'ended');
end;
$function$;

-- Either side, any time, pending or active: consent withdrawn.
create or replace function public.titan_buddy_end_v1(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  update private.titan_buddies set status = 'ended', ended_at = now(), ended_by = auth.uid()
   where id = p_id and status in ('pending', 'active') and auth.uid() in (inviter_id, invitee_id);
  return found;
end;
$function$;

create or replace function public.titan_buddy_nudge_v1(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from private.titan_buddies b where b.id = p_id and b.status = 'active' and v_uid in (b.inviter_id, b.invitee_id)) or not private.titan_buddy_live(p_id) then
    raise exception 'BUDDY_NOT_ALLOWED' using errcode = '42501';
  end if;
  perform public.titan_social_rate_limit(v_uid, 'buddy_nudge', interval '1 day', 20);
  insert into private.titan_buddy_nudges (buddy_id, from_user, day) values (p_id, v_uid, v_today) on conflict do nothing;
  return jsonb_build_object('id', p_id, 'nudgedToday', true);
end;
$function$;

revoke all on function public.titan_buddy_v1(), public.titan_buddy_invite_v1(uuid), public.titan_buddy_respond_v1(uuid, boolean), public.titan_buddy_end_v1(uuid), public.titan_buddy_nudge_v1(uuid) from public, anon;
grant execute on function public.titan_buddy_v1(), public.titan_buddy_invite_v1(uuid), public.titan_buddy_respond_v1(uuid, boolean), public.titan_buddy_end_v1(uuid), public.titan_buddy_nudge_v1(uuid) to authenticated;

-- The export gains the account's own pairings (dates and status only; the partner's data is never exported).
create or replace function private.titan_export_extras_v1(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'garminLink', coalesce((select jsonb_agg(jsonb_build_object('garmin_user_id', g.garmin_user_id, 'linked_at', g.linked_at, 'revoked_at', g.revoked_at, 'last_event_at', g.last_event_at))
                              from private.titan_garmin_links g where g.user_id = p_uid), '[]'::jsonb),
    'pollVotes', coalesce((select jsonb_agg(jsonb_build_object('poll_id', v.poll_id, 'option_position', v.option_position, 'voted_at', v.voted_at) order by v.voted_at)
                             from private.titan_poll_votes v where v.user_id = p_uid), '[]'::jsonb),
    'roadmapVotes', coalesce((select jsonb_agg(jsonb_build_object('item_id', v.item_id, 'voted_at', v.voted_at) order by v.voted_at)
                                from private.titan_roadmap_votes v where v.user_id = p_uid), '[]'::jsonb),
    'pioneer', coalesce((select jsonb_build_object('cohort', b.cohort, 'granted_at', b.granted_at) from private.titan_pioneers b where b.user_id = p_uid), 'null'::jsonb),
    'dailyIntents', coalesce((select jsonb_agg(jsonb_build_object('day', i.day, 'intent', i.intent, 'visibility', i.visibility, 'done_at', i.done_at) order by i.day)
                                from private.titan_daily_intents i where i.user_id = p_uid), '[]'::jsonb),
    'commonQuests', coalesce((select jsonb_agg(jsonb_build_object('quest_id', m.quest_id, 'week_start', q.week_start, 'joined_at', m.joined_at) order by m.joined_at)
                                from private.titan_common_quest_members m join private.titan_common_quests q on q.id = m.quest_id where m.user_id = p_uid), '[]'::jsonb),
    'buddies', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'role', case when b.inviter_id = p_uid then 'inviter' else 'invitee' end, 'status', b.status,
                           'starts_on', b.starts_on, 'ends_on', b.ends_on, 'ended_at', b.ended_at) order by b.created_at)
                           from private.titan_buddies b where p_uid in (b.inviter_id, b.invitee_id)), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;
