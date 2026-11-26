-- V1.6.3 — Contrôle et réconciliation (migration 20261130100200). Synthetic accounts only, full rollback.
-- A. Correction of a typed run (10,4 → 10 km, 52 → 50 min): one revision, date and unit unchanged, no reward change; the change is readable.
-- B. An import that duplicates the run is archived: one counted session; a replay of the same import (even « modified » at the source)
--    creates nothing and does not bring it back; restoring it grants no reward; the account export carries the real state each time.
-- C. A session archived by a V1.6.2 rejoin cannot be restored from the journal (it would count twice): « Séparer » restores it.
-- D. Ownership: another account reads no change; no anonymous access.
begin;
do $$
declare k text;
begin
  foreach k in array array['a','b','c'] loop
    perform set_config('titan.hr_'||k, gen_random_uuid()::text, true);
    insert into auth.users(id,raw_user_meta_data) values (current_setting('titan.hr_'||k)::uuid,'{}');
  end loop;
  update public.profiles set created_at = now() - interval '400 days'
   where id in (current_setting('titan.hr_a')::uuid, current_setting('titan.hr_b')::uuid, current_setting('titan.hr_c')::uuid);
end $$;

set local role authenticated;
do $$
declare k text;
begin
  foreach k in array array['a','b','c'] loop
    perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.hr_'||k),'role','authenticated')::text,true);
    perform public.titan_set_source_consent_v1('health_connect',true);
  end loop;
end $$;

