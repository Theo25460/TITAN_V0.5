-- V1.1 FIN-SEC: close two legacy social RPC privacy bypasses.
-- Same signatures and API grants; no account/session rewrite. Caller owns transaction.
-- Search must respect the discovery consent already enforced by titan_social_request.
-- Lists must wait for friendship acceptance and fail closed for missing privacy flags.
-- No Supabase CLI is installed here; next unused UTC version follows routes at 20261102120000.
-- Rollback containment: revoke execute on function public.titan_find_profile_by_friend_code(text),
-- public.titan_list_my_friends() from authenticated; restoring old bodies reopens privacy leaks.

CREATE OR REPLACE FUNCTION public.titan_find_profile_by_friend_code(p_friend_code text)
 RETURNS TABLE(id uuid, username text, friend_code text, level integer, avatar text, is_elite boolean, is_suspended boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return query
  select p.id, p.username, p.friend_code,
    case when coalesce((p.privacy->>'showStats')::boolean, false) then p.level else 1 end,
    p.avatar, p.is_elite, p.is_suspended
  from public.profiles p
  where p.friend_code = upper(trim(p_friend_code))
    and coalesce((p.privacy->>'publicProfile')::boolean, false)
    and not coalesce(p.is_suspended, false)
    and not exists (
      select 1 from public.titan_user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  limit 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.titan_list_my_friends()
 RETURNS TABLE(id uuid, username text, friend_code text, level integer, avatar text, is_elite boolean, is_suspended boolean, total_sessions integer, fav_sport text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return query
  with friend_ids as (
    select case when f.user_id_1 = auth.uid() then f.user_id_2 else f.user_id_1 end as friend_id
    from public.friendships f
    where (f.user_id_1 = auth.uid() or f.user_id_2 = auth.uid())
      and coalesce(f.status, 'accepted') = 'accepted'
  ),
  sport_counts as (
    select tl.user_id, tl.sport, count(*) as n
    from public.training_logs tl
    join friend_ids fi on fi.friend_id = tl.user_id
    group by tl.user_id, tl.sport
  ),
  fav as (
    select distinct on (user_id) user_id, sport
    from sport_counts
    order by user_id, n desc, sport asc
  )
  select
    p.id,
    case when coalesce((p.privacy->>'publicProfile')::boolean, false) then p.username else 'Agent prive' end as username,
    case when coalesce((p.privacy->>'publicProfile')::boolean, false) then p.friend_code else null end as friend_code,
    case when coalesce((p.privacy->>'showStats')::boolean, false) then p.level else 1 end as level,
    case when coalesce((p.privacy->>'publicProfile')::boolean, false) then p.avatar else null end as avatar,
    p.is_elite,
    p.is_suspended,
    case when coalesce((p.privacy->>'showStats')::boolean, false) then count(tl.id)::integer else 0 end as total_sessions,
    case when coalesce((p.privacy->>'showStats')::boolean, false) then fav.sport else null end as fav_sport
  from friend_ids f
  join public.profiles p on p.id = f.friend_id
  left join public.training_logs tl on tl.user_id = p.id
  left join fav on fav.user_id = p.id
  where private.titan_are_friends(auth.uid(), p.id)
    and coalesce(p.is_suspended, false) is false
    and not exists (
      select 1 from public.titan_user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
    and coalesce((p.privacy->>'socialPresence')::boolean, false) is true
  group by p.id, p.username, p.friend_code, p.level, p.avatar, p.is_elite, p.is_suspended, p.privacy, fav.sport
  order by p.level desc nulls last, p.username asc nulls last;
end;
$function$
;
