-- BOT03 / BOT05 / BOT06 / BOT09: an explainable review queue and human, reversible, immutable decisions.
-- Nothing is automatic: signals alone never change an account. Synthetic identities, full rollback.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); m uuid:=gen_random_uuid();
  p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); p3 uuid:=gen_random_uuid(); i int;
begin
  perform set_config('titan.mq_a',a::text,true); perform set_config('titan.mq_b',b::text,true);
  perform set_config('titan.mq_m',m::text,true); perform set_config('titan.mq_p1',p1::text,true);
  perform set_config('titan.mq_p2',p2::text,true); perform set_config('titan.mq_p3',p3::text,true);
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}'),(m,'{}'),(p1,'{}'),(p2,'{}'),(p3,'{}');
  update public.profiles set role='admin',username='qa_mod_admin' where id=a;
  update public.profiles set role='admin' where id=b;
  update public.profiles set role='moderator' where id=m;
  update public.profiles set credits=900,xp=40,level=2,username='qa_mod_p1' where id in (p1,p2,p3);
  assert to_regprocedure('public.titan_moderation_queue_v1(integer)') is not null,'the queue RPC exists';
  -- p1: one critical plus five repeats of one high reason (capped at three occurrences) = 20 + 24.
  perform public.titan_log_suspicious_action(p1,'training_log.rejected','critical','TRAINING_FREQUENCY_OUT_OF_RANGE','{"n":1}');
  for i in 1..5 loop perform public.titan_log_suspicious_action(p1,'training_log.flagged','high','TRAINING_REVIEW_RECOMMENDED',jsonb_build_object('n',i)); end loop;
  -- p2: fifty identical low signals must not snowball (capped at three occurrences = 3 points).
  for i in 1..50 loop perform public.titan_log_suspicious_action(p2,'training_log.flagged','low','TRAINING_FREQUENCY_HIGH','{}'); end loop;
end $$;

-- Only administrators read the queue.
set local role authenticated;
do $$ declare who text; denied boolean; begin
  foreach who in array array['titan.mq_m','titan.mq_p3'] loop
    perform set_config('request.jwt.claims',json_build_object('sub',current_setting(who),'role','authenticated')::text,true);
    denied:=false; begin perform public.titan_moderation_queue_v1(10); exception when insufficient_privilege then denied:=sqlerrm='ADMIN_ONLY'; end;
    assert denied,'queue refused for '||who;
    denied:=false; begin perform public.titan_moderation_decide_v1(current_setting('titan.mq_p1')::uuid,'watch','QA nope');
    exception when insufficient_privilege then denied:=sqlerrm='ADMIN_ONLY'; end;
    assert denied,'decision refused for '||who;
  end loop;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare denied boolean:=false; begin
  begin perform public.titan_moderation_queue_v1(10); exception when insufficient_privilege then denied:=true; end;
  assert denied,'anonymous refused';
end $$;

