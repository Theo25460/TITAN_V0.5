-- V11-23 (IDEA02): a profile showcase. Up to three titles the player has EARNED (adventure insignias, expedition titles), chosen by them
-- and shown on the opt-in public card when it shows titles. Cosmetic only: no XP, no credits, no advantage, nothing to buy.
-- Same earning rule as the worn title (private.titan_title_earned); a showcased item that is no longer earned simply disappears from the answer.
-- Stored in the existing profiles.appearance jsonb under 'showcase' (private.titan_appearance only reads frame, map and card, so the Atelier
-- ignores it). No new table, column or grant. Changes are limited to 30 per hour, in their own counter: the appearance counter of migration 29
-- ignores the 'showcase' key, like it ignores 'title'.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_set_showcase_v1(text[]), public.titan_showcase_v1(), public.titan_public_card_showcase(text),
-- private.titan_showcase_json(uuid); update public.profiles set appearance = appearance - 'showcase'; then re-apply the trigger function of migration 29.

create or replace function private.titan_rate_limit_surface_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or pg_trigger_depth() > 1 then return new; end if;
  if TG_TABLE_NAME = 'titan_public_cards' then
    if new.user_id = v_uid and not (TG_OP = 'INSERT' and exists (select 1 from public.titan_public_cards c where c.user_id = new.user_id)) then
      perform private.titan_rate_limit(v_uid, 'public_card', 60);
    end if;
  elsif TG_TABLE_NAME = 'profiles' then
    -- Wearing a title (migration 28) and the showcase (migration 36) have their own counters: only a change of the look itself counts here.
    if new.id = v_uid and (new.appearance - 'title' - 'showcase') is distinct from (old.appearance - 'title' - 'showcase') then perform private.titan_rate_limit(v_uid, 'appearance', 60); end if;
  end if;
  return new;
end;
$function$;
revoke all on function private.titan_rate_limit_surface_trigger() from public, anon, authenticated;

-- [{key, label}] in the order chosen; label is set for expedition titles only (chapter insignias are named by the client catalogue).
create or replace function private.titan_showcase_json(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(jsonb_agg(private.titan_title_json(p_uid, k.key) order by k.ord), '[]'::jsonb)
    from (
      select e.value as key, e.ordinality as ord
        from public.profiles p, jsonb_array_elements_text(case when jsonb_typeof(p.appearance -> 'showcase') = 'array' then p.appearance -> 'showcase' else '[]'::jsonb end) with ordinality e(value, ordinality)
       where p.id = p_uid and e.ordinality <= 3
    ) k
   where private.titan_title_earned(p_uid, k.key);
$function$;
revoke all on function private.titan_showcase_json(uuid) from public, anon, authenticated;

create or replace function public.titan_showcase_v1()
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
  return private.titan_showcase_json(v_uid);
end;
$function$;

create or replace function public.titan_set_showcase_v1(p_keys text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_keys text[] := coalesce(p_keys, '{}');
  v_key text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;
  perform private.titan_rate_limit(v_uid, 'showcase_set', 30);
  if cardinality(v_keys) > 3 then raise exception 'SHOWCASE_TOO_LONG' using errcode = '22023'; end if;
  if (select count(distinct k) from unnest(v_keys) k) <> cardinality(v_keys) then raise exception 'SHOWCASE_DUPLICATE' using errcode = '22023'; end if;
  foreach v_key in array v_keys loop
    if v_key is null or v_key !~ '^(chapter:(aube|marees|forge|aurores):[1-9]|exp:[a-z0-9_-]{1,40})$' then
      raise exception 'INVALID_TITLE' using errcode = '22023';
    end if;
    if not private.titan_title_earned(v_uid, v_key) then
      raise exception 'NOT_EARNED' using errcode = '42501';
    end if;
  end loop;
  update public.profiles
     set appearance = case when cardinality(v_keys) = 0 then coalesce(appearance, '{}'::jsonb) - 'showcase'
                           else coalesce(appearance, '{}'::jsonb) || jsonb_build_object('showcase', to_jsonb(v_keys)) end
   where id = v_uid;
  return private.titan_showcase_json(v_uid);
end;
$function$;

-- Readable without an account, like the card itself. A disabled, hidden-titles, unknown or suspended card answers an empty list.
create or replace function public.titan_public_card_showcase(p_slug text)
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
    return '[]'::jsonb;
  end if;
  return private.titan_showcase_json(c.user_id);
end;
$function$;

revoke all on function public.titan_showcase_v1() from public, anon;
revoke all on function public.titan_set_showcase_v1(text[]) from public, anon;
revoke all on function public.titan_public_card_showcase(text) from public;
grant execute on function public.titan_showcase_v1() to authenticated;
grant execute on function public.titan_set_showcase_v1(text[]) to authenticated;
grant execute on function public.titan_public_card_showcase(text) to anon, authenticated;
