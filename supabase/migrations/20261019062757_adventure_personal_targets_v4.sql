-- Freeze personal main objectives only at new chapter boundaries. Preserve active contracts.
alter table public.adventure_progress add column if not exists main_objective jsonb;
update public.adventure_progress
set main_objective=jsonb_build_object('version',0,'days',(array[1,2,2,2,3,2,3,3,3])[chapter],
  'effort',case when chapter=9 then 150 else 0 end,'frozen_at',started_at)
where main_objective is null and chapter between 1 and 9;

create or replace function private.titan_freeze_adventure_quests()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_days integer; v_effort integer;
begin
  if new.chapter between 1 and 9 then
    if tg_op='INSERT' then
      new.quest_profile:=private.titan_adventure_quest_profile(new.started_at,new.timezone);
    elsif old.chapter<>new.chapter then
      new.quest_profile:=private.titan_adventure_quest_profile(new.started_at,new.timezone);
    end if;
    if tg_op='INSERT' or old.chapter<>new.chapter then
      v_days:=case when new.chapter=9 then greatest(2,(new.quest_profile->>'daysTarget')::integer)
        else least((array[1,2,2,2,3,2,3,3,3])[new.chapter],(new.quest_profile->>'daysTarget')::integer) end;
      v_effort:=case when new.chapter=9 then v_days*(new.quest_profile->>'effortTarget')::integer else 0 end;
      new.main_objective:=jsonb_build_object('version',1,'days',v_days,'effort',v_effort,'frozen_at',new.started_at);
    end if;
  else new.quest_profile:=null; new.main_objective:=null;
  end if;
  return new;
end $$;
revoke all on function private.titan_freeze_adventure_quests() from public,anon,authenticated;
drop trigger if exists titan_freeze_adventure_quests on public.adventure_progress;
create trigger titan_freeze_adventure_quests before insert or update of chapter on public.adventure_progress
for each row execute function private.titan_freeze_adventure_quests();

create or replace function public.titan_adventure_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and is_suspended is not true) then
    raise exception 'ACCOUNT_UNAVAILABLE' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'version', 4, 'owner', v_uid, 'generated_at', now(),
    'level', p.level, 'xp', p.xp, 'credits', p.credits, 'next_level_xp', public.titan_level_requirement(p.level),
    'plus', p.is_elite is true and p.elite_refunded_at is null and (p.elite_ends_at is null or p.elite_ends_at > now()),
    'avatar', coalesce(a.avatar, 'scout'), 'selected_world', coalesce(a.selected_world, 'aube'), 'revision', coalesce(a.revision, 0),
    'campaigns', (select jsonb_agg(jsonb_build_object('id', w.id, 'tier', w.tier, 'chapter', coalesce(ap.chapter, 0),
        'route', coalesce(ap.route, 'rhythm'), 'started_at', ap.started_at, 'completed_at', ap.completed_at,
        'target', coalesce((ap.main_objective->>'days')::integer,0),
        'effort_target', coalesce((ap.main_objective->>'effort')::integer,0),
        'main_objective', ap.main_objective,
        'quests', public.titan_adventure_quests(w.id),
        'evidence', public.titan_adventure_evidence(w.id)) order by w.id)
      from public.adventure_worlds w left join public.adventure_progress ap on ap.world_id = w.id and ap.user_id = v_uid),
    'quest_rewards', coalesce((select jsonb_agg(jsonb_build_object('world',r.world_id,'chapter',r.chapter,
        'quest_id',r.quest_id,'earned_at',r.earned_at) order by r.earned_at desc,r.world_id,r.chapter,r.quest_id)
      from public.adventure_quest_rewards r where r.user_id=v_uid),'[]'::jsonb),
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('world', r.world_id, 'chapter', r.chapter, 'earned_at', r.earned_at) order by r.earned_at desc)
      from public.adventure_rewards r where r.user_id = v_uid), '[]'::jsonb)
  ) into v_result
  from public.profiles p left join public.adventure_profiles a on a.user_id = p.id where p.id = v_uid;
  return v_result;
end;
$$;

