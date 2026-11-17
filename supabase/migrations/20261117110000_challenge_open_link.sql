-- AUD-22 (audit top app, 15/11/2026): a challenge anyone can join by link, without being friends first. titan_challenge_create requires
-- 1 to 10 friends, so the duel link (20261029160000_duel_links.sql) could only extend a challenge that already had a friend: the most
-- natural viral loop (« je te défie », sent on WhatsApp) was closed to newcomers. This adds ONE function that creates the challenge with its
-- creator only and returns its first one-use link, with exactly the same rules as before: same validation, same cleaning of the title,
-- same daily limit of 5 challenges (titan_social_rate_limit 'challenge_create'), same link limits (7 days, 5 live links, 20 a day),
-- suspended accounts refused. Joining still goes through titan_challenge_link_accept_v1 (sign in, accept, participant — not friend).
-- No XP, credit or prize is attached to a challenge.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_challenge_open_create_v1(text, text, text, numeric, integer);

create or replace function public.titan_challenge_open_create_v1(p_title text, p_metric text, p_sport text, p_target numeric, p_days integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_link jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = v_uid and coalesce(is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  if p_metric not in ('effort_minutes', 'active_days', 'distance_km', 'sessions') or coalesce(p_days, 0) not between 1 and 31
     or coalesce(p_target, 0) <= 0 or p_target > 100000 or (p_metric = 'distance_km' and coalesce(p_sport, '') = '') then
    raise exception 'CHALLENGE_INVALID' using errcode = '22023';
  end if;
  perform public.titan_social_rate_limit(v_uid, 'challenge_create', interval '1 day', 5);
  insert into public.titan_challenges(creator_id, title, metric, sport, target, starts_at, ends_at)
  values (v_uid, public.titan_clean_social_text(p_title, 'Défi', 60), p_metric,
          nullif(left(regexp_replace(coalesce(p_sport, ''), '[^a-z0-9_]', '', 'g'), 80), ''),
          case when p_metric in ('active_days', 'sessions') then ceil(p_target) else p_target end,
          now(), now() + make_interval(days => p_days))
  returning id into v_id;
  insert into public.titan_challenge_members(challenge_id, user_id, status, joined_at) values (v_id, v_uid, 'joined', now());
  insert into public.titan_social_action_log(actor_id, action) values (v_uid, 'challenge_create');
  v_link := public.titan_challenge_link_create_v1(v_id);
  return jsonb_build_object('id', v_id) || (v_link - 'id') || jsonb_build_object('invite', v_link -> 'id');
end;
$function$;

revoke all on function public.titan_challenge_open_create_v1(text, text, text, numeric, integer) from public, anon;
grant execute on function public.titan_challenge_open_create_v1(text, text, text, numeric, integer) to authenticated;
