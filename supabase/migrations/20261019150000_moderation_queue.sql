-- BOT03 / BOT05 / BOT06 (partial) / BOT09: an explainable review queue and human, reversible decisions.
-- Server side only and additive: no existing table, column, grant or RPC changes. Nothing here is
-- automatic: signals alone never alter an account, and no decision touches XP, credits, rewards or
-- rankings. A permanent ban is deliberately not an available decision (BOT07).
-- The score is computed on demand from open rows of titan_suspicious_actions raised in the last 30 days.
-- Per distinct reason it is weight(highest severity) x min(occurrences, 3), with weights low 1, medium 3,
-- high 8, critical 20, so a heavy trainer who trips the same soft signal fifty times weighs three points.
-- Levels: low < 8 <= watch < 20 <= review < 40 <= urgent.
-- Only administrators (private.titan_is_admin, read from the profile) can read the queue or decide.
-- The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: docs/CDC_WEB_MODERATION_QUEUE_HANDOFF_2026-10-19.md.

create table if not exists private.titan_moderation_decisions (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  admin_id uuid references auth.users(id) on delete set null,
  decision text not null check (decision in ('dismiss', 'watch', 'suspend', 'restore', 'revert')),
  reason text not null check (char_length(reason) between 3 and 500),
  reverts bigint unique references private.titan_moderation_decisions(id),
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object')
);
create index if not exists titan_moderation_decisions_user_idx on private.titan_moderation_decisions (user_id, id desc);
create index if not exists titan_moderation_decisions_admin_idx on private.titan_moderation_decisions (admin_id) where admin_id is not null;
alter table private.titan_moderation_decisions enable row level security;
revoke all on table private.titan_moderation_decisions from public, anon, authenticated;

-- Append-only; the only permitted update detaches an entry from an account that no longer exists.
create or replace function private.titan_moderation_decisions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'user_id' - 'admin_id') = (to_jsonb(old) - 'user_id' - 'admin_id')
     and (new.user_id is not distinct from old.user_id
       or (new.user_id is null and not exists (select 1 from auth.users u where u.id = old.user_id)))
     and (new.admin_id is not distinct from old.admin_id
       or (new.admin_id is null and not exists (select 1 from auth.users u where u.id = old.admin_id))) then
    return new;
  end if;
  raise exception 'MODERATION_APPEND_ONLY' using errcode = '42501';
end;
$function$;
revoke all on function private.titan_moderation_decisions_guard() from public, anon, authenticated;

do $$
declare previous_lock_timeout text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '5s', true);
  if not exists (select 1 from pg_trigger where tgrelid = 'private.titan_moderation_decisions'::regclass
      and tgname = 'titan_moderation_decisions_row_guard') then
    create trigger titan_moderation_decisions_row_guard
      before update or delete on private.titan_moderation_decisions
      for each row execute function private.titan_moderation_decisions_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'private.titan_moderation_decisions'::regclass
      and tgname = 'titan_moderation_decisions_truncate_guard') then
    create trigger titan_moderation_decisions_truncate_guard
      before truncate on private.titan_moderation_decisions
      for each statement execute function private.titan_moderation_decisions_guard();
  end if;
  perform set_config('lock_timeout', previous_lock_timeout, true);
end $$;

