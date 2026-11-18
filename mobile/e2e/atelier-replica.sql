-- A test-only wallet in a rolled-back transaction on the emulator's disposable replica.
-- Model a second device spending its final credits before a second exchange arrives.
begin;
select id::text as athlete from auth.users where email='e2e-b@titan.test' \gset
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.profiles set credits=(select price from public.shop_items where id='cos_frame_neon') where id=:'athlete';
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub', :'athlete','role','authenticated')::text,true);
do $$
declare wallet jsonb;
begin
  perform public.titan_purchase_shop_item('cos_frame_neon');
  begin
    perform public.titan_purchase_shop_item('cos_frame_summit');
    raise exception 'Expected a refusal for the second exchange';
  exception when check_violation then
    if sqlerrm <> 'NO_FUNDS' then raise; end if;
  end;
  wallet := public.titan_atelier();
  if (wallet->>'credits')::int <> 0
     or not exists (select 1 from jsonb_array_elements(wallet->'items') i where i->>'id'='cos_frame_neon' and (i->>'owned')::boolean)
     or exists (select 1 from jsonb_array_elements(wallet->'items') i where i->>'id'='cos_frame_summit' and (i->>'owned')::boolean)
  then raise exception 'Inconsistent ownership or balance after refusal'; end if;
end $$;
rollback;
