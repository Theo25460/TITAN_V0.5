-- V11-80 (COACH-01, COACH-02, COACH-09): the Coach plans and their included seats, built on the existing entitlement ledger (migration 20261020020000).
-- Offers decided in the specification: TITAN Coach (20 euros a month: the coach and 5 athletes with Titan+ included while linked) and TITAN Coach Pro
-- (40 euros a month: the coach and 15 athletes), same professional features, only the number of places differs. NOTHING is priced or activated here:
-- a plan exists for a coach only when an ACTIVE paid entitlement of that coach (Google Play or Paddle, already recorded by the billing functions)
-- carries a product that the team has mapped to a plan in private.titan_plan_products; with no mapping nobody has a plan and no seat is ever granted.
-- Seats: the athletes with an accepted, unrevoked link, oldest first, up to the number of places. Each seat is one row of the ledger with the new source
-- 'coach' (external id "coach:athlete"), so the player's own subscription, purchases and rewards are never touched and the player returns to their personal
-- rights as soon as the seat ends (link revoked by either side, plan ended, payment refused or refunded, plan downgraded). The coach row never replaces the
-- player's own subscription in the profile summary. The sync runs inside the same transaction as the event that changes the situation (accepting or revoking a
-- link, a billing event on the coach), under a per-coach advisory lock, and an hourly sweep (pg_cron when present) closes seats whose plan ended without any event.
-- Capacity: a coach with an active plan has exactly the places of the plan; a coach without a plan keeps the legacy capacity of the published V1 (3, or 20 with a
-- personal Titan+ subscription: a seat included by another coach does not count). Replacing athletes is allowed; the accepted links of a coach over a rolling
-- 30 days are limited to twice the places (at least 6) so a seat cannot be rented out in rotation.
-- Own state is readable through public.titan_my_plan_v1(). The team maps products with public.titan_plan_product_set_v1 (administrators only).
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop trigger titan_entitlements_coach_hook on private.titan_entitlements; drop function public.titan_my_plan_v1(), public.titan_plan_product_set_v1(text,text),
-- public.titan_plan_product_list_v1(), public.titan_coach_seats_sweep_v1(), private.titan_coach_seats_sweep(), private.titan_entitlements_coach_hook(),
-- private.titan_coach_sync_seats(uuid), private.titan_coach_seat_write(uuid,uuid,boolean,timestamptz), private.titan_entitlement_refresh_profile(uuid),
-- private.titan_coach_capacity(uuid), private.titan_coach_plan(uuid); update private.titan_entitlements set is_active=false where source='coach' (then refresh profiles);
-- delete from private.titan_entitlements where source='coach'; drop table private.titan_plan_products; restore the check on private.titan_entitlements.source
-- (paddle, google_play, manual); re-apply titan_coach_portal of 20260913134828 and titan_apply_entitlement_v1 of 20261020020000.

alter table private.titan_entitlements drop constraint if exists titan_entitlements_source_check;
alter table private.titan_entitlements add constraint titan_entitlements_source_check check (source in ('paddle', 'google_play', 'manual', 'coach'));

-- The billing guard refuses any change of the elite_* columns that comes from a player's request. The seat functions below are server code that changes them on
-- behalf of OTHER accounts while a player's request is running (accepting or revoking a link), so they announce themselves with a transaction-local setting that no
-- API call can set; everything else about the guard is unchanged.
create or replace function private.titan_guard_billing_fields()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare k text; v jsonb;
begin
  if coalesce(auth.role(),'') in ('authenticated','anon') and coalesce(current_setting('titan.billing_write', true), '') <> 'coach_seat' then
    for k,v in select key,value from jsonb_each(to_jsonb(old)) where left(key,6)='elite_'
    loop
      if to_jsonb(new)->k is distinct from v then
        raise exception 'BILLING_FIELDS_READ_ONLY' using errcode='42501';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

-- The profile progression guard refuses a request that writes ANOTHER account's profile unless it is the administrator RPC; the seat functions are the second exception.
-- They return before the rest of the checks only for the billing summary they just wrote (the same function body otherwise).
create or replace function public.titan_guard_profile_progression()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_payload jsonb;
  v_credit_delta integer;
  v_level_delta integer;
  v_state_bytes integer;
  v_admin_rpc boolean := false;