-- A and B.
do $$
declare
  a uuid := current_setting('titan.hr_a')::uuid;
  t0 timestamptz := date_trunc('minute', now()) - interval '30 hours';
  imp jsonb; typed record; row public.training_logs%rowtype; r jsonb; ch jsonb; ex jsonb;
  xp0 bigint; xp1 bigint; n int; km numeric; minutes numeric; rev int; logs jsonb;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  -- The watch import arrives first and creates its own session; the athlete then types the same run (10,4 km by mistake).
  imp := public.titan_import_activity_v1('health_connect','hr-hc-run','running',t0 + interval '1 minute',53,10.6);
  assert imp->>'status'='imported', 'fixture: the import creates its session: '||imp::text;
  select * into typed from public.titan_submit_training_session('running','cardio',10.4,'km',jsonb_build_object('duration',52,'note','Sortie du vendredi'),t0);
  select count(*), sum(val), sum(public.titan_numeric_from_json(details,'duration')) into n, km, minutes from public.training_logs where user_id=a and archived_at is null;
  assert n=2 and km=21.0 and minutes=105, 'S0: the same run counts twice: '||n||' / '||km||' / '||minutes;
  select coalesce(sum(xp),0) into xp0 from public.training_logs where user_id=a;

  -- A. Correction: only the changed fields are sent.
  select * into row from public.training_logs where id=typed.log_id::uuid;
  r := public.titan_update_training_session(row.id, row.revision, '{"val":10,"duration":50}'::jsonb);
  assert (r->>'revision')::int = row.revision + 1 and (r->>'val')::numeric = 10 and r->>'unit'='km', 'A: one revision, same unit: '||r::text;
  assert (r->>'date')::timestamptz = row.date and r->>'client_event_id' is not distinct from row.client_event_id::text, 'A: same date, same canonical reference';
  assert (r->'details'->>'note')='Sortie du vendredi', 'A: the note is kept';
  assert (select coalesce(sum(xp),0) from public.training_logs where user_id=a)=xp0, 'A: a correction changes no reward';
  ch := public.titan_session_changes_v1(row.id);
  assert jsonb_array_length(ch)=1 and (ch->0->>'revision')::int = row.revision + 1, 'A: one change readable: '||ch::text;
  assert (select string_agg(c->>'field'||':'||(c->>'before')||'>'||(c->>'after'), ',' order by c->>'field') from jsonb_array_elements(ch->0->'changes') c)
         = 'duration:52>50,val:10.4>10', 'A: what changed, and only that: '||ch::text;
  assert ch->0->'changes'->(case when ch->0->'changes'->0->>'field'='val' then 0 else 1 end)->>'unit' = 'km', 'A: the value carries its unit';
  select count(*), sum(val), sum(public.titan_numeric_from_json(details,'duration')) into n, km, minutes from public.training_logs where user_id=a and archived_at is null;
  assert n=2 and km=20.6 and minutes=103, 'S1: totals follow the correction: '||n||' / '||km||' / '||minutes;

  -- B. The import duplicate is archived.
  select * into row from public.training_logs where id=(imp->>'log_id')::uuid;
  r := public.titan_update_training_session(row.id, row.revision, '{"archived":true}'::jsonb);
  assert r->>'archived_at' is not null, 'B: archived';
  select count(*), sum(val), sum(public.titan_numeric_from_json(details,'duration')) into n, km, minutes from public.training_logs where user_id=a and archived_at is null;
  assert n=1 and km=10 and minutes=50, 'S2: one counted session, the corrected one: '||n||' / '||km||' / '||minutes;
  assert (select coalesce(sum(xp),0) from public.training_logs where user_id=a)=xp0, 'B: archiving removes no reward and grants none';
  ex := public.export_own_data();
  logs := ex->'trainingLogs';
  assert jsonb_array_length(logs)=2, 'B: the export holds both rows: '||jsonb_array_length(logs);
  assert (select count(*) from jsonb_array_elements(logs) l where l->>'archived_at' is not null and l->>'id'=row.id::text)=1, 'B: the export says which one is archived';
  assert (select (l->>'val')::numeric from jsonb_array_elements(logs) l where l->>'id'=typed.log_id)=10, 'B: the export carries the corrected value';
  assert jsonb_array_length(ex->'trainingRevisions')=2, 'B: the export carries the correction and the archive: '||jsonb_array_length(ex->'trainingRevisions');
  assert (select count(*) from jsonb_array_elements(ex->'importedActivities') i where i->>'external_id'='hr-hc-run' and i->>'log_id'=row.id::text)=1, 'B: and the import link';

  -- The source sends the same activity again, « modified » there (10,8 km): already received, never read again.
  r := public.titan_import_activity_v1('health_connect','hr-hc-run','running',t0 + interval '1 minute',55,10.8);
  assert r->>'status'='duplicate' and (r->>'log_id')::uuid=row.id, 'B: replay answers duplicate: '||r::text;
  assert (select count(*) from public.training_logs where user_id=a)=2, 'B: the replay creates no row';
  assert (select archived_at is not null and val=10.6 from public.training_logs where id=row.id), 'B: the replay neither restores nor rewrites the archived import';
  assert (select coalesce(sum(xp),0) from public.training_logs where user_id=a)=xp0, 'B: and grants nothing';

  -- Restore: same row, same reference, revision + 1, no reward; totals come back to S1. Archive again: back to S2.
  select * into row from public.training_logs where id=row.id;
  r := public.titan_update_training_session(row.id, row.revision, '{"archived":false}'::jsonb);
  assert r->>'archived_at' is null and (r->>'revision')::int=row.revision+1 and r->>'client_event_id' is not distinct from row.client_event_id::text, 'B: restored in place';
  select count(*), sum(val) into n, km from public.training_logs where user_id=a and archived_at is null;
  assert n=2 and km=20.6, 'S5: restore brings back the totals of S1: '||n||' / '||km;
  select coalesce(sum(xp),0) into xp1 from public.training_logs where user_id=a;
  assert xp1=xp0, 'B: a restore credits nothing twice: '||xp0||' → '||xp1;
  ch := public.titan_session_changes_v1(row.id);
  assert (select string_agg(c->>'field'||':'||(c->>'after'), ',') from jsonb_array_elements(ch) e, jsonb_array_elements(e->'changes') c) = 'archived:false,archived:true',
         'B: archive and restore are readable, newest first: '||ch::text;
  r := public.titan_update_training_session(row.id, row.revision + 1, '{"archived":true}'::jsonb);
  select count(*), sum(val) into n, km from public.training_logs where user_id=a and archived_at is null;
  assert n=1 and km=10 and (select coalesce(sum(xp),0) from public.training_logs where user_id=a)=xp0, 'S6: archived again, the same totals as S2';
