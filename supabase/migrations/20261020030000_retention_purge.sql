-- Q-002, LEG31, LEG03, LEG09, LEG15: retention durations executed by the code, and erasure that leaves nothing behind.
-- Durations are data (private.titan_retention_rules), so the published matrix (docs/DATA_RETENTION.md) can be checked
-- against what really runs. Nothing is applied by this file: it is part of the migrations waiting for production.
--   * private.titan_purge_expired_data_v1() deletes what has outlived its rule; daily pg_cron job when pg_cron exists.
--   * BEFORE DELETE on auth.users scrubs free text and payloads that would survive the account (their user_id is about to become NULL).
--   * AFTER DELETE on auth.users removes audit_logs copies: the generic audit trigger had copied deleted messages and
--     inventory rows (content included) into audit_logs, which kept them after the account was gone.
-- The economy journal stays immutable by design: once its user is detached it holds only amounts and kinds.
-- Caller owns the transaction. Rollback: docs/CDC_WEB_PRODUCTION_RELEASE_PLAN_2026-10-19.md, row 25.

create table if not exists private.titan_retention_rules (
  id text primary key,
  relation text not null,
  time_column text not null,
  keep interval not null check (keep >= interval '1 day'),
  extra_where text,
  purpose text not null
);
alter table private.titan_retention_rules enable row level security;
revoke all on private.titan_retention_rules from public, anon, authenticated, service_role;