begin
  if auth.uid() is not null and new.id <> auth.uid() then
    v_admin_rpc := coalesce(current_setting('titan.admin_profile_write', true), '') = 'on'
      and private.titan_is_admin(auth.uid());
    -- The seat functions of migration 56 (a coach plan includes Titan+ for the athletes it follows) write the billing summary of another account.
    if coalesce(current_setting('titan.billing_write', true), '') = 'coach_seat' then
      return new;
    end if;
    if not v_admin_rpc then
      raise exception 'PROFILE_USER_MISMATCH' using errcode = '42501';
    end if;
  end if;

  new.credits := coalesce(new.credits, old.credits, 0);
  new.level := coalesce(new.level, old.level, 1);
  new.game_state := coalesce(new.game_state, old.game_state, '{}'::jsonb);
  new.username := nullif(left(trim(regexp_replace(coalesce(new.username, old.username, 'Agent'), '[[:cntrl:]<>]', '', 'g')), 24), '');
  if new.username is null then
    new.username := 'Agent';
  end if;
  if new.avatar is not null and new.avatar !~* '^avatar_[0-9]+\.png$' then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.flagged', 'medium', 'PROFILE_AVATAR_INVALID', jsonb_build_object('avatar', new.avatar));
    new.avatar := old.avatar;
  end if;
  v_credit_delta := new.credits - coalesce(old.credits, 0);
  v_level_delta := new.level - coalesce(old.level, 1);
  v_state_bytes := octet_length(new.game_state::text);

  v_payload := jsonb_build_object(
    'profileId', new.id,
    'oldCredits', old.credits,
    'newCredits', new.credits,
    'creditDelta', v_credit_delta,
    'oldLevel', old.level,
    'newLevel', new.level,
    'levelDelta', v_level_delta,
    'gameStateBytes', v_state_bytes
  );

  if new.credits < 0 or new.credits > 100000000 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'critical', 'PROFILE_CREDITS_OUT_OF_RANGE', v_payload);
    if v_admin_rpc then raise exception 'PROFILE_UPDATE_REJECTED' using errcode = '22023', detail = 'PROFILE_CREDITS_OUT_OF_RANGE'; end if;
    return old;
  end if;

  if new.level < 1 or new.level > 500 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'critical', 'PROFILE_LEVEL_OUT_OF_RANGE', v_payload);
    if v_admin_rpc then raise exception 'PROFILE_UPDATE_REJECTED' using errcode = '22023', detail = 'PROFILE_LEVEL_OUT_OF_RANGE'; end if;
    return old;
  end if;

  if v_state_bytes > 500000 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'high', 'PROFILE_GAME_STATE_TOO_LARGE', v_payload);
    if v_admin_rpc then raise exception 'PROFILE_UPDATE_REJECTED' using errcode = '22023', detail = 'PROFILE_GAME_STATE_TOO_LARGE'; end if;
    return old;
  end if;

  if v_credit_delta > 50000 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'high', 'PROFILE_CREDITS_JUMP', v_payload);
    if v_admin_rpc then raise exception 'PROFILE_UPDATE_REJECTED' using errcode = '22023', detail = 'PROFILE_CREDITS_JUMP'; end if;
    return old;
  end if;

  if v_level_delta > 10 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'high', 'PROFILE_LEVEL_JUMP', v_payload);
    if v_admin_rpc then raise exception 'PROFILE_UPDATE_REJECTED' using errcode = '22023', detail = 'PROFILE_LEVEL_JUMP'; end if;
    return old;
  end if;

  if v_credit_delta > 15000 or v_level_delta > 3 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.flagged', 'medium', 'PROFILE_PROGRESS_REVIEW_RECOMMENDED', v_payload);
  end if;

  return new;
end;
$function$;

-- Third guard on the same columns: for a request that is neither the service role nor an administrator it puts is_elite (and the other privileged columns) back to
-- their old values. The seat functions are the only other writer of is_elite; every other column of the guard keeps its protection.
create or replace function private.titan_guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.role() <> 'service_role' and not private.titan_is_admin(auth.uid()) and coalesce(current_setting('titan.billing_write', true), '') <> 'coach_seat' then
    new.email := old.email;
    new.role := old.role;
    new.is_admin := old.is_admin;
    new.is_premium := old.is_premium;
    new.premium_type := old.premium_type;
    new.premium_until := old.premium_until;
    new.is_elite := old.is_elite;
    new.is_tester := old.is_tester;
    new.status := old.status;
    new.is_suspended := old.is_suspended;
    new.suspension_reason := old.suspension_reason;
    new.admin_notes := old.admin_notes;
    new.moderated_at := old.moderated_at;
    new.moderated_by := old.moderated_by;
  end if;

  return new;
end;
$function$;

create table if not exists private.titan_plan_products (
  product_id text primary key check (char_length(product_id) between 1 and 100),
  plan text not null check (plan in ('titan_plus', 'coach', 'coach_pro')),
  updated_at timestamptz not null default now()
);
alter table private.titan_plan_products enable row level security;
revoke all on private.titan_plan_products from public, anon, authenticated;

