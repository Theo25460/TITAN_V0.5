-- Business revision conflicts are NOT transient serialization failures.
-- PostgREST can retry SQLSTATE 40001 indefinitely, even after HTTP timeout.
-- PT409 returns one HTTP 409 with the same refusal and concurrency protection.
-- Transform installed definitions so later V1.1/V1.2 logic is preserved.
-- CREATE OR REPLACE preserves OIDs, owners and grants; no user rows are changed.
do $migration$
declare
  target record; fn record; definition text; patched text; pattern text; found_count integer;
begin
  for target in select * from (values
    ('titan_save_profile_state', 'PROFILE_VERSION_CONFLICT'),
    ('titan_update_training_session', 'SESSION_VERSION_CONFLICT'),
    ('titan_transition_social_challenge', 'CHALLENGE_STATE_CONFLICT'),
    ('titan_adventure_action', 'ADVENTURE_CONFLICT'),
    ('titan_mutate_analysis_view', 'VIEW_VERSION_CONFLICT')
  ) as targets(name, message)
  loop
    found_count := 0;
    pattern := '(raise\s+exception\s+''' || target.message || '''\s+using\s+errcode\s*=\s*)''40001''';
    for fn in
      select p.oid, p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','private') and p.proname=target.name and p.prokind='f'
    loop
      -- Public wrappers around private implementations contain no RAISE.
      if position(target.message in fn.prosrc)=0 then continue; end if;
      found_count := found_count+1;
      definition := pg_get_functiondef(fn.oid);
      patched := regexp_replace(definition, pattern, '\1''PT409''', 'gi');
      if patched=definition and fn.prosrc !~ ('errcode\s*=\s*''PT409''') then
        raise exception 'Unexpected conflict clause in %; review current function', fn.oid::regprocedure;
      end if;
      if patched ~ 'errcode\s*=\s*''40001''' then
        raise exception 'Unrecognized retryable clause in %; no changes committed', fn.oid::regprocedure;
      end if;
      if patched<>definition then execute patched; end if;
    end loop;
    if found_count=0 then raise exception 'Missing conflict implementation for %; review schema drift', target.name; end if;
  end loop;
end;
$migration$;
-- Existing looping backends require a separately authorized targeted stop.
-- This migration does NOT terminate connections or restart any service.
