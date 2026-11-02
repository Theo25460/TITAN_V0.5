-- V11-09: the sport-specific measures are in place for the 81 sports that only had generic ones. Rollback-only.
begin;
do $$
declare r record; bad text := ''; n integer := 0; f jsonb; ids text[];
begin
  for r in select * from (values ('aerobic_gymnastics','choreographies',3),('elliptical','resistance',3),('fitness_class','class_type',3),('hurdles','reps',3),('rope_jump','jumps',3),('rowing_machine','avg_split_500',4),('sprint','reps',3),('trail','terrain',4),('zumba','style',3),('fencing','weapon',4),('kendo','bouts',3),('hiit','format',4),('alpinism','ascent_m',3),('hiking','terrain',3),('nordic_walk','avg_hr',3),('roller','discipline',3),('rowing','avg_split_500',4),('snowshoeing','avg_hr',3),('via_ferrata','ascent_m',3),('walking','avg_hr',3),('abs_session','exercises',3),('bodyweight','sets',3),('crossfit','wod_type',4),('dips','sets',3),('gymnastics','apparatus',3),('parkour','runs',3),('plank','hold_best_s',3),('pole_dance','figures',3),('pompes','sets',3),('squat','sets',3),('street_workout','sets',3),('tractions','sets',3),('bmx','discipline',3),('paragliding','flights',3),('skydiving','freefall_s',3),('dance','style',3),('canyoning','rappels',3),('kayak','stroke_rate',3),('kitesurf','wind_kt',3),('motocross','laps',3),('paddle','avg_hr',3),('ski_touring','ascent_m',3),('snowboard','runs',3),('wakeboard','laps',3),('windsurf','wind_kt',3),('acrobatic_gymnastics','routines',3),('archery','arrows',3),('artistic_gymnastics','apparatus',3),('ballet','barre_minutes',3),('bowling','games',3),('breakdance','rounds',3),('cheerleading','routines',3),('circus','skills',3),('climbing_route','routes',3),('curling','ends',3),('darts','legs',3),('diving','dives',3),('dressage','level',3),('equestrian','work',3),('eventing','phase',3),('golf','holes',4),('hiphop','choreographies',3),('horse_racing','races',3),('ice_climbing','pitches',3),('ice_skating','practice',3),('karting','laps',3),('rhythmic_gymnastics','apparatus',3),('sailing','wind_kt',3),('salsa','style',3),('show_jumping','jumps',3),('sport_climbing','routes',3),('springboard_diving','dives',3),('surfing','waves',3),('trampoline_gymnastics','routines',3),('american_football','minutes_played',3),('baseball','innings',3),('cricket','runs_scored',3),('lacrosse','minutes_played',3),('softball','innings',3),('ultimate','minutes_played',3),('water_polo','minutes_played',3)) as t(sport, first_id, cnt) loop
    select s.extra_fields into f from public.sports s where s.id = r.sport;
    if f is null then continue; end if; -- a sport absent from a lean test catalogue is not judged
    n := n + 1;
    -- Migration 50 reorders the measures across all 260 sports. Migration 31's IDs
    -- remain supported for old records, but no longer have to be the first field.
    if not exists(select 1 from jsonb_array_elements(f) x where x->>'id'=r.first_id) then bad := bad || r.sport || '(legacy ID) '; end if;
    if (select count(*) from jsonb_array_elements(f) x where (x->>'priority')::int <= 3) <> 3 then bad := bad || r.sport || '(priority) '; end if;
    select array_agg(x ->> 'id') into ids from jsonb_array_elements(f) x;
    if (select count(*) from unnest(ids)) <> (select count(distinct i) from unnest(ids) i) then bad := bad || r.sport || '(duplicate id) '; end if;
    if exists (select 1 from jsonb_array_elements(f) x where x->>'type'='number' and ((x->>'min')::numeric > (x->>'max')::numeric)) then bad := bad || r.sport || '(bounds) '; end if;
    if exists (select 1 from jsonb_array_elements(f) x where x->>'type'='select' and jsonb_array_length(coalesce(x->'options','[]'::jsonb)) < 2) then bad := bad || r.sport || '(options) '; end if;
  end loop;
  assert n > 0, 'the catalogue holds the sports under test';
  assert bad = '', 'sport measures: ' || bad;
  -- running its own heart-rate measures are untouched by this migration
  assert (select count(*) from public.sports where id='running' and (extra_fields -> 0 ->> 'id') = 'session_type') in (0,1), 'running is not part of the lot';
end $$;
rollback;
