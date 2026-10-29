-- V11-61 (COM-B7): the daily rendezvous. "Quel est ton objectif aujourd'hui ?" : a player may state, for one day, an intention of a session
-- (a short sentence), say afterwards that it was kept, and let friends see it and encourage. Optional by design: no streak, no counter of
-- missed days, nothing for a rest day, nothing is published automatically, no location and no health data. An intention is private
-- unless the player chooses "friends" for that day; only accepted, unblocked friends read it and cheer it; the owner only sees how many
-- friends encouraged, not who. No XP, credit, quest, record or ranking is touched.
-- Own intentions are exported (through the extras helper) and erased with the account (foreign keys on delete cascade).
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_intent_set_v1(date,text,text), public.titan_intent_done_v1(date,boolean), public.titan_intent_clear_v1(date),
-- public.titan_intents_v1(date), public.titan_intent_cheer_v1(uuid,date,boolean); drop table private.titan_intent_cheers, private.titan_daily_intents;
-- then re-apply the extras helper of migration 43 (20261029100000_pioneer_badge.sql).

create table if not exists private.titan_daily_intents (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  intent text not null check (char_length(intent) between 3 and 80),
  visibility text not null default 'private' check (visibility in ('private', 'friends')),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create table if not exists private.titan_intent_cheers (
  owner_id uuid not null,
  day date not null,
  cheerer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, day, cheerer_id),
  foreign key (owner_id, day) references private.titan_daily_intents(user_id, day) on delete cascade
);
create index if not exists titan_intent_cheers_cheerer_idx on private.titan_intent_cheers (cheerer_id);
alter table private.titan_daily_intents enable row level security;
alter table private.titan_intent_cheers enable row level security;
revoke all on private.titan_daily_intents, private.titan_intent_cheers from public, anon, authenticated;

-- A day is accepted within one day of the server date (the player's own calendar day, whatever the time zone).
create or replace function private.titan_intent_day_ok(p_day date)
returns boolean
language sql
immutable
as $$ select p_day is not null and p_day between current_date - 1 and current_date + 1 $$;
revoke all on function private.titan_intent_day_ok(date) from public, anon, authenticated;

create or replace function public.titan_intent_set_v1(p_day date, p_text text, p_visibility text default 'private')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_text text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.titan_intent_day_ok(p_day) then raise exception 'DAY_OUT_OF_RANGE' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  v_text := public.titan_clean_social_text(p_text, '', 80);
  if char_length(v_text) < 3 then raise exception 'INTENT_TOO_SHORT' using errcode = '22023'; end if;
  perform public.titan_social_rate_limit(v_uid, 'intent_set', interval '1 day', 30);
  insert into private.titan_daily_intents as i (user_id, day, intent, visibility)
  values (v_uid, p_day, v_text, case when p_visibility = 'friends' then 'friends' else 'private' end)
  on conflict (user_id, day) do update set intent = excluded.intent, visibility = excluded.visibility, updated_at = now();
  return jsonb_build_object('day', p_day, 'intent', v_text, 'visibility', case when p_visibility = 'friends' then 'friends' else 'private' end);
end;
$function$;

create or replace function public.titan_intent_done_v1(p_day date, p_done boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.titan_intent_day_ok(p_day) then raise exception 'DAY_OUT_OF_RANGE' using errcode = '22023'; end if;
  update private.titan_daily_intents set done_at = case when coalesce(p_done, false) then now() else null end, updated_at = now()
   where user_id = v_uid and day = p_day;
  if not found then raise exception 'INTENT_NOT_FOUND' using errcode = '22023'; end if;
  return jsonb_build_object('day', p_day, 'done', coalesce(p_done, false));
end;
$function$;

create or replace function public.titan_intent_clear_v1(p_day date)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_removed integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  delete from private.titan_daily_intents where user_id = auth.uid() and day = p_day;
  get diagnostics v_removed = row_count;
  return v_removed = 1;
end;
$function$;

-- Mine for the day (with the number of friends who encouraged), and the friends' intentions shared for that day (at most 30).
create or replace function public.titan_intents_v1(p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.titan_intent_day_ok(p_day) then raise exception 'DAY_OUT_OF_RANGE' using errcode = '22023'; end if;
  return jsonb_build_object(
    'mine', (select jsonb_build_object('intent', i.intent, 'visibility', i.visibility, 'done', i.done_at is not null,
                      'cheers', (select count(*) from private.titan_intent_cheers c where c.owner_id = i.user_id and c.day = i.day))
               from private.titan_daily_intents i where i.user_id = v_uid and i.day = p_day),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('userId', i.user_id, 'name', coalesce(p.username, 'Ami'), 'intent', i.intent, 'done', i.done_at is not null,
                        'cheered', exists (select 1 from private.titan_intent_cheers c where c.owner_id = i.user_id and c.day = i.day and c.cheerer_id = v_uid))
                       order by i.updated_at desc)
        from (select * from private.titan_daily_intents d
               where d.day = p_day and d.visibility = 'friends' and d.user_id <> v_uid and private.titan_are_friends(v_uid, d.user_id)
               order by d.updated_at desc limit 30) i
        join public.profiles p on p.id = i.user_id and not coalesce(p.is_suspended, false)), '[]'::jsonb));
end;
$function$;

create or replace function public.titan_intent_cheer_v1(p_owner uuid, p_day date, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.titan_intent_day_ok(p_day) then raise exception 'DAY_OUT_OF_RANGE' using errcode = '22023'; end if;
  if p_owner is null or p_owner = v_uid then raise exception 'CHEER_NOT_ALLOWED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  if not exists (select 1 from private.titan_daily_intents d where d.user_id = p_owner and d.day = p_day and d.visibility = 'friends')
     or not private.titan_are_friends(v_uid, p_owner) then
    raise exception 'CHEER_NOT_ALLOWED' using errcode = '42501';
  end if;
  perform public.titan_social_rate_limit(v_uid, 'intent_cheer', interval '1 day', 60);
  if coalesce(p_on, false) then
    insert into private.titan_intent_cheers (owner_id, day, cheerer_id) values (p_owner, p_day, v_uid) on conflict do nothing;
  else
    delete from private.titan_intent_cheers where owner_id = p_owner and day = p_day and cheerer_id = v_uid;
  end if;
  return jsonb_build_object('owner', p_owner, 'day', p_day, 'cheered', coalesce(p_on, false));
end;
$function$;

revoke all on function public.titan_intent_set_v1(date, text, text), public.titan_intent_done_v1(date, boolean), public.titan_intent_clear_v1(date),
  public.titan_intents_v1(date), public.titan_intent_cheer_v1(uuid, date, boolean) from public, anon;
grant execute on function public.titan_intent_set_v1(date, text, text), public.titan_intent_done_v1(date, boolean), public.titan_intent_clear_v1(date),
  public.titan_intents_v1(date), public.titan_intent_cheer_v1(uuid, date, boolean) to authenticated;

-- The export gains the account's own intentions (the helper keeps the Garmin link, the votes and the badge).
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
                                from private.titan_daily_intents i where i.user_id = p_uid), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;
