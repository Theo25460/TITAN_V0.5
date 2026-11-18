-- Monetisation, lot D (21 November 2026): no reward from a session the server did not confirm.
-- 1. titan_claim_achievement counted every unarchived session: historical back-dated entries (0 XP, up to 300 a day, or 50 per history
--    import), sessions whose reward is held or cancelled by the anti-cheat, sessions an administrator excluded, rejected or flagged ones.
--    Cosmetic credits of an achievement (up to 5000 each, outside the weekly cap) could be claimed from them. The criteria now read only
--    the sessions that earned their reward: not archived, not suspicious, not rejected/flagged/pending review, not historical, not marked
--    serverReward = false, and no held or cancelled hold. Sessions recorded before the server stamp existed (no serverReward key) still count:
--    no long-time player loses progress. Achievements already unlocked are kept.
-- 2. The hourly hold release credited a held reward without looking at archiving or status: a player could archive a held session (it then
--    leaves the risk review) and be credited 24 hours later. It also read the session without a lock, so an exclusion committing at the same
--    time could lose the race. The job now locks and re-reads the session (same order as the exclusion: session, then hold), cancels the
--    hold of an excluded, rejected or archived session, and leaves a session under review held. A session under review (flagged or
--    pending_review) is not even a candidate of the batch of 500: held ones at the head of the queue could otherwise fill every batch and
--    delay every clean hold behind them. The locked re-read keeps its own check for a review that starts while the job runs.
-- Same functions as 20260911000358 and 20261020000000 otherwise. Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: re-apply public.titan_claim_achievement of 20260911000358 and private.titan_release_due_reward_holds of 20261020000000;
-- drop function private.titan_achievement_sessions(uuid).

create or replace function private.titan_achievement_sessions(p_uid uuid)
returns setof public.training_logs
language sql
stable
security definer
set search_path = ''
as $function$
  select l.* from public.training_logs l
   where l.user_id = p_uid and l.archived_at is null and l.is_suspicious is not true
     and coalesce(l.status, 'valid') not in ('rejected', 'flagged', 'pending_review')
     and coalesce(l.details ->> 'historical', 'false') <> 'true'
     and coalesce(l.details ->> 'serverReward', 'true') <> 'false'
     and not exists (select 1 from private.titan_reward_holds h where h.log_id = l.id and h.status in ('held', 'cancelled'));
$function$;
revoke all on function private.titan_achievement_sessions(uuid) from public, anon, authenticated;

create or replace function public.titan_claim_achievement(p_achievement_id text)
returns table(achievement_id text,unlocked boolean,reward_credits integer,credits_after integer)
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); a public.achievements_config%rowtype; p public.profiles%rowtype;
 progress numeric:=0; reward integer:=0; inserted boolean:=false;
