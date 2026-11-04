-- V11-18: "Exporter toutes mes données" really exports everything the account holds. The previous definition (kept below, key for key)
-- left out the adventure, goals, moments, public card, expeditions, challenges joined, guild membership, correction history and TITAN+ access,
-- and cannot know the V1.1 tables. Additive: every existing key keeps its name and value; keys are only added.
-- Rows come from the same generic reader as before (public tables are skipped when absent); private V1.1 tables are read here, for the caller only.
-- Left out on purpose: other people's data (their messages to the account stay with them), admin-only tables, billing provider payloads,
-- analytics (collected under a separate consent) and server-side derived counters.
-- The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: re-apply the definition of public.export_own_data() from tools/db/baseline/04-functions-public.sql.

create or replace function public.export_own_data()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb := '{}'::jsonb;
  v_friendships jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select coalesce(to_jsonb(p), '{}'::jsonb) into v_profile from public.profiles p where p.id = v_uid;

  if to_regclass('public.friendships') is not null
     and public.titan_table_has_column('friendships', 'user_id_1')
     and public.titan_table_has_column('friendships', 'user_id_2') then
    select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) into v_friendships
      from public.friendships f where f.user_id_1 = v_uid or f.user_id_2 = v_uid;
  end if;

  return jsonb_build_object(
    'exportedAt', now(),
    'userId', v_uid,
    'profile', v_profile,
    'trainingLogs', public.titan_export_rows('training_logs', 'user_id', v_uid),
    'activities', public.titan_export_rows('activities', 'user_id', v_uid),
    'messages', public.titan_export_rows('messages', 'sender_id', v_uid),
    'friendships', v_friendships,
    'shopHistory', public.titan_export_rows('shop_history', 'user_id', v_uid),
    'achievements', public.titan_export_rows('user_achievements', 'user_id', v_uid),
    'inventory', public.titan_export_rows('inventory', 'user_id', v_uid),
    'socialChallengesAsChallenger', public.titan_export_rows('social_challenges', 'challenger_id', v_uid),
    'socialChallengesAsOpponent', public.titan_export_rows('social_challenges', 'opponent_id', v_uid),
    'cacheReconciliationReports', public.titan_export_rows('titan_cache_reconciliation_reports', 'user_id', v_uid),
    'suspiciousActions', public.titan_export_rows('titan_suspicious_actions', 'user_id', v_uid),
    -- Added by V11-18.
    'trainingRevisions', public.titan_export_rows('training_revisions', 'user_id', v_uid),
    'goals', public.titan_export_rows('sport_goals', 'user_id', v_uid),
    'adventureProfile', public.titan_export_rows('adventure_profiles', 'user_id', v_uid),
    'adventureProgress', public.titan_export_rows('adventure_progress', 'user_id', v_uid),
    'adventureRewards', public.titan_export_rows('adventure_rewards', 'user_id', v_uid),
    'adventureQuestRewards', public.titan_export_rows('adventure_quest_rewards', 'user_id', v_uid),
    'campaignState', public.titan_export_rows('campaign_state', 'user_id', v_uid),
    'bestiary', public.titan_export_rows('user_bestiary', 'user_id', v_uid),
    'moments', public.titan_export_rows('titan_moments', 'user_id', v_uid),
    'momentCheers', public.titan_export_rows('titan_moment_cheers', 'user_id', v_uid),
    'publicCard', public.titan_export_rows('titan_public_cards', 'user_id', v_uid),
    'expeditions', public.titan_export_rows('titan_expedition_members', 'user_id', v_uid),
    'challengesJoined', public.titan_export_rows('titan_challenge_members', 'user_id', v_uid),
    'guildMembership', public.titan_export_rows('guild_members', 'user_id', v_uid),
    'titanPlusAccess', public.titan_export_rows('premium_access', 'user_id', v_uid),
    'periodicQuestClaims', coalesce((select jsonb_agg(to_jsonb(c)) from private.titan_periodic_quest_claims c where c.user_id = v_uid), '[]'::jsonb),
    'sourceConsents', coalesce((select jsonb_agg(to_jsonb(c)) from private.titan_source_consents c where c.user_id = v_uid), '[]'::jsonb),
    'importedActivities', coalesce((select jsonb_agg(to_jsonb(i)) from private.titan_imported_activities i where i.user_id = v_uid), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.export_own_data() from public, anon;
grant execute on function public.export_own_data() to authenticated;
