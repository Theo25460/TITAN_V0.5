-- Monetisation, lot D (20261121130000): no cosmetic credit from a session the server did not confirm (achievements), and the hourly hold
-- release never pays a session that was archived, excluded or rejected while held. Full rollback.
begin;
create function public.zz_ec_claim(p_user uuid, p_id text) returns text language plpgsql as $$
declare r record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select * into r from public.titan_claim_achievement(p_id);
  return case when r.unlocked then 'unlocked:' || r.reward_credits else 'already' end;
exception when others then return sqlerrm;
end $$;
-- Fixtures are written as the service, as the anti-cheat and the administrators do (a player's request cannot set these columns).
create function public.zz_ec_service() returns void language sql as $$ select set_config('request.jwt.claims', '{"role":"service_role"}', true) $$;
create function public.zz_ec_log(p_user uuid, p_details jsonb, p_val numeric default 1) returns uuid language sql as $$
  select public.zz_ec_service();
  insert into public.training_logs (user_id, sport, category, val, unit, xp, date, details, client_event_id)
  values (p_user, 'running', 'cardio', p_val, 'km', 50, now() - interval '1 hour', p_details, gen_random_uuid()) returning id
$$;
do $$
declare
  u uuid := '55000000-0000-4000-8000-0000000000d1';
  held uuid; susp uuid; rej uuid; arch uuid; excluded uuid; review uuid; ok uuid; credits_before integer;
begin
  insert into auth.users (id, is_anonymous) values (u, false);
  insert into public.profiles (id, username) values (u, 'Économie') on conflict (id) do nothing;
  insert into public.achievements_config (id, title, target_value, reward_credits) values ('sess_zz_mon_2', 'Deux séances', 2, 100), ('run_zz_mon_10', 'Dix km', 10, 100);

  -- Sessions that never earned a reward do not unlock anything.
  perform public.zz_ec_log(u, '{"historical": true, "serverReward": false}', 300);
  perform public.zz_ec_log(u, '{"historical": true, "serverReward": false}', 300);
  held := public.zz_ec_log(u, '{"serverReward": true}', 300);
  insert into private.titan_reward_holds (log_id, user_id, xp, credits, release_at) values (held, u, 50, 5, now() - interval '1 minute');
  -- Review columns are set as the anti-cheat review sets them; the player-facing guard trigger is bypassed for the fixture only.
  susp := public.zz_ec_log(u, '{"serverReward": true}', 300);
  rej := public.zz_ec_log(u, '{"serverReward": true}', 300);
  set local session_replication_role = replica;
  update public.training_logs set is_suspicious = true where id = susp;
  update public.training_logs set status = 'rejected' where id = rej;
  set local session_replication_role = origin;
  assert (select count(*) from public.training_logs where user_id = u and (is_suspicious or status = 'rejected')) = 2, 'fixture: one suspicious, one rejected';
  assert public.zz_ec_claim(u, 'sess_zz_mon_2') = 'ACHIEVEMENT_NOT_EARNED', 'historical, held, suspicious and rejected sessions do not count';
  assert public.zz_ec_claim(u, 'run_zz_mon_10') = 'ACHIEVEMENT_NOT_EARNED', 'nor their kilometres';

  -- Confirmed sessions do, and a session recorded before the server stamp existed (no serverReward key) still counts.
  perform public.zz_ec_log(u, '{"serverReward": true}', 6);
  perform public.zz_ec_log(u, '{}', 6);
  select credits into credits_before from public.profiles where id = u;
  assert public.zz_ec_claim(u, 'sess_zz_mon_2') = 'unlocked:100', 'two confirmed sessions unlock it';
  assert public.zz_ec_claim(u, 'sess_zz_mon_2') = 'already', 'claimed once only';
  assert public.zz_ec_claim(u, 'run_zz_mon_10') = 'unlocked:100', 'twelve confirmed kilometres';
  assert (select credits from public.profiles where id = u) = credits_before + 200, 'paid exactly once each';

  -- Hold release: archived, excluded or rejected while held → cancelled, nothing credited; under review → stays held; clean → released.
  arch := public.zz_ec_log(u, '{"serverReward": true}');
  excluded := public.zz_ec_log(u, '{"serverReward": true}');
  review := public.zz_ec_log(u, '{"serverReward": true}');
  ok := public.zz_ec_log(u, '{"serverReward": true}');
  insert into private.titan_reward_holds (log_id, user_id, xp, credits, release_at)
    select x, u, 50, 5, now() - interval '1 minute' from unnest(array[arch, excluded, review, ok]) x;
  set local session_replication_role = replica;
  update public.training_logs set archived_at = now() where id = arch;
  update public.training_logs set status = 'rejected' where id = excluded;
  update public.training_logs set status = 'pending_review' where id = review;
  set local session_replication_role = origin;
  assert (select count(*) from public.training_logs where id in (arch, excluded, review) and (archived_at is not null or status <> 'valid')) = 3, 'fixture: three changed while held';
  select credits into credits_before from public.profiles where id = u;
  perform private.titan_release_due_reward_holds();
  assert (select status from private.titan_reward_holds where log_id = arch) = 'cancelled', 'archived while held: not paid';
  assert (select status from private.titan_reward_holds where log_id = excluded) = 'cancelled', 'rejected while held: not paid';
  assert (select status from private.titan_reward_holds where log_id = review) = 'held', 'under review: waits';
  assert (select status from private.titan_reward_holds where log_id = ok) = 'released', 'a clean session is paid';
  assert (select status from private.titan_reward_holds where log_id = held) = 'released', 'the first held session, clean, is paid too';
  assert (select credits from public.profiles where id = u) = credits_before + 10, 'credits of the two clean holds only';
end $$;
rollback;
