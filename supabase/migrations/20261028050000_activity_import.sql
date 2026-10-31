-- V11-06 (server half): importing sessions from an external source (Health Connect first), following ADR-003.
-- The provenance lives in private tables, NEVER in the client's `details`: nothing the client sends can say "trusted".
-- An import is only a convenience for entering the session: it goes through public.titan_submit_training_session, so the same
-- anti-cheat, risk score, daily/weekly caps and reward holds apply; a source gives no exemption and no extra XP.
-- Consent is explicit, per source, revocable; revoking stops imports and the player can archive what was imported.
-- Duplicates: the same (source, external id) is imported once; an activity that overlaps a session of the same sport already in the
-- journal (manual or from another source) is LINKED to it and counted once (no XP, credits, quests or records twice).
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_set_source_consent_v1(text,boolean), public.titan_import_activity_v1(text,text,text,timestamptz,numeric,numeric),
-- public.titan_archive_imported_v1(text); drop table private.titan_imported_activities, private.titan_source_consents;

create table if not exists private.titan_source_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('health_connect')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, source)
);
alter table private.titan_source_consents enable row level security;
revoke all on private.titan_source_consents from public, anon, authenticated;

create table if not exists private.titan_imported_activities (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('health_connect')),
  external_id text not null check (external_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  log_id uuid not null references public.training_logs(id) on delete cascade,
  status text not null check (status in ('imported', 'linked')),
  imported_at timestamptz not null default now(),
  primary key (user_id, source, external_id)
);
create index if not exists titan_imported_activities_log_idx on private.titan_imported_activities (log_id);
alter table private.titan_imported_activities enable row level security;
revoke all on private.titan_imported_activities from public, anon, authenticated;

