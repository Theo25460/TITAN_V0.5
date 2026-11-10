do $migration$
declare previous_lock_timeout text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '5s', true);

  -- The legacy INSERT policy allowed clients to insert a pre-accepted relationship.
  revoke insert on table public.friendships from public, anon, authenticated;
  drop policy if exists friendships_insert_own on public.friendships;

  -- Only the coach portal, entitlement trigger and service sweep call these helpers.
  revoke execute on function
    private.titan_coach_plan(uuid),
    private.titan_coach_capacity(uuid),
    private.titan_coach_seat_write(uuid, uuid, boolean, timestamptz),
    private.titan_coach_sync_seats(uuid),
    private.titan_coach_seats_sweep(),
    private.titan_entitlements_coach_hook()
    from public, anon, authenticated;

  perform set_config('lock_timeout', previous_lock_timeout, true);
end
$migration$;

notify pgrst, 'reload schema';
