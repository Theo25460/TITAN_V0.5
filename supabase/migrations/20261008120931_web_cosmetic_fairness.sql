-- Four formerly subscription-only pieces can be earned with activity credits.
-- Preserve IDs, purchase history and current subscribers' temporary access. No profile writes.
-- One atomic statement, also safe inside a caller-owned transaction; no BEGIN/COMMIT here.
do $migration$
declare previous_timeout text := current_setting('lock_timeout'); changed integer;
begin
  perform set_config('lock_timeout', '5s', true);
  update public.shop_items si set
    price = v.price, requires_elite = false, starts_at = null, ends_at = null,
    description = v.description,
    metadata = coalesce(si.metadata, '{}'::jsonb) || '{"unlock":"credits","plus_access":true}'::jsonb
  from (values
    ('cos_frame_aegis', 1400, 'Or mat et double filet. Acquisition permanente avec tes crédits ; accès temporaire inclus avec TITAN+.'),
    ('cos_frame_frost', 1400, 'Un cristal pâle autour du portrait. Acquisition permanente avec tes crédits ; accès temporaire inclus avec TITAN+.'),
    ('cos_map_aurora', 1000, 'Un voile vert et violet venu de la citadelle. Acquisition permanente avec tes crédits ; accès temporaire inclus avec TITAN+.'),
    ('cos_card_obsidian', 800, 'Noir profond et reflet violet des forges. Acquisition permanente avec tes crédits ; accès temporaire inclus avec TITAN+.')
  ) v(id, price, description)
  where si.id = v.id and si.type = 'cosmetic';
  get diagnostics changed = row_count;
  if changed <> 4 then raise exception 'COSMETIC_CATALOG_PREREQUISITE_MISSING'; end if;

  execute $ddl$
  create or replace function private.titan_cosmetic_owned(p_uid uuid, p_item text)
  returns boolean language sql stable security definer set search_path = ''
  as $owned$
    select coalesce((
      select case coalesce(si.metadata ->> 'unlock', 'credits')
        when 'default' then true
        when 'rank' then coalesce(p.level, 1) >= coalesce(si.required_level, 1)
        when 'plus' then p.is_elite is true and p.elite_refunded_at is null and (p.elite_ends_at is null or p.elite_ends_at > now())
        when 'credits' then
          exists (select 1 from public.shop_history h where h.user_id = p_uid and h.item_id = si.id)
          or (si.metadata ->> 'plus_access' = 'true' and p.is_elite is true and p.elite_refunded_at is null and (p.elite_ends_at is null or p.elite_ends_at > now()))
        else false end
      from public.shop_items si join public.profiles p on p.id = p_uid
      where si.id = p_item and si.type = 'cosmetic'
    ), false);
  $owned$;
  $ddl$;

  execute $ddl$
  create or replace function public.titan_atelier()
  returns jsonb language plpgsql stable security definer set search_path = ''
  as $atelier$
  declare
    v_uid uuid := auth.uid(); v_p public.profiles%rowtype; v_items jsonb; v_week integer;
  begin
    if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
    select * into v_p from public.profiles where id = v_uid;
    if not found then raise exception 'PROFILE_MISSING' using errcode = '42501'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', si.id, 'cosmetic', si.cosmetic_id, 'slot', si.metadata ->> 'slot', 'unlock', coalesce(si.metadata ->> 'unlock', 'credits'),
      'name', si.name, 'description', si.description, 'price', si.price, 'min_level', si.required_level,
      'owned', private.titan_cosmetic_owned(v_uid, si.id),
      'permanent', case coalesce(si.metadata ->> 'unlock', 'credits')
        when 'credits' then exists (select 1 from public.shop_history h where h.user_id = v_uid and h.item_id = si.id)
        when 'plus' then false
        else private.titan_cosmetic_owned(v_uid, si.id) end,
      'plus_access', coalesce(si.metadata ->> 'plus_access' = 'true', false))
      order by si.metadata ->> 'slot', coalesce((si.metadata ->> 'order')::integer, 999), si.price), '[]'::jsonb)
    into v_items from public.shop_items si
    where si.type = 'cosmetic' and si.metadata ? 'slot'
      and ((coalesce(si.is_active, true) and (si.starts_at is null or si.starts_at <= now()) and (si.ends_at is null or si.ends_at >= now()))
        or exists (select 1 from public.shop_history h where h.user_id = v_uid and h.item_id = si.id));
    select greatest(0, coalesce(u.credits_awarded, 0))::integer into v_week
      from public.titan_weekly_reward_usage u where u.user_id = v_uid and u.week_start = public.titan_week_start(now());
    return jsonb_build_object(
      'owner', v_uid, 'credits', coalesce(v_p.credits, 0), 'level', coalesce(v_p.level, 1),
      'week_credits', coalesce(v_week, 0),
      'week_credit_cap', coalesce((public.titan_economy_limits(v_uid) ->> 'weeklyCreditCap')::integer, 960),
      'plus', jsonb_build_object('active', v_p.is_elite is true and v_p.elite_refunded_at is null and (v_p.elite_ends_at is null or v_p.elite_ends_at > now()), 'status', v_p.elite_status,
        'renews_at', v_p.elite_renews_at, 'ends_at', v_p.elite_ends_at, 'refunded_at', v_p.elite_refunded_at),
      'appearance', private.titan_appearance(v_uid), 'items', v_items);
  end;
  $atelier$;
  $ddl$;
  perform set_config('lock_timeout', previous_timeout, true);
end;
$migration$;
