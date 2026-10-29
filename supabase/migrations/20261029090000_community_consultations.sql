-- V11-57 (COM-F3, COM-F4): community consultations. Two small, separate mechanisms that share one rule: a vote is a preference, never a promise.
--   * Polls (COM-F3): a concrete question with 2 to 6 options and an opening and closing date. One vote per account and poll, changeable
--     until the poll closes; the result (counts per option) is shown only after the close, so nobody follows the crowd. Created and closed
--     by an administrator only.
--   * Roadmap (COM-F4): the ideas under consideration with an honest status (wish, study, planned, doing, shipped) and a preference vote
--     (at most 5 open votes per account). Statuses are changed by an administrator only and keep their history. No date is ever promised.
-- Eligible voters: an account that is not suspended and is at least one day old (a throw-away bot account does not weigh).
-- Votes touch no XP, credit, quest, record or ranking. Tables are private (no API grant); every access goes through the functions below.
-- Own votes are exported with export_own_data() (through the extras helper) and erased with the account (foreign keys on delete cascade).
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_polls_v1(), public.titan_poll_vote_v1(uuid,smallint), public.titan_poll_admin_save_v1(text,text,text[],timestamptz,timestamptz),
-- public.titan_poll_admin_close_v1(uuid), public.titan_roadmap_v1(), public.titan_roadmap_vote_v1(uuid,boolean),
-- public.titan_roadmap_admin_save_v1(uuid,text,text,text,integer,boolean); drop tables private.titan_poll_votes, private.titan_poll_options,
-- private.titan_polls, private.titan_roadmap_votes, private.titan_roadmap_items; then re-apply the extras helper of migration 40
-- (20261028110000_garmin_link.sql).

create table if not exists private.titan_polls (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  detail text check (detail is null or char_length(detail) <= 600),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  closed_early_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (closes_at > opens_at and closes_at <= opens_at + interval '60 days')
);
create table if not exists private.titan_poll_options (
  poll_id uuid not null references private.titan_polls(id) on delete cascade,
  position smallint not null check (position between 1 and 6),
  label text not null check (char_length(label) between 1 and 80),
  primary key (poll_id, position)
);
create table if not exists private.titan_poll_votes (
  poll_id uuid not null references private.titan_polls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_position smallint not null,
  voted_at timestamptz not null default now(),
  primary key (poll_id, user_id),
  foreign key (poll_id, option_position) references private.titan_poll_options(poll_id, position) on delete cascade
);
create index if not exists titan_poll_votes_user_idx on private.titan_poll_votes (user_id);

