-- V1.6.4 — Migration de l’historique (migration 20261123150000). Synthetic accounts only, full rollback.
-- A. A batch: every row gets one result (added, linked, duplicate, skipped with its reason); note, feeling and a kg value are kept;
--    history gives no XP; a replayed call (lost answer) changes nothing; opening the same file again resumes the same batch.
-- B. The per-batch report is readable from any device; another account reads nothing; no anonymous access.
-- C. Withdrawal: the preview changes nothing; applying removes only the untouched sessions the batch added; the session already in the
--    journal, a session corrected after import, one another source joined and one the athlete split are kept; a corrected file can
--    then be imported again.
begin;
do $$
declare k text;
begin
  foreach k in array array['a','b'] loop
    perform set_config('titan.hm_'||k, gen_random_uuid()::text, true);
    insert into auth.users(id,raw_user_meta_data) values (current_setting('titan.hm_'||k)::uuid,'{}');
  end loop;
  update public.profiles set created_at = now() - interval '900 days'
   where id in (current_setting('titan.hm_a')::uuid, current_setting('titan.hm_b')::uuid);
  assert not has_function_privilege('anon','public.titan_import_batch_rows_v1(uuid,jsonb)','execute'), 'anonymous cannot import';
  assert not has_function_privilege('anon','public.titan_import_batch_withdraw_v1(uuid,boolean)','execute'), 'anonymous cannot withdraw';
  assert not has_function_privilege('authenticated','private.titan_import_core(uuid,text,text,text,timestamptz,numeric,numeric,jsonb)','execute'), 'the core stays private';
end $$;