end $$;

-- C. A rejoined split is restored by « Séparer », never by the journal restore.
do $$
declare b uuid := current_setting('titan.hr_b')::uuid; typed record; r jsonb; m jsonb; v_split uuid; ok boolean := false; rev int; xp0 bigint; t1 timestamptz := date_trunc('minute', now()) - interval '3 hours';
begin
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  select * into typed from public.titan_submit_training_session('running','cardio',8,'km',jsonb_build_object('duration',40),t1 + interval '5 minutes');
  r := public.titan_import_activity_v1('health_connect','hr-hc-trap','running',t1,45);
  assert r->>'status'='linked', 'C: fixture linked: '||r::text;
  m := public.titan_resolve_session_match_v1('health_connect','hr-hc-trap','distinct');
  v_split := (m->>'log_id')::uuid;
  m := public.titan_resolve_session_match_v1('health_connect','hr-hc-trap','same');
  assert (select archived_at is not null from public.training_logs where id=v_split), 'C: the rejoin archived the split session';
  select coalesce(sum(xp),0) into xp0 from public.training_logs where user_id=b;
  select revision into rev from public.training_logs where id=v_split;
  begin perform public.titan_update_training_session(v_split, rev, '{"archived":false}'::jsonb); exception when others then ok := sqlerrm='SESSION_MATCH_JOINED'; end;
  assert ok, 'C: the journal restore of a rejoined session is refused';
  assert (select count(*) from public.training_logs where user_id=b and archived_at is null)=1, 'C: still counted once';
  -- A correction of the archived session stays possible (only the restore is guarded), and so does the athlete's own session.
  perform public.titan_update_training_session(v_split, rev, '{"note":"doublon"}'::jsonb);
  m := public.titan_resolve_session_match_v1('health_connect','hr-hc-trap','distinct');
  assert (m->>'log_id')::uuid=v_split and (select archived_at is null from public.training_logs where id=v_split), 'C: « Séparer » restores the same session';
  assert (select coalesce(sum(xp),0) from public.training_logs where user_id=b)=xp0, 'C: without a second reward';
  select revision into rev from public.training_logs where id=v_split;
  perform public.titan_update_training_session(v_split, rev, '{"archived":true}'::jsonb);
  perform public.titan_update_training_session(v_split, rev + 1, '{"archived":false}'::jsonb);
  assert (select archived_at is null from public.training_logs where id=v_split), 'C: once split, the journal archive and restore work as usual';
end $$;

-- D. Ownership.
do $$
declare log uuid; ok boolean := false;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.hr_a'),'role','authenticated')::text,true);
  select id into log from public.training_logs where user_id=current_setting('titan.hr_a')::uuid and archived_at is null limit 1;
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.hr_c'),'role','authenticated')::text,true);
  assert public.titan_session_changes_v1(log) = '[]'::jsonb, 'D: another account reads no change';
  begin perform public.titan_update_training_session(log, 2, '{"archived":true}'::jsonb); exception when others then ok := sqlerrm='SESSION_NOT_FOUND'; end;
  assert ok, 'D: nor archives a session of A';
end $$;
reset role;
do $$
begin
  assert not has_function_privilege('anon','public.titan_session_changes_v1(uuid)','execute'), 'D: no anonymous read';
  assert not has_function_privilege('anon','public.titan_update_training_session(uuid,integer,jsonb)','execute'), 'D: no anonymous edit';
  assert not has_function_privilege('anon','private.titan_session_rejoined_v1(uuid)','execute'), 'D: private helper';
  assert not has_table_privilege('authenticated','public.training_revisions','select'), 'D: revisions are read only through the owner function';
end $$;
rollback;
