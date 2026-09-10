-- TITAN OS v89 — fair-play economy and cosmetic-only storefront.
-- Premium keeps analysis, planning and visual comfort; it never changes rewards.

begin;

create or replace function public.titan_economy_limits(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_elite boolean := false;
begin
  if p_user_id is not null then
    select coalesce(p.is_elite, false)
    into v_is_elite
    from public.profiles as p
    where p.id = p_user_id;
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

-- Keep the proven sport-specific calculation and remove the two legacy
-- subscription reward boosts from the current production function.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.titan_submit_training_session(text,text,numeric,text,jsonb,timestamp with time zone)'::regprocedure
  )
  into v_definition;

  if position(
    'v_hard_cap := v_hard_cap * case when coalesce(v_is_elite, false) then 1.05 else 1 end;'
    in v_definition
  ) = 0 then
    raise exception 'TRAINING_FUNCTION_HARD_CAP_SIGNATURE_CHANGED';
  end if;

  if position(
    'case when coalesce(v_is_elite, false) then 108 else 90 end'
    in v_definition
  ) = 0 then
    raise exception 'TRAINING_FUNCTION_CREDIT_SIGNATURE_CHANGED';
  end if;

  v_definition := replace(
    v_definition,
    'v_hard_cap := v_hard_cap * case when coalesce(v_is_elite, false) then 1.05 else 1 end;',
    'v_hard_cap := v_hard_cap;'
  );
  v_definition := replace(
    v_definition,
    'case when coalesce(v_is_elite, false) then 108 else 90 end',
    '90'
  );
  v_definition := replace(
    v_definition,
    'sport-balance-v69',
    'sport-balance-v89-fair-play'
  );

  execute v_definition;
end;
$migration$;

-- Legacy combat power, battery upgrades and rewarded ads are removed from the
-- public catalogue. Historical rows remain available for audit purposes.
update public.shop_items
set is_active = false,
    updated_at = now()
where type in ('charge', 'upgrade', 'ad');

insert into public.shop_items (
  id,
  name,
  description,
  price,
  type,
  icon,
  effect_val,
  cooldown_type,
  cooldown_max,
  is_active,
  requires_elite,
  economy_tier,
  cosmetic_id
)
values
  ('cos_frame_neon', 'Cadre Neon Core', 'Contour cyan lumineux pour ton profil.', 450, 'cosmetic', 'ri-radar-line', 0, 'once', 1, true, false, 'earned', 'frame-neon'),
  ('cos_frame_crimson', 'Cadre Redline', 'Finition rouge orbital gagnee avec tes credits.', 700, 'cosmetic', 'ri-record-circle-line', 0, 'once', 1, true, false, 'earned', 'frame-crimson'),
  ('cos_grenade_glitch', 'Effet Glitch', 'Effet visuel parasite dans aventure, sans puissance ajoutee.', 600, 'cosmetic', 'ri-scan-2-line', 0, 'once', 1, true, false, 'earned', 'grenade-glitch'),
  ('cos_grenade_frost', 'Effet Cryo', 'Trainee glacee purement visuelle.', 800, 'cosmetic', 'ri-snowflake-line', 0, 'once', 1, true, false, 'earned', 'grenade-frost'),
  ('cos_victory_ion', 'Victoire Ion Burst', 'Animation de victoire debloquee avec tes credits.', 950, 'cosmetic', 'ri-flashlight-line', 0, 'once', 1, true, false, 'earned', 'victory-ion'),
  ('cos_frame_aegis', 'Cadre Aegis Gold', 'Cadre de la collection TITAN+, sans bonus de statistiques.', 0, 'cosmetic', 'ri-vip-crown-2-line', 0, 'once', 1, true, true, 'titan_plus', 'frame-aegis'),
  ('cos_frame_frost', 'Cadre Cryo Plate', 'Finition froide de la collection TITAN+.', 0, 'cosmetic', 'ri-snowflake-line', 0, 'once', 1, true, true, 'titan_plus', 'frame-frost'),
  ('cos_grenade_plasma', 'Effet Plasma', 'Habillage plasma TITAN+, uniquement visuel.', 0, 'cosmetic', 'ri-blur-off-line', 0, 'once', 1, true, true, 'titan_plus', 'grenade-plasma'),
  ('cos_grenade_gold', 'Effet Aurum', 'Finition or TITAN+, sans degat supplementaire.', 0, 'cosmetic', 'ri-vip-diamond-line', 0, 'once', 1, true, true, 'titan_plus', 'grenade-gold'),
  ('cos_victory_orbital', 'Victoire Orbital Seal', 'Signature de victoire TITAN+ sans gain cache.', 0, 'cosmetic', 'ri-crosshair-2-line', 0, 'once', 1, true, true, 'titan_plus', 'victory-orbital')
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    type = excluded.type,
    icon = excluded.icon,
    effect_val = excluded.effect_val,
    cooldown_type = excluded.cooldown_type,
    cooldown_max = excluded.cooldown_max,
    is_active = excluded.is_active,
    requires_elite = excluded.requires_elite,
    economy_tier = excluded.economy_tier,
    cosmetic_id = excluded.cosmetic_id,
    updated_at = now();

