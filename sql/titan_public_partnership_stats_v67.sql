-- TITAN OS v67 - public aggregate stats for the discreet partnerships page.
-- No personal data is returned: only counts and dates useful for a public brief.

create or replace function public.titan_public_partnership_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profiles bigint := 0;
    v_elite bigint := 0;
    v_first_profile timestamptz := null;
    v_training_logs bigint := 0;
    v_combat_logs bigint := 0;
    v_guilds bigint := 0;
    v_bosses bigint := 0;
    v_active_messages bigint := 0;
begin
    select
        count(*),
        count(*) filter (where coalesce(is_elite, false)),
        min(created_at)
    into v_profiles, v_elite, v_first_profile
    from public.profiles;

    select count(*) into v_training_logs from public.training_logs;
    select count(*) into v_combat_logs from public.combat_logs;
    select count(*) into v_guilds from public.guilds;
    select count(*) into v_bosses from public.bosses;

    select
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
    into v_active_messages;

    return jsonb_build_object(
        'agentsTotal', v_profiles,
        'eliteTotal', v_elite,
        'trainingLogsTotal', v_training_logs,
        'combatLogsTotal', v_combat_logs,
        'guildsTotal', v_guilds,
        'bossesTotal', v_bosses,
        'activeMessagesTotal', v_active_messages,
        'webVisitors', null,
        'trafficSource', 'analytics_a_connecter',
        'firstProfileAt', v_first_profile,
        'generatedAt', now()
    );
end;
$$;

comment on function public.titan_public_partnership_stats() is
    'Returns public aggregate counters for the TITAN OS partnerships page. No user-level data.';

revoke all on function public.titan_public_partnership_stats() from public;
grant execute on function public.titan_public_partnership_stats() to anon, authenticated;
