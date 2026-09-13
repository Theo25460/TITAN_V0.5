-- Coaching is a separate, explicit consent. No guild or friendship grants access.
create table private.coach_invites (
 id uuid primary key default gen_random_uuid(), coach_id uuid not null references public.profiles(id) on delete cascade,
 token_hash text not null unique, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days',
 revoked_at timestamptz, accepted_by uuid references public.profiles(id) on delete cascade
);
create index coach_invites_owner on private.coach_invites(coach_id,created_at);
alter table private.coach_invites enable row level security;
revoke all on private.coach_invites from public,anon,authenticated;
create table public.coach_links (
 id uuid primary key default gen_random_uuid(), coach_id uuid not null references public.profiles(id) on delete cascade,
 athlete_id uuid not null references public.profiles(id) on delete cascade, since_date date not null,
 sport text check(sport is null or length(sport) between 1 and 80), share_details boolean not null default false,
 share_notes boolean not null default false, accepted_at timestamptz not null default now(), revoked_at timestamptz,
 revision integer not null default 1, check(coach_id<>athlete_id), check(since_date between '2000-01-01' and '2100-12-31')
);
create unique index coach_links_active_pair on public.coach_links(coach_id,athlete_id) where revoked_at is null;
create index coach_links_athlete on public.coach_links(athlete_id,accepted_at);
create table public.coach_assignments (
 id uuid primary key default gen_random_uuid(), link_id uuid not null references public.coach_links(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 100), sport text not null check(length(sport) between 1 and 80),
 planned_date date not null check(planned_date between '2000-01-01' and '2100-12-31'),
 instructions text not null default '' check(length(instructions)<=2000),
 status text not null default 'proposed' check(status in ('proposed','accepted','declined','completed','cancelled')),
 session_id uuid references public.training_logs(id) on delete set null, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), revision integer not null default 1,
 check(status='completed' or session_id is null)
);
create index coach_assignments_link_date on public.coach_assignments(link_id,planned_date);
create unique index coach_assignments_session_unique on public.coach_assignments(session_id) where session_id is not null;
alter table public.coach_links enable row level security;
alter table public.coach_assignments enable row level security;
revoke all on public.coach_links,public.coach_assignments from public,anon,authenticated;
grant select on public.coach_links,public.coach_assignments to authenticated;
create policy coach_links_participants on public.coach_links for select to authenticated
 using((select auth.uid())=coach_id or (select auth.uid())=athlete_id);
create policy coach_assignments_participants on public.coach_assignments for select to authenticated
 using(exists(select 1 from public.coach_links l where l.id=link_id and l.revoked_at is null and ((select auth.uid())=l.coach_id or (select auth.uid())=l.athlete_id)));