create or replace function public.titan_set_source_consent_v1(p_source text, p_granted boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_source is distinct from 'health_connect' then raise exception 'SOURCE_UNKNOWN' using errcode = '22023'; end if;
  perform private.titan_rate_limit(v_uid, 'source_consent', 30);
  insert into private.titan_source_consents(user_id, source, granted_at, revoked_at)
  values (v_uid, p_source, now(), case when coalesce(p_granted, false) then null else now() end)
  on conflict (user_id, source) do update
    set revoked_at = case when coalesce(p_granted, false) then null else now() end,
        granted_at = case when coalesce(p_granted, false) then now() else private.titan_source_consents.granted_at end;
  return jsonb_build_object('source', p_source, 'granted', coalesce(p_granted, false),
    'imported', (select count(*) from private.titan_imported_activities i join public.training_logs l on l.id = i.log_id
                  where i.user_id = v_uid and i.source = p_source and i.status = 'imported' and l.archived_at is null));
end;
$function$;

create or replace function public.titan_import_activity_v1(
  p_source text, p_external_id text, p_sport text, p_started_at timestamptz,
  p_duration_minutes numeric, p_distance_km numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_prev record;
  v_dup record;
  v_details jsonb;
  v_event uuid;
  v_res record;
  v_end timestamptz;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_source is distinct from 'health_connect' then raise exception 'SOURCE_UNKNOWN' using errcode = '22023'; end if;
  if p_external_id is null or p_external_id !~ '^[A-Za-z0-9_.:-]{1,128}$' then raise exception 'EXTERNAL_ID_INVALID' using errcode = '22023'; end if;
  if p_started_at is null or p_started_at > now() + interval '10 minutes' or p_started_at < timestamptz '1990-01-01' then
    raise exception 'IMPORT_DATE_OUT_OF_RANGE' using errcode = '22023';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 1440 then
    raise exception 'IMPORT_DURATION_OUT_OF_RANGE' using errcode = '22023';
  end if;
  if p_distance_km is not null and (p_distance_km <= 0 or p_distance_km > 1000) then
    raise exception 'IMPORT_DISTANCE_OUT_OF_RANGE' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sports s where s.id = p_sport and coalesce(s.is_active, true)) then
    raise exception 'SPORT_UNKNOWN' using errcode = '22023';
  end if;
  if not exists (select 1 from private.titan_source_consents c where c.user_id = v_uid and c.source = p_source and c.revoked_at is null) then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501';
  end if;
  -- Imports go through the same creation ceilings as any session (12 an hour and 40 a day for recent ones, 300 a day for history older
  -- than 30 days): a long first synchronisation is spread over days by the sender, and a refused call leaves nothing behind (same transaction).
  perform private.titan_rate_limit(v_uid, 'activity_import', 300);
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_source || ':' || p_external_id, 0));

  select i.log_id, i.status into v_prev from private.titan_imported_activities i
   where i.user_id = v_uid and i.source = p_source and i.external_id = p_external_id;
  if found then
    return jsonb_build_object('status', 'duplicate', 'log_id', v_prev.log_id, 'previous', v_prev.status);
  end if;

  -- Same sport and a time overlap of at least half of the shorter one with a session already in the journal: one session, counted once.
  v_end := p_started_at + (p_duration_minutes * interval '1 minute');
  select l.id into v_dup
    from public.training_logs l
   where l.user_id = v_uid and l.archived_at is null and l.sport = p_sport
     and l.date < v_end + interval '10 minutes' and l.date > p_started_at - interval '24 hours'
     and (select extract(epoch from least(v_end, l.date + (d.m * interval '1 minute')) - greatest(p_started_at, l.date)) / 60
            from (select coalesce(public.titan_numeric_from_json(l.details, 'duration'), case when l.unit = 'min' then l.val end, 30) as m) d)
         >= 0.5 * least(p_duration_minutes, (select coalesce(public.titan_numeric_from_json(l.details, 'duration'), case when l.unit = 'min' then l.val end, 30)))
   order by l.date
   limit 1;
  if found then
    insert into private.titan_imported_activities(user_id, source, external_id, log_id, status) values (v_uid, p_source, p_external_id, v_dup.id, 'linked');
    return jsonb_build_object('status', 'linked', 'log_id', v_dup.id);
  end if;

  -- Deterministic event id: a replay of the very same activity can never create a second session, even before the row above exists.
  v_event := md5(v_uid::text || ':' || p_source || ':' || p_external_id)::uuid;
  v_details := jsonb_build_object('duration', p_duration_minutes, 'client_event_id', v_event::text);
  if p_distance_km is null then
    select * into v_res from public.titan_submit_training_session(p_sport, (select s.category from public.sports s where s.id = p_sport), p_duration_minutes, 'min', v_details, p_started_at);
  else
    select * into v_res from public.titan_submit_training_session(p_sport, (select s.category from public.sports s where s.id = p_sport), p_distance_km, 'km', v_details, p_started_at);
  end if;
  insert into private.titan_imported_activities(user_id, source, external_id, log_id, status) values (v_uid, p_source, p_external_id, v_res.log_id::uuid, 'imported');
  return jsonb_build_object('status', 'imported', 'log_id', v_res.log_id, 'xp', v_res.xp, 'reward_held', v_res.reward_held);
end;
$function$;

-- Revocation: the player may archive what a source brought (their right to delete; rewards already granted stay, nothing is taken back).
create or replace function public.titan_archive_imported_v1(p_source text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_n integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_source is distinct from 'health_connect' then raise exception 'SOURCE_UNKNOWN' using errcode = '22023'; end if;
  perform private.titan_rate_limit(v_uid, 'source_archive', 10);
  update public.training_logs l set archived_at = now()
   where l.user_id = v_uid and l.archived_at is null
     and l.id in (select i.log_id from private.titan_imported_activities i where i.user_id = v_uid and i.source = p_source and i.status = 'imported');
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

revoke all on function public.titan_set_source_consent_v1(text, boolean) from public, anon;
revoke all on function public.titan_import_activity_v1(text, text, text, timestamptz, numeric, numeric) from public, anon;
revoke all on function public.titan_archive_imported_v1(text) from public, anon;
grant execute on function public.titan_set_source_consent_v1(text, boolean) to authenticated;
grant execute on function public.titan_import_activity_v1(text, text, text, timestamptz, numeric, numeric) to authenticated;
grant execute on function public.titan_archive_imported_v1(text) to authenticated;
