-- TITAN 300 — Atelier: one currency (credits earned by effort), cosmetics only, ownership decided by the server.
-- Non-destructive: legacy combat cosmetics are deactivated, not deleted; purchase history is untouched.

-- 1. Purchases go through titan_purchase_shop_item only. A direct insert into shop_history would have
--    granted any cosmetic for free once ownership is read from the history.
drop policy if exists shop_history_insert_own_v89 on public.shop_history;
revoke insert on public.shop_history from authenticated, anon;

-- 2. The equipped look lives in its own column, written only by titan_set_appearance (profiles has no
--    self-update policy). game_state never carries it, so a client cannot forge it.
alter table public.profiles add column if not exists appearance jsonb not null default '{}'::jsonb;

-- 3. Catalogue v300. metadata.slot = frame | map | card; metadata.unlock = default | credits | rank | plus.
--    Rank pieces read profiles.level (required_level); plus pieces follow the live TITAN+ status.
update public.shop_items set is_active = false, updated_at = now()
where id in ('cos_grenade_glitch', 'cos_grenade_frost', 'cos_victory_ion', 'cos_grenade_plasma', 'cos_grenade_gold', 'cos_victory_orbital');

insert into public.shop_items (id, name, description, price, type, icon, is_active, requires_elite, cosmetic_id, rarity, required_level, metadata)
values
  ('cos_frame_standard', 'Portrait nu', 'Le portrait tel quel, sans cadre.', 0, 'cosmetic', 'user', true, false, 'frame-standard', 'default', 1, '{"slot":"frame","unlock":"default","order":0}'),
  ('cos_frame_neon', 'Cadre Néon', 'Un liseré cyan, net et discret.', 450, 'cosmetic', 'sparkle', true, false, 'frame-neon', 'earned', 1, '{"slot":"frame","unlock":"credits","order":10}'),
  ('cos_frame_crimson', 'Cadre Braise', 'Un anneau cuivré qui rougeoit doucement.', 700, 'cosmetic', 'sparkle', true, false, 'frame-crimson', 'earned', 1, '{"slot":"frame","unlock":"credits","order":20}'),
  ('cos_frame_tide', 'Cadre Marée', 'Deux bleus qui se croisent comme une ligne d’eau.', 900, 'cosmetic', 'wave', true, false, 'frame-tide', 'earned', 1, '{"slot":"frame","unlock":"credits","order":30}'),
  ('cos_frame_summit', 'Cadre Cime', 'Un trait de neige sur fond d’ardoise, pour les longues saisons.', 1400, 'cosmetic', 'mountain', true, false, 'frame-summit', 'earned', 1, '{"slot":"frame","unlock":"credits","order":40}'),
  ('cos_frame_sentinel', 'Cadre Sentinelle', 'Remis au rang Sentinelle. Ne s’achète pas.', 0, 'cosmetic', 'shield', true, false, 'frame-sentinel', 'rank', 6, '{"slot":"frame","unlock":"rank","order":50}'),
  ('cos_frame_guardian', 'Cadre Gardien', 'Remis au rang Gardien. Ne s’achète pas.', 0, 'cosmetic', 'shield', true, false, 'frame-guardian', 'rank', 10, '{"slot":"frame","unlock":"rank","order":51}'),
  ('cos_frame_champion', 'Cadre Champion', 'Remis au rang Champion. Ne s’achète pas.', 0, 'cosmetic', 'medal', true, false, 'frame-champion', 'rank', 15, '{"slot":"frame","unlock":"rank","order":52}'),
  ('cos_frame_titan', 'Cadre Titan', 'Remis au rang Titan. Ne s’achète pas.', 0, 'cosmetic', 'crown', true, false, 'frame-titan', 'rank', 25, '{"slot":"frame","unlock":"rank","order":53}'),
  ('cos_frame_legend', 'Cadre Légende', 'Remis au rang Légende. Ne s’achète pas.', 0, 'cosmetic', 'crown', true, false, 'frame-legend', 'rank', 40, '{"slot":"frame","unlock":"rank","order":54}'),
  ('cos_frame_aegis', 'Cadre Aegis', 'Or mat et double filet. Inclus avec TITAN+.', 0, 'cosmetic', 'crown', true, true, 'frame-aegis', 'plus', 1, '{"slot":"frame","unlock":"plus","order":60}'),
  ('cos_frame_frost', 'Cadre Givre', 'Un cristal pâle autour du portrait. Inclus avec TITAN+.', 0, 'cosmetic', 'crown', true, true, 'frame-frost', 'plus', 1, '{"slot":"frame","unlock":"plus","order":61}'),
  ('cos_map_default', 'Carte d’origine', 'Les couleurs de chaque monde, telles que dessinées.', 0, 'cosmetic', 'compass', true, false, 'map-default', 'default', 1, '{"slot":"map","unlock":"default","order":0}'),
  ('cos_map_mist', 'Brume', 'Une lumière basse et laiteuse sur la carte d’aventure.', 600, 'cosmetic', 'cloud', true, false, 'map-mist', 'earned', 1, '{"slot":"map","unlock":"credits","order":10}'),
  ('cos_map_night', 'Nuit polaire', 'La carte sous un ciel froid, balises plus vives.', 1000, 'cosmetic', 'moon', true, false, 'map-night', 'earned', 1, '{"slot":"map","unlock":"credits","order":20}'),
  ('cos_map_aurora', 'Aurores', 'Un voile vert et violet venu de la citadelle. Inclus avec TITAN+.', 0, 'cosmetic', 'sparkle', true, true, 'map-aurora', 'plus', 1, '{"slot":"map","unlock":"plus","order":60}'),
  ('cos_card_default', 'Carte TITAN', 'La carte partageable sobre, noir et cyan.', 0, 'cosmetic', 'share', true, false, 'card-default', 'default', 1, '{"slot":"card","unlock":"default","order":0}'),
  ('cos_card_chalk', 'Craie', 'Fond clair et trait de craie, comme un tableau de salle.', 400, 'cosmetic', 'edit', true, false, 'card-chalk', 'earned', 1, '{"slot":"card","unlock":"credits","order":10}'),
  ('cos_card_ember', 'Braise', 'Dégradé cuivre pour les records qui comptent.', 800, 'cosmetic', 'bolt', true, false, 'card-ember', 'earned', 1, '{"slot":"card","unlock":"credits","order":20}'),
  ('cos_card_obsidian', 'Obsidienne', 'Noir profond et reflet violet des forges. Inclus avec TITAN+.', 0, 'cosmetic', 'layers', true, true, 'card-obsidian', 'plus', 1, '{"slot":"card","unlock":"plus","order":60}')