-- One line per account and reason, with the points it adds.
create or replace function private.titan_moderation_signals(p_user uuid default null)
returns table (user_id uuid, reason text, severity text, occurrences integer, points integer, first_at timestamptz, last_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select s.user_id, s.reason,
    (array_agg(s.severity order by case s.severity when 'critical' then 4 when 'high' then 3 when 'medium' then 2 else 1 end desc))[1],
    count(*)::integer,
    (case max(case s.severity when 'critical' then 20 when 'high' then 8 when 'medium' then 3 else 1 end) when null then 0
      else max(case s.severity when 'critical' then 20 when 'high' then 8 when 'medium' then 3 else 1 end) end
      * least(count(*), 3))::integer,
    min(s.created_at), max(s.created_at)
  from public.titan_suspicious_actions s
  where s.status = 'open' and s.user_id is not null
    and s.created_at > now() - interval '30 days'
    and (p_user is null or s.user_id = p_user)
  group by s.user_id, s.reason;
$function$;
revoke all on function private.titan_moderation_signals(uuid) from public, anon, authenticated;

create or replace function private.titan_moderation_level(p_score integer)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case when p_score >= 40 then 'urgent' when p_score >= 20 then 'review' when p_score >= 8 then 'watch' else 'low' end;
$function$;
revoke all on function private.titan_moderation_level(integer) from public, anon, authenticated;

create or replace function private.titan_moderation_require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := auth.uid();
begin
  if v_admin is null or not private.titan_is_admin(v_admin) then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;
  return v_admin;
end;
$function$;
revoke all on function private.titan_moderation_require_admin() from public, anon, authenticated;

-- The review queue: accounts with open signals, highest risk first, every point explained.
create or replace function public.titan_moderation_queue_v1(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  perform private.titan_moderation_require_admin();
  return jsonb_build_object(
    'version', 1,
    'limit', v_limit,
    'generated_at', now(),
    'entries', coalesce((
      select jsonb_agg(q.entry order by q.score desc, q.user_id)
      from (
        select t.user_id, t.score, jsonb_build_object(
          'user_id', t.user_id,
          'username', p.username,
          'status', p.status,
          'score', t.score,
          'level', private.titan_moderation_level(t.score),
          'signals', t.signals,
          'last_decision', (select jsonb_build_object('id', d.id, 'decision', d.decision, 'at', d.at)
            from private.titan_moderation_decisions d where d.user_id = t.user_id order by d.id desc limit 1)
        ) as entry
        from (
          select g.user_id, sum(g.points)::integer as score,
            jsonb_agg(jsonb_build_object('reason', g.reason, 'severity', g.severity, 'count', g.occurrences,
              'points', g.points, 'first_at', g.first_at, 'last_at', g.last_at) order by g.points desc, g.reason) as signals
          from private.titan_moderation_signals(null) g group by g.user_id
        ) t
        join public.profiles p on p.id = t.user_id
        order by t.score desc, t.user_id limit v_limit
      ) q), '[]'::jsonb));
end;
$function$;

-- The case file of one account: score, signals, the raw recent signals and the decisions taken.
create or replace function public.titan_moderation_case_v1(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_profile record;
  v_score integer;
begin
  perform private.titan_moderation_require_admin();
  select id, username, status, is_suspended into v_profile from public.profiles where id = p_user;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  select coalesce(sum(g.points), 0)::integer into v_score from private.titan_moderation_signals(p_user) g;
  return jsonb_build_object(
    'version', 1,
    'user', jsonb_build_object('id', v_profile.id, 'username', v_profile.username, 'status', v_profile.status,
      'is_suspended', v_profile.is_suspended),
    'score', v_score,
    'level', private.titan_moderation_level(v_score),
    'signals', coalesce((select jsonb_agg(jsonb_build_object('reason', g.reason, 'severity', g.severity,
      'count', g.occurrences, 'points', g.points, 'first_at', g.first_at, 'last_at', g.last_at) order by g.points desc, g.reason)
      from private.titan_moderation_signals(p_user) g), '[]'::jsonb),
    'signals_recent', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'at', r.created_at, 'action_type', r.action_type,
      'severity', r.severity, 'reason', r.reason, 'status', r.status, 'payload', r.payload) order by r.created_at desc, r.id)
      from (select * from public.titan_suspicious_actions s where s.user_id = p_user
        order by s.created_at desc, s.id limit 20) r), '[]'::jsonb),
    'decisions', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'at', d.at, 'admin_id', d.admin_id,
      'decision', d.decision, 'reason', d.reason, 'reverts', d.reverts) order by d.id desc)
      from (select * from private.titan_moderation_decisions x where x.user_id = p_user
        order by x.id desc limit 20) d), '[]'::jsonb));
end;
$function$;

