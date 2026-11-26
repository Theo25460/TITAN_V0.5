-- V1.9.6: builds the lot's scenario on a disposable titan_test_ database — Coach Lou (Coach Pro, then Coach, then Coach Pro again) and
-- eight athletes in one group, a block of four weeks prepared from a template, three variants (Paul a week later, Inès on Wednesdays,
-- Malo's long run on Sunday and no race), Sacha's link ended, Léa and Hugo paused by fewer places — and prints the server's own answers at
-- each step (groups, preview, sends with their per-recipient results, the replay of a lost answer, a second send, the resumption, the
-- review, an athlete leaving, the deletion), so the website and Android tests replay real payloads (tests/fixtures/coach-group.json).
-- Everything is rolled back. Dates are relative to the day it runs. Usage: node tools/db/coach-group/build-fixtures.mjs psql -h … -d titan_test_…
begin;
insert into private.titan_feature_flags(key, enabled, rollout, description) values
  ('screens.coach_groups', true, 100, 'QA'), ('screens.coach_programs', true, 100, 'QA'), ('screens.coach_followup', true, 100, 'QA'),
  ('screens.coach_cycle_report', true, 100, 'QA') on conflict (key) do update set enabled = true;
create function pg_temp.id(k text) returns uuid language sql immutable as $$ select ('19600000-0000-4000-8000-' || lpad(k, 12, '0'))::uuid $$;
insert into auth.users(id, raw_user_meta_data) select pg_temp.id(k), '{}' from unnest(array['c1', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']) k;
update public.profiles p set username = n.name from (values ('c1', 'Coach Lou'), ('a1', 'Zoé'), ('a2', 'Noé'), ('a3', 'Paul'), ('a4', 'Inès'), ('a5', 'Malo'),
  ('a6', 'Léa'), ('a7', 'Hugo'), ('a8', 'Sacha')) n(k, name) where p.id = pg_temp.id(n.k);
create function pg_temp.as_(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create function pg_temp.p(u uuid, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_portal(a, d); end $$;
create function pg_temp.g(u uuid, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_program_v1(a, d); end $$;
create function pg_temp.q(u uuid, a text, d jsonb) returns jsonb language plpgsql as $$ begin perform pg_temp.as_(u); return public.titan_coach_group_v1(a, d); end $$;
create function pg_temp.err(u uuid, a text, d jsonb) returns text language plpgsql as $$ begin perform pg_temp.q(u, a, d); return 'ok'; exception when others then return sqlerrm; end $$;
create function pg_temp.link(c uuid, a uuid, r integer) returns uuid language plpgsql as $$
declare inv jsonb; v uuid; begin inv := pg_temp.p(c, 'invite', '{}');
  v := (pg_temp.p(a, 'accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date - 90, 'consent', true))->>'id')::uuid;
  update public.coach_links set accepted_at = now() - make_interval(mins => 100 - r) where id = v; return v; end $$;
create function pg_temp.revoke(a uuid, l uuid) returns jsonb language plpgsql as $$
begin return pg_temp.p(a, 'revoke', jsonb_build_object('link_id', l, 'revision', (select revision from public.coach_links where id = l))); end $$;
create function pg_temp.pro(on_ boolean) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(pg_temp.id('c1'), 'google_play', 'fx-coach-lou-pro-v196', on_, case when on_ then 'active' else 'canceled' end, 'test', clock_timestamp(), null, 'titan03', null,
    case when on_ then now() + interval '30 days' else now() end, case when on_ then now() + interval '30 days' else now() end, null, null);
end $$;
create table pg_temp.out(n serial, k text, v jsonb);
create function pg_temp.keep(k text, v jsonb) returns void language sql as $$ insert into pg_temp.out(k, v) values (k, v) $$;
do $$
declare c uuid := pg_temp.id('c1'); a uuid[] := array[]::uuid[]; l uuid[] := array[]::uuid[]; i integer; s jsonb := '[]'::jsonb; prog jsonb; g jsonb; d jsonb; r jsonb;
  mon date := date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date + 7; op1 uuid := pg_temp.id('f01'); pl jsonb;
begin
  for i in 1..8 loop a := a || pg_temp.id('a' || i); end loop;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(c, 'google_play', 'fx-coach-lou-v196', true, 'active', 'test', clock_timestamp(), null, 'titan02', null, now() + interval '30 days', now() + interval '30 days', null, null);
  perform pg_temp.pro(true);
  for i in 1..8 loop l := l || pg_temp.link(c, a[i], i); end loop;
  for i in 1..4 loop
    s := s || jsonb_build_array(jsonb_build_object('key', 'w' || i || '-tue', 'week', i, 'day', 2, 'title', 'Fractionné ' || i, 'sport', 'running', 'instructions', '6 × 400 m'),
                                jsonb_build_object('key', 'w' || i || '-thu', 'week', i, 'day', 4, 'title', 'Footing ' || i, 'sport', 'running'),
                                jsonb_build_object('key', 'w' || i || '-sat', 'week', i, 'day', 6, 'title', case when i = 4 then 'Course 10 km' else 'Sortie longue ' || i end, 'sport', 'running'));
  end loop;
  prog := pg_temp.g(c, 'save_program', jsonb_build_object('title', 'Bloc 10 km — 4 semaines', 'weeks', 4, 'goals', '["Courir 10 km en 50 min"]'::jsonb, 'sessions', s));
  perform pg_temp.keep('ids', jsonb_build_object('coach', c, 'program', prog->>'id', 'monday', mon, 'links', (select jsonb_object_agg(n, l[k]) from unnest(array['Zoé', 'Noé', 'Paul', 'Inès', 'Malo', 'Léa', 'Hugo', 'Sacha']) with ordinality u(n, k))));
  perform pg_temp.keep('library', pg_temp.g(c, 'library', '{}'));
  perform pg_temp.keep('groups_empty', pg_temp.q(c, 'groups', '{}'));
  g := pg_temp.q(c, 'create_group', jsonb_build_object('title', 'Groupe 10 km du mardi', 'link_ids', to_jsonb(l)));
  perform pg_temp.keep('create_group', g);
  perform pg_temp.keep('group_new', pg_temp.q(c, 'group', jsonb_build_object('id', g->>'id')));
  d := pg_temp.q(c, 'prepare', jsonb_build_object('group_id', g->>'id', 'program_id', prog->>'id', 'start_date', mon));
  perform pg_temp.keep('prepare', d);
  d := d->'dispatch';
  -- Sacha ends the link; the Coach Pro offer lapses: five places for seven links, Léa and Hugo are paused.
  perform pg_temp.revoke(a[8], l[8]);
  perform pg_temp.pro(false);
  perform pg_temp.keep('groups', pg_temp.q(c, 'groups', '{}'));
  perform pg_temp.keep('group', pg_temp.q(c, 'group', jsonb_build_object('id', g->>'id')));
  d := pg_temp.q(c, 'dispatch', jsonb_build_object('id', d->>'id'));
  perform pg_temp.keep('dispatch_blocked', d);
  r := pg_temp.q(c, 'variant', jsonb_build_object('id', d->>'id', 'revision', d->'revision', 'link_id', l[3], 'variant', '{"shift_weeks": 1}'::jsonb));
  perform pg_temp.keep('variant_paul', r); d := r->'dispatch';
  r := pg_temp.q(c, 'variant', jsonb_build_object('id', d->>'id', 'revision', d->'revision', 'link_id', l[4], 'variant', '{"day_map": {"2": 3}}'::jsonb));
  perform pg_temp.keep('variant_ines', r); d := r->'dispatch';
  r := pg_temp.q(c, 'variant', jsonb_build_object('id', d->>'id', 'revision', d->'revision', 'link_id', l[5], 'variant', '{"moves": [{"key": "w2-sat", "week": 2, "day": 7}], "skip": ["w4-sat"]}'::jsonb));
  perform pg_temp.keep('variant_malo', r); d := r->'dispatch';
  perform pg_temp.keep('conflict_error', to_jsonb(pg_temp.err(c, 'send', jsonb_build_object('id', d->>'id', 'preview_key', 'stale', 'op_id', gen_random_uuid()))));
  r := pg_temp.q(c, 'send', jsonb_build_object('id', d->>'id', 'preview_key', d->>'preview_key', 'op_id', op1));
  perform pg_temp.keep('send1', r);
  perform pg_temp.keep('send1_replay', pg_temp.q(c, 'send', jsonb_build_object('id', d->>'id', 'preview_key', d->>'preview_key', 'op_id', op1)));
  d := pg_temp.q(c, 'dispatch', jsonb_build_object('id', d->>'id'));
  perform pg_temp.keep('dispatch_sent1', d);
  r := pg_temp.q(c, 'send', jsonb_build_object('id', d->>'id', 'preview_key', d->>'preview_key', 'op_id', pg_temp.id('f02')));
  perform pg_temp.keep('send2', r);
  perform pg_temp.keep('dispatch_sent2', pg_temp.q(c, 'dispatch', jsonb_build_object('id', d->>'id')));
  perform pg_temp.keep('group_sent2', pg_temp.q(c, 'group', jsonb_build_object('id', g->>'id')));
  -- Coach Pro again: the resumption serves Léa and Hugo only.
  perform pg_temp.pro(true);
  d := pg_temp.q(c, 'dispatch', jsonb_build_object('id', d->>'id'));
  perform pg_temp.keep('dispatch_resume', d);
  r := pg_temp.q(c, 'send', jsonb_build_object('id', d->>'id', 'preview_key', d->>'preview_key', 'op_id', pg_temp.id('f03')));
  perform pg_temp.keep('send3', r);
  d := pg_temp.q(c, 'dispatch', jsonb_build_object('id', d->>'id'));
  perform pg_temp.keep('dispatch_sent3', d);
  r := pg_temp.q(c, 'variant', jsonb_build_object('id', d->>'id', 'revision', d->'revision', 'link_id', l[8], 'excluded', true));
  perform pg_temp.keep('variant_exclude', r); d := r->'dispatch';
  r := pg_temp.q(c, 'send', jsonb_build_object('id', d->>'id', 'preview_key', d->>'preview_key', 'op_id', pg_temp.id('f04')));
  perform pg_temp.keep('send4', r);
  perform pg_temp.keep('dispatch_complete', pg_temp.q(c, 'dispatch', jsonb_build_object('id', d->>'id')));
  -- Answers: Zoé accepts everything, Noé wants to discuss one session.
  pl := pg_temp.g(a[1], 'athlete', '{}');
  perform pg_temp.g(a[1], 'answer', jsonb_build_object('id', pl#>>'{plans,0,id}', 'all', 'accept'));
  pl := pg_temp.g(a[2], 'athlete', '{}');
  perform pg_temp.g(a[2], 'answer', jsonb_build_object('id', pl#>>'{plans,0,id}', 'decisions', '[{"key": "w1-tue", "answer": "discuss", "note": "Genou fragile, je préfère des côtes"}]'::jsonb));
  perform pg_temp.keep('review', pg_temp.q(c, 'review', jsonb_build_object('id', g->>'id')));
  perform pg_temp.keep('program_athlete_zoe', pg_temp.g(a[1], 'athlete', '{}'));
  perform pg_temp.keep('program_athlete_paul', pg_temp.g(a[3], 'athlete', '{}'));
  perform pg_temp.keep('snapshot_zoe', pg_temp.p(a[1], 'snapshot', '{}'));
  perform pg_temp.keep('athlete_group_error', to_jsonb(pg_temp.err(a[1], 'groups', '{}')));
  -- Malo leaves; then the group is deleted.
  perform pg_temp.revoke(a[5], l[5]);
  perform pg_temp.keep('review_left', pg_temp.q(c, 'review', jsonb_build_object('id', g->>'id')));
  perform pg_temp.keep('snapshot', pg_temp.p(c, 'snapshot', '{}'));
  perform pg_temp.keep('delete_group', pg_temp.q(c, 'delete_group', jsonb_build_object('id', g->>'id')));
  perform pg_temp.keep('groups_after_delete', pg_temp.q(c, 'groups', '{}'));
  perform pg_temp.keep('program_athlete_zoe_after_delete', pg_temp.g(a[1], 'athlete', '{}'));
end $$;
select jsonb_build_object('key', k, 'value', v) from pg_temp.out order by n;
rollback;
