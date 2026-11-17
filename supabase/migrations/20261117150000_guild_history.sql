-- AUD-44 (lot « irremplaçable », 15/11/2026): the chronicle of a guild — its last weeks in effort minutes against its weekly target,
-- how many were reached together, and its longest run of reached weeks. A team that has held twenty weeks together does not start
-- again from zero elsewhere. Computed on the fly with the same rule as titan_guild_week (normalized effort, 90 min per member and per
-- day, trusted sessions only) for the guild's CURRENT members (someone who left no longer counts, someone who joined brings their
-- past weeks): an honest approximation, stated as such. Members only; nothing stored, nothing granted.
-- Additive. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: drop function public.titan_guild_history_v1(integer).

create or replace function public.titan_guild_history_v1(p_weeks integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '8s'
as $function$
declare
  v_uid uuid := auth.uid();
  v_guild public.guilds%rowtype;
  v_weeks integer := least(greatest(coalesce(p_weeks, 12), 1), 26);
  v_monday date := (date_trunc('week', now() at time zone 'Europe/Paris'))::date;
  v_from timestamptz;
  v_rows jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select g.* into v_guild from public.guild_members gm join public.guilds g on g.id = gm.guild_id where gm.user_id = v_uid limit 1;
  if v_guild.id is null then return null; end if;
  v_from := (v_monday - 7 * v_weeks)::timestamp at time zone 'Europe/Paris';
  with days as (
    select (d.day - ((extract(isodow from d.day)::integer) - 1))::date as week, d.minutes
    from public.guild_members gm
    cross join lateral private.titan_effort_days(gm.user_id, v_from, (v_monday::timestamp at time zone 'Europe/Paris'), '-infinity'::timestamptz, 90) d
    where gm.guild_id = v_guild.id
  ), weeks as (
    select (v_monday - 7 * k)::date as week from generate_series(1, v_weeks) k
  )
  select coalesce(jsonb_agg(jsonb_build_object('week', w.week, 'minutes', round(coalesce(t.minutes, 0)), 'held', coalesce(t.minutes, 0) >= v_guild.weekly_effort_target) order by w.week), '[]'::jsonb)
    into v_rows
    from weeks w left join (select week, sum(minutes) as minutes from days group by week) t on t.week = w.week;
  return jsonb_build_object('target', v_guild.weekly_effort_target, 'weeks', v_rows,
    'held', (select count(*) from jsonb_array_elements(v_rows) e where (e ->> 'held')::boolean),
    'bestStreak', (select coalesce(max(n), 0) from (
        select count(*) as n from (
          select (e ->> 'held')::boolean as held, ord - row_number() over (partition by (e ->> 'held')::boolean order by ord) as grp
          from jsonb_array_elements(v_rows) with ordinality as x(e, ord)) s
        where held group by grp) r));
end;
$function$;

revoke all on function public.titan_guild_history_v1(integer) from public, anon;
grant execute on function public.titan_guild_history_v1(integer) to authenticated;
