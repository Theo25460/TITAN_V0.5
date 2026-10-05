-- TITAN 300 — Public athlete card: opt-in, off by default, behind an unguessable link (QR friendly).
-- The athlete chooses each block. Never shown: health, weight, GPS, notes, exact dates or times of sessions,
-- friends, guild, email. The card reads only server-validated data (sessions, effort minutes, level, titles).

create table if not exists public.titan_public_cards (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]{10}$'),
  enabled boolean not null default false,
  show_name boolean not null default true,
  show_level boolean not null default true,
  show_totals boolean not null default true,
  show_sports boolean not null default true,
  show_titles boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.titan_public_cards enable row level security;
-- No policy on purpose: the table is only reached through the functions below.
revoke all on public.titan_public_cards from anon, authenticated;

create or replace function private.titan_new_card_slug()
returns text
language sql
volatile
set search_path = public, pg_temp
as $$
  select left(md5(gen_random_uuid()::text || clock_timestamp()::text), 10);
$$;
revoke all on function private.titan_new_card_slug() from public, anon, authenticated;

create or replace function private.titan_card_settings_json(r public.titan_public_cards)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('enabled', coalesce(r.enabled, false), 'slug', r.slug,
    'show', jsonb_build_object('name', coalesce(r.show_name, true), 'level', coalesce(r.show_level, true),
      'totals', coalesce(r.show_totals, true), 'sports', coalesce(r.show_sports, true), 'titles', coalesce(r.show_titles, true)));
$$;
revoke all on function private.titan_card_settings_json(public.titan_public_cards) from public, anon;
grant execute on function private.titan_card_settings_json(public.titan_public_cards) to authenticated;

create or replace function public.titan_public_card_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r public.titan_public_cards%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into r from public.titan_public_cards where user_id = auth.uid();
  return private.titan_card_settings_json(r);
end;
$$;

-- p_show keys: name, level, totals, sports, titles (booleans). p_new_link replaces the link: old QR codes stop working.
create or replace function public.titan_public_card_save(p_enabled boolean, p_show jsonb default '{}'::jsonb, p_new_link boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  s jsonb := coalesce(p_show, '{}'::jsonb);
  r public.titan_public_cards%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;
  insert into public.titan_public_cards as c (user_id, slug, enabled, show_name, show_level, show_totals, show_sports, show_titles)
  values (v_uid, private.titan_new_card_slug(), coalesce(p_enabled, false),
    coalesce((s ->> 'name')::boolean, true), coalesce((s ->> 'level')::boolean, true), coalesce((s ->> 'totals')::boolean, true),
    coalesce((s ->> 'sports')::boolean, true), coalesce((s ->> 'titles')::boolean, true))
  on conflict (user_id) do update set
    enabled = coalesce(p_enabled, c.enabled),
    show_name = coalesce((s ->> 'name')::boolean, c.show_name),
    show_level = coalesce((s ->> 'level')::boolean, c.show_level),
    show_totals = coalesce((s ->> 'totals')::boolean, c.show_totals),
    show_sports = coalesce((s ->> 'sports')::boolean, c.show_sports),
    show_titles = coalesce((s ->> 'titles')::boolean, c.show_titles),
    slug = case when p_new_link then private.titan_new_card_slug() else c.slug end,
    updated_at = now()
  returning * into r;
  return private.titan_card_settings_json(r);
end;
$$;

-- Readable without an account. A disabled, unknown or suspended card answers the same way.
create or replace function public.titan_public_card(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c public.titan_public_cards%rowtype;
  p public.profiles%rowtype;
  v_out jsonb;
  v_sports jsonb;
  v_totals jsonb;
  v_titles jsonb;
  v_insignia integer;
begin
  select * into c from public.titan_public_cards where slug = lower(left(coalesce(p_slug, ''), 10)) and enabled;
  if not found then
    raise exception 'CARD_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into p from public.profiles where id = c.user_id;
  if not found or coalesce(p.is_suspended, false) then
    raise exception 'CARD_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_out := jsonb_build_object(
    'name', case when c.show_name then coalesce(nullif(p.username, ''), 'Athlète TITAN') else 'Athlète TITAN' end,
    'avatar', coalesce((select a.avatar from public.adventure_profiles a where a.user_id = c.user_id), 'scout'),
    'appearance', private.titan_appearance(c.user_id),
    'member_since', to_char(coalesce(p.created_at, now()), 'YYYY-MM'));

  if c.show_level then
    v_out := v_out || jsonb_build_object('level', greatest(1, coalesce(p.level, 1)));
  end if;

  if c.show_totals or c.show_sports then
    with logs as (
      select l.sport,
             coalesce(public.titan_numeric_from_json(l.details -> 'effort', 'minutes'),
                      (public.titan_effort_v300(l.sport, l.unit, l.val, l.details) ->> 'minutes')::numeric, 0) as minutes,
             date_trunc('week', l.date at time zone 'Europe/Paris') as week
      from public.training_logs l
      where l.user_id = c.user_id and l.archived_at is null and l.is_suspicious is not true
        and coalesce(l.status, 'valid') not in ('rejected', 'flagged', 'pending_review') and l.date <= now()
    )
    select
      jsonb_build_object('sessions', count(*), 'minutes', round(coalesce(sum(minutes), 0)), 'weeks', count(distinct week)),
      (select coalesce(jsonb_agg(x order by (x ->> 'minutes')::numeric desc), '[]'::jsonb) from (
         select jsonb_build_object('sport', sport, 'sessions', count(*), 'minutes', round(sum(minutes)), 'weeks', count(distinct week)) as x
         from logs group by sport order by sum(minutes) desc limit 6) t)
    into v_totals, v_sports
    from logs;
    if c.show_totals then v_out := v_out || jsonb_build_object('totals', v_totals); end if;
    if c.show_sports then v_out := v_out || jsonb_build_object('sports', v_sports); end if;
  end if;

  if c.show_titles then
    select coalesce(jsonb_agg(jsonb_build_object('title', e.reward_title, 'expedition', e.title) order by e.ends_at desc), '[]'::jsonb)
    into v_titles
    from public.titan_expeditions e
    join public.titan_expedition_members m on m.expedition_id = e.id and m.user_id = c.user_id
    cross join lateral (
      select count(*) as days, coalesce(sum(minutes), 0) as minutes
      from private.titan_effort_days(c.user_id, e.starts_at, e.ends_at, greatest(m.joined_at, e.starts_at), e.daily_cap)
    ) d
    where e.ends_at < now() and d.days >= e.personal_days and d.minutes >= e.personal_minutes;
    select count(*)::integer into v_insignia from public.adventure_rewards r where r.user_id = c.user_id;
    v_out := v_out || jsonb_build_object('titles', v_titles, 'insignia', v_insignia);
  end if;

  return v_out;
end;
$$;

revoke all on function public.titan_public_card_settings() from public, anon;
revoke all on function public.titan_public_card_save(boolean, jsonb, boolean) from public, anon;
revoke all on function public.titan_public_card(text) from public;
grant execute on function public.titan_public_card_settings() to authenticated;
grant execute on function public.titan_public_card_save(boolean, jsonb, boolean) to authenticated;
grant execute on function public.titan_public_card(text) to anon, authenticated;
