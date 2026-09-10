-- TITAN OS v86 - safer public partnership stats
-- Date: 2026-06-04
-- Objectif: remplacer la RPC publique SECURITY DEFINER par une lecture
-- SECURITY INVOKER sur un cache d'agregats publics.

create table if not exists public.titan_public_stats_cache (
    key text primary key,
    payload jsonb not null default '{}'::jsonb,
    refreshed_at timestamptz not null default now()
);

alter table public.titan_public_stats_cache enable row level security;

revoke all on table public.titan_public_stats_cache from public;
grant select on table public.titan_public_stats_cache to anon, authenticated;

drop policy if exists titan_public_stats_cache_read on public.titan_public_stats_cache;
create policy titan_public_stats_cache_read
on public.titan_public_stats_cache
for select
to anon, authenticated
using (key = 'partnership');

with snapshot as (
    select
        (select count(*) from public.profiles) as agents_total,
        (select count(*) from public.profiles where coalesce(is_elite, false)) as elite_total,
        (select min(created_at) from public.profiles) as first_profile_at,
        (select count(*) from public.training_logs) as training_logs_total,
        (select count(*) from public.combat_logs) as combat_logs_total,
        (select count(*) from public.guilds) as guilds_total,
        (select count(*) from public.bosses) as bosses_total,
        (
            coalesce((
                select count(*)
                from public.messages
                where hidden_at is null
                  and (expires_at is null or expires_at > now())
            ), 0)
            +
            coalesce((
                select count(*)
                from public.guild_messages
                where expires_at is null or expires_at > now()
            ), 0)
        ) as active_messages_total
)
insert into public.titan_public_stats_cache (key, payload, refreshed_at)
select
    'partnership',
    jsonb_build_object(
        'agentsTotal', agents_total,
        'eliteTotal', elite_total,
        'trainingLogsTotal', training_logs_total,
        'combatLogsTotal', combat_logs_total,
        'guildsTotal', guilds_total,
        'bossesTotal', bosses_total,
        'activeMessagesTotal', active_messages_total,
        'webVisitors', null,
        'trafficSource', 'analytics_a_connecter',
        'firstProfileAt', first_profile_at
    ),
    now()
from snapshot
on conflict (key) do update
set payload = excluded.payload,
    refreshed_at = excluded.refreshed_at;

create or replace function public.titan_public_partnership_stats()
returns jsonb
language sql
security invoker
stable
set search_path = ''
as $$
    select coalesce((
        select payload || jsonb_build_object('generatedAt', refreshed_at)
        from public.titan_public_stats_cache
        where key = 'partnership'
    ), '{}'::jsonb);
$$;

comment on table public.titan_public_stats_cache is
    'Public aggregate cache for partnership stats. Contains no user-level data.';

comment on function public.titan_public_partnership_stats() is
    'Returns cached public aggregate counters for the TITAN OS partnerships page. No user-level data.';

revoke all on function public.titan_public_partnership_stats() from public;
grant execute on function public.titan_public_partnership_stats() to anon, authenticated;
