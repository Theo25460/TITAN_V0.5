-- V11-82 (PREM13/PREM14): the list a scheduled job needs to re-read Google Play for subscriptions it has not heard about lately.
-- A real-time notification can be lost; without this sweep an ended subscription would keep its Premium access for ever. The function only NAMES the
-- tokens worth re-reading (active Google Play rows that end within a day or have been silent for three days, oldest first); the access decision is still
-- Google's own answer, applied by the server function through titan_apply_entitlement_v1. Service role only: no API grant, nothing for a player.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_play_entitlements_due_v1(integer);

create or replace function public.titan_play_entitlements_due_v1(p_limit integer default 50)
returns table (user_id uuid, external_id text)
language sql
stable
security definer
set search_path = ''
as $function$
  select e.user_id, e.external_id
    from private.titan_entitlements e
   where e.source = 'google_play'
     and e.is_active
     and (coalesce(e.ends_at, e.last_event_at) < now() + interval '1 day' or e.last_event_at < now() - interval '3 days')
   order by e.last_event_at asc
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$function$;

revoke all on function public.titan_play_entitlements_due_v1(integer) from public, anon, authenticated;
grant execute on function public.titan_play_entitlements_due_v1(integer) to service_role;
