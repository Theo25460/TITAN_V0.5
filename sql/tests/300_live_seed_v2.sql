-- TITAN LIVE seed v2: the seeded missions are exactly those the engine proposes after the sport measure contracts.
-- A mission on a statistic no entry form asks for any more is gone; every other mission and every reward rule stays.
do $$
declare v_n int;
begin
  select count(*) into v_n from private.titan_live_missions
   where id in ('sanctuaire.r_pain_after','joute.r_rally_quality_score','scene.r_elevation','stade.r_elevation','escouade.r_elevation',
     'pilotage.r_elevation','odyssee.r_stations','odyssee.r_runs','scene.r_runs','sentier.r_runs','brasier.r_drills');
  if v_n<>0 then raise exception 'seed v2: % retired missions are still seeded', v_n; end if;
  if not exists(select 1 from private.titan_live_missions where id='forge.seuil' and verify='engine') then raise exception 'seed v2: forge.seuil missing'; end if;
  if not exists(select 1 from private.titan_live_missions where id='roue.r_sprints' and verify='report') then raise exception 'seed v2: roue.r_sprints (home trainer) missing'; end if;
  select count(*) into v_n from private.titan_live_missions where field in ('pain_after','pain_before','rally_quality_score') or requires in ('pain_before');
  if v_n<>0 then raise exception 'seed v2: % missions still read health or self-rated data', v_n; end if;
  select count(*) into v_n from private.titan_live_sports;
  if v_n<>260 then raise exception 'seed v2: % sports seeded, 260 expected', v_n; end if;
  select count(*) into v_n from private.titan_live_finds;
  if v_n<>120 then raise exception 'seed v2: % finds seeded, 120 expected', v_n; end if;
end $$;
