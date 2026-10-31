-- V11-76 (COM-D7, automatic part): a club earns the trophy "A traversé <saison> ensemble" when a season has closed and enough of its members took
-- part in it. The rule is decided by the server from frozen season results and never from a claim: the club must have had at least three members who
-- joined the CLUB before the season ended and who took part in the season (final result frozen), and they must be at least half of the club's members
-- of that time (a club cannot recruit season participants afterwards to win it). One trophy per club and season (key "saison-<first Monday>"), awarded
-- once (the table's unique key), attributed to no person (awarded_by stays empty), cosmetic, never bought or transferred, hidden with an archived club.
-- The function is called by a member when their clubs load; it only looks at the clubs of the caller and at the last twelve closed seasons, and is
-- idempotent. No XP, credit or advantage. Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_club_trophy_sync_v1(); delete from private.titan_club_trophies where key like 'saison-%' and awarded_by is null.

create or replace function public.titan_club_trophy_sync_v1()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_n integer := 0;
  v_s record;
  v_c record;
  v_added uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  perform private.titan_rate_limit(v_uid, 'club_trophy_sync', 60);
  for v_s in select s.id, s.name, s.starts_on, s.ends_on from private.titan_seasons s where s.closed_at is not null order by s.starts_on desc limit 12 loop
    for v_c in
      select c.id from private.titan_clubs c
       where c.archived_at is null
         and exists (select 1 from private.titan_club_members me where me.club_id = c.id and me.user_id = v_uid)
    loop
      if (select count(*) from private.titan_club_members m
            join private.titan_season_members sm on sm.user_id = m.user_id and sm.season_id = v_s.id and sm.final_minutes is not null
           where m.club_id = v_c.id and m.joined_at < (v_s.ends_on + 1)::timestamp at time zone 'Europe/Paris') >= 3
         and (select count(*) from private.titan_club_members m
                join private.titan_season_members sm on sm.user_id = m.user_id and sm.season_id = v_s.id and sm.final_minutes is not null
               where m.club_id = v_c.id and m.joined_at < (v_s.ends_on + 1)::timestamp at time zone 'Europe/Paris') * 2
             >= (select count(*) from private.titan_club_members m where m.club_id = v_c.id and m.joined_at < (v_s.ends_on + 1)::timestamp at time zone 'Europe/Paris')
      then
        insert into private.titan_club_trophies (club_id, key, title, note, awarded_on)
        values (v_c.id, 'saison-' || to_char(v_s.starts_on, 'YYYY-MM-DD'), left('A traversé ' || v_s.name || ' ensemble', 60), 'Attribué automatiquement.', v_s.ends_on)
        on conflict (club_id, key) do nothing returning id into v_added;
        if v_added is not null then v_n := v_n + 1; v_added := null; end if;
      end if;
    end loop;
  end loop;
  return v_n;
end;
$function$;

revoke all on function public.titan_club_trophy_sync_v1() from public, anon;
grant execute on function public.titan_club_trophy_sync_v1() to authenticated;
