-- New API INSERTs only: preserve existing analytics/history and its admin SELECT policy.
-- Prepared only: coordinate the collector/contract rollout; no live migration in this lot.
-- The caller/Supabase migration runner owns the transaction. Never BEGIN/COMMIT here.
create or replace function private.titan_analytics_payload_valid_v300(
  p_name text, p_page text, p_source text, p_referrer text, p_metadata jsonb
) returns boolean
language plpgsql immutable security invoker
set search_path = pg_catalog
as $function$
declare property text; value jsonb; pattern text; scalar text;
begin
  if p_name is null or p_name not in (
    'signup','onboarding_completed','first_session','second_session','goal_created','record_unlocked',
    'campaign_started','campaign_progress','challenge_joined','weekly_recap_viewed',
    'premium_checkout_started','premium_activated','sport_navigation_searched','sport_navigation_filtered',
    'analysis_comparison_viewed','analysis_report_viewed','analysis_report_exported',
    'analysis_view_created','analysis_view_renamed','analysis_view_deleted','analysis_view_opened','dynamic_page_opened',
    'support_opened','support_category_selected','support_submission_result'
  ) then return false; end if;
  if p_page is null or p_page not like '/%' or char_length(p_page)>80 or p_page ~ '[?#[:cntrl:]]'
    or p_referrer is not null or (p_source is not null and char_length(p_source)>40)
    or jsonb_typeof(p_metadata) is distinct from 'object'
    or p_metadata->'v' is distinct from '300'::jsonb
    or jsonb_typeof(p_metadata->'consent') is distinct from 'string'
    or p_metadata->>'consent' not in ('granted','anonymous') then return false; end if;

  -- New support counters require explicit permission and only closed aggregate dimensions.
  if p_name in ('support_opened','support_category_selected','support_submission_result') then
    if p_page not in ('/service','/social') or p_source is not null
      or p_metadata->>'consent'<>'granted' then return false; end if;
    if p_name<>'support_opened' and (jsonb_typeof(p_metadata->'category') is distinct from 'string'
      or p_metadata->>'category' not in ('bug','compte','titanplus','donnees','communaute','autre')) then return false; end if;
    if p_name='support_submission_result' and (jsonb_typeof(p_metadata->'result') is distinct from 'string'
      or p_metadata->>'result' not in ('received','rejected','uncertain','unavailable','offline')) then return false; end if;
    for property,value in select key,val from jsonb_each(p_metadata-'v'-'consent') as props(key,val) loop
      if p_name<>'support_opened' and property='category' then continue; end if;
      if p_name='support_submission_result' and property='result' then continue; end if;
      return false;
    end loop;
    return true;
  end if;

  if p_source is not null and (p_metadata->>'consent'='anonymous'
    or p_name like 'analysis_%' or p_name='dynamic_page_opened') then return false; end if;
  for property,value in select key,val from jsonb_each(p_metadata-'v'-'consent') as props(key,val) loop
    if p_name like 'analysis_%' or p_name='dynamic_page_opened' then
      if p_name in ('analysis_view_created','analysis_view_renamed','analysis_view_deleted','analysis_view_opened')
        and property='kind' and jsonb_typeof(value)='string' and value#>>'{}' in ('report','comparison')
      then continue; end if;
      return false;
    end if;
    pattern:=case property
      when 'family' then '^[a-z]{2,20}$'
      when 'sport' then '^[a-z0-9_]{2,40}$'
      when 'step' then '^[a-z0-9_-]{1,30}$'
      when 'source' then '^[a-z0-9_-]{1,30}$'
      when 'plan' then '^[a-z0-9_-]{1,30}$'
      when 'world' then '^[a-z0-9_-]{1,30}$'
      when 'chapter' then '^[0-9]{1,2}$'
      when 'kind' then '^[a-z_]{1,20}$'
      when 'count' then '^[0-9]{1,4}$'
      else null end;
    -- JSON numeric 12 and 12.0 represent the same integer; normalize scale without rounding fractions.
    scalar:=case when jsonb_typeof(value)='number' then trim_scale((value#>>'{}')::numeric)::text
      else value#>>'{}' end;
    if pattern is null or jsonb_typeof(value) not in ('string','number')
      or (property in ('family','sport','kind') and jsonb_typeof(value)<>'string')
      or (property in ('chapter','count') and jsonb_typeof(value)<>'number')
      or scalar collate "C" !~ pattern then return false; end if;
  end loop;
  return true;
end
$function$;
revoke all on function private.titan_analytics_payload_valid_v300(text,text,text,text,jsonb) from public;
grant execute on function private.titan_analytics_payload_valid_v300(text,text,text,text,jsonb) to anon, authenticated;

-- Add one restrictive rule; preserve every existing insert/owner/admin policy.
do $migration$ begin
  drop policy if exists analytics_events_support_anonymous_v300 on public.analytics_events;
  create policy analytics_events_support_anonymous_v300
  on public.analytics_events as restrictive for insert to anon, authenticated
  with check (event_name not in ('support_opened','support_category_selected','support_submission_result') or user_id is null);
end $migration$;
