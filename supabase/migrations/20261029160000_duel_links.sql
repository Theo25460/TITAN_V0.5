-- V11-66 (COM-C1, COM-E2): duels between friends, and the invitation link. The friends' challenges of the social layer already carry the rules
-- (metric, sport, target, duration, up to 10 invited friends, accept/decline) and an honest server-side progress; this migration adds what was
-- missing for a duel:
--   * a one-use invitation LINK: a long random token (two random UUIDs, 244 bits) of which only the SHA-256 is stored, shown once to its creator,
--     valid at most 7 days and never after the challenge ends, revocable, at most 5 live links per challenge. It carries no personal data: its
--     public preview shows the rules (title, metric, sport, target, end date, number of participants) and never a name. Whoever opens it
--     signs in or signs up, then accepts: joining makes the player a participant (not a friend) and the link is spent. Any invalid, spent,
--     expired or revoked link answers the same "invalid", so nothing leaks;
--   * a FROZEN result: once the challenge has ended, the first participant who asks freezes everyone's final progress and whether the target
--     was reached, so the result never changes if a session is archived later. Only participants read it. No XP, credit or prize is attached.
-- Own links are never exported with their token (it is not stored); own results are exported (extras helper) and erased with the account.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_challenge_link_create_v1(uuid), public.titan_challenge_links_v1(), public.titan_challenge_link_revoke_v1(uuid),
-- public.titan_challenge_link_preview_v1(text), public.titan_challenge_link_accept_v1(text), public.titan_challenge_result_v1(uuid);
-- drop tables private.titan_challenge_results, private.titan_challenge_invites; then re-apply the extras helper of migration 48 (20261029150000_fair_ranking.sql).

create table if not exists private.titan_challenge_invites (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.titan_challenges(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists titan_challenge_invites_challenge_idx on private.titan_challenge_invites (challenge_id);
create index if not exists titan_challenge_invites_creator_idx on private.titan_challenge_invites (created_by);
create index if not exists titan_challenge_invites_used_by_idx on private.titan_challenge_invites (used_by);
create table if not exists private.titan_challenge_results (
  challenge_id uuid not null references public.titan_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  final_progress numeric not null,
  reached boolean not null,
  frozen_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index if not exists titan_challenge_results_user_idx on private.titan_challenge_results (user_id);
alter table private.titan_challenge_invites enable row level security;
alter table private.titan_challenge_results enable row level security;
revoke all on private.titan_challenge_invites, private.titan_challenge_results from public, anon, authenticated;

create or replace function public.titan_challenge_link_create_v1(p_challenge uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_c public.titan_challenges%rowtype;
  v_token text;
  v_id uuid;
  v_expires timestamptz;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  select * into v_c from public.titan_challenges where id = p_challenge and creator_id = v_uid;
  if not found then raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_c.ends_at <= now() then raise exception 'CHALLENGE_ENDED' using errcode = '22023'; end if;
  if (select count(*) from private.titan_challenge_invites i where i.challenge_id = p_challenge and i.revoked_at is null and i.used_at is null and i.expires_at > now()) >= 5 then
    raise exception 'LINK_LIMIT_5' using errcode = '22023';
  end if;
  perform public.titan_social_rate_limit(v_uid, 'challenge_link', interval '1 day', 20);
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires := least(v_c.ends_at, now() + interval '7 days');
  insert into private.titan_challenge_invites (challenge_id, token_hash, created_by, expires_at)
  values (p_challenge, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_uid, v_expires) returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token, 'expiresAt', v_expires);
end;
$function$;

-- The creator's running challenges with their live links (no token), and the recent finished ones the player took part in.
create or replace function public.titan_challenge_links_v1()
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
  return jsonb_build_object(
    'mine', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'endsAt', c.ends_at,
               'links', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'expiresAt', i.expires_at, 'used', i.used_at is not null) order by i.created_at)
                                    from private.titan_challenge_invites i where i.challenge_id = c.id and i.revoked_at is null and (i.used_at is not null or i.expires_at > now())), '[]'::jsonb))
               order by c.ends_at)
        from public.titan_challenges c where c.creator_id = v_uid and c.ends_at > now()), '[]'::jsonb),
    'ended', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'endedAt', c.ends_at) order by c.ends_at desc)
        from public.titan_challenges c join public.titan_challenge_members m on m.challenge_id = c.id and m.user_id = v_uid and m.status = 'joined'
       where c.ends_at <= now() and c.ends_at > now() - interval '14 days'), '[]'::jsonb));
end;
$function$;

