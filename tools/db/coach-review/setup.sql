-- V1.9.3: fixtures COMMITTED in a disposable titan_test_ database. Coach Lou follows Zoé and has prepared her next proposal in the review.
-- Run only by tools/db/test-coach-review-concurrency.sh (refuses other databases).
do $$
declare c uuid := gen_random_uuid(); a uuid := gen_random_uuid(); l uuid; inv jsonb; d jsonb;
begin
  insert into auth.users(id, raw_user_meta_data) values (c, '{}'), (a, '{}');
  insert into private.titan_feature_flags(key, enabled, rollout, description) values ('screens.coach_review', true, 100, 'QA') on conflict (key) do update set enabled = true;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true); inv := public.titan_coach_portal('invite');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  l := (public.titan_coach_portal('accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 30, 'consent', true))->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  d := public.titan_coach_review_v1('prepare', jsonb_build_object('link_id', l, 'title', 'Seuil 3 × 8 min', 'sport', 'running', 'planned_date', current_date + 2))->'draft';
  perform set_config('request.jwt.claims', '{}', true);
  create table if not exists public.cr_ids(k text primary key, v uuid);
  insert into public.cr_ids values ('c', c), ('a', a), ('l', l), ('d', (d->>'id')::uuid) on conflict (k) do update set v = excluded.v;
end $$;
