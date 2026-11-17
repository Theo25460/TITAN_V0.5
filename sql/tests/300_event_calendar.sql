-- AUD-04: the event calendar filler keeps the next weeks covered without ever touching what an administrator planned: one common quest per
-- week, back-to-back seasons (28 days), expeditions (6 weeks) and world goals (12 weeks), no overlap, idempotent, not callable by players,
-- valid against every table constraint. Full rollback.
begin;
do $$
declare r jsonb; r2 jsonb; mon date := (date_trunc('week', now() at time zone 'Europe/Paris'))::date; admin_season date; n integer; ok boolean;
begin
  assert not has_function_privilege('authenticated', 'private.titan_event_calendar_fill_v1(integer)', 'execute'), 'players cannot run the filler';
  assert not has_function_privilege('anon', 'private.titan_event_calendar_fill_v1(integer)', 'execute'), 'anonymous cannot run the filler';
  assert has_function_privilege('service_role', 'private.titan_event_calendar_fill_v1(integer)', 'execute'), 'the scheduler role can run it';

  -- An administrator already planned a season starting in four weeks and the common quest of next week: both must stay untouched.
  admin_season := mon + 35;
  insert into private.titan_seasons (name, rules, starts_on) values ('Saison admin', 'Règles admin', admin_season);
  insert into private.titan_common_quests (week_start, title, detail, target_minutes) values (mon + 7, 'Quête admin', null, 999);

  r := private.titan_event_calendar_fill_v1(12);
  assert (r->>'commonQuests')::integer = 11, 'eleven weeks filled around the admin week: ' || r::text;
  assert (select count(*) from private.titan_common_quests where week_start >= mon and week_start < mon + 84) = 12, 'every week of the horizon has a common quest';
  assert (select title from private.titan_common_quests where week_start = mon + 7) = 'Quête admin' and (select target_minutes from private.titan_common_quests where week_start = mon + 7) = 999, 'the admin quest is kept as is';
  assert (select name from private.titan_seasons where starts_on = admin_season) = 'Saison admin', 'the admin season is kept as is';
  assert not exists (select 1 from private.titan_seasons a join private.titan_seasons b on a.id < b.id and a.starts_on <= b.ends_on and a.ends_on >= b.starts_on), 'seasons never overlap';
  assert exists (select 1 from private.titan_seasons where starts_on = mon and created_by is null), 'a season starts this week';
  assert not exists (select 1 from public.titan_expeditions a join public.titan_expeditions b on a.id < b.id and a.published and b.published and a.starts_at < b.ends_at and a.ends_at > b.starts_at), 'expeditions never overlap';
  assert exists (select 1 from public.titan_expeditions where published and now() < ends_at and starts_at < now() + interval '7 days'), 'an expedition is running or starts within the week';
  assert not exists (select 1 from private.titan_world_goals a join private.titan_world_goals b on a.id < b.id and a.starts_on <= b.ends_on and a.ends_on >= b.starts_on), 'world goals never overlap';
  assert exists (select 1 from private.titan_world_goals where starts_on <= mon + 6 and ends_on >= mon), 'a world goal covers this week';
  assert (select bool_and(extract(isodow from starts_on) = 1) from private.titan_seasons where created_by is null), 'auto seasons start on a Monday';

  r2 := private.titan_event_calendar_fill_v1(12);
  assert (r2->>'commonQuests')::integer = 0 and (r2->>'seasons')::integer = 0 and (r2->>'expeditions')::integer = 0 and (r2->>'worldGoals')::integer = 0, 'a second run adds nothing: ' || r2::text;

  select count(*) into n from private.titan_seasons; perform private.titan_event_calendar_fill_v1(26);
  assert (select count(*) from private.titan_seasons) > n, 'a longer horizon extends the calendar';
  assert not exists (select 1 from private.titan_seasons a join private.titan_seasons b on a.id < b.id and a.starts_on <= b.ends_on and a.ends_on >= b.starts_on), 'still no overlap after extending';
end $$;
set local role authenticated;
do $$
declare ok boolean := false;
begin
  begin perform private.titan_event_calendar_fill_v1(12); exception when insufficient_privilege then ok := true; end;
  assert ok, 'an authenticated caller is refused';
end $$;
rollback;