on conflict (id) do update set
  name = excluded.name, description = excluded.description, price = excluded.price, type = excluded.type, icon = excluded.icon,
  is_active = excluded.is_active, requires_elite = excluded.requires_elite, cosmetic_id = excluded.cosmetic_id, rarity = excluded.rarity,
  required_level = excluded.required_level, metadata = coalesce(public.shop_items.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();

-- 4. Ownership, one rule for every screen.
create or replace function private.titan_cosmetic_owned(p_uid uuid, p_item text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select case coalesce(si.metadata ->> 'unlock', 'credits')
      when 'default' then true
      when 'rank' then coalesce(p.level, 1) >= coalesce(si.required_level, 1)
      when 'plus' then coalesce(p.is_elite, false)
      when 'credits' then exists (select 1 from public.shop_history h where h.user_id = p_uid and h.item_id = si.id)
      else false end
    from public.shop_items si
    join public.profiles p on p.id = p_uid
    where si.id = p_item and si.type = 'cosmetic'
  ), false);
$$;

-- The look actually shown: an equipped piece that is no longer owned (TITAN+ ended) falls back to default.
create or replace function private.titan_appearance(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(a.key, a.value #>> '{}'), '{}'::jsonb)
  from public.profiles p
  cross join lateral jsonb_each(coalesce(p.appearance, '{}'::jsonb)) a
  where p.id = p_uid
    and a.key in ('frame', 'map', 'card')
    and exists (
      select 1 from public.shop_items si
      where si.cosmetic_id = a.value #>> '{}' and si.metadata ->> 'slot' = a.key
        and private.titan_cosmetic_owned(p_uid, si.id)
    );
$$;

-- 5. Purchase: credits only, once per piece, cosmetics only. Rank, TITAN+ and default pieces are not for sale.
create or replace function public.titan_purchase_shop_item(p_item_id text)
returns table(item_id text, cost integer, reward_credits integer, credits_after integer, purchased_at timestamp with time zone, mode text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.shop_items%rowtype;
  v_credits integer;
  v_suspended boolean;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into v_item from public.shop_items si
  where si.id = left(trim(coalesce(p_item_id, '')), 80) and coalesce(si.is_active, true)
    and (si.starts_at is null or si.starts_at <= v_now) and (si.ends_at is null or si.ends_at >= v_now);
  if not found then
    raise exception 'SHOP_ITEM_NOT_FOUND' using errcode = '22023';
  end if;
  if v_item.type <> 'cosmetic' then
    raise exception 'COSMETICS_ONLY' using errcode = '22023';
  end if;
  if coalesce(v_item.requires_elite, false) or coalesce(v_item.metadata ->> 'unlock', 'credits') <> 'credits' or coalesce(v_item.price, 0) < 1 then
    raise exception 'NOT_FOR_SALE' using errcode = '22023';
  end if;

  select coalesce(p.credits, 0)::integer, coalesce(p.is_suspended, false) into v_credits, v_suspended
  from public.profiles p where p.id = v_uid for update;
  if not found then
    raise exception 'PROFILE_MISSING' using errcode = '42501';
  end if;
  if v_suspended then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;
  if exists (select 1 from public.shop_history h where h.user_id = v_uid and h.item_id = v_item.id) then
    raise exception 'PURCHASE_LIMIT_ONCE' using errcode = '23514';
  end if;
  if v_credits < v_item.price then
    raise exception 'NO_FUNDS' using errcode = '23514';
  end if;

  update public.profiles p set credits = v_credits - v_item.price where p.id = v_uid
  returning p.credits::integer into v_credits;
  insert into public.shop_history (user_id, item_id, purchased_at, cost_credits, reward_credits, economy_meta)
  values (v_uid, v_item.id, v_now, v_item.price, 0,
    jsonb_build_object('type', 'cosmetic', 'slot', v_item.metadata ->> 'slot', 'cosmeticId', v_item.cosmetic_id, 'version', 300));

  return query select v_item.id, v_item.price::integer, 0, v_credits, v_now, 'server_v300_atelier'::text;
end;
$$;

-- 6. Equip a piece the server agrees you own. p_item null puts the slot back to default.
create or replace function public.titan_set_appearance(p_slot text, p_item text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_cosmetic text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_slot is null or p_slot not in ('frame', 'map', 'card') then
    raise exception 'INVALID_SLOT' using errcode = '22023';
  end if;
  if p_item is null then
    update public.profiles set appearance = coalesce(appearance, '{}'::jsonb) - p_slot where id = v_uid;
    return private.titan_appearance(v_uid);
  end if;
  select si.cosmetic_id into v_cosmetic from public.shop_items si
  where si.id = p_item and si.type = 'cosmetic' and si.metadata ->> 'slot' = p_slot;
  if v_cosmetic is null then
    raise exception 'SHOP_ITEM_NOT_FOUND' using errcode = '22023';
  end if;
  if not private.titan_cosmetic_owned(v_uid, p_item) then
    raise exception 'NOT_OWNED' using errcode = '42501';
  end if;
  update public.profiles set appearance = coalesce(appearance, '{}'::jsonb) || jsonb_build_object(p_slot, v_cosmetic) where id = v_uid;
  return private.titan_appearance(v_uid);
end;
$$;

-- 7. Everything the Atelier needs in one call. No payment data: only the entitlement the webhook wrote.
create or replace function public.titan_atelier()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles%rowtype;
  v_items jsonb;
  v_week integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into v_p from public.profiles where id = v_uid;
  if not found then
    raise exception 'PROFILE_MISSING' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', si.id, 'cosmetic', si.cosmetic_id, 'slot', si.metadata ->> 'slot', 'unlock', coalesce(si.metadata ->> 'unlock', 'credits'),
      'name', si.name, 'description', si.description, 'price', si.price, 'min_level', si.required_level,
      'owned', private.titan_cosmetic_owned(v_uid, si.id))
    order by si.metadata ->> 'slot', coalesce((si.metadata ->> 'order')::integer, 999), si.price), '[]'::jsonb)
  into v_items
  from public.shop_items si
  where si.type = 'cosmetic' and si.metadata ? 'slot'
    and ((coalesce(si.is_active, true) and (si.starts_at is null or si.starts_at <= now()) and (si.ends_at is null or si.ends_at >= now()))
      or exists (select 1 from public.shop_history h where h.user_id = v_uid and h.item_id = si.id));

  select greatest(0, coalesce(u.credits_awarded, 0))::integer into v_week
  from public.titan_weekly_reward_usage u
  where u.user_id = v_uid and u.week_start = public.titan_week_start(now());

  return jsonb_build_object(
    'credits', coalesce(v_p.credits, 0),
    'level', coalesce(v_p.level, 1),
    'week_credits', coalesce(v_week, 0),
    'week_credit_cap', coalesce((public.titan_economy_limits(v_uid) ->> 'weeklyCreditCap')::integer, 960),
    'plus', jsonb_build_object('active', coalesce(v_p.is_elite, false), 'status', v_p.elite_status,
      'renews_at', v_p.elite_renews_at, 'ends_at', v_p.elite_ends_at),
    'appearance', private.titan_appearance(v_uid),
    'items', v_items);
end;
$$;

revoke all on function private.titan_cosmetic_owned(uuid, text) from public, anon;
revoke all on function private.titan_appearance(uuid) from public, anon;
revoke all on function public.titan_set_appearance(text, text) from public, anon;
revoke all on function public.titan_atelier() from public, anon;
revoke all on function public.titan_purchase_shop_item(text) from public, anon;
grant execute on function private.titan_cosmetic_owned(uuid, text) to authenticated;
grant execute on function private.titan_appearance(uuid) to authenticated;
grant execute on function public.titan_set_appearance(text, text) to authenticated;
grant execute on function public.titan_atelier() to authenticated;
grant execute on function public.titan_purchase_shop_item(text) to authenticated;
