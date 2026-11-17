-- Social excellence, lot D — « Depuis ta dernière visite » (docs/SOCIAL_EXCELLENCE.md). Applies after 20261120110000.
-- One read-only call that gathers what happened in one's circle since the last visit, so that reopening TITAN shows something worth it:
-- Moments friends CHOSE to share, encouragements received, friend requests, friends who were active (only those who allow it:
-- privacy.socialPresence), the cordées and how far they climbed, a summit to celebrate, the TITAN Duo, friends' challenges that ended,
-- shared memories (past summits) and one suggestion of a cordée whose pace fits what the player already does (never more).
-- Nothing is pushed: no notification, no e-mail, no counter of missed days; an empty digest is simply not shown by the clients.
-- Nothing is written except what the Duo and cordée reads already settle (a lapsed Duo, a cordée that summits), through their own functions.
-- The window is clamped to 1 hour .. 30 days (default 7 days). No XP, credit or reward. Additive.
-- The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_social_digest_v1(timestamptz).

create or replace function public.titan_social_digest_v1(p_since timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '8s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_since timestamptz;
  v_cordees jsonb;
  v_duo jsonb;
  v_friends integer;
  v_active28 integer;
  v_running integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  v_since := least(now() - interval '1 hour', greatest(now() - interval '30 days', coalesce(p_since, now() - interval '7 days')));
  -- Cordées first (this settles a summit that is due), then the Duo (this closes a lapsed pairing and keeps its result).
  v_cordees := coalesce(public.titan_cordees_v1() -> 'cordees', '[]'::jsonb);
  v_duo := case when to_regprocedure('public.titan_buddy_v1()') is not null then public.titan_buddy_v1() else null end;
  select count(*)::integer into v_friends
    from public.friendships f
   where (f.user_id_1 = v_uid or f.user_id_2 = v_uid) and f.status = 'accepted'
     and private.titan_are_friends(f.user_id_1, f.user_id_2);
  select count(*)::integer into v_active28 from private.titan_effort_days(v_uid, now() - interval '28 days', now() + interval '1 minute', '-infinity'::timestamptz, 90) d where d.minutes > 0;
  select count(*)::integer into v_running from jsonb_array_elements(v_cordees) c where c->>'status' = 'active' and c->>'myStatus' = 'joined';
  return jsonb_build_object(
    'since', v_since,
    'requestsIn', (select count(*) from public.friendships f where f.user_id_2 = v_uid and f.status = 'pending'
                     and f.created_at > now() - interval '30 days' and f.created_at > v_since),
    'cheersReceived', (select count(*) from public.titan_moment_cheers c join public.titan_moments m on m.id = c.moment_id
                         where m.user_id = v_uid and c.created_at > v_since and private.titan_are_friends(v_uid, c.user_id)),
    'friendMoments', jsonb_build_object(
      'count', (select count(*) from public.titan_moments m
                 where m.user_id <> v_uid and m.visibility = 'friends' and not m.hidden and m.created_at > v_since and private.titan_are_friends(v_uid, m.user_id)),
      'latest', coalesce((select jsonb_agg(x.j order by x.at desc) from (
          select m.created_at as at, jsonb_build_object('id', m.id, 'kind', m.kind, 'title', m.title, 'at', m.created_at,
                   'author', coalesce(nullif(p.username, ''), 'Athlète')) as j
            from public.titan_moments m join public.profiles p on p.id = m.user_id
           where m.user_id <> v_uid and m.visibility = 'friends' and not m.hidden and m.created_at > v_since and private.titan_are_friends(v_uid, m.user_id)
           order by m.created_at desc limit 3) x), '[]'::jsonb)),
    -- Only friends who allow it (privacy.socialPresence) and only that they were active, never what, where or how much.
    'friendsActive', coalesce((select jsonb_agg(x.name order by x.name) from (
        select distinct coalesce(nullif(p.username, ''), 'Athlète') as name
          from public.friendships f
          join public.profiles p on p.id = case when f.user_id_1 = v_uid then f.user_id_2 else f.user_id_1 end
         where (f.user_id_1 = v_uid or f.user_id_2 = v_uid) and f.status = 'accepted' and private.titan_are_friends(v_uid, p.id)
           and not coalesce(p.is_suspended, false) and coalesce((p.privacy ->> 'socialPresence')::boolean, false)
           and exists (select 1 from private.titan_confirmed_sessions(p.id, v_since, now() + interval '1 minute', '-infinity'::timestamptz))
         limit 8) x), '[]'::jsonb),
    'cordees', coalesce((select jsonb_agg(jsonb_build_object('id', c->>'id', 'route', c->>'route', 'status', c->>'status', 'myStatus', c->>'myStatus',
                 'percent', (c->>'percent')::integer, 'camps', (c->>'camps')::integer, 'total', (c->>'total')::integer, 'target', (c->>'target')::integer,
                 'mine', (c->'me'->>'counted')::integer, 'earned', (c->>'earned')::boolean,
                 'summitedSince', c->>'status' = 'summited' and (c->>'summitedAt')::timestamptz > v_since, 'endsAt', c->>'endsAt'))
               from jsonb_array_elements(v_cordees) c where c->>'myStatus' in ('joined', 'invited')), '[]'::jsonb),
    'duo', case
      when v_duo is null then null
      when v_duo->>'status' = 'active' then jsonb_build_object('status', 'active', 'partner', v_duo->'partner'->>'name', 'together', (v_duo->>'together')::integer,
             'target', (v_duo->>'target')::integer, 'daysLeft', (v_duo->>'daysLeft')::integer)
      when v_duo->>'status' = 'pending' and v_duo->>'role' = 'invitee' then jsonb_build_object('status', 'invited', 'partner', v_duo->'partner'->>'name')
      when v_duo->'last' is not null and v_duo->'last' <> 'null'::jsonb and ((v_duo->'last'->>'endsOn')::date + 1)::timestamp at time zone 'Europe/Paris' > v_since
        then jsonb_build_object('status', 'finished', 'partner', v_duo->'last'->'partner'->>'name', 'together', (v_duo->'last'->>'together')::integer,
             'target', (v_duo->'last'->>'target')::integer, 'reached', (v_duo->'last'->>'reached')::boolean)
      else null end,
    'challengesEnded', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'reached', r.reached) order by c.ends_at desc)
        from public.titan_challenges c
        join public.titan_challenge_members m on m.challenge_id = c.id and m.user_id = v_uid and m.status = 'joined'
        left join private.titan_challenge_results r on r.challenge_id = c.id and r.user_id = v_uid
       where c.kind = 'individual' and c.ends_at > v_since and c.ends_at <= now()), '[]'::jsonb),
    -- Shared memories: the last summits one took part in, more than a week ago.
    'memories', coalesce((select jsonb_agg(x.j order by x.at desc) from (
        select c.summited_at as at, jsonb_build_object('id', c.id, 'route', c.route, 'summitedAt', c.summited_at,
                 'members', (select count(*) from private.titan_challenge_results y where y.challenge_id = c.id)) as j
          from public.titan_challenges c join private.titan_challenge_results r on r.challenge_id = c.id and r.user_id = v_uid and r.reached
         where c.kind = 'cordee' and c.summited_at is not null and c.summited_at < now() - interval '7 days'
         order by c.summited_at desc limit 3) x), '[]'::jsonb),
    -- One suggestion, only when it can help: a pace that fits the last 28 days (never more than what was done), solo or with friends.
    'suggestion', case when v_running = 0 then jsonb_build_object('kind', 'cordee', 'activeDays28', v_active28,
        'pace', case when v_active28 >= 16 then 'soutenue' when v_active28 >= 8 then 'reguliere' else 'douce' end, 'friends', v_friends)
      else null end
  );
end;
$function$;
revoke all on function public.titan_social_digest_v1(timestamptz) from public, anon;
grant execute on function public.titan_social_digest_v1(timestamptz) to authenticated;

notify pgrst, 'reload schema';