create table if not exists private.titan_roadmap_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 100),
  detail text check (detail is null or char_length(detail) <= 500),
  status text not null default 'wish' check (status in ('wish', 'study', 'planned', 'doing', 'shipped')),
  sort_order integer not null default 0,
  history jsonb not null default '[]'::jsonb,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists private.titan_roadmap_votes (
  item_id uuid not null references private.titan_roadmap_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index if not exists titan_roadmap_votes_user_idx on private.titan_roadmap_votes (user_id);

alter table private.titan_polls enable row level security;
alter table private.titan_poll_options enable row level security;
alter table private.titan_poll_votes enable row level security;
alter table private.titan_roadmap_items enable row level security;
alter table private.titan_roadmap_votes enable row level security;
revoke all on private.titan_polls, private.titan_poll_options, private.titan_poll_votes, private.titan_roadmap_items, private.titan_roadmap_votes from public, anon, authenticated;

-- Who may vote: signed in, not suspended, account at least one day old.
create or replace function private.titan_can_vote(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select p_uid is not null and exists (
    select 1 from public.profiles p
     where p.id = p_uid and not coalesce(p.is_suspended, false) and p.created_at <= now() - interval '1 day');
$function$;
revoke all on function private.titan_can_vote(uuid) from public, anon, authenticated;

-- The polls of the last two months and the ones to come soon are not shown before they open. Counts only after the close.
create or replace function public.titan_polls_v1()
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
  return coalesce((
    select jsonb_agg(x.j order by x.closes_at desc)
      from (select p.closes_at,
                   jsonb_build_object(
                     'id', p.id, 'title', p.title, 'detail', p.detail, 'opensAt', p.opens_at, 'closesAt', coalesce(p.closed_early_at, p.closes_at),
                     'state', case when coalesce(p.closed_early_at, p.closes_at) <= now() then 'closed' else 'open' end,
                     'myVote', (select v.option_position from private.titan_poll_votes v where v.poll_id = p.id and v.user_id = v_uid),
                     'options', (select jsonb_agg(
                                   jsonb_build_object('position', o.position, 'label', o.label)
                                   || case when coalesce(p.closed_early_at, p.closes_at) <= now()
                                           then jsonb_build_object('votes', (select count(*) from private.titan_poll_votes v where v.poll_id = p.id and v.option_position = o.position))
                                           else '{}'::jsonb end
                                   order by o.position)
                                   from private.titan_poll_options o where o.poll_id = p.id)) as j
              from private.titan_polls p
             where p.opens_at <= now() and coalesce(p.closed_early_at, p.closes_at) > now() - interval '60 days'
             order by p.closes_at desc limit 20) x), '[]'::jsonb);
end;
$function$;

create or replace function public.titan_poll_vote_v1(p_poll uuid, p_option smallint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_poll private.titan_polls%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.titan_can_vote(v_uid) then raise exception 'NOT_ELIGIBLE' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'poll_vote', 60);
  select * into v_poll from private.titan_polls where id = p_poll;
  if not found then raise exception 'POLL_NOT_FOUND' using errcode = '22023'; end if;
  if v_poll.opens_at > now() then raise exception 'POLL_NOT_OPEN' using errcode = '22023'; end if;
  if coalesce(v_poll.closed_early_at, v_poll.closes_at) <= now() then raise exception 'POLL_CLOSED' using errcode = '22023'; end if;
  if not exists (select 1 from private.titan_poll_options o where o.poll_id = p_poll and o.position = p_option) then
    raise exception 'OPTION_UNKNOWN' using errcode = '22023';
  end if;
  insert into private.titan_poll_votes as v (poll_id, user_id, option_position) values (p_poll, v_uid, p_option)
  on conflict (poll_id, user_id) do update set option_position = excluded.option_position, voted_at = now();
  return jsonb_build_object('poll', p_poll, 'myVote', p_option);
end;
$function$;

create or replace function public.titan_poll_admin_save_v1(p_title text, p_detail text, p_options text[], p_opens timestamptz, p_closes timestamptz)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_labels text[];
  i integer;
begin
  if v_uid is null or not private.titan_is_admin(v_uid) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  select coalesce(array_agg(btrim(o) order by n), '{}') into v_labels from unnest(coalesce(p_options, '{}')) with ordinality as t(o, n) where btrim(o) <> '';
  if coalesce(array_length(v_labels, 1), 0) not between 2 and 6 then raise exception 'OPTIONS_2_TO_6' using errcode = '22023'; end if;
  insert into private.titan_polls (title, detail, opens_at, closes_at, created_by)
  values (btrim(p_title), nullif(btrim(coalesce(p_detail, '')), ''), p_opens, p_closes, v_uid) returning id into v_id;
  for i in 1 .. array_length(v_labels, 1) loop
    insert into private.titan_poll_options (poll_id, position, label) values (v_id, i, v_labels[i]);
  end loop;
  return v_id;
end;
$function$;

create or replace function public.titan_poll_admin_close_v1(p_poll uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  update private.titan_polls set closed_early_at = now() where id = p_poll and coalesce(closed_early_at, closes_at) > now();
  if not found then raise exception 'POLL_NOT_OPEN_OR_UNKNOWN' using errcode = '22023'; end if;
end;
$function$;

-- The roadmap: statuses and preference counts. A shipped idea keeps its votes visible but cannot be voted any more.
create or replace function public.titan_roadmap_v1()
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
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', i.id, 'title', i.title, 'detail', i.detail, 'status', i.status, 'updatedAt', i.updated_at, 'history', i.history,
             'votes', (select count(*) from private.titan_roadmap_votes v where v.item_id = i.id),
             'mine', exists (select 1 from private.titan_roadmap_votes v where v.item_id = i.id and v.user_id = v_uid))
           order by i.sort_order, i.created_at)
      from private.titan_roadmap_items i where i.archived_at is null), '[]'::jsonb);