set local role authenticated;
do $$
declare
  a uuid := current_setting('titan.hm_a')::uuid;
  t0 timestamptz := date_trunc('minute', now()) - interval '200 days';
  typed record; b jsonb; r jsonb; ok boolean; xp0 bigint; rep jsonb; rows jsonb; muscu public.training_logs%rowtype; bid uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  -- Already in the journal: a run typed 200 days ago, with the athlete's note.
  select * into typed from public.titan_submit_training_session('running','cardio',10.4,'km',jsonb_build_object('duration',52,'note','Mon fractionné'),t0);
  perform set_config('titan.hm_typed', typed.log_id, true);
  select coalesce(sum(xp),0) into xp0 from public.training_logs where user_id=a;

  ok:=false; begin perform public.titan_import_batch_open_v1('xls','0123456789abcdef',10); exception when others then ok:=sqlerrm='IMPORT_BATCH_INVALID'; end; assert ok,'an unknown format is refused';
  b := public.titan_import_batch_open_v1('csv_profile','0123456789abcdef',8,'historique.csv');
  assert not (b->>'resumed')::boolean and b->>'status'='open' and (b->>'next_row')::int = 1, 'a new batch: '||b::text;
  bid := (b->>'id')::uuid;
  perform set_config('titan.hm_batch', bid::text, true);

  r := public.titan_import_batch_rows_v1(bid, jsonb_build_array(
    -- row 2: the same run as the typed one (3 min later, 51 min): linked, nothing added, the note stays the athlete's.
    jsonb_build_object('row',2,'id','csv-run-1','sport','running','startedAt',(t0 + interval '3 minutes')::text,'minutes',51,'km',10.4,'note','Note du fichier'),
    -- row 3: a weight session with its kg value, feeling and note.
    jsonb_build_object('row',3,'id','csv-muscu-1','sport','muscu_gym','startedAt',(t0 + interval '1 day')::text,'minutes',60,'value',4250,'unit','kg','rpe',7,'note','Jambes'),
    -- row 4: a ride (added), row 5: a swim in metres (added), row 6: recent (skipped by the server), row 7: unreadable sport.
    jsonb_build_object('row',4,'id','csv-ride-1','sport','cycling','startedAt',(t0 + interval '2 days')::text,'minutes',90,'km',40),
    jsonb_build_object('row',5,'id','csv-swim-1','sport','swimming','startedAt',(t0 + interval '3 days')::text,'minutes',40,'km',1.5),
    jsonb_build_object('row',6,'id','csv-run-recent','sport','running','startedAt',(now() - interval '3 days')::text,'minutes',30,'km',6)));
  assert (r->>'processed')::int = 5 and (r->'counts'->>'added')::int = 3 and (r->'counts'->>'linked')::int = 1 and (r->'counts'->>'skipped')::int = 1, 'first call: '||r::text;
  assert (r->>'next_row')::int = 7 and r->>'status'='open', 'the batch expects row 7: '||r::text;
  -- Lost answer: the same call again changes nothing.
  r := public.titan_import_batch_rows_v1(bid, jsonb_build_array(jsonb_build_object('row',4,'id','csv-ride-1','sport','cycling','startedAt',(t0 + interval '2 days')::text,'minutes',90,'km',40)));
  assert (r->>'replayed')::int = 1 and (r->>'processed')::int = 0 and (r->'counts'->>'added')::int = 3, 'a replayed row is not processed twice: '||r::text;
  -- Restart elsewhere: opening the same file resumes the same batch at row 7.
  b := public.titan_import_batch_open_v1('csv_profile','0123456789abcdef',8,'historique.csv');
  assert (b->>'resumed')::boolean and (b->>'id')::uuid = bid and (b->>'next_row')::int = 7, 'the same file resumes its batch: '||b::text;
  r := public.titan_import_batch_rows_v1(bid, jsonb_build_array(
    jsonb_build_object('row',7,'skip','unknown_sport'),
    jsonb_build_object('row',8,'skip','pas_un_motif'),
    jsonb_build_object('row',9,'id','csv-run-2','sport','running','startedAt',(t0 + interval '10 days')::text,'minutes',45,'km',9)));
  assert r->>'status'='done' and (r->>'done_rows')::int = 8 and r->>'finished_at' is not null, 'every row has a result: '||r::text;
  assert (r->'reasons'->>'recent')::int = 1 and (r->'reasons'->>'unknown_sport')::int = 1 and (r->'reasons'->>'server_invalid')::int = 1, 'reasons kept: '||r::text;

  assert (select coalesce(sum(xp),0) from public.training_logs where user_id=a) = xp0, 'history gives no XP';
  assert (select count(*) from public.training_logs where user_id=a and archived_at is null) = 5, 'typed run + 4 added sessions';
  assert (select details->>'note' from public.training_logs where id = typed.log_id::uuid) = 'Mon fractionné', 'the athlete''s note is never replaced';
  select * into muscu from public.training_logs l where l.user_id=a and l.sport='muscu_gym';
  assert muscu.val = 4250 and muscu.unit='kg' and (muscu.details->>'duration')::numeric = 60 and muscu.details->'bio'->>'rpe' = '7' and muscu.details->>'note'='Jambes'
     and muscu.details->>'historical'='true' and muscu.xp = 0, 'kg value, duration, feeling and note kept: '||row_to_json(muscu)::text;
  assert (select val||unit from public.training_logs where user_id=a and sport='swimming') = '1500m', 'a swim stays in metres';

  -- B. Report, paged by outcome.
  rep := public.titan_import_batch_v1(bid, 'skipped');
  assert jsonb_array_length(rep->'rows') = 3, 'three skipped rows: '||rep::text;
  rep := public.titan_import_batch_v1(bid);
  assert jsonb_array_length(rep->'rows') = 8 and rep->'rows'->0->>'outcome'='linked' and (rep->'rows'->0->>'log_id')::uuid = typed.log_id::uuid, 'row 2 is linked to the typed run: '||rep::text;
  assert jsonb_array_length(public.titan_import_batches_v1()) = 1, 'the batch is listed';
end $$;

-- Another account reads and withdraws nothing.
do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.hm_b'),'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_import_batch_v1(current_setting('titan.hm_batch')::uuid); exception when others then ok:=sqlerrm='IMPORT_BATCH_UNKNOWN'; end; assert ok, 'B cannot read A''s batch';
  ok:=false; begin perform public.titan_import_batch_withdraw_v1(current_setting('titan.hm_batch')::uuid, true); exception when others then ok:=sqlerrm='IMPORT_BATCH_UNKNOWN'; end; assert ok, 'B cannot withdraw it';
  ok:=false; begin perform public.titan_import_batch_rows_v1(current_setting('titan.hm_batch')::uuid, '[{"row":1,"skip":"empty"}]'::jsonb); exception when others then ok:=sqlerrm='IMPORT_BATCH_UNKNOWN'; end; assert ok, 'B cannot write in it';
  assert jsonb_array_length(public.titan_import_batches_v1()) = 0, 'B lists nothing';
end $$;

reset role;
-- Provenance (private tables, read as the owner of the database).
do $$
declare a uuid := current_setting('titan.hm_a')::uuid; bid uuid := current_setting('titan.hm_batch')::uuid;
begin
  assert (select count(*) from private.titan_imported_activities where user_id=a and batch_id=bid) = 5, 'provenance: batch on every added or linked row';
  assert (select count(*) from private.titan_imported_activities where user_id=a and batch_id=bid and batch_row is null) = 0, 'provenance: row number';