-- The queue is ordered by an explainable score; nobody is touched by signals alone.
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.mq_a'),'role','authenticated')::text,true);
do $$ declare q jsonb; e jsonb; p1 uuid:=current_setting('titan.mq_p1')::uuid; p2 uuid:=current_setting('titan.mq_p2')::uuid; begin
  q:=public.titan_moderation_queue_v1(10);
  assert (q->>'version')='1' and jsonb_array_length(q->'entries')=2,'two accounts are in the queue, the clean one is not';
  assert (q#>>'{entries,0,user_id}')=p1::text and (q#>>'{entries,1,user_id}')=p2::text,'highest risk first';
  e:=q->'entries'->0;
  assert (e->>'score')::int=44 and e->>'level'='urgent','p1 scores 20 + 3 x 8 and is urgent';
  assert (select count(*)=2 from jsonb_array_elements(e->'signals')),'one line per distinct signal';
  assert exists(select 1 from jsonb_array_elements(e->'signals') s where s->>'reason'='TRAINING_REVIEW_RECOMMENDED'
    and (s->>'count')::int=5 and (s->>'points')::int=24 and s->>'severity'='high' and s ? 'first_at' and s ? 'last_at'),
    'each signal shows its real count and the capped points';
  assert not (e::text ~* 'payload'),'raw payloads are not part of the queue';
  e:=q->'entries'->1;
  assert (e->>'score')::int=3 and e->>'level'='low','fifty repeats of a low signal weigh three points';
  assert (select status='active' and not is_suspended and credits=900 from public.profiles where id=p1),
    'signals alone never change an account (no automatic action)';
  assert (public.titan_moderation_queue_v1(1)->>'limit')::int=1 and jsonb_array_length(public.titan_moderation_queue_v1(1)->'entries')=1,
    'the page size is honoured';
  assert (public.titan_moderation_queue_v1(100000)->>'limit')::int<=200,'the page size is capped';
end $$;

-- Decisions: refused cases first.
do $$ declare p1 uuid:=current_setting('titan.mq_p1')::uuid; a uuid:=current_setting('titan.mq_a')::uuid;
  b uuid:=current_setting('titan.mq_b')::uuid; ok boolean; begin
  foreach ok in array array[true] loop
    begin perform public.titan_moderation_decide_v1(p1,'ban','QA reason'); assert false,'permanent ban refused';
    exception when others then assert sqlerrm='UNKNOWN_DECISION',sqlerrm; end;
    begin perform public.titan_moderation_decide_v1(p1,'watch','  '); assert false,'reason required';
    exception when others then assert sqlerrm='REASON_REQUIRED',sqlerrm; end;
    begin perform public.titan_moderation_decide_v1(a,'suspend','QA self'); assert false,'self refused';
    exception when others then assert sqlerrm='CANNOT_MODERATE_SELF',sqlerrm; end;
    begin perform public.titan_moderation_decide_v1(b,'suspend','QA admin'); assert false,'admin target refused';
    exception when others then assert sqlerrm='CANNOT_MODERATE_ADMIN',sqlerrm; end;
    begin perform public.titan_moderation_decide_v1(gen_random_uuid(),'watch','QA unknown'); assert false,'unknown account';
    exception when others then assert sqlerrm='ACCOUNT_NOT_FOUND',sqlerrm; end;
    begin perform public.titan_moderation_decide_v1(p1,'restore','QA not suspended'); assert false,'restore needs a suspension';
    exception when others then assert sqlerrm='NOT_SUSPENDED',sqlerrm; end;
  end loop;
end $$;

-- Graduated decisions: watch, suspend, revert.
do $$ declare p1 uuid:=current_setting('titan.mq_p1')::uuid; a uuid:=current_setting('titan.mq_a')::uuid; r jsonb; q jsonb; w jsonb; begin
  w:=public.titan_moderation_decide_v1(p1,'watch','QA surveillance');
  assert (w->>'decision')='watch' and (select status='active' from public.profiles where id=p1),'watching changes nothing on the account';
  q:=public.titan_moderation_queue_v1(10);
  assert (q#>>'{entries,0,last_decision,decision}')='watch','the queue shows the last decision';
  r:=public.titan_moderation_decide_v1(p1,'suspend','QA suspension temporaire');
  assert (select status='suspended' and is_suspended and credits=900 and xp=40 and level=2 from public.profiles where id=p1),
    'suspension locks the account and leaves progression untouched';
  assert exists(select 1 from jsonb_array_elements(public.titan_economy_journal_v1(p1,20)->'entries') e
    where e->>'kind'='moderation' and e->>'actor_id'=a::text and e#>>'{changes,status,new}'='suspended'),
    'the suspension is also in the economy journal under the administrator';
  begin perform public.titan_moderation_decide_v1(p1,'suspend','QA twice'); assert false,'double suspension';
  exception when others then assert sqlerrm='ALREADY_SUSPENDED',sqlerrm; end;
  -- Only the latest decision can be reverted, never a revert, never twice.
  begin perform public.titan_moderation_revert_v1((w->>'decision_id')::bigint,'QA old'); assert false,'not the latest';
  exception when others then assert sqlerrm='NOT_LATEST_DECISION',sqlerrm; end;
  begin perform public.titan_moderation_revert_v1((r->>'decision_id')::bigint,''); assert false,'reason required';
  exception when others then assert sqlerrm='REASON_REQUIRED',sqlerrm; end;
  r:=public.titan_moderation_revert_v1((r->>'decision_id')::bigint,'QA erreur de jugement');
  assert (r->>'decision')='revert' and (select status='active' and not is_suspended from public.profiles where id=p1),'the suspension is lifted';
  begin perform public.titan_moderation_revert_v1((r->>'decision_id')::bigint,'QA revert the revert'); assert false,'revert of a revert';
  exception when others then assert sqlerrm='NOT_REVERTIBLE',sqlerrm; end;
  -- The case file lists every decision, the revert included, and the raw signals for the administrator only.
  q:=public.titan_moderation_case_v1(p1);
  assert (select count(*)=3 from jsonb_array_elements(q->'decisions')),'watch, suspend and revert are all recorded';
  assert jsonb_array_length(q->'signals_recent')=6 and (q->'signals_recent'->0) ? 'payload','the case file shows the raw signals';
end $$;

-- Dismissal clears the queue and can be undone.
do $$ declare p1 uuid:=current_setting('titan.mq_p1')::uuid; d jsonb; q jsonb; begin
  d:=public.titan_moderation_decide_v1(p1,'dismiss','QA faux positif');
  perform set_config('titan.mq_dismiss',d->>'decision_id',true);
  assert (select count(*)=0 from public.titan_suspicious_actions where user_id=p1 and status='open'),'signals are marked reviewed';
  q:=public.titan_moderation_queue_v1(10);
  assert not exists(select 1 from jsonb_array_elements(q->'entries') x where x->>'user_id'=p1::text),'a dismissed account leaves the queue';
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.titan_log_suspicious_action(current_setting('titan.mq_p1')::uuid,'training_log.flagged','medium','TRAINING_FREQUENCY_HIGH','{}');
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.mq_a'),'role','authenticated')::text,true);
do $$ declare p1 uuid:=current_setting('titan.mq_p1')::uuid; q jsonb; begin
  q:=public.titan_moderation_queue_v1(10);
  assert (select (x->>'score')::int=3 from jsonb_array_elements(q->'entries') x where x->>'user_id'=p1::text),
    'only signals raised after the dismissal count';
  -- Reverting the dismissal reopens exactly the signals it closed; the later one was never closed.
  perform public.titan_moderation_revert_v1(current_setting('titan.mq_dismiss')::bigint,'QA finalement non');
  q:=public.titan_moderation_queue_v1(10);
  assert (select (x->>'score')::int=47 from jsonb_array_elements(q->'entries') x where x->>'user_id'=p1::text),
    'the reopened signals count again: 20 + 24 + 3';
end $$;

-- Decisions are immutable and invisible to API roles.
reset role;
do $$ begin
  assert not has_table_privilege('authenticated','private.titan_moderation_decisions','select,insert,update,delete')
    and not has_table_privilege('anon','private.titan_moderation_decisions','select,insert,update,delete'),'API roles have no privilege on decisions';
  begin update private.titan_moderation_decisions set reason='edited'; assert false,'immutable';
  exception when others then assert sqlerrm='MODERATION_APPEND_ONLY',sqlerrm; end;
  begin delete from private.titan_moderation_decisions; assert false,'not erasable';
  exception when others then assert sqlerrm='MODERATION_APPEND_ONLY',sqlerrm; end;
  begin truncate private.titan_moderation_decisions; assert false,'not truncatable';
  exception when others then assert sqlerrm='MODERATION_APPEND_ONLY',sqlerrm; end;
  -- Deleting an account detaches its decisions instead of erasing the administrators' history.
  delete from auth.users where id=current_setting('titan.mq_p1')::uuid;
  assert (select count(*)>=3 from private.titan_moderation_decisions where user_id is null),'decisions survive the deleted account, detached';
  assert not exists(select 1 from private.titan_moderation_decisions where snapshot::text like '%'||current_setting('titan.mq_p1')||'%'),
    'snapshots never carry the account id';
end $$;
rollback;