end;
$function$;

create or replace function public.titan_roadmap_vote_v1(p_item uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_open integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.titan_can_vote(v_uid) then raise exception 'NOT_ELIGIBLE' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'roadmap_vote', 60);
  select status into v_status from private.titan_roadmap_items where id = p_item and archived_at is null;
  if not found then raise exception 'ITEM_NOT_FOUND' using errcode = '22023'; end if;
  if coalesce(p_on, false) then
    if v_status = 'shipped' then raise exception 'ITEM_SHIPPED' using errcode = '22023'; end if;
    if not exists (select 1 from private.titan_roadmap_votes where item_id = p_item and user_id = v_uid) then
      select count(*) into v_open from private.titan_roadmap_votes v join private.titan_roadmap_items i on i.id = v.item_id
       where v.user_id = v_uid and i.status <> 'shipped' and i.archived_at is null;
      if v_open >= 5 then raise exception 'VOTE_LIMIT_5' using errcode = '22023'; end if;
      insert into private.titan_roadmap_votes (item_id, user_id) values (p_item, v_uid);
    end if;
  else
    delete from private.titan_roadmap_votes where item_id = p_item and user_id = v_uid;
  end if;
  return jsonb_build_object('item', p_item, 'mine', coalesce(p_on, false),
    'votes', (select count(*) from private.titan_roadmap_votes where item_id = p_item));
end;
$function$;

create or replace function public.titan_roadmap_admin_save_v1(p_id uuid, p_title text, p_detail text, p_status text, p_sort integer default 0, p_archive boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid := p_id;
  v_old text;
begin
  if v_uid is null or not private.titan_is_admin(v_uid) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('wish', 'study', 'planned', 'doing', 'shipped') then raise exception 'STATUS_UNKNOWN' using errcode = '22023'; end if;
  if v_id is null then
    insert into private.titan_roadmap_items (title, detail, status, sort_order, history, created_by)
    values (btrim(p_title), nullif(btrim(coalesce(p_detail, '')), ''), p_status, coalesce(p_sort, 0),
            jsonb_build_array(jsonb_build_object('status', p_status, 'at', now())), v_uid) returning id into v_id;
  else
    select status into v_old from private.titan_roadmap_items where id = v_id;
    if not found then raise exception 'ITEM_NOT_FOUND' using errcode = '22023'; end if;
    update private.titan_roadmap_items set title = btrim(p_title), detail = nullif(btrim(coalesce(p_detail, '')), ''), status = p_status,
           sort_order = coalesce(p_sort, sort_order), updated_at = now(),
           archived_at = case when coalesce(p_archive, false) then coalesce(archived_at, now()) else null end,
           history = case when v_old is distinct from p_status then history || jsonb_build_array(jsonb_build_object('status', p_status, 'at', now())) else history end
     where id = v_id;
  end if;
  return v_id;
end;
$function$;

revoke all on function public.titan_polls_v1(), public.titan_poll_vote_v1(uuid, smallint), public.titan_poll_admin_save_v1(text, text, text[], timestamptz, timestamptz),
  public.titan_poll_admin_close_v1(uuid), public.titan_roadmap_v1(), public.titan_roadmap_vote_v1(uuid, boolean),
  public.titan_roadmap_admin_save_v1(uuid, text, text, text, integer, boolean) from public, anon;
grant execute on function public.titan_polls_v1(), public.titan_poll_vote_v1(uuid, smallint), public.titan_poll_admin_save_v1(text, text, text[], timestamptz, timestamptz),
  public.titan_poll_admin_close_v1(uuid), public.titan_roadmap_v1(), public.titan_roadmap_vote_v1(uuid, boolean),
  public.titan_roadmap_admin_save_v1(uuid, text, text, text, integer, boolean) to authenticated;

-- The export gains the account's own votes (the helper of migration 40 keeps the Garmin link).
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
                                from private.titan_roadmap_votes v where v.user_id = p_uid), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;
