-- Keep corrected measurements consistent with derived legacy display fields.
-- Revisions and historical rewards remain unchanged in meaning.
create or replace function public.titan_update_training_session(p_id uuid,p_revision integer,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); l public.training_logs%rowtype; v public.training_logs%rowtype;
begin
 if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.profiles where id=u and not coalesce(is_suspended,false) for update;
 if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
 select * into l from public.training_logs where id=p_id and user_id=u for update;
 if not found then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
 if p_revision is null or l.revision<>p_revision then raise exception 'SESSION_VERSION_CONFLICT' using errcode='40001'; end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or octet_length(p_patch::text)>100000 then raise exception 'PATCH_INVALID' using errcode='22023'; end if;
 v:=l;
 if p_patch ? 'val' then
  if jsonb_typeof(p_patch->'val')<>'number' then raise exception 'SESSION_INVALID' using errcode='22023'; end if;
  v.val:=(p_patch->>'val')::numeric;
  if jsonb_typeof(l.details->'exercises')='array' and jsonb_array_length(l.details->'exercises')>0 and v.val<>l.val then
   raise exception 'EXERCISE_VOLUME_READ_ONLY' using errcode='22023';
  end if;
  v.details:=jsonb_set(coalesce(v.details,'{}'),'{val1}',to_jsonb(v.val));
 end if;
 if p_patch ? 'date' then
  v.date:=(p_patch->>'date')::timestamptz;
  v.details:=jsonb_set(coalesce(v.details,'{}'),'{performedAt}',coalesce(to_jsonb(v.date),'null'::jsonb));
 end if;
 if p_patch ? 'note' then
  if jsonb_typeof(p_patch->'note')<>'string' then raise exception 'NOTE_INVALID' using errcode='22023'; end if;
  v.details:=jsonb_set(coalesce(v.details,'{}'),'{note}',to_jsonb(left(p_patch->>'note',2000)));
 end if;
 if p_patch ? 'duration' then
  if jsonb_typeof(p_patch->'duration')<>'number' then raise exception 'DURATION_INVALID' using errcode='22023'; end if;
  if (p_patch->>'duration')::numeric <=0 or (p_patch->>'duration')::numeric>1440 then raise exception 'DURATION_INVALID' using errcode='22023'; end if;
  v.details:=jsonb_set(jsonb_set(coalesce(v.details,'{}'),'{val2}',p_patch->'duration'),'{duration}',p_patch->'duration');
 end if;
 if v.unit in ('min','h') and (p_patch ? 'val' or p_patch ? 'duration') then
  v.details:=jsonb_set(jsonb_set(coalesce(v.details,'{}'),'{duration}',to_jsonb(v.val * case when v.unit='h' then 60 else 1 end)),'{val2}',to_jsonb(v.val * case when v.unit='h' then 60 else 1 end));
 end if;
 if p_patch ? 'val' or p_patch ? 'duration' then v.details:=v.details-'summary'; end if;
 if p_patch ? 'archived' then
  if jsonb_typeof(p_patch->'archived')<>'boolean' then raise exception 'ARCHIVE_INVALID' using errcode='22023'; end if;
  v.archived_at:=case when (p_patch->>'archived')::boolean then now() else null end;
 end if;
 if v.val is null or v.val<=0 or v.val>300000 or v.date is null or v.date>now()+interval '10 minutes' then
  raise exception 'SESSION_INVALID' using errcode='22023';
 end if;
 insert into public.training_revisions(user_id,log_id,snapshot) values(u,l.id,to_jsonb(l));
 update public.training_logs set val=v.val,date=v.date,details=v.details,archived_at=v.archived_at,revision=l.revision+1
 where id=l.id returning * into v;
 if v.revision<>l.revision+1 then raise exception 'SESSION_REJECTED' using errcode='23514'; end if;
 return to_jsonb(v);
end $$;
revoke all on function public.titan_update_training_session(uuid,integer,jsonb) from public,anon;
grant execute on function public.titan_update_training_session(uuid,integer,jsonb) to authenticated;