begin
 if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select * into p from public.profiles where id=u for update;
 if not found or p.is_suspended then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
 select * into a from public.achievements_config where id=p_achievement_id;
 if not found then raise exception 'ACHIEVEMENT_NOT_FOUND' using errcode='22023'; end if;
 if exists(select 1 from public.user_achievements ua where ua.user_id=u and ua.achievement_id=a.id) then
  return query select a.id,false,0,coalesce(p.credits,0); return;
 end if;
 case
 when a.id like 'lvl_%' then progress:=p.level;
 when a.id like 'sess_%' or a.id like 'sessions_%' then
   select count(*) into progress from private.titan_achievement_sessions(u);
 when a.id like 'str_%' then
   select coalesce(sum(val),0) into progress from private.titan_achievement_sessions(u) where unit='kg';
 when a.id like 'run_%' then
   select coalesce(sum(val),0) into progress from private.titan_achievement_sessions(u) where unit='km';
 when a.id like 'xp_%' then
   select coalesce(sum(xp),0) into progress from private.titan_achievement_sessions(u);
 when a.id like 'rich_%' then
   select coalesce(sum((response->>'credits')::integer),0) into progress from public.training_receipts where user_id=u;
 when a.id like 'multi_sport_%' then
   select count(distinct sport) into progress from private.titan_achievement_sessions(u);
 when a.id='profile_set' then progress:=case when p.avatar is not null and p.avatar<>'avatar_1.png' then 1 else 0 end;
 when a.id='support_elite' then progress:=case when p.is_elite then 1 else 0 end;
 when a.id in ('night_owl','early_bird','weekend_warrior') then
   select count(*) into progress from private.titan_achievement_sessions(u) l where true
   and case a.id when 'night_owl' then extract(hour from l.date at time zone 'Europe/Paris')>=23
    when 'early_bird' then extract(hour from l.date at time zone 'Europe/Paris')<7
    else extract(isodow from l.date at time zone 'Europe/Paris')=7 end;
 when a.id like 'streak_%' then
   select coalesce(max(n),0) into progress from (
    select count(*) n from (
      select d,d-(row_number() over(order by d))::integer grp from (
       select distinct (date at time zone 'Europe/Paris')::date d from private.titan_achievement_sessions(u)
      ) days
    ) islands group by grp
   ) runs;
 else raise exception 'ACHIEVEMENT_CRITERION_UNVERIFIED' using errcode='22023';
 end case;
 if progress<coalesce(a.target_value,1) then raise exception 'ACHIEVEMENT_NOT_EARNED' using errcode='23514'; end if;
 -- Paying for TITAN+ never yields progression currency.
 reward:=case when a.id='support_elite' then 0 else least(5000,greatest(0,coalesce(a.reward_credits,0))) end;
 insert into public.user_achievements(user_id,achievement_id,unlocked_at) values(u,a.id,now())
 on conflict do nothing returning true into inserted;
 if coalesce(inserted,false) then
  update public.profiles set credits=coalesce(credits,0)+reward where id=u returning * into p;
 else reward:=0;
 end if;
 return query select a.id,coalesce(inserted,false),reward,coalesce(p.credits,0);
end $$;

create or replace function private.titan_release_due_reward_holds()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row record;
  v_log record;
  v_done integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('titan_release_reward_holds', 0)) then
    return 0;
  end if;
  for v_row in
    select h.log_id
      from private.titan_reward_holds h
      join public.training_logs l on l.id = h.log_id
      join public.profiles p on p.id = h.user_id
     where h.status = 'held' and h.release_at <= now()
       and not coalesce(p.is_suspended, false) and coalesce(p.status, 'active') not in ('suspended', 'banned')
       -- Under review: the hold waits and does not take a place in the batch (the locked re-read below checks again).
       and coalesce(l.status, 'valid') not in ('flagged', 'pending_review')
     order by h.release_at
     limit 500
  loop
    begin
      -- Lock and re-read the session first (the order an exclusion uses: session, then hold), so an exclusion or an archive that is
      -- committing is seen before any reward is credited.
      select l.is_suspicious, l.archived_at, coalesce(l.status, 'valid') as status into v_log
        from public.training_logs l where l.id = v_row.log_id for share;
      if coalesce(v_log.is_suspicious, false) or v_log.archived_at is not null or v_log.status = 'rejected' then
        -- Excluded, rejected, or archived by the player while held: the reward is not credited (an administrator may still restore it).
        perform private.titan_reward_hold_settle(v_row.log_id, false);
      elsif v_log.status in ('flagged', 'pending_review') then
        null; -- still under review: the hold waits
      else
        perform private.titan_reward_hold_settle(v_row.log_id, true, true);
        v_done := v_done + 1;
      end if;
    exception when others then
      raise warning 'titan_release_due_reward_holds: hold for session % skipped (%)', v_row.log_id, sqlerrm;
    end;
  end loop;
  return v_done;
end;
$function$;
revoke all on function private.titan_release_due_reward_holds() from public, anon, authenticated;

notify pgrst, 'reload schema';