create or replace function public.titan_challenge_link_revoke_v1(p_invite uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  update private.titan_challenge_invites set revoked_at = now() where id = p_invite and created_by = auth.uid() and revoked_at is null and used_at is null;
  return found;
end;
$function$;

-- Public preview: rules only, never a name, the same answer for every kind of invalid link.
create or replace function public.titan_challenge_link_preview_v1(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_i private.titan_challenge_invites%rowtype;
  v_c public.titan_challenges%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('valid', false); end if;
  select * into v_i from private.titan_challenge_invites where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found or v_i.revoked_at is not null or v_i.used_at is not null or v_i.expires_at <= now() then return jsonb_build_object('valid', false); end if;
  select * into v_c from public.titan_challenges where id = v_i.challenge_id and ends_at > now();
  if not found then return jsonb_build_object('valid', false); end if;
  return jsonb_build_object('valid', true, 'title', v_c.title, 'metric', v_c.metric, 'sport', v_c.sport, 'target', v_c.target, 'endsAt', v_c.ends_at,
    'participants', (select count(*) from public.titan_challenge_members m where m.challenge_id = v_c.id and m.status = 'joined'));
end;
$function$;

create or replace function public.titan_challenge_link_accept_v1(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_i private.titan_challenge_invites%rowtype;
  v_c public.titan_challenges%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'LINK_INVALID' using errcode = '22023'; end if;
  perform public.titan_social_rate_limit(v_uid, 'challenge_link_accept', interval '1 day', 30);
  select * into v_i from private.titan_challenge_invites where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found or v_i.revoked_at is not null or v_i.used_at is not null or v_i.expires_at <= now() then raise exception 'LINK_INVALID' using errcode = '22023'; end if;
  select * into v_c from public.titan_challenges where id = v_i.challenge_id and ends_at > now();
  if not found then raise exception 'LINK_INVALID' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false)) then raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501'; end if;
  if v_c.creator_id = v_uid then raise exception 'LINK_OWN_CHALLENGE' using errcode = '22023'; end if;
  if exists (select 1 from public.titan_user_blocks k where (k.blocker_id = v_c.creator_id and k.blocked_id = v_uid) or (k.blocker_id = v_uid and k.blocked_id = v_c.creator_id)) then
    raise exception 'LINK_INVALID' using errcode = '22023';
  end if;
  if (select count(*) from public.titan_challenge_members m where m.challenge_id = v_c.id and m.status = 'joined') >= 10 then raise exception 'CHALLENGE_FULL' using errcode = '22023'; end if;
  insert into public.titan_challenge_members (challenge_id, user_id, status, joined_at) values (v_c.id, v_uid, 'joined', now())
  on conflict (challenge_id, user_id) do update set status = 'joined', joined_at = now() where public.titan_challenge_members.status in ('invited', 'declined', 'left');
  update private.titan_challenge_invites set used_by = v_uid, used_at = now() where id = v_i.id;
  return jsonb_build_object('challenge', v_c.id, 'title', v_c.title);
end;
$function$;

-- The frozen result of a finished challenge, for its participants only.
create or replace function public.titan_challenge_result_v1(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '15s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_c public.titan_challenges%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_c from public.titan_challenges where id = p_id;
  if not found or not exists (select 1 from public.titan_challenge_members m where m.challenge_id = p_id and m.user_id = v_uid and m.status = 'joined') then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_c.ends_at > now() then raise exception 'CHALLENGE_RUNNING' using errcode = '22023'; end if;
  insert into private.titan_challenge_results (challenge_id, user_id, final_progress, reached)
  select p_id, m.user_id, private.titan_challenge_progress(p_id, m.user_id), private.titan_challenge_progress(p_id, m.user_id) >= v_c.target
    from public.titan_challenge_members m where m.challenge_id = p_id and m.status = 'joined'
  on conflict do nothing;
  return jsonb_build_object('title', v_c.title, 'metric', v_c.metric, 'target', v_c.target, 'endedAt', v_c.ends_at, 'results', coalesce((
    select jsonb_agg(jsonb_build_object('name', coalesce(p.username, 'Athlète'), 'progress', r.final_progress, 'reached', r.reached, 'me', r.user_id = v_uid) order by r.final_progress desc, p.username)
      from private.titan_challenge_results r left join public.profiles p on p.id = r.user_id where r.challenge_id = p_id), '[]'::jsonb));
end;
$function$;

revoke all on function public.titan_challenge_link_create_v1(uuid), public.titan_challenge_links_v1(), public.titan_challenge_link_revoke_v1(uuid),
  public.titan_challenge_link_preview_v1(text), public.titan_challenge_link_accept_v1(text), public.titan_challenge_result_v1(uuid) from public, anon;
grant execute on function public.titan_challenge_link_create_v1(uuid), public.titan_challenge_links_v1(), public.titan_challenge_link_revoke_v1(uuid),
  public.titan_challenge_link_accept_v1(text), public.titan_challenge_result_v1(uuid) to authenticated;
grant execute on function public.titan_challenge_link_preview_v1(text) to anon, authenticated;

-- The export gains the account's own challenge results (links are not exported: only their hash is kept, and it is not personal data).
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
                                from private.titan_daily_intents i where i.user_id = p_uid), '[]'::jsonb),
    'commonQuests', coalesce((select jsonb_agg(jsonb_build_object('quest_id', m.quest_id, 'week_start', q.week_start, 'joined_at', m.joined_at) order by m.joined_at)
                                from private.titan_common_quest_members m join private.titan_common_quests q on q.id = m.quest_id where m.user_id = p_uid), '[]'::jsonb),
    'buddies', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'role', case when b.inviter_id = p_uid then 'inviter' else 'invitee' end, 'status', b.status,
                           'starts_on', b.starts_on, 'ends_on', b.ends_on, 'ended_at', b.ended_at) order by b.created_at)
                           from private.titan_buddies b where p_uid in (b.inviter_id, b.invitee_id)), '[]'::jsonb),
    'seasons', coalesce((select jsonb_agg(jsonb_build_object('season_id', m.season_id, 'name', s.name, 'starts_on', s.starts_on, 'joined_at', m.joined_at,
                           'final_minutes', m.final_minutes, 'final_days', m.final_days) order by s.starts_on)
                           from private.titan_season_members m join private.titan_seasons s on s.id = m.season_id where m.user_id = p_uid), '[]'::jsonb),
    'rankingOptIn', coalesce((select jsonb_build_object('since', o.since) from private.titan_ranking_optin o where o.user_id = p_uid), 'null'::jsonb),
    'challengeResults', coalesce((select jsonb_agg(jsonb_build_object('challenge_id', r.challenge_id, 'final_progress', r.final_progress, 'reached', r.reached, 'frozen_at', r.frozen_at) order by r.frozen_at)
                                    from private.titan_challenge_results r where r.user_id = p_uid), '[]'::jsonb));
$function$;
revoke all on function private.titan_export_extras_v1(uuid) from public, anon, authenticated;
