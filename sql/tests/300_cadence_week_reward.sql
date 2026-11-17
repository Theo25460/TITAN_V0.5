-- AUD-25: a held week (active days >= the player's own goal) can be claimed once for +50 cosmetic credits, only for the current or the
-- previous week, journaled like any credit change; XP and level untouched; suspended accounts refused. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); s uuid := gen_random_uuid(); week date := (date_trunc('week', now() at time zone 'Europe/Paris'))::date; d integer;
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(s,'{}');
  update public.profiles set game_state = jsonb_build_object('user', jsonb_build_object('weeklyGoalSessions', 2)), credits = 100 where id = a;
  update public.profiles set is_suspended = true where id = s;
  -- Two active days in the previous week (Monday and Wednesday, Paris time), one this week.
  for d in 0..1 loop
    insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
    values (a, 'running', 5, 'km', 10, ((week - 7 + d * 2)::timestamp + interval '10 hours') at time zone 'Europe/Paris', '{"serverReward":true,"effort":{"effort_minutes":45}}', ((week - 7 + d * 2)::timestamp + interval '11 hours') at time zone 'Europe/Paris');
  end loop;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at)
  values (a, 'yoga', 30, 'min', 10, now(), '{"serverReward":true,"effort":{"effort_minutes":30}}', clock_timestamp());
  perform set_config('titan.cw_a',a::text,true); perform set_config('titan.cw_s',s::text,true);
  assert not has_table_privilege('authenticated','private.titan_cadence_claims','select'), 'no API grant on the claims';
  assert not has_function_privilege('anon','public.titan_cadence_week_claim_v1(date)','execute'), 'anonymous cannot claim';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; week date := (date_trunc('week', now() at time zone 'Europe/Paris'))::date;
  a uuid := current_setting('titan.cw_a')::uuid; s uuid := current_setting('titan.cw_s')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_cadence_week_status_v1();
  assert (r->'previous'->>'held')::boolean and (r->'previous'->>'days')::int = 2 and (r->'previous'->>'target')::int = 2, 'last week is held: '||r::text;
  assert not (r->'current'->>'held')::boolean, 'this week is not held yet';
  ok:=false; begin perform public.titan_cadence_week_claim_v1(week); exception when others then ok:=sqlerrm='WEEK_NOT_HELD'; end; assert ok,'an unheld week cannot be claimed';
  ok:=false; begin perform public.titan_cadence_week_claim_v1(week - 14); exception when others then ok:=sqlerrm='WEEK_NOT_CLAIMABLE'; end; assert ok,'older weeks cannot be claimed';
  r := public.titan_cadence_week_claim_v1(week - 7);
  assert (r->>'credits')::int = 50 and (r->>'balance')::int = 150, 'fifty credits added: '||r::text;
  ok:=false; begin perform public.titan_cadence_week_claim_v1(week - 7); exception when others then ok:=sqlerrm='WEEK_ALREADY_CLAIMED'; end; assert ok,'once per week';
  assert (public.titan_cadence_week_status_v1()->'previous'->>'claimed')::boolean, 'the status shows the claim';
  perform set_config('request.jwt.claims',json_build_object('sub',s,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_cadence_week_claim_v1(week - 7); exception when others then ok:=sqlerrm='ACCOUNT_SUSPENDED'; end; assert ok,'suspended accounts are refused';
end $$;
reset role;
do $$
declare a uuid := current_setting('titan.cw_a')::uuid;
begin
  assert (select credits from public.profiles where id = a) = 150, 'balance persisted';
  assert exists (select 1 from private.titan_economy_journal j where j.user_id = a), 'the credit change is journaled';
  assert jsonb_array_length(private.titan_export_extras_v1(a) -> 'cadenceWeekClaims') = 1, 'the claim is in the data export';
  assert private.titan_export_extras_v1(a) ? 'journey', 'earlier export parts are kept';
  delete from auth.users where id = a;
  assert not exists (select 1 from private.titan_cadence_claims where user_id = a), 'erased with the account';
end $$;
rollback;
