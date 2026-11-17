-- Monetisation, lot C (21 November 2026): the routine library limit of the offers (5 named routines, 20 with TITAN+) is enforced by the server.
-- Until now only the website's dialog counted the routines; titan_save_profile_state copied game_state.user.gymRoutines through its
-- allowlist without any count, so any client (or a direct RPC call) could keep an unlimited library without TITAN+.
-- Rule: a save that makes the library longer than the cap AND longer than it already is keeps the stored library unchanged (the rest of
-- the save goes through; an offline phone never loses its other preferences). A library that is already larger, because TITAN+ ended, is
-- kept: routines stay loadable, replaceable and removable; nothing is deleted. TITAN+ eligibility is the one the server gates use
-- (is_elite, not refunded, not ended). A non-array value is ignored.
-- Same function as 20261005190000 otherwise, with the PT409 conflict code of 20261104085851. Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: re-apply public.titan_save_profile_state of 20261005190000.

create or replace function public.titan_save_profile_state(p_state jsonb, p_username text default null::text, p_avatar text default null::text, p_inventory jsonb default null::jsonb, p_privacy jsonb default null::jsonb, p_streak_count integer default null::integer, p_last_week_id text default null::text, p_last_seen_news_version text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_existing public.profiles%rowtype;
  v_state jsonb := coalesce(p_state, '{}'::jsonb);
  v_username text := coalesce(public.titan_clean_state_username(p_username), 'Agent');
  v_avatar text := null;
  v_inventory jsonb := coalesce(p_inventory, '{}'::jsonb);
  v_privacy jsonb := coalesce(p_privacy, '{}'::jsonb);
  v_streak integer := greatest(0, coalesce(p_streak_count, 0));
  v_last_week_id text := left(coalesce(p_last_week_id, ''), 32);
  v_news text := nullif(left(coalesce(p_last_seen_news_version, ''), 64), '');
  v_result public.profiles%rowtype;
  v_user jsonb;
  v_preferences jsonb;
  v_routine_cap integer;
  v_routines_before integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if jsonb_typeof(v_state) <> 'object' then
    raise exception 'STATE_MUST_BE_OBJECT' using errcode = '22023';
  end if;

  if octet_length(v_state::text) > 350000 then
    raise exception 'STATE_TOO_LARGE' using errcode = '54000';
  end if;

  if p_avatar ~* '^(avatar_[0-9]+\.(png|jpe?g|webp|gif)|[a-z0-9_-]+_[0-9]+\.(png|jpe?g|webp|gif))$' then
    v_avatar := p_avatar;
  end if;

  select *
  into v_existing
  from public.profiles
  where id = v_uid for update;

  if not found or coalesce(v_existing.is_suspended,false) then
    raise exception 'PROFILE_UNAVAILABLE' using errcode='42501';
  end if;
  if v_state #>> '{meta,profileVersion}' is not null and (v_state #>> '{meta,profileVersion}')::integer <> v_existing.state_version then
    raise exception 'PROFILE_VERSION_CONFLICT' using errcode='PT409';
  end if;
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_preferences
  from jsonb_each(coalesce(v_state->'user','{}'::jsonb)) where key in
    ('name','avatar','weeklyGoalSessions','favoriteSports','favorites','schedule','gymRoutines','goals','sportGoals','onboardingComplete','preferredSports','units','theme','notifications','lastSessionSummary','cadencePauses','onboardedAt');
  -- Routine library: 5 named routines, 20 with an eligible TITAN+ (the published offer). The server never lets the library GROW past the
  -- cap; a library already larger (TITAN+ ended) is kept as it is, routines can still be replaced or removed, nothing is ever deleted here.
  if jsonb_typeof(v_preferences->'gymRoutines') = 'array' then
    v_routine_cap := case when v_existing.is_elite is true and v_existing.elite_refunded_at is null
                           and (v_existing.elite_ends_at is null or v_existing.elite_ends_at > now()) then 20 else 5 end;
    v_routines_before := case when jsonb_typeof(v_existing.game_state #> '{user,gymRoutines}') = 'array'
                              then jsonb_array_length(v_existing.game_state #> '{user,gymRoutines}') else 0 end;
    if jsonb_array_length(v_preferences->'gymRoutines') > greatest(v_routine_cap, v_routines_before) then
      v_preferences := v_preferences - 'gymRoutines';
    end if;
  elsif v_preferences ? 'gymRoutines' and jsonb_typeof(v_preferences->'gymRoutines') <> 'null' then
    v_preferences := v_preferences - 'gymRoutines';
  end if;
  v_user := coalesce(v_existing.game_state->'user','{}'::jsonb) || v_preferences || jsonb_build_object(
    'id',v_uid,'isGuest',false,'xp',v_existing.xp,'credits',v_existing.credits,'level',v_existing.level,
    'is_elite',v_existing.is_elite,'is_tester',v_existing.is_tester,'is_suspended',v_existing.is_suspended,
    'inventory',v_existing.inventory,'unlockedTalents',to_jsonb(v_existing.unlocked_talents));
  v_state := coalesce(v_existing.game_state,'{}'::jsonb) || jsonb_build_object('user',v_user,
    'meta',jsonb_build_object('profileVersion',v_existing.state_version+1));
  v_inventory := coalesce(v_existing.inventory,'{}'::jsonb);
  v_streak := coalesce(v_existing.streak_count,0);
  v_privacy := coalesce(p_privacy,v_existing.privacy,'{}'::jsonb);
  insert into public.profiles (
    id,
    username,
    avatar,
    game_state,
    inventory,
    privacy,
    streak_count,
    last_week_id,
    last_seen_news_version,
    updated_at
  )
  values (
    v_uid,
    v_username,
    v_avatar,
    v_state,
    v_inventory,
    v_privacy,
    v_streak,
    v_last_week_id,
    v_news,
    now()
  )
  on conflict (id) do update set
    state_version = public.profiles.state_version + 1,
    username = excluded.username,
    avatar = coalesce(excluded.avatar, public.profiles.avatar),
    game_state = excluded.game_state,
    inventory = excluded.inventory,
    privacy = excluded.privacy,
    streak_count = excluded.streak_count,
    last_week_id = excluded.last_week_id,
    last_seen_news_version = coalesce(excluded.last_seen_news_version, public.profiles.last_seen_news_version),
    updated_at = now()
  returning *
  into v_result;

  return jsonb_build_object(
    'state_version', v_result.state_version,
    'id', v_result.id,
    'username', v_result.username,
    'avatar', v_result.avatar,
    'game_state', v_result.game_state,
    'inventory', v_result.inventory,
    'privacy', v_result.privacy,
    'streak_count', v_result.streak_count,
    'last_week_id', v_result.last_week_id,
    'last_seen_news_version', v_result.last_seen_news_version,
    'friend_code', v_result.friend_code,
    'credits', v_result.credits,
    'level', v_result.level,
    'xp', v_result.xp,
    'is_elite', coalesce(v_result.is_elite, false),
    'is_tester', coalesce(v_result.is_tester, false),
    'is_suspended', coalesce(v_result.is_suspended, false),
    'updated_at', v_result.updated_at
  );
end;
$function$;

notify pgrst, 'reload schema';