update public.shop_items
set slug = id,
    image_url = '/image/shop/titan-plus-v89.webp',
    price_credits = price,
    rarity = case when requires_elite then 'seasonal' else 'earned' end,
    item_type = 'cosmetic',
    required_premium = requires_elite,
    metadata = jsonb_build_object(
      'fairPlay', true,
      'visualOnly', true,
      'slot',
      case
        when cosmetic_id like 'frame-%' then 'avatarFrame'
        when cosmetic_id like 'grenade-%' then 'grenadeSkin'
        when cosmetic_id like 'victory-%' then 'victoryEffect'
        else 'profile'
      end
    ),
    updated_at = now()
where type = 'cosmetic';

-- The purchase endpoint now accepts only cosmetic items and respects the
-- requires_elite value stored on each catalogue row.
do $migration$
declare
  v_definition text;
  v_found_block text := $needle$
  if not found then
    raise exception 'SHOP_ITEM_NOT_FOUND' using errcode = '22023';
  end if;
$needle$;
  v_guarded_block text := $replacement$
  if not found then
    raise exception 'SHOP_ITEM_NOT_FOUND' using errcode = '22023';
  end if;

  if v_type <> 'cosmetic' then
    raise exception 'COSMETICS_ONLY' using errcode = '22023';
  end if;
$replacement$;
  v_old_cosmetic text := $needle$
  elsif v_type = 'cosmetic' then
    v_cost := 0;
    v_reward := 0;
    v_requires_elite := true;
    v_cooldown_type := 'once';
    v_cooldown_max := 1;
$needle$;
  v_new_cosmetic text := $replacement$
  elsif v_type = 'cosmetic' then
    v_cost := case when v_requires_elite then 0 else greatest(v_price, 1) end;
    v_reward := 0;
    v_cooldown_type := 'once';
    v_cooldown_max := 1;
$replacement$;
begin
  select pg_get_functiondef('public.titan_purchase_shop_item(text)'::regprocedure)
  into v_definition;

  if position(v_found_block in v_definition) = 0 then
    raise exception 'SHOP_FUNCTION_LOOKUP_SIGNATURE_CHANGED';
  end if;

  if position(v_old_cosmetic in v_definition) = 0 then
    raise exception 'SHOP_FUNCTION_COSMETIC_SIGNATURE_CHANGED';
  end if;

  v_definition := replace(v_definition, v_found_block, v_guarded_block);
  v_definition := replace(v_definition, v_old_cosmetic, v_new_cosmetic);
  v_definition := replace(v_definition, 'server_v66', 'server_v89_cosmetic_only');

  execute v_definition;
end;
$migration$;

create index if not exists shop_history_user_item_purchased_at_idx
on public.shop_history (user_id, item_id, purchased_at desc);

grant select on table public.shop_items to anon, authenticated;

revoke all on function public.titan_economy_limits(uuid) from public;
revoke execute on function public.titan_economy_limits(uuid) from anon;
grant execute on function public.titan_economy_limits(uuid) to authenticated;

revoke all on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) from public;
revoke execute on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) from anon;
grant execute on function public.titan_submit_training_session(text, text, numeric, text, jsonb, timestamptz) to authenticated;

revoke all on function public.titan_purchase_shop_item(text) from public;
revoke execute on function public.titan_purchase_shop_item(text) from anon;
grant execute on function public.titan_purchase_shop_item(text) to authenticated;

do $checks$
begin
  if exists (
    select 1
    from public.shop_items
    where is_active is true
      and type <> 'cosmetic'
  ) then
    raise exception 'ACTIVE_NON_COSMETIC_ITEM_REMAINS';
  end if;

  if (
    select count(*)
    from public.shop_items
    where is_active is true
      and type = 'cosmetic'
  ) <> 10 then
    raise exception 'COSMETIC_CATALOG_COUNT_MISMATCH';
  end if;
end;
$checks$;

notify pgrst, 'reload schema';

commit;