-- A human decision, recorded before anything else changes, with what is needed to undo it.
create or replace function public.titan_moderation_decide_v1(p_user uuid, p_decision text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := private.titan_moderation_require_admin();
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_profile record;
  v_ids uuid[];
  v_snapshot jsonb := '{}'::jsonb;
  v_id bigint;
begin
  if p_decision is null or p_decision not in ('dismiss', 'watch', 'suspend', 'restore') then
    raise exception 'UNKNOWN_DECISION' using errcode = '22023';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if p_user is null or p_user = v_admin then
    raise exception 'CANNOT_MODERATE_SELF' using errcode = '42501';
  end if;
  select id, status, is_suspended into v_profile from public.profiles where id = p_user for update;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if private.titan_is_admin(p_user) then
    raise exception 'CANNOT_MODERATE_ADMIN' using errcode = '42501';
  end if;

  if p_decision = 'suspend' then
    if coalesce(v_profile.is_suspended, false) or v_profile.status in ('suspended', 'banned') then
      raise exception 'ALREADY_SUSPENDED' using errcode = '23514';
    end if;
    v_snapshot := jsonb_build_object('prev_status', v_profile.status);
    perform public.titan_admin_update_profile_v1(p_user, jsonb_build_object('status', 'suspended'), v_reason);
  elsif p_decision = 'restore' then
    if v_profile.status <> 'suspended' then
      raise exception 'NOT_SUSPENDED' using errcode = '23514';
    end if;
    v_snapshot := jsonb_build_object('prev_status', v_profile.status);
    perform public.titan_admin_update_profile_v1(p_user, jsonb_build_object('status', 'active'), v_reason);
  elsif p_decision = 'dismiss' then
    select coalesce(array_agg(s.id), '{}') into v_ids from public.titan_suspicious_actions s
      where s.user_id = p_user and s.status = 'open';
    update public.titan_suspicious_actions s
      set status = 'reviewed', reviewed_at = now(), reviewed_by = v_admin, review_note = v_reason
      where s.id = any(v_ids);
    v_snapshot := jsonb_build_object('action_ids', to_jsonb(v_ids));
  end if;

  insert into private.titan_moderation_decisions(user_id, admin_id, decision, reason, snapshot)
  values (p_user, v_admin, p_decision, v_reason, v_snapshot) returning id into v_id;
  return jsonb_build_object('version', 1, 'decision_id', v_id, 'decision', p_decision, 'user_id', p_user);
end;
$function$;

-- Undo the latest decision on an account: lift or re-apply a suspension, reopen dismissed signals.
create or replace function public.titan_moderation_revert_v1(p_decision_id bigint, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := private.titan_moderation_require_admin();
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_target private.titan_moderation_decisions%rowtype;
  v_profile record;
  v_id bigint;
begin
  if char_length(v_reason) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  select * into v_target from private.titan_moderation_decisions where id = p_decision_id;
  if not found then
    raise exception 'DECISION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_target.decision = 'revert' or exists (select 1 from private.titan_moderation_decisions r where r.reverts = v_target.id) then
    raise exception 'NOT_REVERTIBLE' using errcode = '23514';
  end if;
  if v_target.user_id is null then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  select id, status into v_profile from public.profiles where id = v_target.user_id for update;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_target.id <> (select max(d.id) from private.titan_moderation_decisions d where d.user_id = v_target.user_id) then
    raise exception 'NOT_LATEST_DECISION' using errcode = '23514';
  end if;

  if v_target.decision = 'suspend' then
    perform public.titan_admin_update_profile_v1(v_target.user_id,
      jsonb_build_object('status', coalesce(v_target.snapshot ->> 'prev_status', 'active')), v_reason);
  elsif v_target.decision = 'restore' then
    perform public.titan_admin_update_profile_v1(v_target.user_id, jsonb_build_object('status', 'suspended'), v_reason);
  elsif v_target.decision = 'dismiss' then
    update public.titan_suspicious_actions s
      set status = 'open', reviewed_at = null, reviewed_by = null, review_note = null
      where s.user_id = v_target.user_id and s.status = 'reviewed'
        and s.id in (select (jsonb_array_elements_text(v_target.snapshot -> 'action_ids'))::uuid);
  end if;

  insert into private.titan_moderation_decisions(user_id, admin_id, decision, reason, reverts, snapshot)
  values (v_target.user_id, v_admin, 'revert', v_reason, v_target.id, jsonb_build_object('of', v_target.decision))
  returning id into v_id;
  return jsonb_build_object('version', 1, 'decision_id', v_id, 'decision', 'revert', 'reverts', v_target.id);
end;
$function$;

revoke all on function public.titan_moderation_queue_v1(integer) from public, anon;
revoke all on function public.titan_moderation_case_v1(uuid) from public, anon;
revoke all on function public.titan_moderation_decide_v1(uuid, text, text) from public, anon;
revoke all on function public.titan_moderation_revert_v1(bigint, text) from public, anon;
grant execute on function public.titan_moderation_queue_v1(integer) to authenticated;
grant execute on function public.titan_moderation_case_v1(uuid) to authenticated;
grant execute on function public.titan_moderation_decide_v1(uuid, text, text) to authenticated;
grant execute on function public.titan_moderation_revert_v1(bigint, text) to authenticated;
