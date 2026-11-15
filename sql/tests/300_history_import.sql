-- AUD-43: importing past sessions in batches — history only (no XP, no credit), provenance 'archive', the same file twice adds
-- nothing, overlaps are linked, recent or invalid items are skipped, batch bounds enforced. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}');
  update public.profiles set created_at = now() - interval '400 days' where id = a;
  perform set_config('titan.hi_a',a::text,true);
  assert not has_function_privilege('anon','public.titan_import_history_v1(jsonb)','execute'), 'anonymous cannot import';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; xp0 integer; a uuid := current_setting('titan.hi_a')::uuid;
  batch jsonb := jsonb_build_array(
    jsonb_build_object('id','strava-1','sport','running','startedAt',(now() - interval '200 days')::text,'minutes',50,'km',10),
    jsonb_build_object('id','strava-2','sport','cycling','startedAt',(now() - interval '150 days')::text,'minutes',90,'km',40),
    jsonb_build_object('id','strava-3','sport','running','startedAt',(now() - interval '5 days')::text,'minutes',30,'km',6),
    jsonb_build_object('id','strava-4','sport','sport_inconnu','startedAt',(now() - interval '100 days')::text,'minutes',30),
    jsonb_build_object('id','strava-5','sport','running','startedAt','pas une date','minutes',30));
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_import_history_v1('[]'::jsonb); exception when others then ok:=sqlerrm='IMPORT_BATCH_INVALID'; end; assert ok,'an empty batch is refused';
  select xp into xp0 from public.profiles where id = a;
  r := public.titan_import_history_v1(batch);
  assert (r->>'imported')::int = 2 and (r->>'skipped')::int = 3 and (r->>'remaining')::int = 0 and not (r->>'limited')::boolean, 'two past sessions imported, three skipped: '||r::text;
  assert (select xp from public.profiles where id = a) = xp0, 'history gives no XP';
  r := public.titan_import_history_v1(batch);
  assert (r->>'imported')::int = 0 and (r->>'duplicate')::int = 2, 'the same file twice adds nothing: '||r::text;
  r := public.titan_import_history_v1(jsonb_build_array(jsonb_build_object('id','other-file-1','sport','running','startedAt',(now() - interval '200 days' + interval '5 minutes')::text,'minutes',48,'km',10)));
  assert (r->>'linked')::int = 1, 'an overlapping session from another export is linked, not doubled: '||r::text;
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.hi_a')::uuid;
begin
  assert (select count(*) from public.training_logs where user_id = a and archived_at is null) = 2, 'two sessions in the journal';
  assert (select bool_and(coalesce(xp,0) = 0 and coalesce(details->>'historical','false') = 'true') from public.training_logs where user_id = a), 'recorded as history';
  assert (select count(*) from private.titan_imported_activities where user_id = a and source = 'archive') = 3, 'provenance kept privately';
end $$;
rollback;
