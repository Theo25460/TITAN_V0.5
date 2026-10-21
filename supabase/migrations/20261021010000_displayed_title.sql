-- SHOP06 (V1 web): wear one earned title. A title is an adventure insignia (one per chapter, 36 in all) or an expedition title.
-- The server only stores WHICH earned title is worn; its wording stays in the catalogue (chapter insignias) or comes from
-- the expedition row. Cosmetic only: no XP, no credits, no advantage, nothing to buy.
-- The choice lives in the existing profiles.appearance jsonb under the key 'title': private.titan_appearance only reads the keys
-- frame, map and card, so the Atelier and every existing reader ignore it. No new table, column or grant.
-- A worn title that is no longer earned reads as no title at all. Changes are limited to 30 per hour (private.titan_rate_limit).
-- Public: the title is returned on the opt-in public card only when the card shows titles (titan_public_card_title).
-- Additive and backward compatible. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_set_displayed_title(text), public.titan_displayed_title(), public.titan_public_card_title(text),
-- private.titan_title_earned(uuid, text); update public.profiles set appearance = appearance - 'title';

create or replace function private.titan_title_earned(p_uid uuid, p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  m text[];
begin
  if p_uid is null or p_key is null then return false; end if;
  m := regexp_match(p_key, '^chapter:(aube|marees|forge|aurores):([1-9])$');
  if m is not null then
    return exists (select 1 from public.adventure_rewards r where r.user_id = p_uid and r.world_id = m[1] and r.chapter = m[2]::integer);
  end if;
  m := regexp_match(p_key, '^exp:([a-z0-9_-]{1,40})$');
  if m is not null then
    return exists (
      select 1 from public.titan_expeditions e
      join public.titan_expedition_members x on x.expedition_id = e.id and x.user_id = p_uid
      cross join lateral (
        select count(*) as days, coalesce(sum(minutes), 0) as minutes
        from private.titan_effort_days(p_uid, e.starts_at, e.ends_at, greatest(x.joined_at, e.starts_at), e.daily_cap)
      ) d
      where e.id = m[1] and e.ends_at < now() and d.days >= e.personal_days and d.minutes >= e.personal_minutes);
  end if;
  return false;
end;
$function$;
revoke all on function private.titan_title_earned(uuid, text) from public, anon, authenticated;

-- {key, label}: label is set for expedition titles only; chapter insignias are named by the client catalogue.
create or replace function private.titan_title_json(p_uid uuid, p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select case when p_key is null or not private.titan_title_earned(p_uid, p_key) then jsonb_build_object('key', null, 'label', null)
    else jsonb_build_object('key', p_key,
      'label', (select e.reward_title from public.titan_expeditions e where p_key = 'exp:' || e.id))
  end;
$function$;
revoke all on function private.titan_title_json(uuid, text) from public, anon, authenticated;

create or replace function public.titan_displayed_title()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  return private.titan_title_json(v_uid, (select p.appearance ->> 'title' from public.profiles p where p.id = v_uid));
end;
$function$;

create or replace function public.titan_set_displayed_title(p_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;
  perform private.titan_rate_limit(v_uid, 'title_set', 30);
  if p_key is null then
    update public.profiles set appearance = coalesce(appearance, '{}'::jsonb) - 'title' where id = v_uid;
    return private.titan_title_json(v_uid, null);
  end if;
  if p_key !~ '^(chapter:(aube|marees|forge|aurores):[1-9]|exp:[a-z0-9_-]{1,40})$' then
    raise exception 'INVALID_TITLE' using errcode = '22023';
  end if;
  if not private.titan_title_earned(v_uid, p_key) then
    raise exception 'NOT_EARNED' using errcode = '42501';
  end if;
  update public.profiles set appearance = coalesce(appearance, '{}'::jsonb) || jsonb_build_object('title', p_key) where id = v_uid;
  return private.titan_title_json(v_uid, p_key);
end;
$function$;

-- Readable without an account, like the card itself. A disabled, hidden-titles, unknown or suspended card answers null.
create or replace function public.titan_public_card_title(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  c public.titan_public_cards%rowtype;
begin
  select * into c from public.titan_public_cards where slug = lower(left(coalesce(p_slug, ''), 10)) and enabled and show_titles;
  if not found or exists (select 1 from public.profiles p where p.id = c.user_id and coalesce(p.is_suspended, false)) then
    return null;
  end if;
  return private.titan_title_json(c.user_id, (select p.appearance ->> 'title' from public.profiles p where p.id = c.user_id));
end;
$function$;

revoke all on function public.titan_displayed_title() from public, anon;
revoke all on function public.titan_set_displayed_title(text) from public, anon;
revoke all on function public.titan_public_card_title(text) from public;
grant execute on function public.titan_displayed_title() to authenticated;
grant execute on function public.titan_set_displayed_title(text) to authenticated;
grant execute on function public.titan_public_card_title(text) to anon, authenticated;
