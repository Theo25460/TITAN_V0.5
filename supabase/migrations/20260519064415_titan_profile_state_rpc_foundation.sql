-- TITAN OS - Cloud profile state authority foundation
-- Keeps the cross-device player state behind a dedicated authenticated RPC.

alter table public.profiles add column if not exists game_state jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists inventory jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists privacy jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists streak_count integer default 0;
alter table public.profiles add column if not exists last_week_id text default '';
alter table public.profiles add column if not exists last_seen_news_version text;
alter table public.profiles add column if not exists updated_at timestamptz default now();

create or replace function public.titan_clean_state_username(p_value text)
returns text
language sql
immutable
as $$
  select left(
    nullif(
      btrim(
        regexp_replace(
          regexp_replace(coalesce(p_value, 'Agent'), '[[:cntrl:]<>"`{}]', '', 'g'),
          '\s+',
          ' ',
          'g'
        )
      ),
      ''
    ),
    24
  );
$$;

create or replace function public.titan_save_profile_state(
  p_state jsonb,
  p_username text default null,
  p_avatar text default null,
  p_inventory jsonb default null,
  p_privacy jsonb default null,
  p_streak_count integer default null,
  p_last_week_id text default null,
  p_last_seen_news_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  where id = v_uid;

  v_state := jsonb_set(v_state, '{user,id}', to_jsonb(v_uid::text), true);
  v_state := jsonb_set(v_state, '{user,isGuest}', 'false'::jsonb, true);
  v_state := jsonb_set(v_state, '{user,is_elite}', to_jsonb(coalesce(v_existing.is_elite, false)), true);
  v_state := jsonb_set(v_state, '{user,is_tester}', to_jsonb(coalesce(v_existing.is_tester, false)), true);
  v_state := jsonb_set(v_state, '{user,is_suspended}', to_jsonb(coalesce(v_existing.is_suspended, false)), true);

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
$$;

revoke all on function public.titan_clean_state_username(text) from public;
revoke all on function public.titan_save_profile_state(jsonb, text, text, jsonb, jsonb, integer, text, text) from public;
grant execute on function public.titan_save_profile_state(jsonb, text, text, jsonb, jsonb, integer, text, text) to authenticated;