-- The plan a coach is entitled to right now: an active, unrefunded, unexpired paid entitlement (never a seat) whose product is mapped to a coach plan.
create or replace function private.titan_coach_plan(p_uid uuid)
returns table (plan text, seats integer, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select pp.plan, case pp.plan when 'coach_pro' then 15 else 5 end, coalesce(e.ends_at, e.renews_at)
    from private.titan_entitlements e
    join private.titan_plan_products pp on pp.product_id = e.product_id and pp.plan in ('coach', 'coach_pro')
   where e.user_id = p_uid and e.source <> 'coach' and e.is_active and e.refunded_at is null and (e.ends_at is null or e.ends_at > now())
   order by (case pp.plan when 'coach_pro' then 15 else 5 end) desc, e.last_event_at desc
   limit 1;
$function$;

create or replace function private.titan_coach_capacity(p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_seats integer;
begin
  select p.seats into v_seats from private.titan_coach_plan(p_uid) p;
  if v_seats is not null then return v_seats; end if;
  -- Legacy capacity of the published V1: only a personal paid Titan+ counts, never a seat included by another coach.
  return case when exists (select 1 from private.titan_entitlements e
                            where e.user_id = p_uid and e.source <> 'coach' and e.is_active and e.refunded_at is null and (e.ends_at is null or e.ends_at > now()))
              then 20 else 3 end;
end;
$function$;

-- The profile summary follows the ledger (same rules as titan_apply_entitlement_v1): elite when at least one source is active.
create or replace function private.titan_entitlement_refresh_profile(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_active boolean;
  v_latest private.titan_entitlements%rowtype;
begin
  select coalesce(bool_or(is_active), false) into v_active from private.titan_entitlements where user_id = p_uid;
  select * into v_latest from private.titan_entitlements where user_id = p_uid order by (source = 'coach'), last_event_at desc, source limit 1;
  perform set_config('titan.billing_write', 'coach_seat', true);
  update public.profiles
  set is_elite = v_active,
      elite_status = v_latest.status,
      elite_subscription_id = case when v_latest.source in ('google_play', 'coach') then null else v_latest.external_id end,
      elite_order_id = v_latest.order_id,
      elite_product_id = v_latest.product_id,
      elite_variant_id = v_latest.variant_id,
      elite_renews_at = v_latest.renews_at,
      elite_ends_at = v_latest.ends_at,
      elite_trial_ends_at = v_latest.trial_ends_at,
      elite_refunded_at = v_latest.refunded_at,
      elite_last_event_name = v_latest.event_name,
      elite_last_event_at = v_latest.last_event_at,
      elite_updated_at = now(),
      updated_at = now()
  where id = p_uid;
  perform set_config('titan.billing_write', '', true);
end;
$function$;

create or replace function private.titan_coach_seat_write(p_coach uuid, p_athlete uuid, p_active boolean, p_ends timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_before boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('titan_entitlement:' || p_athlete::text, 0));
  select is_active into v_before from private.titan_entitlements where source = 'coach' and external_id = p_coach::text || ':' || p_athlete::text;
  if not coalesce(p_active, false) and not coalesce(v_before, false) then return; end if;
  insert into private.titan_entitlements as e (source, external_id, user_id, is_active, status, event_name, product_id, ends_at, last_event_at)
  values ('coach', p_coach::text || ':' || p_athlete::text, p_athlete, p_active, case when p_active then 'seat' else 'seat_ended' end, 'coach_seat', null,
          case when p_active then p_ends else now() end, now())
  on conflict (source, external_id) do update
    set is_active = excluded.is_active, status = excluded.status, event_name = excluded.event_name, ends_at = excluded.ends_at,
        last_event_at = excluded.last_event_at, updated_at = now();
  perform private.titan_entitlement_refresh_profile(p_athlete);
end;
$function$;

-- Brings the seats of one coach in line with the plan and the links: the first N links (oldest first) hold a seat, every other seat of this coach ends.
create or replace function private.titan_coach_sync_seats(p_coach uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan record;
  v_row record;
  v_keep uuid[] := array[]::uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended('titan_coach_seats:' || p_coach::text, 0));
  select * into v_plan from private.titan_coach_plan(p_coach);
  if v_plan.plan is not null then
    for v_row in select l.athlete_id from public.coach_links l where l.coach_id = p_coach and l.revoked_at is null order by l.accepted_at, l.id limit v_plan.seats loop
      v_keep := v_keep || v_row.athlete_id;
      perform private.titan_coach_seat_write(p_coach, v_row.athlete_id, true, v_plan.ends_at);
    end loop;
  end if;
  for v_row in select e.user_id from private.titan_entitlements e
                where e.source = 'coach' and e.is_active and e.external_id like p_coach::text || ':%' and not (e.user_id = any(v_keep)) loop
    perform private.titan_coach_seat_write(p_coach, v_row.user_id, false, now());
  end loop;
end;
$function$;

-- A billing event on a coach (renewal, cancellation, refund, plan change) re-runs the seats in the same transaction.
create or replace function private.titan_entitlements_coach_hook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (select 1 from public.coach_links l where l.coach_id = new.user_id and l.revoked_at is null)
     or exists (select 1 from private.titan_entitlements e where e.source = 'coach' and e.is_active and e.external_id like new.user_id::text || ':%') then
    perform private.titan_coach_sync_seats(new.user_id);
  end if;
  return null;
end;
$function$;
drop trigger if exists titan_entitlements_coach_hook on private.titan_entitlements;
create trigger titan_entitlements_coach_hook after insert or update on private.titan_entitlements
  for each row when (new.source <> 'coach') execute function private.titan_entitlements_coach_hook();

-- Hourly sweep: seats whose plan ended without an event are closed.
create or replace function private.titan_coach_seats_sweep()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare v_row record; v_n integer := 0;
begin
  for v_row in select distinct x.coach from (
      select l.coach_id as coach from public.coach_links l where l.revoked_at is null
      union select split_part(e.external_id, ':', 1)::uuid from private.titan_entitlements e where e.source = 'coach' and e.is_active) x limit 5000 loop
    perform private.titan_coach_sync_seats(v_row.coach);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;
create or replace function public.titan_coach_seats_sweep_v1()
returns integer
language sql
security definer
set search_path = ''
as $function$ select private.titan_coach_seats_sweep(); $function$;
revoke all on function public.titan_coach_seats_sweep_v1() from public, anon, authenticated;
grant execute on function public.titan_coach_seats_sweep_v1() to service_role;
do $$
begin
  -- pg_cron exists in production, not on the local bench: the job table is only read once the extension is known to be there.
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  if not exists (select 1 from cron.job where jobname = 'titan_coach_seats_sweep') then
    perform cron.schedule('titan_coach_seats_sweep', '7 * * * *', 'select public.titan_coach_seats_sweep_v1();');
  end if;
end $$;

-- ---- the published billing function, with two changes only: the profile summary prefers the player's own subscription over a seat, and a seat id is never copied to the profile.
create or replace function public.titan_apply_entitlement_v1(
  p_user_id uuid,
  p_source text,
  p_external_id text,
  p_is_active boolean,
  p_status text,
  p_event_name text,
  p_event_at timestamptz,
  p_order_id text default null,
  p_product_id text default null,
  p_variant_id text default null,
  p_renews_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_trial_ends_at timestamptz default null,
  p_refunded_at timestamptz default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_applied boolean := false;
  v_active boolean;
  v_latest private.titan_entitlements%rowtype;
begin
  if p_event_at is null then raise exception 'ENTITLEMENT_EVENT_TIME_REQUIRED' using errcode = '22023'; end if;
  if p_source not in ('paddle', 'google_play', 'manual') then raise exception 'ENTITLEMENT_SOURCE_INVALID' using errcode = '22023'; end if;
  if coalesce(p_external_id, '') = '' then raise exception 'ENTITLEMENT_ID_REQUIRED' using errcode = '22023'; end if;
  if p_is_active is null then raise exception 'ENTITLEMENT_STATE_REQUIRED' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;

  perform pg_advisory_xact_lock(hashtextextended('titan_entitlement:' || p_user_id::text, 0));
  -- A purchase token or subscription id serves one account only.
  select user_id into v_owner from private.titan_entitlements where source = p_source and external_id = p_external_id for update;
  if found and v_owner <> p_user_id then raise exception 'ENTITLEMENT_OWNED_BY_OTHER' using errcode = '42501'; end if;

  insert into private.titan_entitlements as e (source, external_id, user_id, is_active, status, event_name, order_id, product_id,
    variant_id, renews_at, ends_at, trial_ends_at, refunded_at, last_event_at)
  values (p_source, p_external_id, p_user_id, p_is_active, nullif(p_status, ''), nullif(p_event_name, ''), p_order_id, p_product_id,
    p_variant_id, p_renews_at, p_ends_at, p_trial_ends_at, p_refunded_at, p_event_at)
  on conflict (source, external_id) do update
    set is_active = excluded.is_active, status = excluded.status, event_name = excluded.event_name, order_id = excluded.order_id,
        product_id = excluded.product_id, variant_id = excluded.variant_id, renews_at = excluded.renews_at, ends_at = excluded.ends_at,
        trial_ends_at = excluded.trial_ends_at, refunded_at = excluded.refunded_at, last_event_at = excluded.last_event_at,
        updated_at = now()
    where e.user_id = excluded.user_id and e.last_event_at <= excluded.last_event_at
  returning true into v_applied;

  -- A concurrent insert may win after the initial owner read saw no row.
  -- The conflicting row remains locked by the UPSERT, including when its WHERE
  -- clause refuses the update; recheck ownership before touching any profile.
  if not coalesce(v_applied, false) then
    select user_id into v_owner from private.titan_entitlements
      where source = p_source and external_id = p_external_id;
    if v_owner is distinct from p_user_id then
      raise exception 'ENTITLEMENT_OWNED_BY_OTHER' using errcode = '42501';
    end if;
  end if;

  select coalesce(bool_or(is_active), false) into v_active from private.titan_entitlements where user_id = p_user_id;
  -- A seat included by a coach never hides the player's own subscription in the profile summary.
  select * into v_latest from private.titan_entitlements where user_id = p_user_id order by (source = 'coach'), last_event_at desc, source limit 1;
  update public.profiles
  set is_elite = v_active,
      elite_status = v_latest.status,
      -- A Google purchase token is never copied to a profile row the player can read.
      elite_subscription_id = case when v_latest.source in ('google_play', 'coach') then null else v_latest.external_id end,
      elite_order_id = v_latest.order_id,
      elite_product_id = v_latest.product_id,
      elite_variant_id = v_latest.variant_id,
      elite_renews_at = v_latest.renews_at,
      elite_ends_at = v_latest.ends_at,
      elite_trial_ends_at = v_latest.trial_ends_at,
      elite_refunded_at = v_latest.refunded_at,
      elite_last_event_name = v_latest.event_name,
      elite_last_event_at = v_latest.last_event_at,
      elite_updated_at = now(),
      updated_at = now()
  where id = p_user_id;
  return coalesce(v_applied, false);
end;
$$;

revoke all on function public.titan_apply_entitlement_v1(uuid, text, text, boolean, text, text, timestamptz, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.titan_apply_entitlement_v1(uuid, text, text, boolean, text, text, timestamptz, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz) to service_role;

-- ---- the coach portal: capacity from the plan, seats synced on accept and on revoke, plan and seats used in the snapshot, churn limit.
create or replace function private.titan_coach_portal(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='8s'
as $$
declare
 v_uid uuid:=auth.uid();v_link public.coach_links%rowtype;v_invite private.coach_invites%rowtype;
 v_assignment public.coach_assignments%rowtype;v_coach public.profiles%rowtype;
 v_id uuid;v_token text;v_since date;v_sport text;v_limit integer;v_result jsonb;v_rows jsonb;
 v_total integer;v_offset integer;v_revision integer;v_date date;
begin
 if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and is_suspended is not true) then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000 then raise exception 'INVALID_INPUT';end if;
 if p_action='snapshot' then
   select * into v_coach from public.profiles where id=v_uid;
   v_limit:=private.titan_coach_capacity(v_uid);
   return jsonb_build_object('owner',v_uid,'capacity',v_limit,'plan',(select to_jsonb(p)-'ends_at'||jsonb_build_object('endsAt',p.ends_at) from private.titan_coach_plan(v_uid) p),'seatsUsed',(select count(*) from public.coach_links where coach_id=v_uid and revoked_at is null),
    'links',(select coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('coach_name',c.username,'athlete_name',a.username) order by l.accepted_at desc),'[]') from public.coach_links l join public.profiles c on c.id=l.coach_id join public.profiles a on a.id=l.athlete_id where (l.coach_id=v_uid or l.athlete_id=v_uid) and l.revoked_at is null),
    'invites',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'expires_at',i.expires_at,'created_at',i.created_at) order by i.created_at desc),'[]') from private.coach_invites i where i.coach_id=v_uid and i.accepted_by is null and i.revoked_at is null and i.expires_at>now()),
    'assignments_count',(select count(*) from public.coach_assignments a join public.coach_links l on l.id=a.link_id where l.revoked_at is null and (l.coach_id=v_uid or l.athlete_id=v_uid)));
 end if;
 if p_action='invite' then
   perform 1 from public.profiles where id=v_uid for update;
   if (select count(*) from private.coach_invites where coach_id=v_uid and created_at>now()-interval '1 day')>=30 or (select count(*) from private.coach_invites where coach_id=v_uid and revoked_at is null and accepted_by is null and expires_at>now())>=10 then raise exception 'INVITE_LIMIT';end if;
   select * into v_coach from public.profiles where id=v_uid;
   v_limit:=private.titan_coach_capacity(v_uid);
   if (select count(*) from public.coach_links where coach_id=v_uid and revoked_at is null)>=v_limit then raise exception 'COACH_CAPACITY';end if;
   v_token:=encode(extensions.gen_random_bytes(24),'hex');
   insert into private.coach_invites(coach_id,token_hash) values(v_uid,encode(extensions.digest(v_token,'sha256'),'hex')) returning * into v_invite;
   return jsonb_build_object('id',v_invite.id,'token',v_token,'expires_at',v_invite.expires_at,'coach_name',v_coach.username);
 end if;
 if p_action='cancel_invite' then
   update private.coach_invites set revoked_at=now() where id=(p_data->>'id')::uuid and coach_id=v_uid and accepted_by is null;
   if not found then raise exception 'INVITE_UNAVAILABLE';end if;return jsonb_build_object('ok',true);
 end if;
 if p_action in ('preview','accept') then
   v_token:=lower(trim(coalesce(p_data->>'token','')));
   if v_token!~'^[0-9a-f]{48}$' then raise exception 'INVITE_UNAVAILABLE';end if;
   select * into v_invite from private.coach_invites where token_hash=encode(extensions.digest(v_token,'sha256'),'hex') and accepted_by is null and revoked_at is null and expires_at>now();
   if not found or v_invite.coach_id=v_uid then raise exception 'INVITE_UNAVAILABLE';end if;
   perform 1 from public.profiles where id in (v_uid,v_invite.coach_id) order by id for update;
   select * into v_invite from private.coach_invites where id=v_invite.id and accepted_by is null and revoked_at is null and expires_at>now() for update;
   if not found then raise exception 'INVITE_UNAVAILABLE';end if;
   -- Serialize capacity changes against the coach account, as well as each single-use invitation.
   select * into v_coach from public.profiles where id=v_invite.coach_id and is_suspended is not true for update;
   if not found then raise exception 'INVITE_UNAVAILABLE';end if;
   if p_action='preview' then return jsonb_build_object('coach_name',v_coach.username,'expires_at',v_invite.expires_at);end if;
   if (p_data->>'consent') is distinct from 'true' then raise exception 'CONSENT_REQUIRED';end if;
   v_limit:=private.titan_coach_capacity(v_invite.coach_id);
   if (select count(*) from public.coach_links where coach_id=v_invite.coach_id and revoked_at is null)>=v_limit then raise exception 'COACH_CAPACITY';end if;
   -- Lock the athlete for the separate maximum number of accepted sharing relationships.
   perform 1 from public.profiles where id=v_uid for update;
   if (select count(*) from public.coach_links where athlete_id=v_uid and revoked_at is null)>=5 then raise exception 'ATHLETE_CAPACITY';end if;
   v_since:=(p_data->>'since_date')::date;v_sport:=nullif(trim(p_data->>'sport'),'');
   if v_since is null or v_since>current_date or v_since<'2000-01-01'::date then raise exception 'INVALID_PERIOD';end if;
   if (select count(*) from public.coach_links where coach_id=v_invite.coach_id and accepted_at>now()-interval '30 days')>=greatest(v_limit*2,6) then raise exception 'SEAT_CHURN_LIMIT';end if;
   insert into public.coach_links(coach_id,athlete_id,since_date,sport,share_details,share_notes)
    values(v_invite.coach_id,v_uid,v_since,v_sport,coalesce((p_data->>'share_details')::boolean,false),coalesce((p_data->>'share_notes')::boolean,false)) returning id into v_id;
   update private.coach_invites set accepted_by=v_uid where id=v_invite.id;
   perform private.titan_coach_sync_seats(v_invite.coach_id);
   return jsonb_build_object('id',v_id);
 end if;
 if p_action in ('scope','revoke','sessions','assign','assignments') then
   select * into v_link from public.coach_links where id=(p_data->>'link_id')::uuid and revoked_at is null and (coach_id=v_uid or athlete_id=v_uid) for update;
   if not found then raise exception 'SHARING_UNAVAILABLE' using errcode='42501';end if;
   if p_action='assignments' then
     v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),100000));
     return jsonb_build_object('link_id',v_link.id,'revision',v_link.revision,'total',(select count(*) from public.coach_assignments where link_id=v_link.id),'offset',v_offset,'rows',(select coalesce(jsonb_agg(to_jsonb(q) order by created_at desc,id desc),'[]') from (select * from public.coach_assignments where link_id=v_link.id order by created_at desc,id desc limit 100 offset v_offset)q));
   end if;
   if p_action in ('scope','revoke') then
     if v_link.revision is distinct from (p_data->>'revision')::integer then raise exception 'COACH_CONFLICT';end if;
     if p_action='revoke' then
       update public.coach_links set revoked_at=now(),revision=revision+1 where id=v_link.id;
       perform private.titan_coach_sync_seats(v_link.coach_id);
       return jsonb_build_object('ok',true);
     end if;
     if v_link.athlete_id<>v_uid then raise exception 'ATHLETE_ONLY' using errcode='42501';end if;
     v_since:=(p_data->>'since_date')::date;v_sport:=nullif(trim(p_data->>'sport'),'');
     if v_since is null or v_since>current_date or v_since<'2000-01-01'::date then raise exception 'INVALID_PERIOD';end if;
     update public.coach_links set since_date=v_since,sport=v_sport,share_details=coalesce((p_data->>'share_details')::boolean,false),share_notes=coalesce((p_data->>'share_notes')::boolean,false),revision=revision+1 where id=v_link.id;
     return jsonb_build_object('ok',true);
   end if;
   if p_action='sessions' then
     v_date:=coalesce((p_data->>'from_date')::date,current_date-29);v_since:=greatest(v_date,v_link.since_date);
     if p_data->>'to_date' is null or (p_data->>'to_date')::date<v_since or (p_data->>'to_date')::date>current_date or (p_data->>'to_date')::date-v_date>366 then raise exception 'INVALID_PERIOD';end if;
     v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),100000));
     select count(*) into v_total from public.training_logs l where l.user_id=v_link.athlete_id and l.archived_at is null and l.date>=v_since::timestamp at time zone 'UTC' and l.date<((p_data->>'to_date')::date+1)::timestamp at time zone 'UTC' and l.date<=now() and (v_link.sport is null or l.sport=v_link.sport);
     select coalesce(jsonb_agg(row_data order by session_date desc,session_id desc),'[]') into v_rows from (
       select l.date as session_date,l.id as session_id,jsonb_build_object('id',l.id,'date',l.date,'sport',l.sport,'val',l.val,'unit',l.unit,
        'details',jsonb_strip_nulls(jsonb_build_object(
         'duration',case when coalesce(l.details->>'duration','')~'^[0-9]+([.][0-9]+)?$' then (l.details->>'duration')::numeric when coalesce(l.details->>'val2','')~'^[0-9]+([.][0-9]+)?$' then (l.details->>'val2')::numeric when coalesce(l.details#>>'{gpxStats,movingMinutes}','')~'^[0-9]+([.][0-9]+)?$' then (l.details#>>'{gpxStats,movingMinutes}')::numeric else null end,
         'note',case when v_link.share_notes then coalesce(l.details->>'note',l.details->>'notes') else null end,
         'exercises',case when v_link.share_details then (select jsonb_agg(jsonb_build_object('name',e->>'name','variant',e->>'variant','equipment',e->>'equipment','sets',e->'sets','weight',e->'weight','reps',e->'reps','setRows',(select jsonb_agg(jsonb_build_object('weight',s->'weight','reps',s->'reps','rir',s->'rir')) from (select value s from jsonb_array_elements(case when jsonb_typeof(e->'setRows')='array' then e->'setRows' else '[]' end) limit 30)sr))) from (select value e from jsonb_array_elements(case when jsonb_typeof(l.details->'exercises')='array' then l.details->'exercises' else '[]' end) limit 30)ex) else null end,
         'extras',case when v_link.share_details then jsonb_strip_nulls(jsonb_build_object('grade_system',l.details#>'{extras,grade_system}','climbing_discipline',l.details#>'{extras,climbing_discipline}','belay',l.details#>'{extras,belay}','max_done',l.details#>'{extras,max_done}','max_attempt',l.details#>'{extras,max_attempt}','attempts',l.details#>'{extras,attempts}','successful_routes',l.details#>'{extras,successful_routes}')) else null end))) as row_data
       from public.training_logs l where l.user_id=v_link.athlete_id and l.archived_at is null and l.date>=v_since::timestamp at time zone 'UTC' and l.date<((p_data->>'to_date')::date+1)::timestamp at time zone 'UTC' and l.date<=now() and (v_link.sport is null or l.sport=v_link.sport)
       order by l.date desc,l.id desc limit 100 offset v_offset
     ) q;
     return jsonb_build_object('owner',v_uid,'link_id',v_link.id,'revision',v_link.revision,'rows',v_rows,'total',v_total,'offset',v_offset,'from_date',v_since,'to_date',p_data->>'to_date','timezone','UTC');
   end if;
   if p_action='assign' then
     if v_link.coach_id<>v_uid then raise exception 'COACH_ONLY' using errcode='42501';end if;
     if (select count(*) from public.coach_assignments where link_id=v_link.id)>=500 then raise exception 'ASSIGNMENT_LIMIT';end if;
     v_date:=(p_data->>'planned_date')::date;
     if v_date<current_date-7 or v_date>current_date+366 then raise exception 'INVALID_PERIOD';end if;
     insert into public.coach_assignments(link_id,title,sport,planned_date,instructions) values(v_link.id,trim(p_data->>'title'),trim(p_data->>'sport'),v_date,coalesce(p_data->>'instructions','')) returning * into v_assignment;
     return to_jsonb(v_assignment);
   end if;
 end if;
 if p_action in ('assignment_status','cancel_assignment') then
   -- Consistent lock order: the sharing relationship is locked before the assignment.
   select l.* into v_link from public.coach_links l join public.coach_assignments a on a.link_id=l.id where a.id=(p_data->>'id')::uuid and l.revoked_at is null and (l.coach_id=v_uid or l.athlete_id=v_uid) for update of l;
   if not found then raise exception 'SHARING_UNAVAILABLE' using errcode='42501';end if;
   select * into v_assignment from public.coach_assignments where id=(p_data->>'id')::uuid for update;
   if v_assignment.revision is distinct from (p_data->>'revision')::integer then raise exception 'COACH_CONFLICT';end if;
   if p_action='cancel_assignment' then
     if v_link.coach_id<>v_uid or v_assignment.status not in ('proposed','accepted') then raise exception 'INVALID_TRANSITION';end if;
     update public.coach_assignments set status='cancelled',revision=revision+1,updated_at=now() where id=v_assignment.id returning * into v_assignment;
   else
     if v_link.athlete_id<>v_uid then raise exception 'ATHLETE_ONLY' using errcode='42501';end if;
     if not ((v_assignment.status='proposed' and p_data->>'status' in ('accepted','declined')) or (v_assignment.status='accepted' and p_data->>'status' in ('declined','completed'))) then raise exception 'INVALID_TRANSITION';end if;
     v_id:=null;
     if p_data->>'status'='completed' then
       v_id:=(p_data->>'session_id')::uuid;
       if v_id is null or not exists(select 1 from public.training_logs l where l.id=v_id and l.user_id=v_uid and l.sport=v_assignment.sport and l.archived_at is null and l.date<=now() and l.date>=v_link.since_date::timestamp at time zone 'UTC' and l.date>=v_assignment.created_at-interval '7 days' and l.is_suspicious is not true and coalesce(l.status,'valid') not in ('rejected','flagged','pending_review')) then raise exception 'INVALID_SESSION';end if;
       if exists(select 1 from public.coach_assignments a join public.coach_links l on l.id=a.link_id where l.athlete_id=v_uid and a.session_id=v_id) then raise exception 'SESSION_ALREADY_LINKED';end if;
     end if;
     update public.coach_assignments set status=p_data->>'status',session_id=v_id,revision=revision+1,updated_at=now() where id=v_assignment.id returning * into v_assignment;
   end if;
   return to_jsonb(v_assignment);
 end if;
 raise exception 'INVALID_ACTION';
end;
$$;
revoke all on function private.titan_coach_portal(text,jsonb) from public,anon;
grant execute on function private.titan_coach_portal(text,jsonb) to authenticated;

-- ---- Reading and administration
create or replace function public.titan_my_plan_v1()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_plan record;
  v_coach_name text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_plan from private.titan_coach_plan(v_uid);
  select p.username into v_coach_name from private.titan_entitlements e join public.profiles p on p.id = split_part(e.external_id, ':', 1)::uuid
   where e.user_id = v_uid and e.source = 'coach' and e.is_active order by e.last_event_at desc limit 1;
  return jsonb_build_object(
    'titanPlus', coalesce((select p.is_elite from public.profiles p where p.id = v_uid), false),
    'own', exists (select 1 from private.titan_entitlements e where e.user_id = v_uid and e.source <> 'coach' and e.is_active and e.refunded_at is null and (e.ends_at is null or e.ends_at > now())),
    'viaCoach', exists (select 1 from private.titan_entitlements e where e.user_id = v_uid and e.source = 'coach' and e.is_active),
    'coachName', v_coach_name,
    'coachPlan', case when v_plan.plan is null then null else jsonb_build_object('plan', v_plan.plan, 'seats', v_plan.seats, 'endsAt', v_plan.ends_at,
        'used', (select count(*) from public.coach_links l where l.coach_id = v_uid and l.revoked_at is null)) end);
end;
$function$;

create or replace function public.titan_plan_product_set_v1(p_product text, p_plan text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_product is null or p_product !~ '^[A-Za-z0-9._-]{1,100}$' then raise exception 'BAD_PRODUCT' using errcode = '22023'; end if;
  if p_plan is null then
    delete from private.titan_plan_products where product_id = p_product;
  elsif p_plan not in ('titan_plus', 'coach', 'coach_pro') then raise exception 'BAD_PLAN' using errcode = '22023';
  else
    insert into private.titan_plan_products (product_id, plan) values (p_product, p_plan)
    on conflict (product_id) do update set plan = excluded.plan, updated_at = now();
  end if;
  return true;
end;
$function$;

create or replace function public.titan_plan_product_list_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.titan_is_admin(auth.uid()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('productId', product_id, 'plan', plan) order by plan, product_id) from private.titan_plan_products), '[]'::jsonb);
end;
$function$;

revoke all on function public.titan_my_plan_v1(), public.titan_plan_product_set_v1(text, text), public.titan_plan_product_list_v1() from public, anon;
grant execute on function public.titan_my_plan_v1(), public.titan_plan_product_set_v1(text, text), public.titan_plan_product_list_v1() to authenticated;