create function private.titan_coach_portal(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='8s'
as $$
declare
 v_uid uuid:=auth.uid();v_link public.coach_links%rowtype;v_invite private.coach_invites%rowtype;
 v_assignment public.coach_assignments%rowtype;v_coach public.profiles%rowtype;
 v_id uuid;v_token text;v_since date;v_sport text;v_limit integer;v_result jsonb;v_rows jsonb;
 v_total integer;v_offset integer;v_revision integer;v_date date;
begin
 if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and is_suspended is not true) then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000 then raise exception 'INVALID_INPUT';end if;
 if p_action='snapshot' then
   select * into v_coach from public.profiles where id=v_uid;
   v_limit:=case when v_coach.is_elite is true and v_coach.elite_refunded_at is null and (v_coach.elite_ends_at is null or v_coach.elite_ends_at>now()) then 20 else 3 end;
   return jsonb_build_object('owner',v_uid,'capacity',v_limit,
    'links',(select coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('coach_name',c.username,'athlete_name',a.username) order by l.accepted_at desc),'[]') from public.coach_links l join public.profiles c on c.id=l.coach_id join public.profiles a on a.id=l.athlete_id where (l.coach_id=v_uid or l.athlete_id=v_uid) and l.revoked_at is null),
    'invites',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'expires_at',i.expires_at,'created_at',i.created_at) order by i.created_at desc),'[]') from private.coach_invites i where i.coach_id=v_uid and i.accepted_by is null and i.revoked_at is null and i.expires_at>now()),
    'assignments_count',(select count(*) from public.coach_assignments a join public.coach_links l on l.id=a.link_id where l.revoked_at is null and (l.coach_id=v_uid or l.athlete_id=v_uid)));
 end if;
 if p_action='invite' then
   perform 1 from public.profiles where id=v_uid for update;
   if (select count(*) from private.coach_invites where coach_id=v_uid and created_at>now()-interval '1 day')>=30 or (select count(*) from private.coach_invites where coach_id=v_uid and revoked_at is null and accepted_by is null and expires_at>now())>=10 then raise exception 'INVITE_LIMIT';end if;
   select * into v_coach from public.profiles where id=v_uid;
   v_limit:=case when v_coach.is_elite is true and v_coach.elite_refunded_at is null and (v_coach.elite_ends_at is null or v_coach.elite_ends_at>now()) then 20 else 3 end;
   if (select count(*) from public.coach_links where coach_id=v_uid and revoked_at is null)>=v_limit then raise exception 'COACH_CAPACITY';end if;
   v_token:=encode(extensions.gen_random_bytes(24),'hex');
   insert into private.coach_invites(coach_id,token_hash) values(v_uid,encode(extensions.digest(v_token,'sha256'),'hex')) returning * into v_invite;
   return jsonb_build_object('id',v_invite.id,'token',v_token,'expires_at',v_invite.expires_at,'coach_name',v_coach.username);
 end if;
 if p_action='cancel_invite' then
   update private.coach_invites set revoked_at=now() where id=(p_data->>'id')::uuid and coach_id=v_uid and accepted_by is null;
   if not found then raise exception 'INVITE_UNAVAILABLE';end if;return jsonb_build_object('ok',true);
 end if;
 if p_action in ('preview','accept') then
   v_token:=lower(trim(coalesce(p_data->>'token','')));
   if v_token!~'^[0-9a-f]{48}$' then raise exception 'INVITE_UNAVAILABLE';end if;
   select * into v_invite from private.coach_invites where token_hash=encode(extensions.digest(v_token,'sha256'),'hex') and accepted_by is null and revoked_at is null and expires_at>now();
   if not found or v_invite.coach_id=v_uid then raise exception 'INVITE_UNAVAILABLE';end if;
   perform 1 from public.profiles where id in (v_uid,v_invite.coach_id) order by id for update;
   select * into v_invite from private.coach_invites where id=v_invite.id and accepted_by is null and revoked_at is null and expires_at>now() for update;
   if not found then raise exception 'INVITE_UNAVAILABLE';end if;
   -- Serialize capacity changes against the coach account, as well as each single-use invitation.
   select * into v_coach from public.profiles where id=v_invite.coach_id and is_suspended is not true for update;
   if not found then raise exception 'INVITE_UNAVAILABLE';end if;
   if p_action='preview' then return jsonb_build_object('coach_name',v_coach.username,'expires_at',v_invite.expires_at);end if;
   if (p_data->>'consent') is distinct from 'true' then raise exception 'CONSENT_REQUIRED';end if;
   v_limit:=case when v_coach.is_elite is true and v_coach.elite_refunded_at is null and (v_coach.elite_ends_at is null or v_coach.elite_ends_at>now()) then 20 else 3 end;
   if (select count(*) from public.coach_links where coach_id=v_invite.coach_id and revoked_at is null)>=v_limit then raise exception 'COACH_CAPACITY';end if;
   -- Lock the athlete for the separate maximum number of accepted sharing relationships.
   perform 1 from public.profiles where id=v_uid for update;
   if (select count(*) from public.coach_links where athlete_id=v_uid and revoked_at is null)>=5 then raise exception 'ATHLETE_CAPACITY';end if;
   v_since:=(p_data->>'since_date')::date;v_sport:=nullif(trim(p_data->>'sport'),'');
   if v_since is null or v_since>current_date or v_since<'2000-01-01'::date then raise exception 'INVALID_PERIOD';end if;
   insert into public.coach_links(coach_id,athlete_id,since_date,sport,share_details,share_notes)
    values(v_invite.coach_id,v_uid,v_since,v_sport,coalesce((p_data->>'share_details')::boolean,false),coalesce((p_data->>'share_notes')::boolean,false)) returning id into v_id;
   update private.coach_invites set accepted_by=v_uid where id=v_invite.id;
   return jsonb_build_object('id',v_id);
 end if;
 if p_action in ('scope','revoke','sessions','assign','assignments') then
   select * into v_link from public.coach_links where id=(p_data->>'link_id')::uuid and revoked_at is null and (coach_id=v_uid or athlete_id=v_uid) for update;
   if not found then raise exception 'SHARING_UNAVAILABLE' using errcode='42501';end if;
   if p_action='assignments' then
     v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),100000));
     return jsonb_build_object('link_id',v_link.id,'revision',v_link.revision,'total',(select count(*) from public.coach_assignments where link_id=v_link.id),'offset',v_offset,'rows',(select coalesce(jsonb_agg(to_jsonb(q) order by created_at desc,id desc),'[]') from (select * from public.coach_assignments where link_id=v_link.id order by created_at desc,id desc limit 100 offset v_offset)q));
   end if;
   if p_action in ('scope','revoke') then
     if v_link.revision is distinct from (p_data->>'revision')::integer then raise exception 'COACH_CONFLICT';end if;
     if p_action='revoke' then
       update public.coach_links set revoked_at=now(),revision=revision+1 where id=v_link.id;
       return jsonb_build_object('ok',true);
     end if;
     if v_link.athlete_id<>v_uid then raise exception 'ATHLETE_ONLY' using errcode='42501';end if;
     v_since:=(p_data->>'since_date')::date;v_sport:=nullif(trim(p_data->>'sport'),'');
     if v_since is null or v_since>current_date or v_since<'2000-01-01'::date then raise exception 'INVALID_PERIOD';end if;
     update public.coach_links set since_date=v_since,sport=v_sport,share_details=coalesce((p_data->>'share_details')::boolean,false),share_notes=coalesce((p_data->>'share_notes')::boolean,false),revision=revision+1 where id=v_link.id;
     return jsonb_build_object('ok',true);
   end if;
   if p_action='sessions' then
     v_date:=coalesce((p_data->>'from_date')::date,current_date-29);v_since:=greatest(v_date,v_link.since_date);
     if p_data->>'to_date' is null or (p_data->>'to_date')::date<v_since or (p_data->>'to_date')::date>current_date or (p_data->>'to_date')::date-v_date>366 then raise exception 'INVALID_PERIOD';end if;
     v_offset:=greatest(0,least(coalesce((p_data->>'offset')::integer,0),100000));
     select count(*) into v_total from public.training_logs l where l.user_id=v_link.athlete_id and l.archived_at is null and l.date>=v_since::timestamp at time zone 'UTC' and l.date<((p_data->>'to_date')::date+1)::timestamp at time zone 'UTC' and l.date<=now() and (v_link.sport is null or l.sport=v_link.sport);
     select coalesce(jsonb_agg(row_data order by session_date desc,session_id desc),'[]') into v_rows from (
       select l.date as session_date,l.id as session_id,jsonb_build_object('id',l.id,'date',l.date,'sport',l.sport,'val',l.val,'unit',l.unit,
        'details',jsonb_strip_nulls(jsonb_build_object(
         'duration',case when coalesce(l.details->>'duration','')~'^[0-9]+([.][0-9]+)?$' then (l.details->>'duration')::numeric when coalesce(l.details->>'val2','')~'^[0-9]+([.][0-9]+)?$' then (l.details->>'val2')::numeric when coalesce(l.details#>>'{gpxStats,movingMinutes}','')~'^[0-9]+([.][0-9]+)?$' then (l.details#>>'{gpxStats,movingMinutes}')::numeric else null end,
         'note',case when v_link.share_notes then coalesce(l.details->>'note',l.details->>'notes') else null end,
         'exercises',case when v_link.share_details then (select jsonb_agg(jsonb_build_object('name',e->>'name','variant',e->>'variant','equipment',e->>'equipment','sets',e->'sets','weight',e->'weight','reps',e->'reps','setRows',(select jsonb_agg(jsonb_build_object('weight',s->'weight','reps',s->'reps','rir',s->'rir')) from (select value s from jsonb_array_elements(case when jsonb_typeof(e->'setRows')='array' then e->'setRows' else '[]' end) limit 30)sr))) from (select value e from jsonb_array_elements(case when jsonb_typeof(l.details->'exercises')='array' then l.details->'exercises' else '[]' end) limit 30)ex) else null end,
         'extras',case when v_link.share_details then jsonb_strip_nulls(jsonb_build_object('grade_system',l.details#>'{extras,grade_system}','climbing_discipline',l.details#>'{extras,climbing_discipline}','belay',l.details#>'{extras,belay}','max_done',l.details#>'{extras,max_done}','max_attempt',l.details#>'{extras,max_attempt}','attempts',l.details#>'{extras,attempts}','successful_routes',l.details#>'{extras,successful_routes}')) else null end))) as row_data
       from public.training_logs l where l.user_id=v_link.athlete_id and l.archived_at is null and l.date>=v_since::timestamp at time zone 'UTC' and l.date<((p_data->>'to_date')::date+1)::timestamp at time zone 'UTC' and l.date<=now() and (v_link.sport is null or l.sport=v_link.sport)
       order by l.date desc,l.id desc limit 100 offset v_offset
     ) q;
     return jsonb_build_object('owner',v_uid,'link_id',v_link.id,'revision',v_link.revision,'rows',v_rows,'total',v_total,'offset',v_offset,'from_date',v_since,'to_date',p_data->>'to_date','timezone','UTC');
   end if;
   if p_action='assign' then
     if v_link.coach_id<>v_uid then raise exception 'COACH_ONLY' using errcode='42501';end if;
     if (select count(*) from public.coach_assignments where link_id=v_link.id)>=500 then raise exception 'ASSIGNMENT_LIMIT';end if;
     v_date:=(p_data->>'planned_date')::date;
     if v_date<current_date-7 or v_date>current_date+366 then raise exception 'INVALID_PERIOD';end if;
     insert into public.coach_assignments(link_id,title,sport,planned_date,instructions) values(v_link.id,trim(p_data->>'title'),trim(p_data->>'sport'),v_date,coalesce(p_data->>'instructions','')) returning * into v_assignment;
     return to_jsonb(v_assignment);
   end if;
 end if;
 if p_action in ('assignment_status','cancel_assignment') then
   -- Consistent lock order: the sharing relationship is locked before the assignment.
   select l.* into v_link from public.coach_links l join public.coach_assignments a on a.link_id=l.id where a.id=(p_data->>'id')::uuid and l.revoked_at is null and (l.coach_id=v_uid or l.athlete_id=v_uid) for update of l;
   if not found then raise exception 'SHARING_UNAVAILABLE' using errcode='42501';end if;
   select * into v_assignment from public.coach_assignments where id=(p_data->>'id')::uuid for update;
   if v_assignment.revision is distinct from (p_data->>'revision')::integer then raise exception 'COACH_CONFLICT';end if;
   if p_action='cancel_assignment' then
     if v_link.coach_id<>v_uid or v_assignment.status not in ('proposed','accepted') then raise exception 'INVALID_TRANSITION';end if;
     update public.coach_assignments set status='cancelled',revision=revision+1,updated_at=now() where id=v_assignment.id returning * into v_assignment;
   else
     if v_link.athlete_id<>v_uid then raise exception 'ATHLETE_ONLY' using errcode='42501';end if;
     if not ((v_assignment.status='proposed' and p_data->>'status' in ('accepted','declined')) or (v_assignment.status='accepted' and p_data->>'status' in ('declined','completed'))) then raise exception 'INVALID_TRANSITION';end if;
     v_id:=null;
     if p_data->>'status'='completed' then
       v_id:=(p_data->>'session_id')::uuid;
       if v_id is null or not exists(select 1 from public.training_logs l where l.id=v_id and l.user_id=v_uid and l.sport=v_assignment.sport and l.archived_at is null and l.date<=now() and l.date>=v_link.since_date::timestamp at time zone 'UTC' and l.date>=v_assignment.created_at-interval '7 days' and l.is_suspicious is not true and coalesce(l.status,'valid') not in ('rejected','flagged','pending_review')) then raise exception 'INVALID_SESSION';end if;
       if exists(select 1 from public.coach_assignments a join public.coach_links l on l.id=a.link_id where l.athlete_id=v_uid and a.session_id=v_id) then raise exception 'SESSION_ALREADY_LINKED';end if;
     end if;
     update public.coach_assignments set status=p_data->>'status',session_id=v_id,revision=revision+1,updated_at=now() where id=v_assignment.id returning * into v_assignment;
   end if;
   return to_jsonb(v_assignment);
 end if;
 raise exception 'INVALID_ACTION';
end;
$$;
revoke all on function private.titan_coach_portal(text,jsonb) from public,anon;
grant execute on function private.titan_coach_portal(text,jsonb) to authenticated;
create function public.titan_coach_portal(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.titan_coach_portal(p_action,p_data);$$;
revoke all on function public.titan_coach_portal(text,jsonb) from public,anon;
grant execute on function public.titan_coach_portal(text,jsonb) to authenticated;
