begin;

-- TITAN OS v43 rescue patch.
-- Use this if the live site started failing right after running v43.
-- It keeps the new sport-specific DB data, but removes constraints that can
-- block older deployed front code while the capped XP engine is not live yet.

do $$
begin
  if to_regclass('public.training_logs') is not null then
    alter table public.training_logs drop constraint if exists training_logs_xp_reasonable_v43;
    alter table public.training_logs drop constraint if exists training_logs_details_size_v43;
  end if;
end $$;

do $$
begin
  if to_regclass('public.sports') is not null then
    update public.sports
    set extra_fields = '[]'::jsonb
    where extra_fields is null
       or jsonb_typeof(extra_fields) <> 'array';

    update public.sports
    set xp_rules = '{}'::jsonb
    where xp_rules is null
       or jsonb_typeof(xp_rules) <> 'object';

    update public.sports
    set validation_rules = '{}'::jsonb
    where validation_rules is null
       or jsonb_typeof(validation_rules) <> 'object';
  end if;
end $$;

grant select on public.sports to anon, authenticated;
grant select on public.mobs to anon, authenticated;
grant select on public.bosses to anon, authenticated;
grant select, insert, update, delete on public.training_logs to authenticated;

commit;
