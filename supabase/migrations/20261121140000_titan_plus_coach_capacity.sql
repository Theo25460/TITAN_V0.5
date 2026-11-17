-- OWNER DECISION — Monetisation, lot C (21 November 2026): only the Coach offers give coaching places.
-- The published V1 rule let a personal TITAN+ (4,99 € a month) follow 20 athletes, while Coach (19,99 €) follows 5 and Coach Ultra (39,99 €) 15:
-- the cheapest offer had four times the capacity of the professional one, and a TITAN+ subscriber who moved to Coach saw 15 links paused.
-- The offers the owner decided on 4 November 2026 (docs/PLAY_CONSOLE_SUBSCRIPTIONS_2026-11-04.md) give coaching capacity to Coach (5) and
-- Coach Ultra (15) only; TITAN+ is an individual offer. No new policy is invented: without a Coach offer, an account follows the Classique
-- capacity (3), with or without TITAN+. Nothing is deleted or revoked: links beyond 3 of a TITAN+ account are paused (20261121100000) and
-- resume with a Coach offer. Production has no coach link on 21 November 2026 and no paid TITAN+: nobody loses anything on application.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: re-apply private.titan_coach_capacity of 20261102090000.

create or replace function private.titan_coach_capacity(p_uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_seats integer;
begin
  select p.seats into v_seats from private.titan_coach_plan(p_uid) p;
  -- Places come from a Coach offer only; otherwise the Classique capacity applies, with or without a personal TITAN+.
  return case when v_seats is not null then v_seats else 3 end;
end;
$function$;
revoke all on function private.titan_coach_capacity(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