insert into private.titan_retention_rules (id, relation, time_column, keep, extra_where, purpose) values
  ('analytics',            'public.analytics_events',                   'created_at', interval '13 months', null, 'mesure d''audience'),
  ('support_general',      'private.titan_support_requests',            'created_at', interval '6 months',  'category not in (''titanplus'', ''donnees'')', 'assistance : bug, compte, communauté, autre'),
  ('support_payment',      'private.titan_support_requests',            'created_at', interval '13 months', 'category = ''titanplus''', 'assistance : paiement et remboursement'),
  ('support_rights',       'private.titan_support_requests',            'created_at', interval '12 months', 'category = ''donnees''', 'assistance : exercice des droits'),
  ('bug_reports',          'public.bug_reports',                        'created_at', interval '12 months', null, 'ancienne table de signalements de bug'),
  ('contact_messages',     'public.contact_messages',                   'created_at', interval '12 months', null, 'ancienne table de messages de contact'),
  ('billing_events',       'public.titan_billing_events',               'coalesce(occurred_at, processed_at)', interval '13 months', null, 'copie locale des événements de facturation'),
  ('admin_audit',          'public.titan_admin_audit',                  'created_at', interval '12 months', null, 'journal d''audit administrateur'),
  ('admin_logs',           'public.admin_logs',                         'created_at', interval '12 months', null, 'ancien journal administrateur'),
  ('audit_logs',           'public.audit_logs',                         'created_at', interval '12 months', null, 'journal d''audit générique'),
  ('moderation_decisions', 'private.titan_moderation_decisions',        'at',         interval '24 months',
     'not exists (select 1 from private.titan_moderation_decisions d2 where d2.reverts = titan_moderation_decisions.id) and not (decision = ''suspend'' and user_id is not null and not exists (select 1 from private.titan_moderation_decisions d3 where d3.user_id = titan_moderation_decisions.user_id and d3.id > titan_moderation_decisions.id and d3.decision in (''restore'', ''revert'')))',
     'décisions de modération (une décision annulée par une plus récente, ou une suspension encore en vigueur, reste)'),
  ('appeals',              'private.titan_appeals',                     'decided_at', interval '24 months', 'decided_at is not null', 'recours tranchés'),
  ('suspicious_actions',   'public.titan_suspicious_actions',           'created_at', interval '12 months', null, 'signaux anti-triche'),
  ('moderation_reports',   'public.titan_moderation_reports',           'created_at', interval '12 months', 'status in (''resolved'', ''dismissed'')', 'signalements traités'),
  ('reports_legacy',       'public.reports',                            'created_at', interval '12 months', 'coalesce(status, '''') not in (''pending'', ''new'', ''open'')', 'anciens signalements traités'),
  ('reward_holds',         'private.titan_reward_holds',                'settled_at', interval '3 months',  'settled_at is not null', 'retenues de récompenses réglées'),
  ('social_action_log',    'public.titan_social_action_log',            'created_at', interval '90 days',   null, 'journal des actions sociales'),
  ('verification_requests','private.titan_verification_requests',       'created_at', interval '12 months', null, 'demandes de vérification et réponses')
on conflict (id) do update
  set relation = excluded.relation, time_column = excluded.time_column, keep = excluded.keep,
      extra_where = excluded.extra_where, purpose = excluded.purpose;

-- The decisions journal is append-only (MODERATION_APPEND_ONLY); a transaction-local marker set only by the two
-- functions below lets retention delete an expired row or empty the snapshot of a deleted account.
create or replace function private.titan_moderation_decisions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if current_setting('titan.retention', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    if tg_op = 'UPDATE' and new.snapshot = '{}'::jsonb and (to_jsonb(new) - 'snapshot') = (to_jsonb(old) - 'snapshot') then return new; end if;
  end if;
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

-- The generic audit trigger cast the id of a deleted row to uuid outside its error handling when nobody is signed in
-- (cron, dashboard): it raised for tables whose id is a number (admin_logs, reports, admin_messages) and aborted the deletion.
create or replace function public.handle_audit_log()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
    safe_record_id text;
    safe_old_data jsonb;
    safe_new_data jsonb;
    current_user_id uuid;
    row_data jsonb;
    candidate text;
begin
    current_user_id := auth.uid();
    if (tg_op = 'DELETE') then
        row_data := to_jsonb(old);
        safe_old_data := row_data;
        safe_new_data := null;
        safe_record_id := coalesce(row_data->>'id', row_data->>'user_id', 'unknown');
        if current_user_id is null then
            candidate := coalesce(row_data->>'user_id', row_data->>'id');
            if candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
                current_user_id := candidate::uuid;
            end if;
        end if;
    elsif (tg_op = 'INSERT') then
        row_data := to_jsonb(new);
        safe_record_id := coalesce(row_data->>'id', row_data->>'user_id', 'unknown');
        safe_old_data := null;
        safe_new_data := row_data;
    else
        row_data := to_jsonb(new);
        safe_record_id := coalesce(row_data->>'id', row_data->>'user_id', 'unknown');
        safe_old_data := to_jsonb(old);
        safe_new_data := row_data;
    end if;
    begin
        insert into public.audit_logs (table_name, operation, record_id, old_data, new_data, changed_by)
        values (tg_table_name, tg_op, safe_record_id, safe_old_data, safe_new_data, current_user_id);
    exception when others then
        null;
    end;
    if (tg_op = 'DELETE') then return old; end if;
    return new;
end;
$function$;

create or replace function private.titan_purge_expired_data_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  r private.titan_retention_rules%rowtype;
  v_counts jsonb := '{}'::jsonb;
  v_n bigint;
  v_column text;
begin
  perform set_config('titan.retention', 'on', true);
  for r in select * from private.titan_retention_rules order by id loop
    -- A rule for a table or column this database does not have is skipped, never an error.
    if to_regclass(r.relation) is null then continue; end if;
    v_column := case when r.time_column ~ '^[a-z_]+$' then r.time_column else regexp_replace(split_part(r.time_column, '(', 2), '[^a-z_].*$', '') end;
    if not exists (select 1 from pg_attribute a where a.attrelid = to_regclass(r.relation) and a.attname = v_column and not a.attisdropped) then continue; end if;
    -- One failing rule never stops the others.
    begin
      execute format('delete from %s where %s < now() - %L::interval%s', r.relation, r.time_column, r.keep::text,
        case when r.extra_where is null then '' else ' and (' || r.extra_where || ')' end);
      get diagnostics v_n = row_count;
      v_counts := v_counts || jsonb_build_object(r.id, v_n);
    exception when others then
      raise warning 'retention rule % failed: %', r.id, sqlerrm;
      v_counts := v_counts || jsonb_build_object(r.id, -1);
    end;
  end loop;
  -- The generic audit trigger copied the rows deleted above into audit_logs (stamped with this transaction's start): remove those copies.
  begin
    if to_regclass('public.audit_logs') is not null then
      delete from public.audit_logs where table_name in ('admin_logs', 'reports') and operation = 'DELETE' and created_at >= now();
    end if;
  exception when others then raise warning 'retention: audit copy cleanup failed: %', sqlerrm; end;
  perform set_config('titan.retention', 'off', true);
  return v_counts;
end;
$function$;
revoke all on function private.titan_purge_expired_data_v1() from public, anon, authenticated;
grant execute on function private.titan_purge_expired_data_v1() to service_role;

create or replace function private.titan_scrub_before_account_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform set_config('titan.retention', 'on', true);
  -- Each step is isolated: a failure is reported but never blocks the deletion of the account; the retention rules
  -- remove what such a step leaves within their durations.
  begin
    if to_regclass('public.bug_reports') is not null then delete from public.bug_reports where user_id = old.id; end if;
    if to_regclass('public.contact_messages') is not null then delete from public.contact_messages where user_id = old.id; end if;
  exception when others then raise warning 'account scrub (support tables) skipped: %', sqlerrm; end;
  begin
    if to_regclass('public.messages') is not null then delete from public.messages where sender_id = old.id; end if;
  exception when others then raise warning 'account scrub (messages) skipped: %', sqlerrm; end;
  begin
    if to_regclass('public.titan_suspicious_actions') is not null then delete from public.titan_suspicious_actions where user_id = old.id; end if;
    if to_regclass('public.titan_billing_events') is not null then update public.titan_billing_events set payload = '{}'::jsonb where user_id = old.id and payload <> '{}'::jsonb; end if;
    if to_regclass('public.titan_admin_audit') is not null then update public.titan_admin_audit set payload = '{}'::jsonb where target_user_id = old.id and payload <> '{}'::jsonb; end if;
    if to_regclass('private.titan_moderation_decisions') is not null then update private.titan_moderation_decisions set snapshot = '{}'::jsonb where user_id = old.id and snapshot <> '{}'::jsonb; end if;
    if to_regclass('public.titan_moderation_reports') is not null then update public.titan_moderation_reports set details = null, resolution_note = null where (reporter_id = old.id or target_user_id = old.id) and (details is not null or resolution_note is not null); end if;
  exception when others then raise warning 'account scrub (payloads) skipped: %', sqlerrm; end;
  -- These two tables hold the account's id without a foreign key, so nothing detaches it on its own.
  begin
    if to_regclass('public.reports') is not null then
      update public.reports set reporter_id = null, description = null where reporter_id = old.id;
      update public.reports set reported_id = null, reported_user_id = null where reported_id = old.id or reported_user_id = old.id;
    end if;
    if to_regclass('public.admin_logs') is not null then
      update public.admin_logs set target_id = null, old_value = null, new_value = null, details = null where target_id = old.id::text;
    end if;
  exception when others then raise warning 'account scrub (legacy journals) skipped: %', sqlerrm; end;
  return old;
end;
$function$;
revoke all on function private.titan_scrub_before_account_delete() from public, anon, authenticated;

create or replace function private.titan_scrub_after_account_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Fires after the cascades, which is when the generic audit trigger has copied their rows into audit_logs.
  -- Never blocks the deletion: what is missed here expires with the audit_logs rule.
  begin
    if to_regclass('public.audit_logs') is not null then
      delete from public.audit_logs
      where changed_by = old.id
         or record_id = old.id::text
         or (table_name in ('messages', 'inventory', 'reports', 'admin_logs')
             and (coalesce(old_data::text, '') like '%' || old.id::text || '%' or coalesce(new_data::text, '') like '%' || old.id::text || '%'));
    end if;
  exception when others then raise warning 'account scrub (audit copies) skipped: %', sqlerrm; end;
  return old;
end;
$function$;
revoke all on function private.titan_scrub_after_account_delete() from public, anon, authenticated;

do $$
declare previous_lock_timeout text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '5s', true);
  if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'titan_scrub_before_account_delete') then
    create trigger titan_scrub_before_account_delete before delete on auth.users
      for each row execute function private.titan_scrub_before_account_delete();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'titan_scrub_after_account_delete') then
    create trigger titan_scrub_after_account_delete after delete on auth.users
      for each row execute function private.titan_scrub_after_account_delete();
  end if;
  perform set_config('lock_timeout', previous_lock_timeout, true);
end $$;

-- Daily job where pg_cron exists (it does in production, not on the local bench).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'titan_purge_expired_data') then
      perform cron.schedule('titan_purge_expired_data', '20 4 * * *', 'select private.titan_purge_expired_data_v1();');
    end if;
  end if;
exception when others then
  raise notice 'titan_purge_expired_data not scheduled: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
