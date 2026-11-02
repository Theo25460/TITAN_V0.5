-- V11-80 (COACH-01/02/09): Coach plans and included Titan+ seats on the entitlement ledger. Nothing exists without a product mapped by the team;
-- 0/5/6 and 0/15/16 places; seats follow links and plan; the player's own subscription is never touched; two coaches; cancellation, refund and downgrade;
-- seat rotation limit; the team alone maps products. Full rollback.
begin;
do $$
declare c uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); u uuid[] := array[]::uuid[]; i integer;
begin
  for i in 1..18 loop u := u || gen_random_uuid(); end loop;
  insert into auth.users(id,raw_user_meta_data) select x,'{}' from unnest(u) x;
  insert into auth.users(id,raw_user_meta_data) values (c,'{}'),(c2,'{}'),(adm,'{}');
  update public.profiles set role = 'admin' where id = adm;
  update public.profiles set username = 'Coach Camille' where id = c;
  perform set_config('titan.cs_c',c::text,true); perform set_config('titan.cs_c2',c2::text,true); perform set_config('titan.cs_adm',adm::text,true);
  perform set_config('titan.cs_u',array_to_string(u,','),true);
  assert not has_table_privilege('authenticated','private.titan_plan_products','select'), 'no API grant on the mapping';
end $$;

-- Helpers (test only, removed by the rollback): a coach invites, an athlete accepts, a side revokes, and the bearer of a claim.
create function public.zz_as(p_user uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true) $$;
create function public.zz_link(p_coach uuid, p_athlete uuid) returns uuid language plpgsql as $$
declare inv jsonb; acc jsonb;
begin
  perform public.zz_as(p_coach);
  inv := public.titan_coach_portal('invite');
  perform public.zz_as(p_athlete);
  acc := public.titan_coach_portal('accept', jsonb_build_object('token', inv->>'token', 'since_date', current_date, 'consent', true));
  return (acc->>'id')::uuid;
end $$;
create function public.zz_unlink(p_by uuid, p_link uuid) returns void language plpgsql as $$
declare rev integer;
begin
  select revision into rev from public.coach_links where id = p_link;
  perform public.zz_as(p_by);
  perform public.titan_coach_portal('revoke', jsonb_build_object('link_id', p_link, 'revision', rev));
end $$;
create function public.zz_elite(p_user uuid) returns boolean language sql as $$ select coalesce(is_elite, false) from public.profiles where id = p_user $$;
create function public.zz_refused(p_coach uuid, p_athlete uuid, p_code text) returns boolean language plpgsql as $$
begin
  perform public.zz_link(p_coach, p_athlete);
  return false;
exception when others then return sqlerrm = p_code;
end $$;
create function public.zz_pay(p_user uuid, p_ext text, p_product text, p_active boolean, p_refunded boolean default false) returns void language plpgsql as $$
begin
  -- Billing events reach the database with the service role, never with a player's claims.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.titan_apply_entitlement_v1(p_user, 'google_play', p_ext, p_active, case when p_active then 'active' else 'canceled' end, 'test', clock_timestamp(), null, p_product, null,
    now() + interval '30 days', now() + interval '30 days', null, case when p_refunded then now() else null end);
end $$;

do $$
declare
  c uuid := current_setting('titan.cs_c')::uuid; c2 uuid := current_setting('titan.cs_c2')::uuid; adm uuid := current_setting('titan.cs_adm')::uuid;
  u uuid[] := string_to_array(current_setting('titan.cs_u'), ',')::uuid[];
  l1 uuid; l2 uuid; l3 uuid; l3b uuid; snap jsonb; mine jsonb; ok boolean; n integer; i integer; links uuid[] := array[]::uuid[];