end $$;

-- C. Withdrawal (the RPCs run with the athlete's identity; the private tables are checked directly).
do $$
declare
  a uuid := current_setting('titan.hm_a')::uuid;
  bid uuid := current_setting('titan.hm_batch')::uuid;
  t0 timestamptz;
  ride public.training_logs%rowtype; swim public.training_logs%rowtype; run2 public.training_logs%rowtype;
  p jsonb; r jsonb; b jsonb; hc jsonb; n int;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  select * into ride from public.training_logs where user_id=a and sport='cycling';
  select * into swim from public.training_logs where user_id=a and sport='swimming';
  select * into run2 from public.training_logs where user_id=a and sport='running' and id <> current_setting('titan.hm_typed')::uuid;
  -- After the import: the athlete corrects the ride; Santé Connect brings the same swim (it joins the imported one).
  perform public.titan_update_training_session(ride.id, ride.revision, '{"val":41}'::jsonb);
  perform public.titan_set_source_consent_v1('health_connect', true);
  hc := public.titan_import_activity_v1('health_connect','hm-hc-swim','swimming',swim.date + interval '2 minutes',38,1.5);
  assert hc->>'status'='linked' and (hc->>'log_id')::uuid = swim.id, 'fixture: the watch swim joins the imported one: '||hc::text;

  p := public.titan_import_batch_withdraw_v1(bid, false);
  assert not (p->>'applied')::boolean and (p->'effects'->>'remove')::int = 2 and (p->'effects'->>'detach')::int = 1
     and (p->'effects'->>'kept_corrected')::int = 1 and (p->'effects'->>'kept_linked')::int = 1, 'preview: '||p::text;
  assert (select count(*) from public.training_logs where user_id=a) = 5, 'the preview changes nothing';

  r := public.titan_import_batch_withdraw_v1(bid, true);
  assert (r->>'applied')::boolean and r->>'status'='withdrawn' and (r->'effects'->>'remove')::int = 2, 'applied: '||r::text;
  assert exists (select 1 from public.training_logs where id = current_setting('titan.hm_typed')::uuid and archived_at is null and val = 10.4 and details->>'note'='Mon fractionné'), 'the session already in the journal is intact';
  assert exists (select 1 from public.training_logs where id = ride.id and val = 41), 'the corrected ride is kept with its correction';
  assert exists (select 1 from public.training_logs where id = swim.id), 'the swim another source joined is kept';
  assert not exists (select 1 from public.training_logs where id = run2.id), 'the untouched run of the batch is removed';
  assert not exists (select 1 from public.training_logs where user_id=a and sport='muscu_gym'), 'the untouched weight session is removed';
  assert not exists (select 1 from public.training_receipts where user_id=a and client_event_id = run2.client_event_id), 'its receipt goes with it';
  assert not exists (select 1 from private.titan_imported_activities where user_id=a and source='archive' and external_id='csv-run-1'), 'the link to the typed run is undone';
  assert exists (select 1 from private.titan_imported_activities where user_id=a and source='health_connect' and external_id='hm-hc-swim' and log_id = swim.id), 'the watch link is untouched';
  r := public.titan_import_batch_withdraw_v1(bid, true);
  assert (r->>'applied')::boolean and (r->'effects'->>'remove')::int = 2, 'withdrawing twice changes nothing more';

  -- The corrected file can be imported again: a new batch adds the run back; the kept rows answer « already imported ».
  b := public.titan_import_batch_open_v1('csv_profile','0123456789abcdef',3,'historique.csv');
  assert not (b->>'resumed')::boolean and (b->>'id')::uuid <> bid, 'a withdrawn file opens a new batch';
  r := public.titan_import_batch_rows_v1((b->>'id')::uuid, jsonb_build_array(
    jsonb_build_object('row',2,'id','csv-run-2','sport','running','startedAt',run2.date::text,'minutes',45,'km',9),
    jsonb_build_object('row',3,'id','csv-ride-1','sport','cycling','startedAt',ride.date::text,'minutes',90,'km',40)));
  assert (r->'counts'->>'added')::int = 1 and (r->'counts'->>'duplicate')::int = 1, 'reimport after withdrawal: '||r::text;
  select count(*) into n from public.training_logs where user_id=a and sport='cycling';
  assert n = 1 and exists (select 1 from public.training_logs where id = ride.id and val = 41), 'the corrected ride is neither doubled nor overwritten';
end $$;
rollback;
