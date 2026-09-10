-- TITAN OS v89 — callers can only inspect their own limits.

create or replace function public.titan_economy_limits(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_subject uuid := coalesce(auth.uid(), p_user_id);
  v_is_elite boolean := false;
begin
  if v_subject is not null then
    select coalesce(p.is_elite, false)
    into v_is_elite
    from public.profiles as p
    where p.id = v_subject;
  end if;

  return jsonb_build_object(
    'isElite', coalesce(v_is_elite, false),
    'chatGlobalCost', 2,
    'chatGuildCost', 3,
    'guildCreateCost', 3000,
    'messageMaxLength', case when coalesce(v_is_elite, false) then 700 else 280 end,
    'freeMessageMaxLength', 280,
    'eliteMessageMaxLength', 700,
    'globalRetentionHours', 48,
    'guildRetentionHours', 72,
    'weeklyXpCap', 9600,
    'weeklyCreditCap', 1800,
    'eliteCapMultiplier', 1,
    'trainingCreditRatio', 0.16,
    'fairPlayVersion', 'v89'
  );
end;
$$;

revoke all on function public.titan_economy_limits(uuid) from public;
revoke execute on function public.titan_economy_limits(uuid) from anon;
grant execute on function public.titan_economy_limits(uuid) to authenticated;
