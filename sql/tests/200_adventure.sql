-- Synthetic identities only. All test writes are rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();
begin
 perform set_config('titan.qa_user',a::text,true);perform set_config('titan.qa_other',b::text,true);
 insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(b,'{}');
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_user'),'role','authenticated')::text,true);
do $$
declare s jsonb;denied boolean:=false;
begin
 s:=public.titan_adventure_snapshot();assert (s->>'revision')::int=0,'empty snapshot';
 s:=public.titan_adventure_action('start','aube','rhythm',null,0,null,'Europe/Paris');
 assert (s->>'revision')::int=2,'start revision';
 assert (select chapter=1 from public.adventure_progress where user_id=auth.uid() and world_id='aube'),'first stage';
 begin perform public.titan_adventure_action('claim','aube','rhythm',null,2,1,'Europe/Paris');exception when others then denied:=sqlerrm='QUEST_INCOMPLETE';end;
 assert denied,'empty claim denied';denied:=false;
 begin perform public.titan_adventure_action('start','forge','rhythm',null,2,null,'Europe/Paris');exception when others then denied:=sqlerrm='TITAN_PLUS_REQUIRED';end;
 assert denied,'free premium claim denied';denied:=false;
 begin perform public.titan_adventure_action('avatar',null,'rhythm','sentinel',2,null,'Europe/Paris');exception when others then denied:=sqlerrm='AVATAR_LOCKED';end;
 assert denied,'locked avatar denied';denied:=false;
 begin update public.adventure_progress set chapter=10 where user_id=auth.uid();exception when insufficient_privilege then denied:=true;end;
 assert denied,'direct campaign writes denied';denied:=false;
 begin insert into public.adventure_rewards(user_id,world_id,chapter,source_ids) values(auth.uid(),'aube',9,'{}');exception when insufficient_privilege then denied:=true;end;
 assert denied,'direct reward writes denied';
 assert not has_function_privilege('anon','public.titan_adventure_action(text,text,text,text,integer,integer,text)','execute'),'anonymous action denied';
 assert not has_function_privilege('anon','public.titan_adventure_snapshot()','execute'),'anonymous snapshot denied';
end $$;
reset role;
-- Source ownership, one contribution/day, moderation and creation boundary.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.training_logs(user_id,sport,category,val,unit,date,details,created_at)
values
 (current_setting('titan.qa_user')::uuid,'running','cardio',5,'km',now(),'{"serverReward":true,"duration":30}',now()),
 (current_setting('titan.qa_user')::uuid,'yoga','training',20,'min',now(),'{"serverReward":true}',now()),
 (current_setting('titan.qa_other')::uuid,'running','cardio',99,'km',now(),'{"serverReward":true}',now());
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_user'),'role','authenticated')::text,true);
do $$
declare s jsonb;denied boolean:=false;before_xp integer;before_credits integer;
begin
 assert (public.titan_adventure_evidence('aube')->>'days')::int=1,'one day despite two sessions';
 select xp,credits into before_xp,before_credits from public.profiles where id=auth.uid();
 s:=public.titan_adventure_action('claim','aube','rhythm',null,2,1,'Europe/Paris');
 assert (s->>'revision')::int=3,'claim revision';assert jsonb_array_length(s->'rewards')=1,'one reward';
 assert (s->>'xp')::integer=before_xp and (s->>'credits')::integer=before_credits,'cosmetic claim cannot mint xp or money';
 assert (select chapter=2 from public.adventure_progress where user_id=auth.uid() and world_id='aube'),'next chapter';
 assert (public.titan_adventure_evidence('aube')->>'days')::int=0,'old sources cannot advance next chapter';
 begin perform public.titan_adventure_action('claim','aube','rhythm',null,2,1,'Europe/Paris');exception when others then denied:=sqlerrm='ADVENTURE_CONFLICT';end;
 assert denied,'repeated or stale request denied';
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_other'),'role','authenticated')::text,true);
 assert (select count(*)=0 from public.adventure_progress),'second account cannot read progress';
 assert (select count(*)=0 from public.adventure_rewards),'second account cannot read rewards';
 assert (public.titan_adventure_evidence('aube')->>'days')::int=0,'second account cannot borrow sources';
 s:=public.titan_adventure_snapshot();assert s->>'owner'=current_setting('titan.qa_other'),'snapshot owner isolation';
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.profiles set is_elite=true,elite_ends_at=now()+interval '1 day',elite_refunded_at=null where id=current_setting('titan.qa_user')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_user'),'role','authenticated')::text,true);
do $$ declare s jsonb;begin
 s:=public.titan_adventure_action('start','forge','journal',null,3,null,'Europe/Paris');assert (s->>'plus')::boolean,'active plus permitted';
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.profiles set elite_ends_at=now()-interval '1 second' where id=current_setting('titan.qa_user')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('titan.qa_user'),'role','authenticated')::text,true);
do $$ declare denied boolean:=false;s jsonb;begin
 s:=public.titan_adventure_snapshot();assert (s->>'plus')::boolean is false,'expired entitlement';assert jsonb_array_length(s->'rewards')=1,'earned collection remains';
 begin perform public.titan_adventure_action('claim','forge','journal',null,4,1,'Europe/Paris');exception when others then denied:=sqlerrm='TITAN_PLUS_REQUIRED';end;
 assert denied,'expired plus claim denied';
end $$;
rollback;