begin
  -- 0. Without any mapped product nobody has a plan: the legacy capacity of V1 stays (3), and no seat is ever granted.
  l1 := public.zz_link(c, u[1]);
  perform public.zz_as(c); snap := public.titan_coach_portal('snapshot');
  assert (snap->>'capacity')::int=3 and snap->'plan'='null'::jsonb, 'legacy capacity, no plan: '||snap::text;
  assert not public.zz_elite(u[1]), 'no Titan+ without a plan';

  -- 1. The team alone maps products to plans.
  set local role authenticated;
  perform public.zz_as(u[1]);
  ok:=false; begin perform public.titan_plan_product_set_v1('play.coach','coach'); exception when others then ok:=sqlerrm='ADMIN_REQUIRED'; end; assert ok,'a player cannot map a product';
  perform public.zz_as(adm);
  ok:=false; begin perform public.titan_plan_product_set_v1('play.coach','gratuit'); exception when others then ok:=sqlerrm='BAD_PLAN'; end; assert ok,'a known plan only';
  ok:=false; begin perform public.titan_plan_product_set_v1('mauvais id !','coach'); exception when others then ok:=sqlerrm='BAD_PRODUCT'; end; assert ok,'a clean product id';
  perform public.titan_plan_product_set_v1('play.coach','coach'); perform public.titan_plan_product_set_v1('play.coach_pro','coach_pro');
  assert jsonb_array_length(public.titan_plan_product_list_v1())=2, 'two products mapped';
  reset role;

  -- 2. The coach pays (ledger event): the existing link gets its seat in the same transaction, the coach keeps their own Titan+, capacity is 5.
  perform public.zz_pay(c, 'tok-coach', 'play.coach', true);
  assert public.zz_elite(c) and public.zz_elite(u[1]), 'the coach and the linked athlete have Titan+';
  perform public.zz_as(c); snap := public.titan_coach_portal('snapshot');
  assert (snap->>'capacity')::int=5 and snap#>>'{plan,plan}'='coach' and (snap->>'seatsUsed')::int=1, 'capacity 5 from the plan: '||snap::text;
  set local role authenticated; perform public.zz_as(u[1]); mine := public.titan_my_plan_v1(); reset role;
  assert (mine->>'viaCoach')::boolean and not (mine->>'own')::boolean and mine->>'coachName'='Coach Camille', 'the athlete sees where Titan+ comes from: '||mine::text;
  assert not (select to_jsonb(p)::text like '%'||c::text||'%' from public.profiles p where p.id = u[1]), 'the profile summary never carries the coach identity';

  -- 3. 5 places: the sixth athlete is refused, every one of the five has Titan+.
  for i in 2..5 loop perform public.zz_link(c, u[i]); end loop;
  assert public.zz_refused(c, u[6], 'COACH_CAPACITY'), 'the sixth is refused';
  assert (select count(*) from public.profiles where id = any(u[1:5]) and is_elite)=5 and not public.zz_elite(u[6]), 'five seats, no more';

  -- 4. An athlete leaves: the seat ends at once and the place can be taken again (replacement).
  perform public.zz_unlink(u[1], l1);
  assert not public.zz_elite(u[1]), 'back to personal rights when the link ends';
  l2 := public.zz_link(c, u[6]);
  assert public.zz_elite(u[6]) and (select count(*) from public.coach_links where coach_id=c and revoked_at is null)=5, 'the replacement has a seat';

  -- 5. An athlete with a personal subscription keeps it when the seat ends.
  perform public.zz_pay(u[2], 'tok-own', 'play.titan_plus', true);
  perform public.zz_unlink(c, (select id from public.coach_links where coach_id=c and athlete_id=u[2] and revoked_at is null));
  assert public.zz_elite(u[2]), 'own subscription untouched';
  set local role authenticated; perform public.zz_as(u[2]); mine := public.titan_my_plan_v1(); reset role;
  assert (mine->>'own')::boolean and not (mine->>'viaCoach')::boolean, 'own subscription, no seat: '||mine::text;
  perform public.zz_link(c, u[2]);
  assert (select count(*) from private.titan_entitlements where user_id=u[2] and is_active)=2, 'own subscription and seat side by side';

  -- 6. Two coaches: Titan+ lasts as long as one seat does.
  perform public.zz_pay(c2, 'tok-coach2', 'play.coach', true);
  l3 := (select id from public.coach_links where coach_id=c and athlete_id=u[3] and revoked_at is null);
  l3b := public.zz_link(c2, u[3]);
  perform public.zz_unlink(u[3], l3);
  assert public.zz_elite(u[3]), 'still included by the other coach';
  perform public.zz_unlink(u[3], l3b);
  assert not public.zz_elite(u[3]), 'no seat left';

  -- 7. Payment refused / cancellation: every seat ends, the links remain; renewal gives the seats back.
  n := (select count(*) from public.coach_links where coach_id=c and revoked_at is null);
  perform public.zz_pay(c, 'tok-coach', 'play.coach', false);
  assert not public.zz_elite(c) and not public.zz_elite(u[4]) and not public.zz_elite(u[5]) and not public.zz_elite(u[6]), 'seats end with the plan';
  assert public.zz_elite(u[2]), 'own subscription stays';
  assert (select count(*) from public.coach_links where coach_id=c and revoked_at is null)=n, 'the links remain';
  perform public.zz_as(c); snap := public.titan_coach_portal('snapshot');
  assert (snap->>'capacity')::int=3 and snap->'plan'='null'::jsonb, 'legacy capacity without a plan';
  perform public.zz_pay(c, 'tok-coach', 'play.coach', true);
  assert public.zz_elite(u[4]) and public.zz_elite(u[5]) and public.zz_elite(u[6]), 'renewal gives the seats back';
  perform public.zz_pay(c, 'tok-coach', 'play.coach', false, true);
  assert not public.zz_elite(u[4]), 'a refund ends the seats too';
  perform public.zz_pay(c, 'tok-coach', 'play.coach', true);

  -- 8. Pro: 15 places (0/15/16); downgrade keeps the oldest five.
  perform public.zz_pay(c, 'tok-coach', 'play.coach_pro', true);
  perform public.zz_as(c); snap := public.titan_coach_portal('snapshot');
  assert (snap->>'capacity')::int=15 and snap#>>'{plan,plan}'='coach_pro', 'Pro has 15 places: '||snap::text;
  for i in 7..17 loop perform public.zz_link(c, u[i]); end loop;
  assert (select count(*) from public.coach_links where coach_id=c and revoked_at is null)=15, 'fifteen athletes';
  assert public.zz_refused(c, u[18], 'COACH_CAPACITY'), 'the sixteenth is refused';
  assert (select count(*) from public.profiles where id in (select athlete_id from public.coach_links where coach_id=c and revoked_at is null) and is_elite)>=15, 'fifteen seats';
  perform public.zz_pay(c, 'tok-coach', 'play.coach', true);
  assert (select count(*) from private.titan_entitlements where source='coach' and is_active and external_id like c::text||':%')=5, 'a downgrade keeps five seats';
  perform public.zz_as(c); snap := public.titan_coach_portal('snapshot');
  assert (snap->>'capacity')::int=5 and (snap->>'seatsUsed')::int=15, 'ten athletes are over the new capacity and lose Titan+, their links remain: '||snap::text;
  ok:=false; begin perform public.zz_link(c, u[18]); exception when others then ok:=sqlerrm='COACH_CAPACITY'; end; assert ok,'no new athlete above capacity';

  -- 9. Rotation limit: a coach with 5 places cannot accept more than 10 links in 30 days.
  for i in 7..17 loop
    perform public.zz_unlink(u[i], (select id from public.coach_links where coach_id=c and athlete_id=u[i] and revoked_at is null));
  end loop;
  assert public.zz_refused(c, u[18], 'SEAT_CHURN_LIMIT'), 'seats cannot be rented out in rotation';

  -- 10. The sweep closes seats of a plan that ended without any event, and the capacity of a seat-holder as a coach is the legacy one.
  update private.titan_entitlements set ends_at = now() - interval '1 minute' where user_id = c and source = 'google_play';
  assert private.titan_coach_seats_sweep() >= 1, 'the sweep looked at the coach';
  assert (select count(*) from private.titan_entitlements where source='coach' and is_active and external_id like c::text||':%')=0, 'expired plan: no seat';
  assert private.titan_coach_capacity(u[5])=3, 'a seat holder acting as coach has the legacy capacity (a seat is not a purchase)';
end $$;

-- 11. Erasure: the athlete's ledger rows go with the account; the coach's plan is unaffected.
do $$
declare c uuid := current_setting('titan.cs_c')::uuid; u uuid[] := string_to_array(current_setting('titan.cs_u'), ',')::uuid[];
begin
  delete from auth.users where id = u[4];
  assert not exists (select 1 from private.titan_entitlements where user_id = u[4]), 'ledger rows erased with the account';
  assert exists (select 1 from private.titan_entitlements where user_id = c and source = 'google_play'), 'the coach plan stays';
end $$;
rollback;