create or replace function private.titan_adventure_action(
  p_action text, p_world text, p_route text, p_avatar text, p_revision integer, p_chapter integer, p_timezone text
) returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_uid uuid := auth.uid(); v_profile public.profiles%rowtype; v_state public.adventure_profiles%rowtype;
  v_progress public.adventure_progress%rowtype; v_world public.adventure_worlds%rowtype;
  v_evidence jsonb; v_target integer; v_required integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('start', 'select', 'claim', 'avatar') then raise exception 'INVALID_ACTION'; end if;
  select * into v_profile from public.profiles where id = v_uid for update;
  if not found or v_profile.is_suspended is true then raise exception 'ACCOUNT_UNAVAILABLE' using errcode = '42501'; end if;
  insert into public.adventure_profiles(user_id) values (v_uid) on conflict do nothing;
  select * into v_state from public.adventure_profiles where user_id = v_uid for update;
  if p_revision is null or (p_revision <> v_state.revision and not (p_revision = 0 and v_state.revision = 1)) then
    raise exception 'ADVENTURE_CONFLICT' using errcode = '40001';
  end if;
  if p_action = 'avatar' then
    v_required := case p_avatar when 'scout' then 1 when 'ranger' then 1 when 'keeper' then 3 when 'artisan' then 6
      when 'navigator' then 10 when 'sentinel' then 15 end;
    if v_required is null or v_profile.level < v_required then raise exception 'AVATAR_LOCKED' using errcode = '42501'; end if;
    update public.adventure_profiles set avatar = p_avatar where user_id = v_uid;
  else
    select * into v_world from public.adventure_worlds where id = p_world;
    if not found then raise exception 'INVALID_WORLD'; end if;
    select * into v_progress from public.adventure_progress where user_id = v_uid and world_id = p_world for update;
    if p_action = 'start' then
      if p_route is null or p_route not in ('rhythm', 'journal') then raise exception 'INVALID_ROUTE'; end if;
      if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
        raise exception 'INVALID_TIMEZONE';
      end if;
      insert into public.adventure_progress(user_id, world_id, route, timezone) values (v_uid, p_world, p_route, p_timezone)
        on conflict do nothing;
    elsif p_action = 'claim' then
      if v_progress.user_id is null or p_chapter is null or v_progress.chapter <> p_chapter or p_chapter > 9 then
        raise exception 'ADVENTURE_CONFLICT' using errcode = '40001';
      end if;
      v_target := (v_progress.main_objective->>'days')::integer;
      if v_target is null or v_target<1 or v_progress.main_objective->>'effort' is null then
        raise exception 'OBJECTIVE_UNAVAILABLE';
      end if;
      v_evidence := public.titan_adventure_evidence(p_world);
      if (v_evidence ->> 'days')::integer < v_target then raise exception 'QUEST_INCOMPLETE'; end if;
      if p_chapter = 9 and coalesce((v_evidence ->> 'effort')::numeric, 0) < (v_progress.main_objective->>'effort')::numeric then
        raise exception 'GUARDIAN_EFFORT_INCOMPLETE';
      end if;
      insert into public.adventure_quest_rewards(user_id,world_id,chapter,quest_id)
        select v_uid,p_world,p_chapter,q->>'id'
        from jsonb_array_elements(public.titan_adventure_quests(p_world)->'items') q
        where (q->>'complete')::boolean;
      insert into public.adventure_rewards(user_id, world_id, chapter, source_ids)
        values (v_uid, p_world, p_chapter, array(select value::uuid from jsonb_array_elements_text(v_evidence -> 'source_ids')));
      update public.adventure_progress set chapter = chapter + 1, started_at = clock_timestamp(),
        completed_at = case when chapter = 9 then now() else null end
      where user_id = v_uid and world_id = p_world;
    end if;
    update public.adventure_profiles set selected_world = p_world where user_id = v_uid;
  end if;
  update public.adventure_profiles set revision = revision + 1, updated_at = now() where user_id = v_uid;
  return public.titan_adventure_snapshot();
end;
$$;
revoke all on function private.titan_adventure_action(text, text, text, text, integer, integer, text) from public, anon;
grant execute on function private.titan_adventure_action(text, text, text, text, integer, integer, text) to authenticated;

notify pgrst, 'reload schema';
