-- V11-63 (COM-C2): progress buddies. Friends only, accepted by the invited side, one at a time, 14 days, shared goal in active days, the
-- partner's data limited to a count of active days, either side may stop at once, a block or an unfriending ends it, nothing granted,
-- exported (without the partner's data) and erased with the account. Full rollback.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); s uuid := gen_random_uuid();
begin
  insert into auth.users(id,raw_user_meta_data) values (a,'{}'),(b,'{}'),(c,'{}'),(s,'{}');
  update public.profiles set privacy = coalesce(privacy, '{}'::jsonb) || '{"publicProfile": true}'::jsonb where id in (b, c);
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  insert into public.friendships(user_id_1,user_id_2,status) values (a,b,'accepted'),(a,c,'accepted');
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('titan.bd_a',a::text,true); perform set_config('titan.bd_b',b::text,true); perform set_config('titan.bd_c',c::text,true); perform set_config('titan.bd_s',s::text,true);
  assert not has_table_privilege('authenticated','private.titan_buddies','select') and not has_table_privilege('authenticated','private.titan_buddy_nudges','select'), 'no API grant on the tables';
end $$;
set local role authenticated;
do $$
declare ok boolean; r jsonb; id1 uuid; xp0 integer; cr0 integer;
  a uuid := current_setting('titan.bd_a')::uuid; b uuid := current_setting('titan.bd_b')::uuid; c uuid := current_setting('titan.bd_c')::uuid; s uuid := current_setting('titan.bd_s')::uuid;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  select xp, credits into xp0, cr0 from public.profiles where id = a;
  r := public.titan_buddy_v1();
  assert r->>'status'='none' and jsonb_array_length(r->'friends')=2, 'no buddy yet, two friends to pick from: '||r::text;
  ok:=false; begin perform public.titan_buddy_invite_v1(s); exception when others then ok:=sqlerrm='BUDDY_NOT_ALLOWED'; end; assert ok,'only friends';
  ok:=false; begin perform public.titan_buddy_invite_v1(a); exception when others then ok:=sqlerrm='BUDDY_NOT_ALLOWED'; end; assert ok,'not oneself';
  id1 := (public.titan_buddy_invite_v1(b)->>'id')::uuid;
  ok:=false; begin perform public.titan_buddy_invite_v1(c); exception when others then ok:=sqlerrm='BUDDY_ALREADY_PAIRED'; end; assert ok,'one at a time (inviter side)';
  r := public.titan_buddy_v1();
  assert r->>'status'='pending' and r->>'role'='inviter' and r->'partner'->>'id'=b::text, 'a invitation is pending: '||r::text;
  ok:=false; begin perform public.titan_buddy_respond_v1(id1,true); exception when others then ok:=sqlerrm='BUDDY_NOT_FOUND'; end; assert ok,'the inviter cannot accept for the invited friend';
  ok:=false; begin perform public.titan_buddy_nudge_v1(id1); exception when others then ok:=sqlerrm='BUDDY_NOT_ALLOWED'; end; assert ok,'no nudge before acceptance';

  -- c cannot be invited by someone else while a is paired? c is free; but a stranger cannot respond to a's invitation.
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_buddy_respond_v1(id1,true); exception when others then ok:=sqlerrm='BUDDY_NOT_FOUND'; end; assert ok,'a third party cannot answer';
  assert public.titan_buddy_v1()->>'status'='none', 'c sees nothing of it';

  -- b sees the invitation, may decline (nothing happens), then a invites again and b accepts.
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  r := public.titan_buddy_v1();
  assert r->>'status'='pending' and r->>'role'='invitee' and r->'partner'->>'id'=a::text, 'b sees the invitation: '||r::text;
  assert public.titan_buddy_respond_v1(id1,false)->>'status'='ended', 'declined';
  assert public.titan_buddy_v1()->>'status'='none', 'free again';
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  id1 := (public.titan_buddy_invite_v1(b)->>'id')::uuid;
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  r := public.titan_buddy_respond_v1(id1,true);
  assert r->>'status'='active' and (r->>'endsOn')::date = (r->>'startsOn')::date + 13, 'fourteen days: '||r::text;

  -- Active: counts of active days only, no partner data beyond that.
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  update private.titan_buddies set accepted_at = clock_timestamp() where id = id1;
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values (a, 'running', 5, 'km', 10, now(), '{"effort":{"effort_minutes":40}}', clock_timestamp());
  insert into public.training_logs(user_id, sport, val, unit, xp, date, details, created_at) values (b, 'swimming', 1, 'km', 10, now(), '{"effort":{"effort_minutes":30}}', clock_timestamp());
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.titan_buddy_v1();
  assert (r->>'myDays')::int=1 and (r->>'partnerDays')::int=1 and (r->>'together')::int=2 and (r->>'target')::int=12 and (r->>'daysLeft')::int=14, 'active days together: '||r::text;
  assert not (r->'partner' ? 'sport') and not (r ? 'partnerSessions') and not (r ? 'minutes'), 'no sport, no minutes of the partner';
  assert (r->>'nudgedToday')::boolean=false and (r->>'nudgesReceived')::int=0, 'no nudge yet';
  ok:=false; begin perform public.titan_buddy_invite_v1(c); exception when others then ok:=sqlerrm='BUDDY_ALREADY_PAIRED'; end; assert ok,'one at a time';
  perform public.titan_buddy_nudge_v1(id1);
  perform public.titan_buddy_nudge_v1(id1);   -- twice a day: still one
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  assert (public.titan_buddy_v1()->>'nudgesReceived')::int=1 and (public.titan_buddy_v1()->>'nudgedToday')::boolean=false, 'b received one encouragement';
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  ok:=false; begin perform public.titan_buddy_nudge_v1(id1); exception when others then ok:=sqlerrm='BUDDY_NOT_ALLOWED'; end; assert ok,'a third party cannot nudge';
  assert public.titan_buddy_end_v1(id1) is false, 'a third party cannot end it';

  -- Exported without the partner's data.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  r := public.export_own_data()->'buddies';
  assert jsonb_array_length(r)=2 and not (r->0 ? 'partner'), 'own pairings are exported without the partner: '||r::text;
  assert (select xp from public.profiles where id = a) is not distinct from xp0 and (select credits from public.profiles where id = a) is not distinct from cr0, 'no XP, no credit';

  -- Either side stops at once; afterwards nothing of the other is readable and both are free.
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  assert public.titan_buddy_end_v1(id1) is true and public.titan_buddy_end_v1(id1) is false, 'consent withdrawn once';
  assert public.titan_buddy_v1()->>'status'='none', 'b: nothing left';
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert public.titan_buddy_v1()->>'status'='none', 'a: nothing left';
  ok:=false; begin perform public.titan_buddy_nudge_v1(id1); exception when others then ok:=sqlerrm='BUDDY_NOT_ALLOWED'; end; assert ok,'no nudge after the end';

  -- A block ends a pairing by itself.
  id1 := (public.titan_buddy_invite_v1(c)->>'id')::uuid;
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  perform public.titan_buddy_respond_v1(id1,true);
  perform set_config('request.jwt.claims','{}',true);
  reset role;
  insert into public.titan_user_blocks(blocker_id, blocked_id) values (c, a);
  set local role authenticated;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  assert public.titan_buddy_v1()->>'status'='none', 'a block ends it for the blocked one';
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  assert public.titan_buddy_v1()->>'status'='none', 'and for the blocker';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  ok:=false; begin perform public.titan_buddy_v1(); exception when others then ok:=true; end; assert ok,'anonymous refused';
end $$;
reset role;
do $$
declare s uuid := current_setting('titan.bd_s')::uuid; c uuid := current_setting('titan.bd_c')::uuid;
begin
  insert into private.titan_buddies(inviter_id, invitee_id, status, starts_on, ends_on) values (s, c, 'ended', current_date, current_date + 13);
  assert exists (select 1 from private.titan_buddies where inviter_id = s), 'a pairing exists';
  delete from auth.users where id = s;
  assert not exists (select 1 from private.titan_buddies where inviter_id = s), 'erased with the account';
end $$;
rollback;
