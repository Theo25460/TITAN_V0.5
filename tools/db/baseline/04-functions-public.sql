-- Production public-schema functions snapshot (2026-10-05). Test-only.
CREATE OR REPLACE FUNCTION public.add_friend_by_code(target_input text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  current_user_id UUID;
  target_user_id UUID;
  existing_check UUID;
BEGIN
  current_user_id := auth.uid();
  
  -- Sécurité : Si pas connecté
  IF current_user_id IS NULL THEN
    RETURN 'NOT_LOGGED_IN';
  END IF;

  -- A. Recherche de l'ID cible (par friend_code OU par UUID si c'en est un)
  -- On utilise une astuce regex pour voir si c'est un UUID
  IF target_input ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
     SELECT id INTO target_user_id FROM profiles WHERE id = target_input::uuid;
  ELSE
     SELECT id INTO target_user_id FROM profiles WHERE friend_code = target_input;
  END IF;

  -- B. Résultat recherche
  IF target_user_id IS NULL THEN
    RETURN 'NOT_FOUND';
  END IF;

  -- C. S'ajouter soi-même
  IF target_user_id = current_user_id THEN
    RETURN 'SELF_ERROR';
  END IF;

  -- D. Vérifier si déjà ami
  SELECT id INTO existing_check FROM friends 
  WHERE (user_id = current_user_id AND friend_id = target_user_id)
     OR (user_id = target_user_id AND friend_id = current_user_id);
     
  IF existing_check IS NOT NULL THEN
    RETURN 'ALREADY_FRIENDS';
  END IF;

  -- E. Insertion
  INSERT INTO friends (user_id, friend_id, status)
  VALUES (current_user_id, target_user_id, 'accepted');

  RETURN 'SUCCESS';
END;
$function$
;
CREATE OR REPLACE FUNCTION public.add_friend_by_id(target_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  current_user_id uuid;
  target_exists boolean;
begin
  -- 1. Qui appelle la fonction ?
  current_user_id := auth.uid();

  -- 2. On vérifie juste si on essaie de s'ajouter soi-même
  if current_user_id = target_id then
    return 'SELF_ERROR';
  end if;

  -- 3. On vérifie si l'ID existe dans la table profiles (sans souci de permission)
  select exists(select 1 from public.profiles where id = target_id) into target_exists;
  
  if not target_exists then
    return 'NOT_FOUND';
  end if;

  -- 4. On tente l'insertion direct
  insert into public.friends (user_id, friend_id, status)
  values (current_user_id, target_id, 'accepted'); -- ou 'pending' selon ton choix

  return 'SUCCESS';

exception 
  when unique_violation then
    return 'ALREADY_FRIENDS';
  when others then
    return 'ERROR';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.add_rewards(p_user_id uuid, p_xp integer, p_credits integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.profiles
  SET 
    xp = COALESCE(xp, 0) + p_xp,
    credits = COALESCE(credits, 0) + p_credits
  WHERE id = p_user_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.check_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Tentative de modification illégale : ID utilisateur incorrect.';
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.check_if_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
    AND is_admin = true
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.delete_inactive_users()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- Supprime les utilisateurs non connectés depuis 60 jours
  delete from auth.users
  where last_sign_in_at < (now() - interval '2 months');
end;
$function$
;
CREATE OR REPLACE FUNCTION public.delete_own_account()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_counts jsonb := '{}'::jsonb;
  v_deleted integer := 0;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_deleted := public.titan_delete_rows('training_logs', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('training_logs', v_deleted);

  v_deleted := public.titan_delete_rows('activities', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('activities', v_deleted);

  v_deleted := public.titan_delete_rows('messages', 'sender_id', v_uid);
  v_counts := v_counts || jsonb_build_object('messages', v_deleted);

  v_deleted := public.titan_delete_rows('shop_history', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('shop_history', v_deleted);

  v_deleted := public.titan_delete_rows('user_achievements', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('user_achievements', v_deleted);

  v_deleted := public.titan_delete_rows('inventory', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('inventory', v_deleted);

  v_deleted := public.titan_delete_rows('titan_cache_reconciliation_reports', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('cache_reconciliation_reports', v_deleted);

  v_deleted := public.titan_delete_rows('titan_suspicious_actions', 'user_id', v_uid);
  v_counts := v_counts || jsonb_build_object('suspicious_actions', v_deleted);

  if to_regclass('public.friendships') is not null
     and public.titan_table_has_column('friendships', 'user_id_1')
     and public.titan_table_has_column('friendships', 'user_id_2') then
    delete from public.friendships
    where user_id_1 = v_uid or user_id_2 = v_uid;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('friendships', v_deleted);
  end if;

  if to_regclass('public.social_challenges') is not null
     and public.titan_table_has_column('social_challenges', 'challenger_id')
     and public.titan_table_has_column('social_challenges', 'opponent_id') then
    delete from public.social_challenges
    where challenger_id = v_uid or opponent_id = v_uid;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('social_challenges', v_deleted);
  end if;

  delete from public.profiles where id = v_uid;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('profiles', v_deleted);

  delete from auth.users where id = v_uid;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('auth_users', v_deleted);

  return jsonb_build_object(
    'deletedAt', now(),
    'userId', v_uid,
    'deleted', v_counts
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.export_own_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb := '{}'::jsonb;
  v_friendships jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select coalesce(to_jsonb(p), '{}'::jsonb)
  into v_profile
  from public.profiles p
  where p.id = v_uid;

  if to_regclass('public.friendships') is not null
     and public.titan_table_has_column('friendships', 'user_id_1')
     and public.titan_table_has_column('friendships', 'user_id_2') then
    select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb)
    into v_friendships
    from public.friendships f
    where f.user_id_1 = v_uid or f.user_id_2 = v_uid;
  end if;

  return jsonb_build_object(
    'exportedAt', now(),
    'userId', v_uid,
    'profile', v_profile,
    'trainingLogs', public.titan_export_rows('training_logs', 'user_id', v_uid),
    'activities', public.titan_export_rows('activities', 'user_id', v_uid),
    'messages', public.titan_export_rows('messages', 'sender_id', v_uid),
    'friendships', v_friendships,
    'shopHistory', public.titan_export_rows('shop_history', 'user_id', v_uid),
    'achievements', public.titan_export_rows('user_achievements', 'user_id', v_uid),
    'inventory', public.titan_export_rows('inventory', 'user_id', v_uid),
    'socialChallengesAsChallenger', public.titan_export_rows('social_challenges', 'challenger_id', v_uid),
    'socialChallengesAsOpponent', public.titan_export_rows('social_challenges', 'opponent_id', v_uid),
    'cacheReconciliationReports', public.titan_export_rows('titan_cache_reconciliation_reports', 'user_id', v_uid),
    'suspiciousActions', public.titan_export_rows('titan_suspicious_actions', 'user_id', v_uid)
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_my_friends_v2()
 RETURNS TABLE(friend_uuid uuid, username text, avatar text, level integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.username,
    p.avatar,
    p.level
  FROM friends f
  JOIN profiles p ON (
    -- Si je suis user_id, je veux les infos de friend_id
    (f.user_id = auth.uid() AND f.friend_id = p.id)
    OR 
    -- Si je suis friend_id, je veux les infos de user_id
    (f.friend_id = auth.uid() AND f.user_id = p.id)
  )
  WHERE f.status = 'accepted';
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_server_date()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT CURRENT_DATE::text; $function$
;
CREATE OR REPLACE FUNCTION public.handle_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    safe_record_id text;
    safe_old_data jsonb;
    safe_new_data jsonb;
    current_user_id uuid;
    row_data jsonb;
BEGIN
    -- On récupère l'ID utilisateur s'il est dispo
    current_user_id := auth.uid();

    -- CAS 1 : SUPPRESSION
    IF (TG_OP = 'DELETE') THEN
        -- On convertit la ligne supprimée (OLD) en JSON pour lire les champs sans planter
        row_data := to_jsonb(OLD);
        safe_old_data := row_data;
        safe_new_data := NULL;
        
        -- On cherche 'id' OU 'user_id' (pour les tables comme admin_whitelist)
        safe_record_id := COALESCE(row_data->>'id', row_data->>'user_id', 'unknown');
        
        -- Si l'utilisateur se supprime lui-même, on garde sa trace via les données supprimées
        IF current_user_id IS NULL THEN
            current_user_id := (COALESCE(row_data->>'user_id', row_data->>'id'))::uuid;
        END IF;

    -- CAS 2 : INSERTION
    ELSIF (TG_OP = 'INSERT') THEN
        row_data := to_jsonb(NEW);
        safe_record_id := COALESCE(row_data->>'id', row_data->>'user_id', 'unknown');
        safe_old_data := NULL;
        safe_new_data := row_data;

    -- CAS 3 : MISE À JOUR
    ELSE 
        row_data := to_jsonb(NEW);
        safe_record_id := COALESCE(row_data->>'id', row_data->>'user_id', 'unknown');
        safe_old_data := to_jsonb(OLD);
        safe_new_data := row_data;
    END IF;

    -- Enregistrement sécurisé dans les logs
    -- Si ça échoue ici (ex: format uuid invalide), on ignore l'erreur pour ne pas bloquer l'action utilisateur
    BEGIN
        INSERT INTO public.audit_logs (table_name, operation, record_id, old_data, new_data, changed_by)
        VALUES (TG_TABLE_NAME, TG_OP, safe_record_id, safe_old_data, safe_new_data, current_user_id);
    EXCEPTION WHEN OTHERS THEN
        -- On ne fait rien, on laisse la suppression continuer même si le log échoue
        NULL;
    END;

    -- On valide l'opération
    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, username, credits, level, game_state)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Recrue Titan'),
    200,
    1,
    '{}'::jsonb
  )
  on conflict (id) do nothing;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN (SELECT is_admin FROM profiles WHERE id = auth.uid());
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM admin_whitelist WHERE user_id = auth.uid()
    );
$function$
;
CREATE OR REPLACE FUNCTION public.purchase_lootbox()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  current_credits int;
  price constant int := 200; -- Le prix est fixé ici, impossible à changer par le joueur
  new_credits int;
begin
  -- 1. Vérifier le solde actuel du joueur qui appelle la fonction
  select credits into current_credits from profiles where id = auth.uid();
  
  -- 2. Vérification anti-triche
  if current_credits < price then
    return json_build_object('success', false, 'message', 'Fonds insuffisants');
  end if;

  -- 3. Transaction : On débite le joueur
  update profiles 
  set credits = credits - price 
  where id = auth.uid()
  returning credits into new_credits;

  -- 4. Succès : On renvoie le nouveau solde
  return json_build_object('success', true, 'new_credits', new_credits);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.submit_activity(p_sport_key text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_last_activity_time timestamp with time zone;
  v_sport_rec record;
  v_profile_rec record;
  v_base_xp numeric := 0;
  v_final_xp int;
  v_credits int;
  v_multiplier numeric := 1.0;
  v_marketing_mult numeric := 1.0;
  v_marketing_level int;
  v_exercise jsonb;
  v_val numeric;
  v_new_credits int;
  v_new_xp int;
BEGIN
  -- A. Check Cooldown (5 min)
  SELECT created_at INTO v_last_activity_time FROM activities 
  WHERE user_id = v_user_id ORDER BY created_at DESC LIMIT 1;

  IF v_last_activity_time IS NOT NULL AND v_last_activity_time > (NOW() - INTERVAL '5 minutes') THEN
    RAISE EXCEPTION 'COOLDOWN_ACTIVE'; 
  END IF;

  -- B. Récupération Sport
  SELECT * INTO v_sport_rec FROM sports WHERE key = p_sport_key LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sport introuvable'; END IF;

  -- C. Calcul XP Brute
  IF v_sport_rec.form_type = 'builder_gym' THEN
    FOR v_exercise IN SELECT * FROM jsonb_array_elements(p_data->'exercises')
    LOOP
      v_base_xp := v_base_xp + (
        COALESCE((v_exercise->>'weight')::numeric, 0) * COALESCE((v_exercise->>'sets')::numeric, 0) * COALESCE((v_exercise->>'reps')::numeric, 0)
      );
    END LOOP;
  ELSE
    v_val := COALESCE((p_data->>'val1')::numeric, 0);
    v_base_xp := v_val;
  END IF;
  
  v_base_xp := v_base_xp * COALESCE(v_sport_rec.xp_multiplier, 1);

  -- D. Bonus et Profil
  SELECT * INTO v_profile_rec FROM profiles WHERE id = v_user_id;
  
  IF (p_data->'bio'->>'rpe')::int >= 8 THEN v_multiplier := v_multiplier * 1.25;
  ELSIF (p_data->'bio'->>'rpe')::int >= 6 THEN v_multiplier := v_multiplier * 1.1;
  END IF;
  
  IF (v_profile_rec.game_state->'user'->'buffs'->>'xp_boost')::bigint > (EXTRACT(EPOCH FROM NOW()) * 1000) THEN
     v_multiplier := v_multiplier * 1.5;
  END IF;

  v_final_xp := FLOOR(v_base_xp * v_multiplier);

  -- E. Crédits & Marketing
  v_marketing_level := COALESCE((v_profile_rec.game_state->'user'->'upgrades'->>'marketing')::int, 0);
  IF v_marketing_level > 0 THEN
    v_marketing_mult := 1.10 + ((v_marketing_level - 1) * 0.05);
  END IF;
  v_credits := FLOOR(v_final_xp * 0.2 * v_marketing_mult);

  -- F. Mise à jour SQL
  UPDATE profiles 
  SET credits = COALESCE(credits, 0) + v_credits,
      total_xp = COALESCE(total_xp, 0) + v_final_xp,
      total_sessions = COALESCE(total_sessions, 0) + 1,
      updated_at = NOW()
  WHERE id = v_user_id;

  -- G. Historique
  INSERT INTO activities (user_id, sport_key, date, xp_earned, details)
  VALUES (v_user_id, p_sport_key, CURRENT_DATE, v_final_xp, p_data);

  RETURN jsonb_build_object('success', true, 'xp_gained', v_final_xp, 'credits_gained', v_credits);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_add_friend_by_code(p_friend_code text)
 RETURNS TABLE(id uuid, username text, friend_code text, level integer, avatar text, is_elite boolean, is_suspended boolean, total_sessions integer, fav_sport text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_friend_code, '')));
  v_friend public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_code !~ '^TN-[A-Z2-9]{4,8}$' then
    raise exception 'INVALID_FRIEND_CODE' using errcode = '22023';
  end if;

  select * into v_friend
  from public.profiles p
  where p.friend_code = v_code
  limit 1;

  if v_friend.id is null then
    raise exception 'FRIEND_CODE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_friend.id = v_uid then
    raise exception 'CANNOT_ADD_SELF' using errcode = '22023';
  end if;

  if coalesce(v_friend.is_suspended, false) is true then
    raise exception 'TARGET_SUSPENDED' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.titan_user_blocks b
    where (b.blocker_id = v_uid and b.blocked_id = v_friend.id)
       or (b.blocker_id = v_friend.id and b.blocked_id = v_uid)
  ) then
    raise exception 'USER_BLOCKED' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.friendships f
    where (f.user_id_1 = v_uid and f.user_id_2 = v_friend.id)
       or (f.user_id_1 = v_friend.id and f.user_id_2 = v_uid)
  ) then
    return query
    select f.*
    from public.titan_list_my_friends() f
    where f.id = v_friend.id;
    return;
  end if;

  insert into public.friendships(user_id_1, user_id_2, status)
  values (v_uid, v_friend.id, 'accepted')
  on conflict do nothing;

  return query
  select f.*
  from public.titan_list_my_friends() f
  where f.id = v_friend.id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_allowed_content_tables()
 RETURNS TABLE(table_name text, label text, description text, order_by text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from (values
    ('sports', 'Sports', 'Disciplines, categories, XP, formulaires et champs avances.', 'id'),
    ('mobs', 'Mobs', 'Ennemis standards de la campagne.', 'id'),
    ('bosses', 'Bosses', 'Boss, niveaux, HP, faiblesse et visuels.', 'level'),
    ('talents', 'Talents', 'Arbre de talents et prerequis.', 'path'),
    ('achievements_config', 'Succes', 'Trophees, objectifs et recompenses.', 'id'),
    ('shop_items', 'Boutique', 'Objets, prix, effets, cooldown et activation.', 'id'),
    ('fun_stats', 'Fun stats', 'Equivalences statistiques affichees dans l app.', 'id'),
    ('global_config', 'Config globale', 'Parametres publics comme maintenance_mode.', 'key')
  ) as t(table_name, label, description, order_by)
  where to_regclass('public.' || table_name) is not null;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_assert()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or not public.titan_is_admin(auth.uid()) then
    raise exception 'TITAN_ADMIN_REQUIRED' using errcode = '42501';
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_audit_write(p_action text, p_target_user_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.titan_admin_audit(admin_id, action, target_user_id, payload)
  values (auth.uid(), p_action, p_target_user_id, coalesce(p_payload, '{}'::jsonb));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_claim_first(p_expected_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if exists (select 1 from public.titan_admins where revoked_at is null) then
    raise exception 'ADMIN_ALREADY_EXISTS' using errcode = '42501';
  end if;

  if v_email <> lower(trim(p_expected_email)) then
    raise exception 'EMAIL_MISMATCH' using errcode = '42501';
  end if;

  insert into public.titan_admins(user_id, role, created_by)
  values (auth.uid(), 'owner', auth.uid());

  perform public.titan_admin_audit_write('admin.claim_first', auth.uid(), jsonb_build_object('email', v_email));
  return jsonb_build_object('ok', true, 'role', 'owner');
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_content_catalog()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.titan_admin_assert();

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'table', t.table_name,
        'label', t.label,
        'description', t.description,
        'orderBy', t.order_by,
        'columns', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'name', c.column_name,
            'type', c.data_type,
            'udt', c.udt_name,
            'nullable', c.is_nullable = 'YES',
            'default', c.column_default
          ) order by c.ordinal_position), '[]'::jsonb)
          from information_schema.columns c
          where c.table_schema = 'public'
            and c.table_name = t.table_name
        )
      ) order by t.label
    ), '[]'::jsonb)
    from public.titan_admin_allowed_content_tables() t
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result jsonb;
begin
  perform public.titan_admin_assert();

  select jsonb_build_object(
    'role', public.titan_admin_role(auth.uid()),
    'profilesTotal', (select count(*) from public.profiles),
    'profilesSuspended', (select count(*) from public.profiles where is_suspended is true),
    'eliteTotal', (select count(*) from public.profiles where is_elite is true),
    'testerTotal', (select count(*) from public.profiles where is_tester is true),
    'trainingLogsTotal', (select count(*) from public.training_logs),
    'openReports', (select count(*) from public.titan_moderation_reports where status in ('open','reviewing')),
    'messagesTotal', (case when to_regclass('public.messages') is not null then (select count(*) from public.messages) else 0 end),
    'activeNews', (select count(*) from public.news_updates where active is true),
    'contentTables', 8,
    'latestNews', (
      select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc), '[]'::jsonb)
      from (select id, version_id, title, kind, active, created_at from public.news_updates order by created_at desc limit 5) n
    ),
    'recentProfiles', (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.updated_at desc), '[]'::jsonb)
      from (
        select id, username, level, credits, is_elite, is_tester, is_suspended, updated_at
        from public.profiles
        order by updated_at desc nulls last
        limit 8
      ) p
    )
  ) into result;

  return result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_dashboard_v1()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'private'
AS $function$
  select private.titan_admin_dashboard_v1();
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_delete_content(p_table text, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_allowed boolean;
  v_key_col text := 'id';
  v_sql text;
  v_result jsonb;
begin
  perform public.titan_admin_assert();

  select exists(select 1 from public.titan_admin_allowed_content_tables() where table_name = p_table) into v_allowed;
  if not v_allowed then
    raise exception 'CONTENT_TABLE_NOT_ALLOWED' using errcode = '42501';
  end if;

  if p_table = 'global_config' then
    v_key_col := 'key';
  end if;

  v_sql := format('delete from public.%I where %I::text = %L returning to_jsonb(%I.*)', p_table, v_key_col, p_key, p_table);
  execute v_sql into v_result;

  if v_result is null then
    raise exception 'CONTENT_ROW_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.titan_admin_audit_write('content.delete', null, jsonb_build_object('table', p_table, 'key', p_key));
  notify pgrst, 'reload schema';
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_delete_message(p_message_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result jsonb;
begin
  perform public.titan_admin_assert();

  if to_regclass('public.messages') is null then
    raise exception 'MESSAGES_TABLE_MISSING' using errcode = '42P01';
  end if;

  execute format('delete from public.messages where id::text = %L returning to_jsonb(messages.*)', p_message_id)
  into result;

  if result is null then
    raise exception 'MESSAGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.titan_admin_audit_write('message.delete', null, result);
  return result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_get_context_v1()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'private'
AS $function$
  select private.titan_admin_get_context_v1();
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_grant_premium_v1(p_user_id uuid, p_type text DEFAULT 'premium'::text, p_source text DEFAULT 'admin'::text, p_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_is_lifetime boolean DEFAULT false, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'private'
AS $function$
  select private.titan_admin_grant_premium_v1(p_user_id, p_type, p_source, p_ends_at, p_is_lifetime, p_reason);
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_hide_chat_message(p_message_id text, p_reason text DEFAULT 'moderation'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or not public.titan_is_admin(auth.uid()) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  update public.messages
  set
    hidden_at = coalesce(hidden_at, now()),
    hidden_by = auth.uid(),
    hidden_reason = left(regexp_replace(trim(coalesce(p_reason, 'moderation')), '[[:cntrl:]]', '', 'g'), 180)
  where id::text = p_message_id;

  if not found then
    raise exception 'MESSAGE_NOT_FOUND' using errcode = '22023';
  end if;

  if to_regclass('public.titan_admin_audit') is not null then
    insert into public.titan_admin_audit(admin_id, action, target_user_id, payload)
    values (auth.uid(), 'chat.message.hide', null, jsonb_build_object('message_id', p_message_id, 'reason', p_reason));
  end if;

  notify pgrst, 'reload schema';
  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_json_value_sql(p_value jsonb, p_data_type text, p_udt_name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_value is null or p_value = 'null'::jsonb then
    return 'null';
  end if;

  if p_data_type = 'jsonb' then
    return quote_literal(p_value::text) || '::jsonb';
  elsif p_data_type = 'json' then
    return quote_literal(p_value::text) || '::json';
  elsif p_data_type in ('integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision') then
    return quote_literal(p_value #>> '{}') || '::' || p_data_type;
  elsif p_data_type = 'boolean' then
    return quote_literal(p_value #>> '{}') || '::boolean';
  elsif p_data_type like 'timestamp%' then
    return quote_literal(p_value #>> '{}') || '::timestamptz';
  else
    return quote_literal(p_value #>> '{}');
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_list_content(p_table text, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order text;
  v_sql text;
  result jsonb;
begin
  perform public.titan_admin_assert();

  select order_by into v_order
  from public.titan_admin_allowed_content_tables()
  where table_name = p_table;

  if v_order is null then
    raise exception 'CONTENT_TABLE_NOT_ALLOWED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = v_order
  ) then
    v_order := 'id';
  end if;

  v_sql := format(
    'select coalesce(jsonb_agg(to_jsonb(t) order by %I), ''[]''::jsonb) from (select * from public.%I limit %s) t',
    v_order,
    p_table,
    least(greatest(coalesce(p_limit, 100), 1), 500)
  );
  execute v_sql into result;
  return result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_list_messages(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result jsonb;
begin
  perform public.titan_admin_assert();

  if to_regclass('public.messages') is null then
    return '[]'::jsonb;
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc), ''[]''::jsonb)
     from (select * from public.messages order by created_at desc limit %s) m',
    least(greatest(coalesce(p_limit, 50), 1), 200)
  ) into result;

  return result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_list_news(p_limit integer DEFAULT 20)
 RETURNS SETOF news_updates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.titan_admin_assert();
  return query
  select *
  from public.news_updates
  order by created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_list_profiles(p_search text DEFAULT ''::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, username text, level integer, credits integer, is_elite boolean, is_tester boolean, is_suspended boolean, suspension_reason text, admin_notes text, friend_code text, streak_count integer, last_seen_news_version text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.titan_admin_assert();

  return query
  select p.id, p.username, p.level, p.credits, p.is_elite, p.is_tester, p.is_suspended,
         p.suspension_reason, p.admin_notes, p.friend_code, p.streak_count,
         p.last_seen_news_version, p.created_at, p.updated_at
  from public.profiles p
  where coalesce(trim(p_search), '') = ''
     or p.username ilike '%' || trim(p_search) || '%'
     or p.friend_code ilike '%' || trim(p_search) || '%'
     or p.id::text = trim(p_search)
  order by p.updated_at desc nulls last
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_list_profiles_v1(p_search text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_premium text DEFAULT NULL::text, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, email text, username text, role text, is_premium boolean, premium_type text, premium_until timestamp with time zone, xp integer, level integer, credits integer, status text, created_at timestamp with time zone, updated_at timestamp with time zone, last_seen_at timestamp with time zone, is_elite boolean, is_tester boolean, is_suspended boolean, suspension_reason text, admin_notes text)
 LANGUAGE sql
 SET search_path TO 'public', 'private'
AS $function$
  select * from private.titan_admin_list_profiles_v1(p_search, p_role, p_status, p_premium, p_limit, p_offset);
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_list_reports(p_status text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS SETOF titan_moderation_reports
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.titan_admin_assert();

  return query
  select *
  from public.titan_moderation_reports
  where p_status is null or status = p_status
  order by created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_publish_news(p_version_id text, p_title text, p_message text, p_kind text DEFAULT 'update'::text, p_active boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.news_updates%rowtype;
  v_kind text := coalesce(nullif(trim(p_kind), ''), 'update');
begin
  perform public.titan_admin_assert();

  if trim(coalesce(p_version_id, '')) = '' or trim(coalesce(p_title, '')) = '' or trim(coalesce(p_message, '')) = '' then
    raise exception 'NEWS_FIELDS_REQUIRED' using errcode = '22023';
  end if;

  if v_kind not in ('update', 'maintenance', 'event', 'warning') then
    v_kind := 'update';
  end if;

  if p_active is true then
    update public.news_updates set active = false, updated_at = now() where active is true;
  end if;

  insert into public.news_updates(version_id, title, message, kind, active, created_by)
  values (trim(p_version_id), trim(p_title), trim(p_message), v_kind, coalesce(p_active, true), auth.uid())
  on conflict (version_id) do update
    set title = excluded.title,
        message = excluded.message,
        kind = excluded.kind,
        active = excluded.active,
        updated_at = now(),
        created_by = auth.uid()
  returning * into v_row;

  perform public.titan_admin_audit_write('news.publish', null, to_jsonb(v_row));
  notify pgrst, 'reload schema';
  return to_jsonb(v_row);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_resolve_report(p_report_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.titan_moderation_reports%rowtype;
  v_status text := coalesce(nullif(trim(p_status), ''), 'resolved');
begin
  perform public.titan_admin_assert();

  if v_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'INVALID_REPORT_STATUS' using errcode = '22023';
  end if;

  update public.titan_moderation_reports
  set status = v_status,
      resolved_by = case when v_status in ('resolved', 'dismissed') then auth.uid() else resolved_by end,
      resolution_note = nullif(trim(coalesce(p_note, '')), ''),
      resolved_at = case when v_status in ('resolved', 'dismissed') then now() else null end
  where id = p_report_id
  returning * into v_row;

  if not found then
    raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.titan_admin_audit_write('report.resolve', v_row.target_user_id, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_revoke_premium_v1(p_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'private'
AS $function$
  select private.titan_admin_revoke_premium_v1(p_user_id, p_reason);
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_role(p_user_id uuid DEFAULT auth.uid())
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'private'
AS $function$
  select private.titan_admin_role_for(coalesce(p_user_id, auth.uid()));
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_run_contest_draw_v1(p_contest_key text DEFAULT 'launch'::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'private'
AS $function$
  select private.titan_admin_run_contest_draw_v1(p_contest_key, p_reason);
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_set_news_active(p_news_id uuid, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.news_updates%rowtype;
begin
  perform public.titan_admin_assert();

  if p_active is true then
    update public.news_updates set active = false, updated_at = now() where active is true;
  end if;

  update public.news_updates
  set active = coalesce(p_active, false), updated_at = now()
  where id = p_news_id
  returning * into v_row;

  if not found then
    raise exception 'NEWS_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.titan_admin_audit_write('news.set_active', null, jsonb_build_object('id', p_news_id, 'active', p_active));
  return to_jsonb(v_row);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_update_profile(p_user_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_level integer;
  v_credits integer;
  v_row public.profiles%rowtype;
begin
  perform public.titan_admin_assert();

  if p_user_id is null then
    raise exception 'TARGET_REQUIRED' using errcode = '22023';
  end if;

  if v_patch ? 'level' then
    v_level := greatest(1, least((v_patch ->> 'level')::integer, 999));
  end if;

  if v_patch ? 'credits' then
    v_credits := greatest(0, least((v_patch ->> 'credits')::integer, 999999999));
  end if;

  update public.profiles
  set
    username = case when v_patch ? 'username' then nullif(trim(v_patch ->> 'username'), '') else username end,
    level = case when v_patch ? 'level' then v_level else level end,
    credits = case when v_patch ? 'credits' then v_credits else credits end,
    is_elite = case when v_patch ? 'is_elite' then (v_patch ->> 'is_elite')::boolean else is_elite end,
    is_tester = case when v_patch ? 'is_tester' then (v_patch ->> 'is_tester')::boolean else is_tester end,
    is_suspended = case when v_patch ? 'is_suspended' then (v_patch ->> 'is_suspended')::boolean else is_suspended end,
    suspension_reason = case when v_patch ? 'suspension_reason' then nullif(trim(v_patch ->> 'suspension_reason'), '') else suspension_reason end,
    admin_notes = case when v_patch ? 'admin_notes' then nullif(trim(v_patch ->> 'admin_notes'), '') else admin_notes end,
    moderated_at = now(),
    moderated_by = auth.uid(),
    updated_at = now()
  where profiles.id = p_user_id
  returning * into v_row;

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if (v_patch ? 'delete_training_logs') and (v_patch ->> 'delete_training_logs')::boolean then
    delete from public.training_logs where user_id = p_user_id;
  end if;

  perform public.titan_admin_audit_write('profile.update', p_user_id, v_patch);
  return to_jsonb(v_row);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_update_profile_v1(p_user_id uuid, p_patch jsonb, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'private'
AS $function$
  select private.titan_admin_update_profile_v1(p_user_id, p_patch, p_reason);
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_upsert_content(p_table text, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_allowed boolean;
  v_key text := 'id';
  v_exists boolean;
  v_cols text;
  v_vals text;
  v_sets text;
  v_sql text;
  v_result jsonb;
begin
  perform public.titan_admin_assert();

  select exists(select 1 from public.titan_admin_allowed_content_tables() where table_name = p_table) into v_allowed;
  if not v_allowed then
    raise exception 'CONTENT_TABLE_NOT_ALLOWED' using errcode = '42501';
  end if;

  if p_table = 'global_config' then
    v_key := 'key';
  end if;

  if p_row is null or not (p_row ? v_key) then
    raise exception 'CONTENT_KEY_REQUIRED' using errcode = '22023';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = v_key
  ) into v_exists;
  if not v_exists then
    raise exception 'CONTENT_KEY_COLUMN_MISSING' using errcode = '42703';
  end if;

  select
    string_agg(format('%I', c.column_name), ', '),
    string_agg(public.titan_admin_json_value_sql(p_row -> c.column_name, c.data_type, c.udt_name), ', '),
    string_agg(format('%I = excluded.%I', c.column_name, c.column_name), ', ')
  into v_cols, v_vals, v_sets
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = p_table
    and p_row ? c.column_name
    and c.is_generated = 'NEVER'
    and c.column_name not in ('created_at');

  if v_cols is null then
    raise exception 'CONTENT_NO_VALID_COLUMNS' using errcode = '22023';
  end if;

  select string_agg(format('%I = excluded.%I', c.column_name, c.column_name), ', ')
  into v_sets
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = p_table
    and p_row ? c.column_name
    and c.column_name <> v_key
    and c.column_name not in ('created_at')
    and c.is_generated = 'NEVER';

  if v_sets is null then
    v_sets := format('%I = excluded.%I', v_key, v_key);
  end if;

  v_sql := format(
    'insert into public.%I (%s) values (%s) on conflict (%I) do update set %s returning to_jsonb(%I.*)',
    p_table, v_cols, v_vals, v_key, v_sets, p_table
  );
  execute v_sql into v_result;

  perform public.titan_admin_audit_write('content.upsert', null, jsonb_build_object('table', p_table, 'row', p_row));
  notify pgrst, 'reload schema';
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_upsert_row_v1(p_table text, p_pk text DEFAULT 'id'::text, p_payload jsonb DEFAULT '{}'::jsonb, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'private'
AS $function$
  select private.titan_admin_upsert_row_v1(p_table, p_pk, p_payload, p_reason);
$function$
;
CREATE OR REPLACE FUNCTION public.titan_admin_write_log_v1(p_action text, p_target_table text DEFAULT NULL::text, p_target_id text DEFAULT NULL::text, p_old_value jsonb DEFAULT NULL::jsonb, p_new_value jsonb DEFAULT NULL::jsonb, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'private'
AS $function$
  select private.titan_admin_log_v1(p_action, p_target_table, p_target_id, p_old_value, p_new_value, p_reason);
$function$
;
CREATE OR REPLACE FUNCTION public.titan_adventure_action(p_action text, p_world text DEFAULT NULL::text, p_route text DEFAULT 'rhythm'::text, p_avatar text DEFAULT NULL::text, p_revision integer DEFAULT NULL::integer, p_chapter integer DEFAULT NULL::integer, p_timezone text DEFAULT 'Europe/Paris'::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select private.titan_adventure_action(p_action,p_world,p_route,p_avatar,p_revision,p_chapter,p_timezone);
$function$
;
CREATE OR REPLACE FUNCTION public.titan_adventure_evidence(p_world text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
 SET statement_timeout TO '5s'
AS $function$
  with candidates as (
    select distinct on ((l.date at time zone a.timezone)::date)
      l.id, (l.date at time zone a.timezone)::date as day
    from public.adventure_progress a join public.training_logs l on l.user_id=a.user_id
    where a.user_id=(select auth.uid()) and a.world_id=p_world and a.chapter<=9
      and l.archived_at is null and l.is_suspicious is not true
      and coalesce(l.status,'valid') not in ('rejected','flagged','pending_review')
      and l.created_at>=a.started_at and l.date<=now()
      and (l.date at time zone a.timezone)::date >= (a.started_at at time zone a.timezone)::date
      and l.val>0 and l.details->>'serverReward'='true'
      and (a.route='rhythm' or length(trim(coalesce(l.details->>'note',l.details->>'notes','')))>=10)
    order by (l.date at time zone a.timezone)::date,l.created_at,l.id
  ) select jsonb_build_object('days',count(*),'source_ids',coalesce(jsonb_agg(id order by day),'[]'::jsonb)) from candidates;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_adventure_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
 SET statement_timeout TO '5s'
AS $function$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where id=v_uid and is_suspended is not true) then
    raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
  select jsonb_build_object(
    'version',1,'owner',v_uid,'generated_at',now(),
    'level',p.level,'xp',p.xp,'credits',p.credits,'next_level_xp',public.titan_level_requirement(p.level),
    'plus',p.is_elite is true and p.elite_refunded_at is null and (p.elite_ends_at is null or p.elite_ends_at>now()),
    'avatar',coalesce(a.avatar,'scout'),'selected_world',coalesce(a.selected_world,'aube'),'revision',coalesce(a.revision,0),
    'campaigns', (select jsonb_agg(jsonb_build_object('id',w.id,'tier',w.tier,'chapter',coalesce(ap.chapter,0),
      'route',coalesce(ap.route,'rhythm'),'started_at',ap.started_at,'completed_at',ap.completed_at,
      'target',case when ap.chapter<=9 then (array[1,2,2,2,3,2,3,3,3])[ap.chapter] else 0 end,
      'evidence',public.titan_adventure_evidence(w.id)) order by w.id)
      from public.adventure_worlds w left join public.adventure_progress ap on ap.world_id=w.id and ap.user_id=v_uid),
    'rewards',coalesce((select jsonb_agg(jsonb_build_object('world',r.world_id,'chapter',r.chapter,'earned_at',r.earned_at) order by r.earned_at desc)
      from public.adventure_rewards r where r.user_id=v_uid),'[]'::jsonb)
  ) into v_result from public.profiles p left join public.adventure_profiles a on a.user_id=p.id where p.id=v_uid;
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_apply_paddle_entitlement_v87(p_user_id uuid, p_is_elite boolean, p_status text, p_event_name text, p_event_at timestamp with time zone, p_subscription_id text DEFAULT NULL::text, p_order_id text DEFAULT NULL::text, p_product_id text DEFAULT NULL::text, p_variant_id text DEFAULT NULL::text, p_renews_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_trial_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_refunded_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
    v_applied boolean := false;
begin
    if p_event_at is null then
        raise exception 'Paddle event timestamp is required';
    end if;

    update public.profiles
    set is_elite = p_is_elite,
        elite_status = nullif(p_status, ''),
        elite_subscription_id = p_subscription_id,
        elite_order_id = p_order_id,
        elite_product_id = p_product_id,
        elite_variant_id = p_variant_id,
        elite_renews_at = p_renews_at,
        elite_ends_at = p_ends_at,
        elite_trial_ends_at = p_trial_ends_at,
        elite_refunded_at = p_refunded_at,
        elite_last_event_name = nullif(p_event_name, ''),
        elite_last_event_at = p_event_at,
        elite_updated_at = now(),
        updated_at = now()
    where id = p_user_id
      and (
          elite_last_event_at is null
          or elite_last_event_at <= p_event_at
      )
    returning true into v_applied;

    return coalesce(v_applied, false);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_apply_progression_reward(p_user_id uuid, p_reward_xp integer, p_reward_credits integer)
 RETURNS TABLE(credits_after integer, xp_after integer, level_after integer, level_bonus integer, leveled_up integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := p_user_id;
  v_reward_xp integer := greatest(0, least(coalesce(p_reward_xp, 0), 25000));
  v_reward_credits integer := greatest(0, least(coalesce(p_reward_credits, 0), 25000));
  v_xp integer;
  v_level integer;
  v_credits integer;
  v_req integer;
  v_level_bonus integer := 0;
  v_leveled_up integer := 0;
  v_state jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  insert into public.profiles(id, username, game_state, credits, level, xp, updated_at)
  values (v_uid, 'Agent', '{}'::jsonb, 0, 1, 0, now())
  on conflict (id) do nothing;

  select
    greatest(0, coalesce(p.xp, 0)),
    greatest(1, coalesce(p.level, 1)),
    greatest(0, coalesce(p.credits, 0)),
    coalesce(p.game_state, '{}'::jsonb)
  into v_xp, v_level, v_credits, v_state
  from public.profiles as p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'PROFILE_MISSING' using errcode = '42501';
  end if;

  v_xp := v_xp + v_reward_xp;
  v_credits := v_credits + v_reward_credits;

  while v_leveled_up < 20 loop
    v_req := public.titan_level_requirement(v_level);
    exit when v_xp < v_req;

    v_xp := v_xp - v_req;
    v_level := v_level + 1;
    v_level_bonus := v_level_bonus + greatest(150, floor(180 + (v_level * 35))::integer);
    v_leveled_up := v_leveled_up + 1;
  end loop;

  v_credits := v_credits + v_level_bonus;

  v_state := coalesce(v_state, '{}'::jsonb);
  v_state := jsonb_set(
    v_state,
    '{user}',
    case when jsonb_typeof(v_state -> 'user') = 'object' then v_state -> 'user' else '{}'::jsonb end,
    true
  );
  v_state := jsonb_set(
    v_state,
    '{meta}',
    case when jsonb_typeof(v_state -> 'meta') = 'object' then v_state -> 'meta' else '{}'::jsonb end,
    true
  );
  v_state := jsonb_set(v_state, '{user,xp}', to_jsonb(v_xp), true);
  v_state := jsonb_set(v_state, '{user,level}', to_jsonb(v_level), true);
  v_state := jsonb_set(v_state, '{user,credits}', to_jsonb(v_credits), true);
  v_state := jsonb_set(v_state, '{meta,updatedAt}', to_jsonb(now()), true);

  update public.profiles as p
  set xp = v_xp,
      level = v_level,
      credits = v_credits,
      game_state = v_state,
      updated_at = now()
  where p.id = v_uid;

  credits_after := v_credits;
  xp_after := v_xp;
  level_after := v_level;
  level_bonus := v_level_bonus;
  leveled_up := v_leveled_up;
  return next;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_apply_weekly_reward_cap(p_user_id uuid, p_requested_xp integer, p_requested_credits integer)
 RETURNS TABLE(xp_awarded integer, credits_awarded integer, xp_cap integer, credit_cap integer, xp_used integer, credits_used integer, is_capped boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_week date := public.titan_week_start(now());
  v_limits jsonb := public.titan_economy_limits(p_user_id);
  v_xp_requested integer := greatest(0, coalesce(p_requested_xp, 0));
  v_credits_requested integer := greatest(0, coalesce(p_requested_credits, 0));
  v_usage public.titan_weekly_reward_usage%rowtype;
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  xp_cap := greatest(0, coalesce((v_limits ->> 'weeklyXpCap')::integer, 9600));
  credit_cap := greatest(0, coalesce((v_limits ->> 'weeklyCreditCap')::integer, 4800));

  insert into public.titan_weekly_reward_usage(user_id, week_start, xp_awarded, credits_awarded, updated_at)
  values (p_user_id, v_week, 0, 0, now())
  on conflict (user_id, week_start) do nothing;

  select *
  into v_usage
  from public.titan_weekly_reward_usage
  where user_id = p_user_id
    and week_start = v_week
  for update;

  xp_awarded := least(v_xp_requested, greatest(0, xp_cap - coalesce(v_usage.xp_awarded, 0)));
  credits_awarded := least(v_credits_requested, greatest(0, credit_cap - coalesce(v_usage.credits_awarded, 0)));

  update public.titan_weekly_reward_usage as usage_row
  set xp_awarded = usage_row.xp_awarded + titan_apply_weekly_reward_cap.xp_awarded,
      credits_awarded = usage_row.credits_awarded + titan_apply_weekly_reward_cap.credits_awarded,
      updated_at = now()
  where usage_row.user_id = p_user_id
    and usage_row.week_start = v_week;

  xp_used := coalesce(v_usage.xp_awarded, 0) + xp_awarded;
  credits_used := coalesce(v_usage.credits_awarded, 0) + credits_awarded;
  is_capped := xp_awarded < v_xp_requested or credits_awarded < v_credits_requested;
  return next;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_assign_friend_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  code text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select friend_code into code
  from public.profiles
  where id = auth.uid();

  if code is not null and code ~ '^TN-[A-Z2-9]{4,8}$' then
    return code;
  end if;

  code := public.titan_generate_friend_code();
  update public.profiles
  set friend_code = code, updated_at = now()
  where id = auth.uid();

  return code;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_block_user(p_blocked_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_blocked_id = auth.uid() then
    raise exception 'CANNOT_BLOCK_SELF' using errcode = '22023';
  end if;

  perform public.titan_social_rate_limit(auth.uid(), 'block_user', interval '1 day', 50);

  insert into public.titan_user_blocks(blocker_id, blocked_id, reason)
  values (auth.uid(), p_blocked_id, left(trim(coalesce(p_reason, '')), 180))
  on conflict (blocker_id, blocked_id) do update set
    reason = excluded.reason,
    created_at = now();

  delete from public.friendships
  where (user_id_1 = auth.uid() and user_id_2 = p_blocked_id)
     or (user_id_1 = p_blocked_id and user_id_2 = auth.uid());

  insert into public.titan_social_action_log(actor_id, action, target_id)
  values (auth.uid(), 'block_user', p_blocked_id);

  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_cache_safe_int(p_value text, p_default integer DEFAULT 0)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_numeric numeric;
begin
  if p_value is null or trim(p_value) = '' then
    return p_default;
  end if;

  begin
    v_numeric := p_value::numeric;
  exception when others then
    return p_default;
  end;

  if v_numeric is null or v_numeric < 0 then
    return p_default;
  end if;

  return least(v_numeric, 2147483647)::integer;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_cache_safe_timestamptz(p_value text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result timestamptz;
begin
  if p_value is null or trim(p_value) = '' then
    return null;
  end if;

  begin
    v_result := p_value::timestamptz;
  exception when others then
    return null;
  end;

  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_charge_credits(p_user_id uuid, p_amount integer, p_reason text DEFAULT 'economy'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_amount integer := greatest(0, coalesce(p_amount, 0));
  v_credits_after integer;
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  insert into public.profiles(id, username, game_state, credits, level, xp, updated_at)
  values (p_user_id, 'Agent', '{}'::jsonb, 0, 1, 0, now())
  on conflict (id) do nothing;

  if v_amount = 0 then
    select greatest(0, coalesce(credits, 0))
    into v_credits_after
    from public.profiles
    where id = p_user_id;
    return coalesce(v_credits_after, 0);
  end if;

  update public.profiles
  set credits = greatest(0, coalesce(credits, 0)) - v_amount,
      updated_at = now()
  where id = p_user_id
    and greatest(0, coalesce(credits, 0)) >= v_amount
  returning credits::integer into v_credits_after;

  if v_credits_after is null then
    raise exception 'INSUFFICIENT_CREDITS' using errcode = '23514';
  end if;

  return v_credits_after;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_claim_achievement(p_achievement_id text)
 RETURNS TABLE(achievement_id text, unlocked boolean, reward_credits integer, credits_after integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 u uuid:=auth.uid(); a public.achievements_config%rowtype; p public.profiles%rowtype;
 progress numeric:=0; reward integer:=0; inserted boolean:=false;
begin
 if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select * into p from public.profiles where id=u for update;
 if not found or p.is_suspended then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
 select * into a from public.achievements_config where id=p_achievement_id;
 if not found then raise exception 'ACHIEVEMENT_NOT_FOUND' using errcode='22023'; end if;
 if exists(select 1 from public.user_achievements ua where ua.user_id=u and ua.achievement_id=a.id) then
  return query select a.id,false,0,coalesce(p.credits,0); return;
 end if;
 case
 when a.id like 'lvl_%' then progress:=p.level;
 when a.id like 'sess_%' or a.id like 'sessions_%' then
   select count(*) into progress from public.training_logs where user_id=u and archived_at is null;
 when a.id like 'str_%' then
   select coalesce(sum(val),0) into progress from public.training_logs where user_id=u and archived_at is null and unit='kg';
 when a.id like 'run_%' then
   select coalesce(sum(val),0) into progress from public.training_logs where user_id=u and archived_at is null and unit='km';
 when a.id like 'xp_%' then
   select coalesce(sum(xp),0) into progress from public.training_logs where user_id=u and archived_at is null;
 when a.id like 'rich_%' then
   select coalesce(sum((response->>'credits')::integer),0) into progress from public.training_receipts where user_id=u;
 when a.id like 'multi_sport_%' then
   select count(distinct sport) into progress from public.training_logs where user_id=u and archived_at is null;
 when a.id='profile_set' then progress:=case when p.avatar is not null and p.avatar<>'avatar_1.png' then 1 else 0 end;
 when a.id='support_elite' then progress:=case when p.is_elite then 1 else 0 end;
 when a.id in ('night_owl','early_bird','weekend_warrior') then
   select count(*) into progress from public.training_logs l where user_id=u and archived_at is null
   and case a.id when 'night_owl' then extract(hour from l.date at time zone 'Europe/Paris')>=23
    when 'early_bird' then extract(hour from l.date at time zone 'Europe/Paris')<7
    else extract(isodow from l.date at time zone 'Europe/Paris')=7 end;
 when a.id like 'streak_%' then
   select coalesce(max(n),0) into progress from (
    select count(*) n from (
      select d,d-(row_number() over(order by d))::integer grp from (
       select distinct (date at time zone 'Europe/Paris')::date d from public.training_logs where user_id=u and archived_at is null
      ) days
    ) islands group by grp
   ) runs;
 else raise exception 'ACHIEVEMENT_CRITERION_UNVERIFIED' using errcode='22023';
 end case;
 if progress<coalesce(a.target_value,1) then raise exception 'ACHIEVEMENT_NOT_EARNED' using errcode='23514'; end if;
 -- Paying for TITAN+ never yields progression currency.
 reward:=case when a.id='support_elite' then 0 else least(5000,greatest(0,coalesce(a.reward_credits,0))) end;
 insert into public.user_achievements(user_id,achievement_id,unlocked_at) values(u,a.id,now())
 on conflict do nothing returning true into inserted;
 if coalesce(inserted,false) then
  update public.profiles set credits=coalesce(credits,0)+reward where id=u returning * into p;
 else reward:=0;
 end if;
 return query select a.id,coalesce(inserted,false),reward,coalesce(p.credits,0);
end $function$
;
CREATE OR REPLACE FUNCTION public.titan_clean_economy_message(p_content text, p_max_length integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select left(
    regexp_replace(
      btrim(coalesce(p_content, '')),
      '[[:cntrl:]<>`{}]',
      '',
      'g'
    ),
    greatest(1, coalesce(p_max_length, 280))
  );
$function$
;
CREATE OR REPLACE FUNCTION public.titan_clean_social_text(p_value text, p_fallback text, p_max integer)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_value text;
begin
  v_value := left(regexp_replace(trim(coalesce(p_value, '')), '[[:cntrl:]<>]', '', 'g'), greatest(1, p_max));
  v_value := regexp_replace(v_value, '\s+', ' ', 'g');
  if v_value = '' then
    return left(p_fallback, greatest(1, p_max));
  end if;
  return v_value;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_clean_state_username(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select left(
    nullif(
      btrim(
        regexp_replace(
          regexp_replace(coalesce(p_value, 'Agent'), '[[:cntrl:]<>"`{}]', '', 'g'),
          '\s+',
          ' ',
          'g'
        )
      ),
      ''
    ),
    24
  );
$function$
;
CREATE OR REPLACE FUNCTION public.titan_coach_portal(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.titan_coach_portal(p_action,p_data);$function$
;
CREATE OR REPLACE FUNCTION public.titan_create_guild(p_name text, p_motto text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_motto text;
  v_code text;
  v_guild_id uuid;
  v_cost integer;
  v_credits_after integer;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false) is true) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  if exists (select 1 from public.guild_members gm where gm.user_id = v_uid) then
    return public.titan_get_my_guild();
  end if;

  v_cost := coalesce((public.titan_economy_limits(v_uid) ->> 'guildCreateCost')::integer, 3000);
  v_credits_after := public.titan_charge_credits(v_uid, v_cost, 'guild_create');
  v_name := public.titan_clean_social_text(p_name, 'Escouade Titan', 28);
  v_motto := public.titan_clean_social_text(p_motto, 'Tenir la ligne.', 64);
  v_code := public.titan_generate_guild_code();

  insert into public.guilds(name, owner_id, code, motto, weekly_target, level, xp, boss_hp, boss_max_hp, boss_level, active_quests, chat_history, created_at, updated_at)
  values (
    v_name,
    v_uid,
    v_code,
    v_motto,
    5,
    1,
    0,
    1000,
    1000,
    1,
    '[]'::jsonb,
    jsonb_build_array(public.titan_clean_social_text((select username from public.profiles where id = v_uid), 'Agent', 24) || ' a fonde ' || v_name || '.'),
    now(),
    now()
  )
  returning id into v_guild_id;

  insert into public.guild_members(guild_id, user_id, role)
  values (v_guild_id, v_uid, 'owner')
  on conflict (user_id) do update set guild_id = excluded.guild_id, role = 'owner', joined_at = now();

  update public.profiles
  set guild_id = v_guild_id, updated_at = now()
  where id = v_uid;

  v_result := public.titan_get_my_guild();
  return v_result || jsonb_build_object('economy', jsonb_build_object('cost', v_cost, 'credits_after', v_credits_after));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_create_social_challenge(p_opponent uuid, p_sport text, p_target numeric DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); c public.social_challenges%rowtype;
begin
 if u is null or p_opponent is null or p_sport is null or length(trim(p_sport))=0 or p_target is null or p_opponent=u or p_target<=0 or p_target>300000 then raise exception 'CHALLENGE_INVALID' using errcode='22023'; end if;
 perform 1 from public.profiles where id=u and not coalesce(is_suspended,false) for update;
 if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_opponent and not coalesce(is_suspended,false)) then raise exception 'OPPONENT_UNAVAILABLE' using errcode='22023'; end if;
 if (select count(*) from public.social_challenges where challenger_id=u and created_at>now()-interval '1 day')>=10 then raise exception 'CHALLENGE_RATE_LIMIT' using errcode='23514'; end if;
 insert into public.social_challenges(challenger_id,opponent_id,type,sport,target_val,stake,status,expires_at)
 values(u,p_opponent,'duel',left(p_sport,80),p_target,0,'pending',now()+interval '7 days') returning * into c;
 return to_jsonb(c);
end $function$
;
CREATE OR REPLACE FUNCTION public.titan_create_wager_challenge(p_opponent_id uuid, p_sport text, p_stake integer DEFAULT 50)
 RETURNS TABLE(challenge_id uuid, credits_after integer, stake integer, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_stake integer := greatest(0, least(coalesce(p_stake, 50), 500));
  v_credits integer;
  v_expires_at timestamptz := now() + interval '24 hours';
  v_challenge_id uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_opponent_id is null or p_opponent_id = v_uid then
    raise exception 'INVALID_OPPONENT' using errcode = '22023';
  end if;

  if v_stake <= 0 then
    raise exception 'INVALID_STAKE' using errcode = '22023';
  end if;

  select coalesce(p.credits, 0)::integer
  into v_credits
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'PROFILE_MISSING' using errcode = '42501';
  end if;

  if v_credits < v_stake then
    raise exception 'NO_FUNDS' using errcode = '23514';
  end if;

  update public.profiles
  set credits = v_credits - v_stake
  where id = v_uid
  returning credits::integer into v_credits;

  insert into public.social_challenges(challenger_id, opponent_id, type, sport, stake, status, expires_at)
  values (v_uid, p_opponent_id, 'wager', left(coalesce(p_sport, 'mixed'), 40), v_stake, 'pending', v_expires_at)
  returning id into v_challenge_id;

  return query
  select v_challenge_id, v_credits, v_stake, v_expires_at;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_delete_rows(p_table text, p_column text, p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer := 0;
begin
  if to_regclass(format('public.%I', p_table)) is null then
    return 0;
  end if;

  if not public.titan_table_has_column(p_table, p_column) then
    return 0;
  end if;

  execute format('delete from public.%I where %I = $1', p_table, p_column)
  using p_user_id;

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_economy_limits(p_user_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_subject uuid := coalesce(auth.uid(), p_user_id);
  v_is_elite boolean := false;
begin
  if v_subject is not null then
    select coalesce(p.is_elite, false)
    into v_is_elite
    from public.profiles as p
    where p.id = v_subject;
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
$function$
;
CREATE OR REPLACE FUNCTION public.titan_export_rows(p_table text, p_column text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb := '[]'::jsonb;
begin
  if to_regclass(format('public.%I', p_table)) is null then
    return '[]'::jsonb;
  end if;

  if not public.titan_table_has_column(p_table, p_column) then
    return '[]'::jsonb;
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where %I = $1',
    p_table,
    p_column
  )
  using p_user_id
  into v_result;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_find_profile_by_friend_code(p_friend_code text)
 RETURNS TABLE(id uuid, username text, friend_code text, level integer, avatar text, is_elite boolean, is_suspended boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return query
  select p.id, p.username, p.friend_code, p.level, p.avatar, p.is_elite, p.is_suspended
  from public.profiles p
  where p.friend_code = upper(trim(p_friend_code))
  limit 1;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_generate_friend_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i integer;
begin
  loop
    code := 'TN-';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_generate_guild_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_code text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i integer;
begin
  loop
    v_code := 'G-';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.guilds where code = v_code);
  end loop;
  return v_code;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_get_economy_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_week date := public.titan_week_start(now());
  v_limits jsonb;
  v_usage public.titan_weekly_reward_usage%rowtype;
  v_credits integer := 0;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  insert into public.profiles(id, username, game_state, credits, level, xp, updated_at)
  values (v_uid, 'Agent', '{}'::jsonb, 0, 1, 0, now())
  on conflict (id) do nothing;

  insert into public.titan_weekly_reward_usage(user_id, week_start, xp_awarded, credits_awarded, updated_at)
  values (v_uid, v_week, 0, 0, now())
  on conflict (user_id, week_start) do nothing;

  select greatest(0, coalesce(credits, 0))
  into v_credits
  from public.profiles
  where id = v_uid;

  select *
  into v_usage
  from public.titan_weekly_reward_usage
  where user_id = v_uid
    and week_start = v_week;

  v_limits := public.titan_economy_limits(v_uid);

  return v_limits || jsonb_build_object(
    'credits', coalesce(v_credits, 0),
    'weekStart', v_week,
    'weeklyXpUsed', coalesce(v_usage.xp_awarded, 0),
    'weeklyCreditsUsed', coalesce(v_usage.credits_awarded, 0),
    'weeklyXpRemaining', greatest(0, coalesce((v_limits ->> 'weeklyXpCap')::integer, 9600) - coalesce(v_usage.xp_awarded, 0)),
    'weeklyCreditsRemaining', greatest(0, coalesce((v_limits ->> 'weeklyCreditCap')::integer, 4800) - coalesce(v_usage.credits_awarded, 0))
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_get_my_guild()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_guild public.guilds%rowtype;
  v_members jsonb := '[]'::jsonb;
  v_messages jsonb := '[]'::jsonb;
  v_week_sessions integer := 0;
  v_progress integer := 0;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select g.* into v_guild
  from public.guild_members gm
  join public.guilds g on g.id = gm.guild_id
  where gm.user_id = v_uid
  order by gm.joined_at asc
  limit 1;

  if v_guild.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gm.user_id,
    'name', coalesce(p.username, 'Agent'),
    'role', gm.role,
    'level', coalesce(p.level, 1),
    'avatar', p.avatar,
    'joined_at', gm.joined_at
  ) order by case gm.role when 'owner' then 0 when 'officer' then 1 else 2 end, gm.joined_at), '[]'::jsonb)
  into v_members
  from public.guild_members gm
  left join public.profiles p on p.id = gm.user_id
  where gm.guild_id = v_guild.id;

  select count(*)::integer into v_week_sessions
  from public.training_logs tl
  where tl.user_id in (
    select gm.user_id from public.guild_members gm where gm.guild_id = v_guild.id
  )
  and tl.date >= date_trunc('week', now());

  v_progress := least(100, round((v_week_sessions::numeric / greatest(1, coalesce(v_guild.weekly_target, 5))) * 100)::integer);

  select coalesce(jsonb_agg(row_to_json(msg)::jsonb order by msg.created_at asc), '[]'::jsonb)
  into v_messages
  from (
    select id, guild_id, sender_id, sender_name, content, 'guild'::text as channel, created_at
    from public.guild_messages
    where guild_id = v_guild.id
      and hidden is false
    order by created_at desc
    limit 80
  ) msg;

  return jsonb_build_object(
    'id', v_guild.id,
    'code', v_guild.code,
    'name', v_guild.name,
    'motto', coalesce(v_guild.motto, ''),
    'owner_id', v_guild.owner_id,
    'level', coalesce(v_guild.level, 1),
    'xp', coalesce(v_guild.xp, 0),
    'weeklyTarget', coalesce(v_guild.weekly_target, 5),
    'weekSessions', v_week_sessions,
    'progress', v_progress,
    'members', v_members,
    'messages', v_messages,
    'logs', coalesce(v_guild.chat_history, '[]'::jsonb)
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_get_progression_snapshot()
 RETURNS TABLE(server_user_id uuid, level integer, xp integer, credits integer, is_elite boolean, is_tester boolean, is_suspended boolean, training_total integer, training_7d integer, training_30d integer, last_training_at timestamp with time zone, week_start date, weekly_xp_used integer, weekly_credits_used integer, weekly_xp_cap integer, weekly_credit_cap integer, weekly_xp_remaining integer, weekly_credits_remaining integer, authority text, rules_version text, checked_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from private.titan_progression_snapshot_v78();
$function$
;
CREATE OR REPLACE FUNCTION public.titan_guard_friendship_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform public.titan_social_rate_limit(auth.uid(), 'friend_remove', interval '1 hour', 30);

  insert into public.titan_social_action_log(actor_id, action, target_id)
  values (auth.uid(), 'friend_remove', case when old.user_id_1 = auth.uid() then old.user_id_2 else old.user_id_1 end);

  return old;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_guard_friendship_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if new.user_id_1 <> auth.uid() then
    raise exception 'FRIENDSHIP_OWNER_REQUIRED' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.titan_user_blocks b
    where (b.blocker_id = new.user_id_1 and b.blocked_id = new.user_id_2)
       or (b.blocker_id = new.user_id_2 and b.blocked_id = new.user_id_1)
  ) then
    raise exception 'USER_BLOCKED' using errcode = '42501';
  end if;

  if to_regclass('public.profiles') is not null and exists (
    select 1 from public.profiles p
    where p.id = new.user_id_2
      and (
        coalesce(p.is_suspended, false) is true
        or coalesce((p.privacy->>'socialPresence')::boolean, true) is false
        or coalesce((p.privacy->>'publicProfile')::boolean, true) is false
      )
  ) then
    raise exception 'PROFILE_NOT_AVAILABLE' using errcode = '42501';
  end if;

  perform public.titan_social_rate_limit(auth.uid(), 'friend_add', interval '1 day', 25);

  insert into public.titan_social_action_log(actor_id, action, target_id)
  values (auth.uid(), 'friend_add', new.user_id_2);

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_guard_message_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_recent_count integer;
  v_max integer := 280;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if to_regclass('public.profiles') is not null and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_suspended is true
  ) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  v_max := case
    when exists(select 1 from public.profiles where id = auth.uid() and coalesce(is_elite, false) is true)
    then 700
    else 280
  end;

  new.sender_id := auth.uid();
  new.sender_name := public.titan_clean_social_text(new.sender_name, 'Agent', 24);
  new.content := public.titan_clean_economy_message(new.content, v_max);
  if new.content = '' then
    raise exception 'MESSAGE_EMPTY' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_recent_count
  from public.messages
  where sender_id = auth.uid()
    and created_at > now() - interval '1 minute';

  if v_recent_count >= 5 then
    raise exception 'CHAT_RATE_LIMIT' using errcode = '42900';
  end if;

  new.created_at := now();
  new.expires_at := coalesce(new.expires_at, now() + interval '48 hours');
  new.cost_credits := coalesce(new.cost_credits, 0);
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_guard_profile_progression()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payload jsonb;
  v_credit_delta integer;
  v_level_delta integer;
  v_state_bytes integer;
begin
  if auth.uid() is not null and new.id <> auth.uid() then
    raise exception 'PROFILE_USER_MISMATCH' using errcode = '42501';
  end if;

  new.credits := coalesce(new.credits, old.credits, 0);
  new.level := coalesce(new.level, old.level, 1);
  new.game_state := coalesce(new.game_state, old.game_state, '{}'::jsonb);
  new.username := nullif(left(trim(regexp_replace(coalesce(new.username, old.username, 'Agent'), '[[:cntrl:]<>]', '', 'g')), 24), '');
  if new.username is null then
    new.username := 'Agent';
  end if;
  if new.avatar is not null and new.avatar !~* '^avatar_[0-9]+\.png$' then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.flagged', 'medium', 'PROFILE_AVATAR_INVALID', jsonb_build_object('avatar', new.avatar));
    new.avatar := old.avatar;
  end if;
  v_credit_delta := new.credits - coalesce(old.credits, 0);
  v_level_delta := new.level - coalesce(old.level, 1);
  v_state_bytes := octet_length(new.game_state::text);

  v_payload := jsonb_build_object(
    'profileId', new.id,
    'oldCredits', old.credits,
    'newCredits', new.credits,
    'creditDelta', v_credit_delta,
    'oldLevel', old.level,
    'newLevel', new.level,
    'levelDelta', v_level_delta,
    'gameStateBytes', v_state_bytes
  );

  if new.credits < 0 or new.credits > 100000000 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'critical', 'PROFILE_CREDITS_OUT_OF_RANGE', v_payload);
    return old;
  end if;

  if new.level < 1 or new.level > 500 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'critical', 'PROFILE_LEVEL_OUT_OF_RANGE', v_payload);
    return old;
  end if;

  if v_state_bytes > 500000 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'high', 'PROFILE_GAME_STATE_TOO_LARGE', v_payload);
    return old;
  end if;

  if v_credit_delta > 50000 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'high', 'PROFILE_CREDITS_JUMP', v_payload);
    return old;
  end if;

  if v_level_delta > 10 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.rejected', 'high', 'PROFILE_LEVEL_JUMP', v_payload);
    return old;
  end if;

  if v_credit_delta > 15000 or v_level_delta > 3 then
    perform public.titan_log_suspicious_action(new.id, 'profile_update.flagged', 'medium', 'PROFILE_PROGRESS_REVIEW_RECOMMENDED', v_payload);
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_guard_training_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payload jsonb;
  v_duration_min numeric;
  v_distance_km numeric;
  v_elevation_m numeric;
  v_gpx_points integer;
  v_hour_count integer;
  v_day_count integer;
  v_details_bytes integer;
  v_old_or_null public.training_logs%rowtype;
begin
  if TG_OP = 'UPDATE' then
    v_old_or_null := old;
  end if;

  if auth.uid() is not null and new.user_id <> auth.uid() then
    raise exception 'TRAINING_USER_MISMATCH' using errcode = '42501';
  end if;

  new.sport := left(coalesce(new.sport, 'unknown'), 80);
  new.category := left(coalesce(new.category, 'training'), 80);
  new.unit := left(coalesce(new.unit, ''), 24);
  new.details := coalesce(new.details, '{}'::jsonb);
  new.date := coalesce(new.date, now());
  new.xp := coalesce(new.xp, 0);
  new.val := coalesce(new.val, 0);

  v_payload := jsonb_build_object(
    'operation', TG_OP,
    'sport', new.sport,
    'category', new.category,
    'unit', new.unit,
    'val', new.val,
    'xp', new.xp,
    'date', new.date,
    'details', new.details
  );

  v_details_bytes := octet_length(new.details::text);
  v_duration_min := coalesce(
    nullif(public.titan_jsonb_numeric(new.details, 'val2'), 0),
    nullif(public.titan_jsonb_numeric(new.details, 'duration'), 0)
  );
  v_distance_km := case
    when new.unit = 'km' then new.val
    else public.titan_jsonb_numeric(new.details, 'distance')
  end;
  v_elevation_m := coalesce(public.titan_jsonb_numeric(new.details, 'elevation'), 0);
  v_gpx_points := case
    when jsonb_typeof(new.details -> 'gpxPath') = 'array' then jsonb_array_length(new.details -> 'gpxPath')
    else 0
  end;

  if new.val <= 0 or new.val > 300000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_VALUE_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode='23514';
  end if;

  if new.xp < 0 or new.xp > 25000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'critical', 'TRAINING_XP_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode='23514';
  end if;

  if new.date > now() + interval '10 minutes' then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DATE_IN_FUTURE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode='23514';
  end if;

  if v_details_bytes > 50000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DETAILS_TOO_LARGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode='23514';
  end if;

  if v_gpx_points > 1200 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_GPX_TOO_LARGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode='23514';
  end if;

  if v_duration_min is not null and (v_duration_min <= 0 or v_duration_min > 1440) then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DURATION_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode='23514';
  end if;

  if v_distance_km is not null and v_distance_km > 300 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_DISTANCE_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode='23514';
  end if;

  if v_elevation_m > 12000 then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.rejected', 'high', 'TRAINING_ELEVATION_OUT_OF_RANGE', v_payload);
    raise exception 'TRAINING_REJECTED' using errcode='23514';
  end if;

  if TG_OP = 'INSERT' then
    select count(*) into v_hour_count
    from public.training_logs
    where user_id = new.user_id
      and created_at >= now() - interval '1 hour';

    select count(*) into v_day_count
    from public.training_logs
    where user_id = new.user_id
      and created_at >= now() - interval '24 hours';

    if v_hour_count >= 12 or v_day_count >= 40 then
      perform public.titan_log_suspicious_action(
        new.user_id,
        'training_log.rejected',
        'critical',
        'TRAINING_FREQUENCY_OUT_OF_RANGE',
        v_payload || jsonb_build_object('hourCount', v_hour_count, 'dayCount', v_day_count)
      );
      raise exception 'TRAINING_RATE_LIMIT' using errcode='23514';
    elsif v_hour_count >= 6 or v_day_count >= 20 then
      perform public.titan_log_suspicious_action(
        new.user_id,
        'training_log.flagged',
        'medium',
        'TRAINING_FREQUENCY_HIGH',
        v_payload || jsonb_build_object('hourCount', v_hour_count, 'dayCount', v_day_count)
      );
    end if;
  end if;

  if new.xp > 10000 or new.date < now() - interval '30 days' then
    perform public.titan_log_suspicious_action(new.user_id, 'training_log.flagged', 'medium', 'TRAINING_REVIEW_RECOMMENDED', v_payload);
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_is_admin(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'private'
AS $function$
  select private.titan_is_admin(coalesce(p_user_id, auth.uid()));
$function$
;
CREATE OR REPLACE FUNCTION public.titan_join_guild(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_code text := public.titan_normalize_guild_code(p_code);
  v_guild public.guilds%rowtype;
  v_member_name text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_code !~ '^G-[A-Z0-9]{4,10}$' then
    raise exception 'INVALID_GUILD_CODE' using errcode = '22023';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false) is true) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  select * into v_guild
  from public.guilds
  where code = v_code
  limit 1;

  if v_guild.id is null then
    raise exception 'GUILD_NOT_FOUND' using errcode = 'P0002';
  end if;

  delete from public.guild_members
  where user_id = v_uid
    and guild_id <> v_guild.id;

  insert into public.guild_members(guild_id, user_id, role)
  values (v_guild.id, v_uid, 'member')
  on conflict (user_id) do update set guild_id = excluded.guild_id, role = 'member', joined_at = now();

  update public.profiles
  set guild_id = v_guild.id, updated_at = now()
  where id = v_uid;

  v_member_name := public.titan_clean_social_text((select username from public.profiles where id = v_uid), 'Agent', 24);

  update public.guilds
  set chat_history = jsonb_build_array(v_member_name || ' a rejoint la guilde.') || coalesce(chat_history, '[]'::jsonb),
      updated_at = now()
  where id = v_guild.id;

  return public.titan_get_my_guild();
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_jsonb_array_length_safe(p_value jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when jsonb_typeof(p_value) = 'array' then jsonb_array_length(p_value) else 0 end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_jsonb_numeric(p_payload jsonb, p_key text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_text text;
begin
  v_text := nullif(p_payload ->> p_key, '');
  if v_text is null then return null; end if;
  return v_text::numeric;
exception when others then
  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_jsonb_object_size_safe(p_value jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when jsonb_typeof(p_value) = 'object' then (select count(*)::integer from jsonb_object_keys(p_value)) else 0 end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_leave_guild()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
  v_owner_id uuid;
  v_next_owner uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select gm.guild_id into v_guild_id
  from public.guild_members gm
  where gm.user_id = v_uid
  limit 1;

  if v_guild_id is null then
    return true;
  end if;

  select owner_id into v_owner_id from public.guilds where id = v_guild_id;

  delete from public.guild_members where guild_id = v_guild_id and user_id = v_uid;
  update public.profiles set guild_id = null, updated_at = now() where id = v_uid;

  if v_owner_id = v_uid then
    select user_id into v_next_owner
    from public.guild_members
    where guild_id = v_guild_id
    order by joined_at asc
    limit 1;

    if v_next_owner is null then
      delete from public.guilds where id = v_guild_id;
    else
      update public.guild_members set role = 'owner' where guild_id = v_guild_id and user_id = v_next_owner;
      update public.guilds set owner_id = v_next_owner, updated_at = now() where id = v_guild_id;
    end if;
  end if;

  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_level_requirement(p_level integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select greatest(1, floor(2200 * power(greatest(1, coalesce(p_level, 1))::numeric, 1.18))::integer);
$function$
;
CREATE OR REPLACE FUNCTION public.titan_list_global_messages()
 RETURNS TABLE(id text, sender_id uuid, sender_name text, content text, channel text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform public.titan_purge_expired_social_messages();

  return query
  select m.id::text, m.sender_id, m.sender_name, m.content, 'global'::text, m.created_at
  from public.messages m
  where coalesce(m.expires_at, m.created_at + interval '48 hours') > now()
    and m.hidden_at is null
  order by m.created_at asc
  limit 90;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_list_guild_messages()
 RETURNS TABLE(id uuid, guild_id uuid, sender_id uuid, sender_name text, content text, channel text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform public.titan_purge_expired_social_messages();

  select gm.guild_id into v_guild_id
  from public.guild_members gm
  where gm.user_id = v_uid
  limit 1;

  if v_guild_id is null then
    return;
  end if;

  return query
  select m.id, m.guild_id, m.sender_id, m.sender_name, m.content, 'guild'::text as channel, m.created_at
  from public.guild_messages m
  where m.guild_id = v_guild_id
    and m.hidden is false
    and coalesce(m.expires_at, m.created_at + interval '72 hours') > now()
  order by m.created_at asc
  limit 80;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_list_my_friends()
 RETURNS TABLE(id uuid, username text, friend_code text, level integer, avatar text, is_elite boolean, is_suspended boolean, total_sessions integer, fav_sport text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return query
  with friend_ids as (
    select case when f.user_id_1 = auth.uid() then f.user_id_2 else f.user_id_1 end as friend_id
    from public.friendships f
    where f.user_id_1 = auth.uid() or f.user_id_2 = auth.uid()
  ),
  sport_counts as (
    select tl.user_id, tl.sport, count(*) as n
    from public.training_logs tl
    join friend_ids fi on fi.friend_id = tl.user_id
    group by tl.user_id, tl.sport
  ),
  fav as (
    select distinct on (user_id) user_id, sport
    from sport_counts
    order by user_id, n desc, sport asc
  )
  select
    p.id,
    case when coalesce((p.privacy->>'publicProfile')::boolean, true) then p.username else 'Agent prive' end as username,
    case when coalesce((p.privacy->>'publicProfile')::boolean, true) then p.friend_code else null end as friend_code,
    case when coalesce((p.privacy->>'showStats')::boolean, true) then p.level else 1 end as level,
    case when coalesce((p.privacy->>'publicProfile')::boolean, true) then p.avatar else null end as avatar,
    p.is_elite,
    p.is_suspended,
    case when coalesce((p.privacy->>'showStats')::boolean, true) then count(tl.id)::integer else 0 end as total_sessions,
    case when coalesce((p.privacy->>'showStats')::boolean, true) then fav.sport else null end as fav_sport
  from friend_ids f
  join public.profiles p on p.id = f.friend_id
  left join public.training_logs tl on tl.user_id = p.id
  left join fav on fav.user_id = p.id
  where coalesce(p.is_suspended, false) is false
    and not exists (
      select 1 from public.titan_user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
    and coalesce((p.privacy->>'socialPresence')::boolean, true) is true
  group by p.id, p.username, p.friend_code, p.level, p.avatar, p.is_elite, p.is_suspended, p.privacy, fav.sport
  order by p.level desc nulls last, p.username asc nulls last;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_log_suspicious_action(p_user_id uuid, p_action_type text, p_severity text, p_reason text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  insert into public.titan_suspicious_actions(user_id, action_type, severity, reason, payload)
  values (
    p_user_id,
    left(coalesce(p_action_type, 'unknown'), 80),
    case when p_severity in ('low', 'medium', 'high', 'critical') then p_severity else 'medium' end,
    left(coalesce(p_reason, 'unknown'), 240),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_normalize_guild_code(p_code text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g') like 'G%' then
      'G-' || substr(regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g'), 2, 10)
    else ''
  end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_numeric_from_json(p_payload jsonb, p_key text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_text text;
begin
  v_text := nullif(p_payload ->> p_key, '');
  if v_text is null then return null; end if;
  return v_text::numeric;
exception when others then
  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_public_partnership_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
    select coalesce((
        select payload || jsonb_build_object('generatedAt', refreshed_at)
        from public.titan_public_stats_cache
        where key = 'partnership'
    ), '{}'::jsonb);
$function$
;
CREATE OR REPLACE FUNCTION public.titan_public_release_rls_audit()
 RETURNS TABLE(table_name text, table_exists boolean, rls_enabled boolean, rls_forced boolean, anon_privileges text[], authenticated_privileges text[], policies jsonb, recommendation text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tables text[] := array[
    'profiles',
    'training_logs',
    'activities',
    'messages',
    'friendships',
    'shop_history',
    'user_achievements',
    'inventory',
    'guilds',
    'guild_raid',
    'social_challenges',
    'titan_billing_events',
    'titan_cache_reconciliation_reports',
    'titan_suspicious_actions'
  ];
  v_table text;
begin
  foreach v_table in array v_tables loop
    return query
    with cls as (
      select c.oid, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_table
        and c.relkind in ('r', 'p')
    ),
    grants as (
      select
        coalesce(array_agg(rtg.privilege_type::text order by rtg.privilege_type::text) filter (where rtg.grantee = 'anon'), array[]::text[]) as anon_privs,
        coalesce(array_agg(rtg.privilege_type::text order by rtg.privilege_type::text) filter (where rtg.grantee = 'authenticated'), array[]::text[]) as auth_privs
      from information_schema.role_table_grants rtg
      where rtg.table_schema = 'public'
        and rtg.table_name = v_table
    ),
    policy_rows as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'policy', pol.policyname,
        'command', pol.cmd,
        'roles', pol.roles,
        'using', pol.qual,
        'withCheck', pol.with_check
      ) order by pol.policyname), '[]'::jsonb) as policy_json
      from pg_policies pol
      where pol.schemaname = 'public'
        and pol.tablename = v_table
    )
    select
      v_table,
      exists(select 1 from cls),
      coalesce((select relrowsecurity from cls), false),
      coalesce((select relforcerowsecurity from cls), false),
      coalesce((select anon_privs from grants), array[]::text[]),
      coalesce((select auth_privs from grants), array[]::text[]),
      coalesce((select policy_json from policy_rows), '[]'::jsonb),
      case
        when not exists(select 1 from cls) then 'TABLE_MISSING_OR_UNUSED'
        when not coalesce((select relrowsecurity from cls), false) then 'ENABLE_RLS_BEFORE_PUBLIC_RELEASE'
        when array_length(coalesce((select anon_privs from grants), array[]::text[]), 1) is not null
             and v_table not in ('messages') then 'REVIEW_ANON_GRANTS'
        when coalesce((select policy_json from policy_rows), '[]'::jsonb) = '[]'::jsonb then 'NO_POLICIES_DEFINED'
        else 'OK_REVIEW_POLICIES'
      end;
  end loop;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_purchase_shop_item(p_item_id text)
 RETURNS TABLE(item_id text, cost integer, reward_credits integer, credits_after integer, purchased_at timestamp with time zone, mode text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_item_id text := left(trim(coalesce(p_item_id, '')), 80);
  v_price integer;
  v_type text;
  v_effect_val integer;
  v_cooldown_type text;
  v_cooldown_max integer;
  v_requires_elite boolean;
  v_cost integer := 0;
  v_reward integer := 0;
  v_credits integer;
  v_is_elite boolean := false;
  v_count integer := 0;
  v_global_count integer := 0;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_item_id = '' then
    raise exception 'ITEM_REQUIRED' using errcode = '22023';
  end if;

  if to_regclass('public.shop_items') is null then
    raise exception 'SHOP_ITEMS_TABLE_MISSING' using errcode = '42P01';
  end if;

  select
    greatest(coalesce(si.price, 0), 0)::integer,
    left(coalesce(si.type, 'item'), 32),
    greatest(coalesce(si.effect_val, 0), 0)::integer,
    left(coalesce(si.cooldown_type, ''), 24),
    greatest(coalesce(si.cooldown_max, 1), 1)::integer,
    coalesce(si.requires_elite, false)
  into v_price, v_type, v_effect_val, v_cooldown_type, v_cooldown_max, v_requires_elite
  from public.shop_items si
  where si.id::text = v_item_id
    and coalesce(si.is_active, true) is true
  limit 1;

  if not found then
    raise exception 'SHOP_ITEM_NOT_FOUND' using errcode = '22023';
  end if;

  if v_type <> 'cosmetic' then
    raise exception 'COSMETICS_ONLY' using errcode = '22023';
  end if;

  if v_type = 'charge' then
    v_cost := greatest(v_price, greatest(450, greatest(v_effect_val, 1) * 90));
    v_reward := 0;
    v_cooldown_type := 'weekly';
    v_cooldown_max := 2;
  elsif v_type = 'upgrade' then
    v_cost := greatest(v_price, 1400 + (greatest(v_effect_val, 1) - 1) * 1150);
    v_reward := 0;
    v_cooldown_type := 'once';
    v_cooldown_max := 1;
  elsif v_type = 'ad' then
    v_cost := 0;
    v_reward := least(greatest(v_effect_val, 0), 120);
    v_cooldown_type := 'daily';
    v_cooldown_max := 1;
  elsif v_type = 'cosmetic' then
    v_cost := case when v_requires_elite then 0 else greatest(v_price, 1) end;
    v_reward := 0;
    v_cooldown_type := 'once';
    v_cooldown_max := 1;
  else
    v_cost := v_price;
    v_reward := 0;
  end if;

  select coalesce(p.credits, 0)::integer, coalesce(p.is_elite, false)
  into v_credits, v_is_elite
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'PROFILE_MISSING' using errcode = '42501';
  end if;

  if v_requires_elite is true and v_is_elite is not true then
    raise exception 'ELITE_REQUIRED' using errcode = '42501';
  end if;

  if v_cooldown_type = 'once' then
    select count(*)::integer
    into v_count
    from public.shop_history h
    where h.user_id = v_uid
      and h.item_id = v_item_id;

    if v_count >= v_cooldown_max then
      raise exception 'PURCHASE_LIMIT_ONCE' using errcode = '23514';
    end if;
  elsif v_cooldown_type = 'daily' then
    select count(*)::integer
    into v_count
    from public.shop_history h
    where h.user_id = v_uid
      and h.item_id = v_item_id
      and h.purchased_at > v_now - interval '24 hours';

    if v_count >= v_cooldown_max then
      raise exception 'PURCHASE_LIMIT_DAILY' using errcode = '23514';
    end if;
  elsif v_cooldown_type = 'weekly' then
    select count(*)::integer
    into v_count
    from public.shop_history h
    where h.user_id = v_uid
      and h.item_id = v_item_id
      and h.purchased_at > v_now - interval '7 days';

    if v_count >= v_cooldown_max then
      raise exception 'PURCHASE_LIMIT_WEEKLY' using errcode = '23514';
    end if;
  end if;

  if v_type = 'charge' then
    select count(*)::integer
    into v_global_count
    from public.shop_history h
    left join public.shop_items si on si.id::text = h.item_id
    where h.user_id = v_uid
      and h.purchased_at > v_now - interval '7 days'
      and (coalesce(h.economy_meta->>'type', '') = 'charge' or coalesce(si.type, '') = 'charge');

    if v_global_count >= 2 then
      raise exception 'PURCHASE_LIMIT_WEEKLY' using errcode = '23514';
    end if;
  elsif v_type = 'ad' then
    select count(*)::integer
    into v_global_count
    from public.shop_history h
    left join public.shop_items si on si.id::text = h.item_id
    where h.user_id = v_uid
      and h.purchased_at > v_now - interval '7 days'
      and (coalesce(h.economy_meta->>'type', '') = 'ad' or coalesce(si.type, '') = 'ad');

    if v_global_count >= 3 then
      raise exception 'PURCHASE_LIMIT_WEEKLY' using errcode = '23514';
    end if;
  end if;

  if v_credits < v_cost then
    raise exception 'NO_FUNDS' using errcode = '23514';
  end if;

  update public.profiles as p
  set credits = v_credits - v_cost + v_reward
  where p.id = v_uid
  returning p.credits::integer into v_credits;

  insert into public.shop_history(user_id, item_id, purchased_at, cost_credits, reward_credits, economy_meta)
  values (
    v_uid,
    v_item_id,
    v_now,
    v_cost,
    v_reward,
    jsonb_build_object(
      'type', v_type,
      'cooldownType', v_cooldown_type,
      'cooldownMax', v_cooldown_max,
      'requiresElite', v_requires_elite
    )
  );

  return query
  select v_item_id, v_cost, v_reward, v_credits, v_now, 'server_v89_cosmetic_only'::text;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_purge_expired_social_messages()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deleted integer := 0;
  v_step integer := 0;
begin
  delete from public.messages
  where coalesce(expires_at, created_at + interval '48 hours') < now();
  get diagnostics v_step = row_count;
  v_deleted := v_deleted + coalesce(v_step, 0);

  delete from public.guild_messages
  where coalesce(expires_at, created_at + interval '72 hours') < now();
  get diagnostics v_step = row_count;
  v_deleted := v_deleted + coalesce(v_step, 0);

  return v_deleted;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_reject_suspended_user_action()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_suspended boolean := false;
begin
  if v_uid is null then
    return new;
  end if;

  select coalesce(p.is_suspended, false)
  into v_suspended
  from public.profiles p
  where p.id = v_uid;

  if coalesce(v_suspended, false) is true then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_report_chat_message(p_message_id text, p_reason text DEFAULT 'chat_abuse'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_msg record;
  v_report_id uuid;
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select id::text as id, sender_id, sender_name, content, hidden_at
  into v_msg
  from public.messages
  where id::text = p_message_id;

  if not found then
    raise exception 'MESSAGE_NOT_FOUND' using errcode = '22023';
  end if;

  if v_msg.sender_id = auth.uid() then
    raise exception 'CANNOT_REPORT_SELF' using errcode = '22023';
  end if;

  v_reason := left(regexp_replace(trim(coalesce(p_reason, 'chat_abuse')), '[^a-zA-Z0-9_.:-]', '_', 'g'), 60);
  if v_reason = '' then
    v_reason := 'chat_abuse';
  end if;

  insert into public.titan_moderation_reports(
    reporter_id,
    target_user_id,
    message_id,
    reason,
    details
  )
  values (
    auth.uid(),
    v_msg.sender_id,
    v_msg.id,
    v_reason,
    left(
      concat(
        'Message chat signale. Agent: ',
        coalesce(v_msg.sender_name, 'Agent'),
        '. Extrait: ',
        coalesce(v_msg.content, '')
      ),
      700
    )
  )
  returning id into v_report_id;

  return v_report_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_save_profile_state(p_state jsonb, p_username text DEFAULT NULL::text, p_avatar text DEFAULT NULL::text, p_inventory jsonb DEFAULT NULL::jsonb, p_privacy jsonb DEFAULT NULL::jsonb, p_streak_count integer DEFAULT NULL::integer, p_last_week_id text DEFAULT NULL::text, p_last_seen_news_version text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_existing public.profiles%rowtype;
  v_state jsonb := coalesce(p_state, '{}'::jsonb);
  v_username text := coalesce(public.titan_clean_state_username(p_username), 'Agent');
  v_avatar text := null;
  v_inventory jsonb := coalesce(p_inventory, '{}'::jsonb);
  v_privacy jsonb := coalesce(p_privacy, '{}'::jsonb);
  v_streak integer := greatest(0, coalesce(p_streak_count, 0));
  v_last_week_id text := left(coalesce(p_last_week_id, ''), 32);
  v_news text := nullif(left(coalesce(p_last_seen_news_version, ''), 64), '');
  v_result public.profiles%rowtype;
  v_user jsonb;
  v_preferences jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if jsonb_typeof(v_state) <> 'object' then
    raise exception 'STATE_MUST_BE_OBJECT' using errcode = '22023';
  end if;

  if octet_length(v_state::text) > 350000 then
    raise exception 'STATE_TOO_LARGE' using errcode = '54000';
  end if;

  if p_avatar ~* '^(avatar_[0-9]+\.(png|jpe?g|webp|gif)|[a-z0-9_-]+_[0-9]+\.(png|jpe?g|webp|gif))$' then
    v_avatar := p_avatar;
  end if;

  select *
  into v_existing
  from public.profiles
  where id = v_uid for update;

  if not found or coalesce(v_existing.is_suspended,false) then
    raise exception 'PROFILE_UNAVAILABLE' using errcode='42501';
  end if;
  if v_state #>> '{meta,profileVersion}' is not null and (v_state #>> '{meta,profileVersion}')::integer <> v_existing.state_version then
    raise exception 'PROFILE_VERSION_CONFLICT' using errcode='40001';
  end if;
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_preferences
  from jsonb_each(coalesce(v_state->'user','{}'::jsonb)) where key in
    ('name','avatar','weeklyGoalSessions','favoriteSports','favorites','schedule','gymRoutines','goals','sportGoals','onboardingComplete','preferredSports','units','theme','notifications','lastSessionSummary');
  v_user := coalesce(v_existing.game_state->'user','{}'::jsonb) || v_preferences || jsonb_build_object(
    'id',v_uid,'isGuest',false,'xp',v_existing.xp,'credits',v_existing.credits,'level',v_existing.level,
    'is_elite',v_existing.is_elite,'is_tester',v_existing.is_tester,'is_suspended',v_existing.is_suspended,
    'inventory',v_existing.inventory,'unlockedTalents',to_jsonb(v_existing.unlocked_talents));
  v_state := coalesce(v_existing.game_state,'{}'::jsonb) || jsonb_build_object('user',v_user,
    'meta',jsonb_build_object('profileVersion',v_existing.state_version+1));
  v_inventory := coalesce(v_existing.inventory,'{}'::jsonb);
  v_streak := coalesce(v_existing.streak_count,0);
  v_privacy := coalesce(p_privacy,v_existing.privacy,'{}'::jsonb);
  insert into public.profiles (
    id,
    username,
    avatar,
    game_state,
    inventory,
    privacy,
    streak_count,
    last_week_id,
    last_seen_news_version,
    updated_at
  )
  values (
    v_uid,
    v_username,
    v_avatar,
    v_state,
    v_inventory,
    v_privacy,
    v_streak,
    v_last_week_id,
    v_news,
    now()
  )
  on conflict (id) do update set
    state_version = public.profiles.state_version + 1,
    username = excluded.username,
    avatar = coalesce(excluded.avatar, public.profiles.avatar),
    game_state = excluded.game_state,
    inventory = excluded.inventory,
    privacy = excluded.privacy,
    streak_count = excluded.streak_count,
    last_week_id = excluded.last_week_id,
    last_seen_news_version = coalesce(excluded.last_seen_news_version, public.profiles.last_seen_news_version),
    updated_at = now()
  returning *
  into v_result;

  return jsonb_build_object(
    'state_version', v_result.state_version,
    'id', v_result.id,
    'username', v_result.username,
    'avatar', v_result.avatar,
    'game_state', v_result.game_state,
    'inventory', v_result.inventory,
    'privacy', v_result.privacy,
    'streak_count', v_result.streak_count,
    'last_week_id', v_result.last_week_id,
    'last_seen_news_version', v_result.last_seen_news_version,
    'friend_code', v_result.friend_code,
    'credits', v_result.credits,
    'level', v_result.level,
    'xp', v_result.xp,
    'is_elite', coalesce(v_result.is_elite, false),
    'is_tester', coalesce(v_result.is_tester, false),
    'is_suspended', coalesce(v_result.is_suspended, false),
    'updated_at', v_result.updated_at
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_send_global_message(p_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_limits jsonb;
  v_max integer;
  v_cost integer;
  v_content text;
  v_sender text;
  v_message public.messages%rowtype;
  v_recent integer := 0;
  v_credits_after integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false) is true) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  perform public.titan_purge_expired_social_messages();

  v_limits := public.titan_economy_limits(v_uid);
  v_max := coalesce((v_limits ->> 'messageMaxLength')::integer, 280);
  v_cost := coalesce((v_limits ->> 'chatGlobalCost')::integer, 2);
  v_content := public.titan_clean_economy_message(p_content, v_max);

  if v_content = '' then
    raise exception 'MESSAGE_EMPTY' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_recent
  from public.messages
  where sender_id = v_uid
    and created_at > now() - interval '1 minute';

  if v_recent >= 5 then
    raise exception 'CHAT_RATE_LIMIT' using errcode = '42900';
  end if;

  v_credits_after := public.titan_charge_credits(v_uid, v_cost, 'chat_global');
  v_sender := public.titan_clean_social_text((select username from public.profiles where id = v_uid), 'Agent', 24);

  insert into public.messages(sender_id, sender_name, content, expires_at, cost_credits)
  values (v_uid, v_sender, v_content, now() + interval '48 hours', v_cost)
  returning * into v_message;

  return jsonb_build_object(
    'id', v_message.id,
    'sender_id', v_message.sender_id,
    'sender_name', v_message.sender_name,
    'content', v_message.content,
    'channel', 'global',
    'created_at', v_message.created_at,
    'cost', v_cost,
    'maxLength', v_max,
    'credits_after', v_credits_after
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_send_guild_message(p_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
  v_limits jsonb;
  v_max integer;
  v_cost integer;
  v_content text;
  v_sender text;
  v_message public.guild_messages%rowtype;
  v_recent integer := 0;
  v_credits_after integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_suspended, false) is true) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  perform public.titan_purge_expired_social_messages();

  select gm.guild_id into v_guild_id
  from public.guild_members gm
  where gm.user_id = v_uid
  limit 1;

  if v_guild_id is null then
    raise exception 'GUILD_REQUIRED' using errcode = '42501';
  end if;

  v_limits := public.titan_economy_limits(v_uid);
  v_max := coalesce((v_limits ->> 'messageMaxLength')::integer, 280);
  v_cost := coalesce((v_limits ->> 'chatGuildCost')::integer, 3);
  v_content := public.titan_clean_economy_message(p_content, v_max);

  if v_content = '' then
    raise exception 'EMPTY_MESSAGE' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_recent
  from public.guild_messages
  where sender_id = v_uid
    and created_at > now() - interval '1 minute';

  if v_recent >= 5 then
    raise exception 'CHAT_RATE_LIMIT' using errcode = '42900';
  end if;

  v_credits_after := public.titan_charge_credits(v_uid, v_cost, 'chat_guild');
  v_sender := public.titan_clean_social_text((select username from public.profiles where id = v_uid), 'Agent', 24);

  insert into public.guild_messages(guild_id, sender_id, sender_name, content, expires_at, cost_credits)
  values (v_guild_id, v_uid, v_sender, v_content, now() + interval '72 hours', v_cost)
  returning * into v_message;

  return jsonb_build_object(
    'id', v_message.id,
    'guild_id', v_message.guild_id,
    'sender_id', v_message.sender_id,
    'sender_name', v_message.sender_name,
    'content', v_message.content,
    'channel', 'guild',
    'created_at', v_message.created_at,
    'cost', v_cost,
    'maxLength', v_max,
    'credits_after', v_credits_after
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_set_guild_target(p_target integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_guild_id uuid;
  v_target integer := least(30, greatest(1, coalesce(p_target, 5)));
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select g.id into v_guild_id
  from public.guilds g
  where g.owner_id = v_uid
  limit 1;

  if v_guild_id is null then
    raise exception 'GUILD_OWNER_REQUIRED' using errcode = '42501';
  end if;

  update public.guilds
  set weekly_target = v_target,
      chat_history = jsonb_build_array('Objectif hebdo ajuste a ' || v_target || ' seances.') || coalesce(chat_history, '[]'::jsonb),
      updated_at = now()
  where id = v_guild_id;

  return public.titan_get_my_guild();
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_social_rate_limit(p_actor_id uuid, p_action text, p_window interval, p_limit integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer;
begin
  select count(*)::integer
  into v_count
  from public.titan_social_action_log
  where actor_id = p_actor_id
    and action = p_action
    and created_at > now() - p_window;

  if v_count >= p_limit then
    raise exception 'SOCIAL_RATE_LIMIT' using errcode = '42900';
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_submit_cache_reconciliation(p_local_state jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_training_count integer := 0;
  v_training_last_date timestamptz;
  v_local_user jsonb := coalesce(p_local_state -> 'user', '{}'::jsonb);
  v_local_game jsonb := coalesce(p_local_state -> 'game', '{}'::jsonb);
  v_local_history jsonb := coalesce(p_local_state -> 'history', '[]'::jsonb);
  v_local_meta jsonb := coalesce(p_local_state -> 'meta', '{}'::jsonb);
  v_local_id text;
  v_local_level integer;
  v_local_xp integer;
  v_local_credits integer;
  v_local_avatar text;
  v_local_history_count integer;
  v_local_inventory_count integer;
  v_local_achievements_count integer;
  v_local_talents_count integer;
  v_local_boss_level integer;
  v_local_updated_at timestamptz;
  v_cloud_state jsonb;
  v_cloud_level integer;
  v_cloud_xp integer;
  v_cloud_credits integer;
  v_cloud_avatar text;
  v_cloud_history_count integer;
  v_cloud_inventory_count integer;
  v_cloud_achievements_count integer;
  v_cloud_talents_count integer;
  v_cloud_boss_level integer;
  v_cloud_updated_at timestamptz;
  v_local_summary jsonb;
  v_cloud_summary jsonb;
  v_differences jsonb;
  v_flags text[] := '{}'::text[];
  v_report_id uuid;
  v_payload_size integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_local_state is null or jsonb_typeof(p_local_state) <> 'object' then
    raise exception 'LOCAL_STATE_OBJECT_REQUIRED' using errcode = '22023';
  end if;

  v_payload_size := octet_length(p_local_state::text);
  if v_payload_size > 512000 then
    raise exception 'LOCAL_STATE_TOO_LARGE' using errcode = '22023';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_uid;

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(*)::integer, max(date)
  into v_training_count, v_training_last_date
  from public.training_logs
  where user_id = v_uid;

  v_cloud_state := coalesce(v_profile.game_state, '{}'::jsonb);

  v_local_id := nullif(v_local_user ->> 'id', '');
  v_local_level := public.titan_cache_safe_int(v_local_user ->> 'level', 1);
  v_local_xp := public.titan_cache_safe_int(v_local_user ->> 'xp', 0);
  v_local_credits := public.titan_cache_safe_int(v_local_user ->> 'credits', 0);
  v_local_avatar := nullif(trim(coalesce(v_local_user ->> 'avatar', '')), '');
  v_local_history_count := public.titan_jsonb_array_length_safe(v_local_history);
  v_local_inventory_count := public.titan_jsonb_object_size_safe(coalesce(v_local_user -> 'inventory', p_local_state -> 'inventory', '{}'::jsonb));
  v_local_achievements_count := public.titan_jsonb_array_length_safe(coalesce(v_local_user -> 'unlockedAchievements', '[]'::jsonb));
  v_local_talents_count := public.titan_jsonb_array_length_safe(coalesce(v_local_user -> 'unlockedTalents', '[]'::jsonb));
  v_local_boss_level := public.titan_cache_safe_int(v_local_game ->> 'bossLevel', 1);
  v_local_updated_at := public.titan_cache_safe_timestamptz(coalesce(v_local_meta ->> 'updatedAt', p_local_state ->> 'updatedAt'));

  v_cloud_level := coalesce(v_profile.level, public.titan_cache_safe_int(v_cloud_state #>> '{user,level}', 1));
  v_cloud_xp := public.titan_cache_safe_int(v_cloud_state #>> '{user,xp}', 0);
  v_cloud_credits := coalesce(v_profile.credits, public.titan_cache_safe_int(v_cloud_state #>> '{user,credits}', 0));
  v_cloud_avatar := nullif(trim(coalesce(v_profile.avatar, v_cloud_state #>> '{user,avatar}', '')), '');
  v_cloud_history_count := greatest(v_training_count, public.titan_jsonb_array_length_safe(coalesce(v_cloud_state -> 'history', '[]'::jsonb)));
  v_cloud_inventory_count := greatest(
    public.titan_jsonb_object_size_safe(coalesce(v_profile.inventory, '{}'::jsonb)),
    public.titan_jsonb_object_size_safe(coalesce(v_cloud_state #> '{user,inventory}', v_cloud_state -> 'inventory', '{}'::jsonb))
  );
  v_cloud_achievements_count := public.titan_jsonb_array_length_safe(coalesce(v_cloud_state #> '{user,unlockedAchievements}', '[]'::jsonb));
  v_cloud_talents_count := public.titan_jsonb_array_length_safe(coalesce(v_cloud_state #> '{user,unlockedTalents}', '[]'::jsonb));
  v_cloud_boss_level := public.titan_cache_safe_int(v_cloud_state #>> '{game,bossLevel}', 1);
  v_cloud_updated_at := coalesce(
    public.titan_cache_safe_timestamptz(v_cloud_state #>> '{meta,updatedAt}'),
    v_profile.updated_at
  );

  if v_local_id is not null and v_local_id <> v_uid::text and v_local_id not like 'guest_%' then
    v_flags := array_append(v_flags, 'LOCAL_USER_ID_MISMATCH');
  end if;

  if v_local_id like 'guest_%' then
    v_flags := array_append(v_flags, 'LOCAL_CACHE_FROM_GUEST_MODE');
  end if;

  if v_local_avatar is not null and v_local_avatar !~ '^[a-zA-Z0-9_-]+_[0-9]+\.(png|jpg|jpeg|webp|gif)$' and v_local_avatar !~ '^avatar_[0-9]+\.png$' then
    v_flags := array_append(v_flags, 'LOCAL_AVATAR_INVALID_FORMAT');
  end if;

  if v_local_level > v_cloud_level + 10 then
    v_flags := array_append(v_flags, 'LEVEL_DELTA_HIGH_REVIEW_REQUIRED');
  end if;

  if v_local_credits > v_cloud_credits + 50000 then
    v_flags := array_append(v_flags, 'CREDITS_DELTA_HIGH_REVIEW_REQUIRED');
  end if;

  if v_local_history_count > v_cloud_history_count + 25 then
    v_flags := array_append(v_flags, 'HISTORY_DELTA_HIGH_REVIEW_REQUIRED');
  end if;

  if v_local_updated_at is not null and v_cloud_updated_at is not null and v_local_updated_at > v_cloud_updated_at + interval '1 minute' then
    v_flags := array_append(v_flags, 'LOCAL_CACHE_NEWER_THAN_CLOUD');
  end if;

  if v_local_avatar is not null and coalesce(v_cloud_avatar, '') <> v_local_avatar then
    v_flags := array_append(v_flags, 'AVATAR_DIFF');
  end if;

  if v_local_history_count > v_cloud_history_count then
    v_flags := array_append(v_flags, 'LOCAL_HISTORY_NOT_FULLY_IN_CLOUD');
  end if;

  v_local_summary := jsonb_build_object(
    'userId', v_local_id,
    'username', nullif(trim(coalesce(v_local_user ->> 'name', v_local_user ->> 'username', '')), ''),
    'level', v_local_level,
    'xp', v_local_xp,
    'credits', v_local_credits,
    'avatar', v_local_avatar,
    'historyCount', v_local_history_count,
    'inventoryItemCount', v_local_inventory_count,
    'achievementsCount', v_local_achievements_count,
    'talentsCount', v_local_talents_count,
    'bossLevel', v_local_boss_level,
    'updatedAt', v_local_updated_at,
    'payloadBytes', v_payload_size
  );

  v_cloud_summary := jsonb_build_object(
    'userId', v_uid,
    'username', v_profile.username,
    'level', v_cloud_level,
    'xp', v_cloud_xp,
    'credits', v_cloud_credits,
    'avatar', v_cloud_avatar,
    'historyCount', v_cloud_history_count,
    'trainingLogsCount', v_training_count,
    'trainingLastDate', v_training_last_date,
    'inventoryItemCount', v_cloud_inventory_count,
    'achievementsCount', v_cloud_achievements_count,
    'talentsCount', v_cloud_talents_count,
    'bossLevel', v_cloud_boss_level,
    'updatedAt', v_cloud_updated_at
  );

  v_differences := jsonb_build_object(
    'levelDelta', v_local_level - v_cloud_level,
    'xpDelta', v_local_xp - v_cloud_xp,
    'creditsDelta', v_local_credits - v_cloud_credits,
    'historyCountDelta', v_local_history_count - v_cloud_history_count,
    'inventoryItemCountDelta', v_local_inventory_count - v_cloud_inventory_count,
    'achievementsCountDelta', v_local_achievements_count - v_cloud_achievements_count,
    'talentsCountDelta', v_local_talents_count - v_cloud_talents_count,
    'bossLevelDelta', v_local_boss_level - v_cloud_boss_level,
    'avatarDiff', coalesce(v_local_avatar, '') <> coalesce(v_cloud_avatar, ''),
    'localNewer', v_local_updated_at is not null and (v_cloud_updated_at is null or v_local_updated_at > v_cloud_updated_at)
  );

  insert into public.titan_cache_reconciliation_reports(
    user_id,
    local_summary,
    cloud_summary,
    differences,
    risk_flags
  )
  values (
    v_uid,
    v_local_summary,
    v_cloud_summary,
    v_differences,
    v_flags
  )
  returning id into v_report_id;

  return jsonb_build_object(
    'ok', true,
    'reportId', v_report_id,
    'localSummary', v_local_summary,
    'cloudSummary', v_cloud_summary,
    'differences', v_differences,
    'riskFlags', v_flags,
    'note', 'Report only. No progression was changed from browser cache.'
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_submit_combat_victory(p_enemy_key text, p_enemy_type text, p_enemy_id text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_level integer DEFAULT 1, p_reward_mult numeric DEFAULT 1, p_damage integer DEFAULT 0, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(combat_log_id uuid, reward_xp integer, reward_credits integer, credits_after integer, xp_after integer, level_after integer, level_bonus integer, leveled_up integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_enemy_key text := left(regexp_replace(trim(coalesce(p_enemy_key, '')), '[[:cntrl:]]', '', 'g'), 120);
  v_enemy_type text := upper(left(trim(coalesce(p_enemy_type, 'MOB')), 12));
  v_enemy_id text := nullif(left(regexp_replace(trim(coalesce(p_enemy_id, '')), '[[:cntrl:]]', '', 'g'), 80), '');
  v_name text := nullif(left(regexp_replace(trim(coalesce(p_name, '')), '[[:cntrl:]]', '', 'g'), 120), '');
  v_level integer := least(500, greatest(1, coalesce(p_level, 1)));
  v_reward_mult numeric := least(10, greatest(0.1, coalesce(p_reward_mult, 1)));
  v_damage integer := least(10000000, greatest(0, coalesce(p_damage, 0)));
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_recent_count integer;
  v_base_credits integer;
  v_requested_credits integer;
  v_requested_xp integer;
  v_credits integer;
  v_xp integer;
  v_log_id uuid;
  v_progress record;
  v_cap record;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_enemy_key = '' then
    raise exception 'ENEMY_KEY_REQUIRED' using errcode = '22023';
  end if;

  if v_enemy_type not in ('MOB', 'BOSS') then
    raise exception 'ENEMY_TYPE_INVALID' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_recent_count
  from public.combat_logs
  where user_id = v_uid
    and created_at > now() - interval '1 minute';

  if v_recent_count >= 40 then
    raise exception 'COMBAT_RATE_LIMIT' using errcode = '23514';
  end if;

  perform 1 from public.profiles where id=v_uid and not coalesce(is_suspended,false) for update;
  if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
  v_xp := 0; v_credits := 0; v_requested_xp := 0; v_requested_credits := 0;
  select coalesce(credits,0) credits_after,coalesce(xp,0) xp_after,coalesce(level,1) level_after,0 level_bonus,0 leveled_up
  into v_progress from public.profiles where id=v_uid;
  select 0 xp_cap,0 credit_cap,false is_capped into v_cap;
  insert into public.combat_logs(
    user_id,
    enemy_key,
    enemy_type,
    enemy_id,
    name,
    result,
    damage,
    reward_xp,
    reward_credits,
    details
  )
  values (
    v_uid,
    v_enemy_key,
    v_enemy_type,
    v_enemy_id,
    v_name,
    'victory',
    v_damage,
    v_xp,
    v_credits,
    v_details || jsonb_build_object(
      'serverReward',
      true,
      'serverVersion',
      'adventure-cosmetic-v101',
      'requestedXp',
      v_requested_xp,
      'requestedCredits',
      v_requested_credits,
      'weeklyXpCap',
      v_cap.xp_cap,
      'weeklyCreditCap',
      v_cap.credit_cap,
      'weeklyCapped',
      coalesce(v_cap.is_capped, false),
      'rewardMult',
      v_reward_mult,
      'level',
      v_level
    )
  )
  returning id into v_log_id;

  insert into public.user_bestiary(
    user_id,
    enemy_key,
    enemy_type,
    enemy_id,
    name,
    defeats,
    last_defeated_at
  )
  values (
    v_uid,
    v_enemy_key,
    v_enemy_type,
    v_enemy_id,
    v_name,
    1,
    now()
  )
  on conflict (user_id, enemy_key) do update
  set defeats = public.user_bestiary.defeats + 1,
      enemy_type = excluded.enemy_type,
      enemy_id = coalesce(excluded.enemy_id, public.user_bestiary.enemy_id),
      name = coalesce(excluded.name, public.user_bestiary.name),
      last_defeated_at = now();

  return query
  select
    v_log_id,
    v_xp,
    v_credits,
    v_progress.credits_after::integer,
    v_progress.xp_after::integer,
    v_progress.level_after::integer,
    v_progress.level_bonus::integer,
    v_progress.leveled_up::integer;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_submit_training_session(p_sport text, p_category text, p_val numeric, p_unit text DEFAULT ''::text, p_details jsonb DEFAULT '{}'::jsonb, p_date timestamp with time zone DEFAULT now())
 RETURNS TABLE(log_id text, xp integer, credits integer, credits_after integer, xp_after integer, level_after integer, level_bonus integer, leveled_up integer, requested_xp integer, requested_credits integer, weekly_xp_remaining integer, weekly_credits_remaining integer, server_version text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_sport text := left(regexp_replace(trim(coalesce(p_sport, 'unknown')), '[[:cntrl:]]', '', 'g'), 80);
  v_category text := lower(left(regexp_replace(trim(coalesce(p_category, 'training')), '[[:cntrl:]]', '', 'g'), 80));
  v_unit text := lower(left(regexp_replace(trim(coalesce(p_unit, '')), '[[:cntrl:]]', '', 'g'), 24));
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_val numeric := coalesce(p_val, 0);
  v_duration numeric;
  v_elevation numeric;
  v_base numeric;
  v_score numeric;
  v_soft_cap numeric;
  v_hard_cap numeric;
  v_cap_hardness numeric := 10;
  v_rpe numeric := 5;
  v_rpe_text text := coalesce(v_details #>> '{bio,rpe}', '');
  v_gpx_minutes_text text := coalesce(v_details #>> '{gpxStats,movingMinutes}', '');
  v_gpx_ascent_text text := coalesce(v_details #>> '{gpxStats,ascent}', '');
  v_terrain text := lower(coalesce(v_details #>> '{extras,terrain}', v_details #>> '{extras,surface}', v_details #>> '{extras,technicality}', ''));
  v_profile text;
  v_is_elite boolean := false;
  v_intensity numeric;
  v_terrain_mult numeric := 1;
  v_planned_mult numeric := 1;
  v_xp integer;
  v_credits integer;
  v_requested_xp integer;
  v_requested_credits integer;
  v_log_id text;
  v_progress record;
  v_cap record;
  v_event uuid := coalesce(nullif(v_details->>'client_event_id','')::uuid,gen_random_uuid());
  v_request jsonb := jsonb_build_object('sport',p_sport,'category',p_category,'val',p_val,'unit',p_unit,'details',p_details,'date',p_date);
  v_receipt public.training_receipts%rowtype;
  v_response jsonb;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform 1 from public.profiles where id=v_user_id and not coalesce(is_suspended,false) for update;
  if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
  select * into v_receipt from public.training_receipts where user_id=v_user_id and client_event_id=v_event;
  if found then
    if v_receipt.request <> v_request then raise exception 'EVENT_CONTENT_CONFLICT' using errcode='23505'; end if;
    return query select r.* from jsonb_to_record(v_receipt.response) as r(log_id text,xp integer,credits integer,credits_after integer,xp_after integer,level_after integer,level_bonus integer,leveled_up integer,requested_xp integer,requested_credits integer,weekly_xp_remaining integer,weekly_credits_remaining integer,server_version text);
    return;
  end if;
  if jsonb_typeof(v_details) <> 'object' or octet_length(v_details::text)>100000 then
    raise exception 'TRAINING_DETAILS_INVALID' using errcode='22023';
  end if;
  if p_date is null then raise exception 'TRAINING_DATE_REQUIRED' using errcode='22023'; end if;
  if v_val <= 0 or v_val > 300000 then
    raise exception 'TRAINING_VALUE_OUT_OF_RANGE' using errcode = '22023';
  end if;

  if p_date > now() + interval '10 minutes' or p_date < now() - interval '30 days' then
    raise exception 'TRAINING_DATE_OUT_OF_RANGE' using errcode = '22023';
  end if;

  select coalesce(is_elite, false)
  into v_is_elite
  from public.profiles
  where id = v_user_id;

  v_duration := coalesce(
    case when v_gpx_minutes_text ~ '^[0-9]+(\.[0-9]+)?$' then v_gpx_minutes_text::numeric end,
    nullif(public.titan_numeric_from_json(v_details, 'val2'), 0),
    nullif(public.titan_numeric_from_json(v_details, 'duration'), 0),
    case when v_unit = 'min' then v_val else 0 end
  );
  v_elevation := coalesce(
    case when v_gpx_ascent_text ~ '^[0-9]+(\.[0-9]+)?$' then v_gpx_ascent_text::numeric end,
    public.titan_numeric_from_json(v_details, 'elevation'),
    0
  );

  if v_duration < 0 or v_duration > 1440 then
    raise exception 'TRAINING_DURATION_OUT_OF_RANGE' using errcode = '22023';
  end if;

  v_elevation := least(greatest(coalesce(v_elevation, 0), 0), 12000);
  if v_rpe_text ~ '^[0-9]+(\.[0-9]+)?$' then
    v_rpe := least(10, greatest(1, v_rpe_text::numeric));
  end if;

  v_profile := case
    when v_unit = 'kg' or v_category like '%muscu%' or v_category like '%force%' then 'strength'
    when v_unit = 'km' and (v_sport ilike '%trail%' or v_category like '%outdoor%') then 'trail'
    when v_unit = 'km' and (v_sport ilike '%velo%' or v_sport ilike '%bike%' or v_sport ilike '%cycling%') then 'cycling'
    when v_unit = 'km' and (v_sport ilike '%rando%' or v_sport ilike '%hiking%' or v_sport ilike '%marche%') then 'hiking'
    when v_unit = 'km' then 'running'
    when v_category like '%combat%' then 'combat'
    when v_category like '%team%' or v_category like '%collectif%' then 'team'
    when v_category like '%mobil%' or v_category like '%health%' or v_category like '%recovery%' then 'mobility'
    else 'generic'
  end;

  if v_terrain ~ '(mountain|montagne|snow|neige|mud|boue|rock|tech)' then
    v_terrain_mult := 1.08;
  elsif v_terrain ~ '(trail|sentier|gravel|sable|sand|wind|vent)' then
    v_terrain_mult := 1.05;
  end if;

  if lower(coalesce(v_details ->> 'isPlanned', 'false')) in ('true', '1', 'yes', 'on') then
    v_planned_mult := 1.04;
  end if;

  if v_profile = 'strength' then
    v_base := sqrt(least(v_val, 300000)) * 3.15 + least(v_duration, 120) * 0.75;
    v_soft_cap := 520;
    v_hard_cap := 900;
  elsif v_unit = 'km' then
    v_base := least(v_val, 250)
      * case when v_profile = 'cycling' then 19 when v_profile = 'hiking' then 24 when v_profile = 'trail' then 36 else 32 end
      + least(v_duration, 600) * 0.55
      + least(v_elevation, 6000) * case when v_profile in ('trail', 'hiking') then 0.105 else 0.075 end;
    v_soft_cap := case when v_profile = 'trail' then 620 else 560 end;
    v_hard_cap := case when v_profile = 'trail' then 1050 else 950 end;
  elsif v_unit = 'min' then
    v_base := least(v_val, 720) * case when v_profile = 'mobility' then 3.1 else 4.65 end;
    v_soft_cap := case when v_profile = 'mobility' then 260 else 460 end;
    v_hard_cap := case when v_profile = 'mobility' then 480 else 820 end;
  elsif v_profile in ('combat', 'team') then
    v_base := least(greatest(v_duration, v_val), 240) * 4.2 + least(v_val, 500) * 0.42;
    v_soft_cap := 540;
    v_hard_cap := 920;
  else
    v_base := least(v_val, 10000) * 6 + least(v_duration, 180) * 0.6;
    v_soft_cap := 460;
    v_hard_cap := 820;
  end if;

  v_intensity := least(1.13, 1 + greatest(v_rpe - 5, 0) * 0.025);
  v_score := greatest(0, v_base * v_intensity * v_terrain_mult * v_planned_mult);
  if v_score > v_soft_cap then
    v_score := v_soft_cap + sqrt(v_score - v_soft_cap) * v_cap_hardness;
  end if;

  v_hard_cap := v_hard_cap;
  v_requested_xp := greatest(1, floor(least(v_score, v_hard_cap))::integer);
  v_requested_credits := least(
    90,
    greatest(0, floor(v_requested_xp * 0.16)::integer)
  );

  select *
  into v_cap
  from public.titan_apply_weekly_reward_cap(v_user_id, v_requested_xp, v_requested_credits);

  v_xp := coalesce(v_cap.xp_awarded, 0);
  v_credits := coalesce(v_cap.credits_awarded, 0);

  insert into public.training_logs(client_event_id, user_id, sport, category, val, unit, xp, date, details)
  values (
    v_event,
    v_user_id,
    v_sport,
    v_category,
    v_val,
    v_unit,
    v_xp,
    coalesce(p_date, now()),
    v_details || jsonb_build_object(
      'serverReward',
      true,
      'serverVersion',
      'sport-integrity-v101',
      'balanceProfile',
      v_profile,
      'requestedXp',
      v_requested_xp,
      'requestedCredits',
      v_requested_credits,
      'credits',
      v_credits,
      'creditRatio',
      0.16,
      'weeklyXpCap',
      v_cap.xp_cap,
      'weeklyCreditCap',
      v_cap.credit_cap,
      'weeklyXpRemaining',
      greatest(0, coalesce(v_cap.xp_cap, 0) - coalesce(v_cap.xp_used, coalesce(v_cap.xp_awarded, 0))),
      'weeklyCreditsRemaining',
      greatest(0, coalesce(v_cap.credit_cap, 0) - coalesce(v_cap.credits_used, coalesce(v_cap.credits_awarded, 0))),
      'weeklyCapped',
      coalesce(v_cap.is_capped, false)
    )
  )
  returning id::text into v_log_id;
  if v_log_id is null then raise exception 'TRAINING_REJECTED' using errcode='23514'; end if;

  select *
  into v_progress
  from public.titan_apply_progression_reward(v_user_id, v_xp, v_credits);

  v_response := jsonb_build_object('log_id',v_log_id,'xp',v_xp,'credits',v_credits,
    'credits_after',v_progress.credits_after,'xp_after',v_progress.xp_after,'level_after',v_progress.level_after,
    'level_bonus',v_progress.level_bonus,'leveled_up',v_progress.leveled_up,
    'requested_xp',v_requested_xp,'requested_credits',v_requested_credits,
    'weekly_xp_remaining',greatest(0,coalesce(v_cap.xp_cap,0)-coalesce(v_cap.xp_used,0)),
    'weekly_credits_remaining',greatest(0,coalesce(v_cap.credit_cap,0)-coalesce(v_cap.credits_used,0)),
    'server_version','sport-integrity-v101');
  insert into public.training_receipts(user_id,client_event_id,request,response) values(v_user_id,v_event,v_request,v_response);
  return query
  select
    v_log_id,
    v_xp,
    v_credits,
    v_progress.credits_after::integer,
    v_progress.xp_after::integer,
    v_progress.level_after::integer,
    v_progress.level_bonus::integer,
    v_progress.leveled_up::integer,
    v_requested_xp,
    v_requested_credits,
    greatest(0, coalesce(v_cap.xp_cap, 0) - coalesce(v_cap.xp_used, coalesce(v_cap.xp_awarded, 0)))::integer,
    greatest(0, coalesce(v_cap.credit_cap, 0) - coalesce(v_cap.credits_used, coalesce(v_cap.credits_awarded, 0)))::integer,
    'sport-integrity-v101'::text;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_table_has_column(p_table text, p_column text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
  );
$function$
;
CREATE OR REPLACE FUNCTION public.titan_training_insights(p_from timestamp with time zone, p_to timestamp with time zone, p_sport text DEFAULT NULL::text, p_timezone text DEFAULT 'Europe/Paris'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
 SET statement_timeout TO '5s'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles p where p.id = v_uid
      and p.is_elite is true and p.is_suspended is not true
      and (p.elite_ends_at is null or p.elite_ends_at > now())
      and p.elite_refunded_at is null
  ) then raise exception 'TITAN_PLUS_REQUIRED'; end if;
  if p_from is null or p_to is null or p_from >= p_to
     or p_to > now() + interval '5 minutes'
     or p_to - p_from > interval '366 days'
     or p_from < now() - interval '5 years'
     or coalesce(length(p_sport),0) > 100 then
    raise exception 'INVALID_REPORT_PERIOD';
  end if;
  if p_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) then raise exception 'INVALID_TIMEZONE'; end if;

  with periods(period, start_at, end_at) as (
    values ('current', p_from, p_to), ('previous', p_from-(p_to-p_from), p_from)
  ), measured as (
    select l.id,l.sport,l.date,l.unit,l.val,d.minutes,
      case when l.details#>>'{bio,rpe}' ~ '^(10|[1-9])(\.[0-9]{1,2})?$'
        then case when (l.details#>>'{bio,rpe}')::numeric <= 10
          then (l.details#>>'{bio,rpe}')::numeric end end as rpe
    from public.training_logs l
    left join lateral (
      select raw::numeric as minutes from (values
        (1,l.details->>'duration'), (2,l.details->>'val2'),
        (3,l.details#>>'{gpxStats,movingMinutes}'),
        (4,case when l.unit='min' then l.val::text when l.unit='h' then (l.val*60)::text end)
      ) candidates(priority,raw)
      where case when raw ~ '^[0-9]{1,6}(\.[0-9]{1,8})?$'
        then raw::numeric > 0 and raw::numeric <= 1440 else false end
      order by priority limit 1
    ) d on true
    where l.user_id = v_uid and l.archived_at is null
      and l.date >= p_from-(p_to-p_from) and l.date < p_to
      and (p_sport is null or l.sport = p_sport)
  ), totals as (
    select p.period, count(m.id) as sessions,
      count(m.minutes) as duration_measured, coalesce(sum(m.minutes),0) as minutes,
      count(m.id) filter(where m.unit='km') as distance_measured,
      coalesce(sum(m.val) filter(where m.unit='km'),0) as distance,
      count(distinct (m.date at time zone p_timezone)::date) as active_days,
      count(m.id) filter(where m.rpe is not null and m.minutes is not null) as load_measured,
      coalesce(sum(m.minutes*m.rpe),0) as reported_load,
      round(avg(m.rpe),1) as average_rpe
    from periods p left join measured m on m.date >= p.start_at and m.date < p.end_at
    group by p.period
  ), sports as (
    select sport,count(*) as sessions,count(minutes) as duration_measured,
      coalesce(sum(minutes),0) as minutes from measured
    where date >= p_from group by sport
  )
  select jsonb_build_object(
    'from',p_from,'to',p_to,'previous_from',p_from-(p_to-p_from),'timezone',p_timezone,
    'periods',(select jsonb_object_agg(period,to_jsonb(t)-'period') from totals t),
    'sports',coalesce((select jsonb_agg(to_jsonb(s) order by sessions desc,sport) from sports s),'[]'::jsonb),
    'generated_at',now()
  ) into v_result;
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_training_storage_health()
 RETURNS TABLE(check_name text, ok boolean, details text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select 'training_logs_table', to_regclass('public.training_logs') is not null, coalesce(to_regclass('public.training_logs')::text, 'missing')
  union all
  select 'training_rpc', to_regprocedure('public.titan_submit_training_session(text,text,numeric,text,jsonb,timestamptz)') is not null, coalesce(to_regprocedure('public.titan_submit_training_session(text,text,numeric,text,jsonb,timestamptz)')::text, 'missing')
  union all
  select 'authenticated_insert_grant', has_table_privilege('authenticated', 'public.training_logs', 'insert'), 'training_logs insert'
  union all
  select 'authenticated_select_grant', has_table_privilege('authenticated', 'public.training_logs', 'select'), 'training_logs select'
  union all
  select 'rls_enabled', coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'training_logs'), false), 'training_logs rls'
  union all
  select 'insert_policy', exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'training_logs' and policyname = 'training_logs_insert_own'), 'training_logs_insert_own'
  union all
  select 'select_policy', exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'training_logs' and policyname = 'training_logs_select_own'), 'training_logs_select_own';
$function$
;
CREATE OR REPLACE FUNCTION public.titan_transition_social_challenge(p_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); c public.social_challenges%rowtype;
begin
 if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.profiles where id=u and not coalesce(is_suspended,false) for update;
 if not found then raise exception 'PROFILE_UNAVAILABLE' using errcode='42501'; end if;
 select * into c from public.social_challenges where id=p_id and (challenger_id=u or opponent_id=u) for update;
 if not found then raise exception 'CHALLENGE_NOT_FOUND' using errcode='42501'; end if;
 if c.stake<>0 then raise exception 'LEGACY_WAGER_REQUIRES_SUPPORT' using errcode='22023'; end if;
 if c.status<>'pending' or c.expires_at<now() then raise exception 'CHALLENGE_STATE_CONFLICT' using errcode='40001'; end if;
 if p_action in ('accept','decline') and c.opponent_id=u then
  update public.social_challenges set status=case p_action when 'accept' then 'active' else 'declined' end where id=c.id returning * into c;
 elsif p_action='cancel' and c.challenger_id=u then
  update public.social_challenges set status='cancelled' where id=c.id returning * into c;
 else raise exception 'CHALLENGE_ACTION_FORBIDDEN' using errcode='42501'; end if;
 return to_jsonb(c);
end $function$
;
CREATE OR REPLACE FUNCTION public.titan_unblock_user(p_blocked_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  delete from public.titan_user_blocks
  where blocker_id = auth.uid()
    and blocked_id = p_blocked_id;

  insert into public.titan_social_action_log(actor_id, action, target_id)
  values (auth.uid(), 'unblock_user', p_blocked_id);

  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_update_training_session(p_id uuid, p_revision integer, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.titan_update_training_session(p_id,p_revision,p_patch);$function$
;
CREATE OR REPLACE FUNCTION public.titan_v72_sport_fields(p_profile text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_profile
    when 'football' then jsonb_build_array(
      jsonb_build_object('id','position','label','Poste','type','select','options',jsonb_build_array('Gardien','Defenseur','Milieu','Attaquant'),'priority',1),
      jsonb_build_object('id','minutes_played','label','Temps joue','type','number','unit','min','min',0,'max',130,'step',1,'chart',true,'aggregate','sum','priority',2),
      jsonb_build_object('id','goals','label','Buts','type','number','min',0,'max',20,'step',1,'chart',true,'aggregate','sum','priority',3,'xpWeight',8,'visibleWhen',jsonb_build_object('field','position','in',jsonb_build_array('Milieu','Attaquant'))),
      jsonb_build_object('id','assists','label','Passes decisives','type','number','min',0,'max',20,'step',1,'chart',true,'aggregate','sum','priority',4,'xpWeight',6),
      jsonb_build_object('id','key_passes','label','Passes cles','type','number','min',0,'max',40,'step',1,'chart',true,'aggregate','sum','priority',5),
      jsonb_build_object('id','shots_on_target','label','Tirs cadres','type','number','min',0,'max',30,'step',1,'chart',true,'aggregate','sum','priority',6),
      jsonb_build_object('id','duels_won','label','Duels gagnes','type','number','min',0,'max',80,'step',1,'chart',true,'aggregate','sum','priority',7),
      jsonb_build_object('id','successful_tackles','label','Tacles/interceptions','type','number','min',0,'max',80,'step',1,'chart',true,'aggregate','sum','priority',8),
      jsonb_build_object('id','saves','label','Arrets','type','number','min',0,'max',40,'step',1,'chart',true,'aggregate','sum','priority',9,'visibleWhen',jsonb_build_object('field','position','equals','Gardien')),
      jsonb_build_object('id','clean_sheet','label','Clean sheet','type','checkbox','priority',10,'visibleWhen',jsonb_build_object('field','position','equals','Gardien'))
    )
    when 'basketball' then jsonb_build_array(
      jsonb_build_object('id','position','label','Poste','type','select','options',jsonb_build_array('Meneur','Arriere','Ailier','Ailier fort','Pivot'),'priority',1),
      jsonb_build_object('id','points','label','Points','type','number','min',0,'max',120,'step',1,'chart',true,'aggregate','sum','priority',2,'xpWeight',2),
      jsonb_build_object('id','rebounds','label','Rebonds','type','number','min',0,'max',60,'step',1,'chart',true,'aggregate','sum','priority',3),
      jsonb_build_object('id','assists','label','Passes decisives','type','number','min',0,'max',40,'step',1,'chart',true,'aggregate','sum','priority',4),
      jsonb_build_object('id','steals','label','Interceptions','type','number','min',0,'max',20,'step',1,'chart',true,'aggregate','sum','priority',5),
      jsonb_build_object('id','blocks','label','Contres','type','number','min',0,'max',20,'step',1,'chart',true,'aggregate','sum','priority',6),
      jsonb_build_object('id','three_points','label','Tirs a 3 pts','type','number','min',0,'max',30,'step',1,'chart',true,'aggregate','sum','priority',7),
      jsonb_build_object('id','turnovers','label','Pertes de balle','type','number','min',0,'max',30,'step',1,'chart',true,'aggregate','sum','priority',8,'higherIsBetter',false)
    )
    when 'tennis' then jsonb_build_array(
      jsonb_build_object('id','match_result','label','Resultat','type','select','options',jsonb_build_array('Victoire','Defaite','Entrainement'),'priority',1),
      jsonb_build_object('id','sets_won','label','Sets gagnes','type','number','min',0,'max',10,'step',1,'chart',true,'aggregate','sum','priority',2),
      jsonb_build_object('id','games_won','label','Jeux gagnes','type','number','min',0,'max',60,'step',1,'chart',true,'aggregate','sum','priority',3),
      jsonb_build_object('id','aces','label','Aces','type','number','min',0,'max',80,'step',1,'chart',true,'aggregate','sum','priority',4),
      jsonb_build_object('id','winners','label','Winners','type','number','min',0,'max',160,'step',1,'chart',true,'aggregate','sum','priority',5),
      jsonb_build_object('id','unforced_errors','label','Fautes directes','type','number','min',0,'max',160,'step',1,'chart',true,'aggregate','sum','priority',6,'higherIsBetter',false),
      jsonb_build_object('id','first_serve_pct','label','1res balles','type','number','unit','%','min',0,'max',100,'step',1,'chart',true,'aggregate','avg','priority',7)
    )
    when 'running' then jsonb_build_array(
      jsonb_build_object('id','session_type','label','Type de seance','type','select','options',jsonb_build_array('Endurance','Tempo','Fractionne','Cote','Recuperation'),'priority',1),
      jsonb_build_object('id','avg_hr','label','FC moyenne','type','number','unit','bpm','min',60,'max',230,'step',1,'chart',true,'aggregate','avg','priority',2),
      jsonb_build_object('id','cadence','label','Cadence','type','number','unit','ppm','min',80,'max',240,'step',1,'chart',true,'aggregate','avg','priority',3),
      jsonb_build_object('id','intervals','label','Repetitions','type','number','min',0,'max',100,'step',1,'chart',true,'aggregate','sum','priority',4),
      jsonb_build_object('id','surface','label','Surface','type','select','options',jsonb_build_array('Route','Piste','Chemin','Tapis'),'priority',5)
    )
    when 'cycling' then jsonb_build_array(
      jsonb_build_object('id','bike_type','label','Type de velo','type','select','options',jsonb_build_array('Route','Gravel','Home trainer','Transport'),'priority',1),
      jsonb_build_object('id','avg_power','label','Puissance moyenne','type','number','unit','W','min',0,'max',700,'step',1,'chart',true,'aggregate','avg','priority',2),
      jsonb_build_object('id','normalized_power','label','Puissance normalisee','type','number','unit','W','min',0,'max',900,'step',1,'chart',true,'aggregate','avg','priority',3),
      jsonb_build_object('id','cadence','label','Cadence','type','number','unit','rpm','min',30,'max',180,'step',1,'chart',true,'aggregate','avg','priority',4),
      jsonb_build_object('id','avg_hr','label','FC moyenne','type','number','unit','bpm','min',60,'max',230,'step',1,'chart',true,'aggregate','avg','priority',5),
      jsonb_build_object('id','sprints','label','Sprints','type','number','min',0,'max',60,'step',1,'chart',true,'aggregate','sum','priority',6)
    )
    when 'swimming_pool' then jsonb_build_array(
      jsonb_build_object('id','stroke','label','Nage dominante','type','select','options',jsonb_build_array('Crawl','Brasse','Dos','Papillon','Mixte'),'priority',1),
      jsonb_build_object('id','pace_100m','label','Allure 100 m','type','number','unit','s','min',20,'max',600,'step',1,'chart',true,'aggregate','min','priority',2,'higherIsBetter',false),
      jsonb_build_object('id','swolf','label','SWOLF','type','number','min',10,'max',160,'step',1,'chart',true,'aggregate','min','priority',3,'higherIsBetter',false),
      jsonb_build_object('id','stroke_rate','label','Cadence bras','type','number','unit','cpm','min',0,'max',120,'step',1,'chart',true,'aggregate','avg','priority',4),
      jsonb_build_object('id','drills','label','Educatifs','type','number','min',0,'max',60,'step',1,'chart',true,'aggregate','sum','priority',5)
    )
    when 'strength_max' then jsonb_build_array(
      jsonb_build_object('id','lift','label','Mouvement','type','select','options',jsonb_build_array('Squat','Developpe couche','Souleve de terre','Epaules','Arracher','Epauler-jete','Carry'),'priority',1),
      jsonb_build_object('id','top_set_weight','label','Top set','type','number','unit','kg','min',0,'max',700,'step',0.5,'chart',true,'aggregate','max','priority',2),
      jsonb_build_object('id','top_set_reps','label','Reps top set','type','number','min',1,'max',50,'step',1,'chart',true,'aggregate','max','priority',3),
      jsonb_build_object('id','working_sets','label','Series de travail','type','number','min',0,'max',40,'step',1,'chart',true,'aggregate','sum','priority',4),
      jsonb_build_object('id','rir','label','RIR','type','number','min',0,'max',10,'step',1,'chart',true,'aggregate','avg','priority',5,'higherIsBetter',false)
    )
    when 'strength' then jsonb_build_array(
      jsonb_build_object('id','muscle_group','label','Groupe principal','type','select','options',jsonb_build_array('Pectoraux','Dos','Jambes','Epaules','Bras','Core','Full body'),'priority',1),
      jsonb_build_object('id','top_set_weight','label','Top set','type','number','unit','kg','min',0,'max',700,'step',0.5,'chart',true,'aggregate','max','priority',2),
      jsonb_build_object('id','top_set_reps','label','Reps top set','type','number','min',1,'max',80,'step',1,'chart',true,'aggregate','max','priority',3),
      jsonb_build_object('id','working_sets','label','Series utiles','type','number','min',0,'max',60,'step',1,'chart',true,'aggregate','sum','priority',4),
      jsonb_build_object('id','rir','label','RIR','type','number','min',0,'max',10,'step',1,'chart',true,'aggregate','avg','priority',5,'higherIsBetter',false),
      jsonb_build_object('id','tempo','label','Tempo','type','select','options',jsonb_build_array('Normal','Controle','Explosif','Pause'),'priority',6)
    )
    when 'combat_striking' then jsonb_build_array(
      jsonb_build_object('id','mode','label','Travail','type','select','options',jsonb_build_array('Technique','Sac','Pao','Sparring','Competition'),'priority',1),
      jsonb_build_object('id','rounds','label','Rounds','type','number','min',0,'max',40,'step',1,'chart',true,'aggregate','sum','priority',2),
      jsonb_build_object('id','clean_strikes','label','Frappes propres','type','number','min',0,'max',600,'step',1,'chart',true,'aggregate','sum','priority',3),
      jsonb_build_object('id','defensive_actions','label','Defenses reussies','type','number','min',0,'max',300,'step',1,'chart',true,'aggregate','sum','priority',4),
      jsonb_build_object('id','sparring_intensity','label','Intensite sparring','type','number','min',1,'max',10,'step',1,'chart',true,'aggregate','avg','priority',5)
    )
    when 'combat_grappling' then jsonb_build_array(
      jsonb_build_object('id','mode','label','Travail','type','select','options',jsonb_build_array('Technique','Drill','Sparring','Sol','Competition'),'priority',1),
      jsonb_build_object('id','rounds','label','Rounds','type','number','min',0,'max',40,'step',1,'chart',true,'aggregate','sum','priority',2),
      jsonb_build_object('id','takedowns','label','Amenes au sol','type','number','min',0,'max',100,'step',1,'chart',true,'aggregate','sum','priority',3),
      jsonb_build_object('id','escapes','label','Sorties','type','number','min',0,'max',100,'step',1,'chart',true,'aggregate','sum','priority',4),
      jsonb_build_object('id','submissions','label','Soumissions','type','number','min',0,'max',80,'step',1,'chart',true,'aggregate','sum','priority',5)
    )
    when 'climbing' then jsonb_build_array(
      jsonb_build_object('id','climb_type','label','Format','type','select','options',jsonb_build_array('Bloc','Voie','Tete','Moulinette','Pan','Exterieur'),'priority',1),
      jsonb_build_object('id','max_attempted','label','Niveau tente','type','text','placeholder','Ex: 6b, 7A, V5','priority',2),
      jsonb_build_object('id','max_done','label','Niveau reussi','type','text','placeholder','Ex: 6a+, 6C, V4','priority',3),
      jsonb_build_object('id','attempts','label','Essais utiles','type','number','min',0,'max',160,'step',1,'chart',true,'aggregate','sum','priority',4),
      jsonb_build_object('id','successful_routes','label','Blocs / voies reussis','type','number','min',0,'max',100,'step',1,'chart',true,'aggregate','sum','priority',5),
      jsonb_build_object('id','fall_count','label','Chutes','type','number','min',0,'max',120,'step',1,'chart',true,'aggregate','sum','priority',6,'higherIsBetter',false)
    )
    when 'mindbody' then jsonb_build_array(
      jsonb_build_object('id','focus_area','label','Zone cible','type','select','options',jsonb_build_array('Respiration','Hanches','Dos','Epaules','Chevilles','Full body'),'priority',1),
      jsonb_build_object('id','hold_seconds','label','Maintiens longs','type','number','unit','s','min',0,'max',7200,'step',5,'chart',true,'aggregate','sum','priority',2),
      jsonb_build_object('id','pain_before','label','Douleur avant','type','number','min',0,'max',10,'step',1,'chart',true,'aggregate','avg','priority',3,'higherIsBetter',false),
      jsonb_build_object('id','pain_after','label','Douleur apres','type','number','min',0,'max',10,'step',1,'chart',true,'aggregate','avg','priority',4,'higherIsBetter',false),
      jsonb_build_object('id','breathing_quality','label','Qualite respiration','type','number','min',1,'max',10,'step',1,'chart',true,'aggregate','avg','priority',5)
    )
    else jsonb_build_array(
      jsonb_build_object('id','session_type','label','Type de seance','type','select','options',jsonb_build_array('Technique','Endurance','Intensite','Recuperation','Competition'),'priority',1),
      jsonb_build_object('id','quality_score','label','Qualite execution','type','number','min',1,'max',10,'step',1,'chart',true,'aggregate','avg','priority',2),
      jsonb_build_object('id','successful_actions','label','Actions reussies','type','number','min',0,'max',1000,'step',1,'chart',true,'aggregate','sum','priority',3),
      jsonb_build_object('id','errors','label','Erreurs majeures','type','number','min',0,'max',500,'step',1,'chart',true,'aggregate','sum','priority',4,'higherIsBetter',false),
      jsonb_build_object('id','technical_focus','label','Focus technique','type','text','placeholder','Ex: timing, precision, relance','priority',5)
    )
  end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_v72_sport_profile(p_id text, p_label text, p_category text, p_form_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when lower(coalesce(p_id, '')) in ('soccer', 'futsal') then 'football'
    when lower(coalesce(p_id, '')) = 'basketball' then 'basketball'
    when lower(coalesce(p_id, '')) = 'handball' then 'handball'
    when lower(coalesce(p_id, '')) = 'rugby' then 'rugby'
    when lower(coalesce(p_id, '')) in ('volleyball', 'beach_volley') then 'volleyball'
    when lower(coalesce(p_id, '')) in ('baseball', 'softball') then 'baseball'
    when lower(coalesce(p_id, '')) = 'cricket' then 'cricket'
    when lower(coalesce(p_id, '')) in ('hockey_field', 'hockey_ice', 'lacrosse', 'ultimate') then 'hockey_team'
    when lower(coalesce(p_id, '')) in ('american_football', 'water_polo') then 'contact_team'
    when lower(coalesce(p_id, '')) = 'tennis' then 'tennis'
    when lower(coalesce(p_id, '')) in ('badminton', 'squash', 'table_tennis', 'pickleball') then 'racket_fast'
    when lower(coalesce(p_id, '')) = 'padel' then 'padel'
    when lower(coalesce(p_id, '')) in ('running', 'treadmill', 'orienteering') then 'running'
    when lower(coalesce(p_id, '')) in ('sprint', 'hurdles', 'rope_jump') then 'speed'
    when lower(coalesce(p_id, '')) in ('trail', 'hiking', 'walking', 'nordic_walk', 'stroller_walk', 'snowshoeing', 'alpinism', 'via_ferrata') then 'mountain_endurance'
    when lower(coalesce(p_id, '')) in ('cycling', 'gravel', 'cycling_indoor', 'spinning', 'velotaf') then 'cycling'
    when lower(coalesce(p_id, '')) in ('mtb', 'bmx') then 'mtb'
    when lower(coalesce(p_id, '')) in ('swimming', 'aquagym') then 'swimming_pool'
    when lower(coalesce(p_id, '')) = 'open_water' then 'open_water'
    when lower(coalesce(p_id, '')) in ('rowing', 'rowing_machine', 'kayak', 'paddle') then 'rowing_water'
    when lower(coalesce(p_id, '')) in ('powerlifting', 'haltero', 'strongman') then 'strength_max'
    when lower(coalesce(p_id, '')) in ('muscu_builder', 'muscu_gym', 'muscu_home', 'kettlebell', 'sandbag', 'trx', 'farmers_walk') then 'strength'
    when lower(coalesce(p_id, '')) in ('pompes', 'tractions', 'dips', 'squat', 'plank', 'bodyweight', 'street_workout', 'abs_session') then 'calisthenics'
    when lower(coalesce(p_id, '')) in ('boxing', 'kickboxing', 'thaiboxing', 'savate', 'taekwondo', 'karate', 'capoeira') then 'combat_striking'
    when lower(coalesce(p_id, '')) in ('bjj', 'judo', 'wrestling', 'mma', 'aikido', 'krav_maga', 'kung_fu') then 'combat_grappling'
    when lower(coalesce(p_id, '')) in ('fencing', 'kendo') then 'combat_weapon'
    when lower(coalesce(p_id, '')) in ('climbing', 'bouldering') then 'climbing'
    when lower(coalesce(p_id, '')) in ('gymnastics', 'parkour', 'circus', 'pole_dance') then 'gym_skill'
    when lower(coalesce(p_id, '')) in ('dance', 'ballet', 'hiphop', 'salsa', 'zumba') then 'dance'
    when lower(coalesce(p_id, '')) in ('golf', 'archery', 'darts') then 'precision'
    when lower(coalesce(p_id, '')) in ('bowling', 'curling') then 'score_precision'
    when lower(coalesce(p_id, '')) in ('surfing', 'kitesurf', 'windsurf', 'wakeboard', 'sailing', 'diving', 'canyoning') then 'water_skill'
    when lower(coalesce(p_id, '')) in ('ski', 'snowboard', 'ski_touring', 'cross_country_ski', 'roller', 'skate', 'ice_skating') then 'glide'
    when lower(coalesce(p_id, '')) in ('yoga', 'pilates', 'stretching', 'meditation', 'qigong', 'taichi', 'sauna') then 'mindbody'
    when lower(coalesce(p_id, '')) in ('crossfit', 'hiit', 'fitness_class', 'vr_fitness', 'elliptical') then 'mixed_conditioning'
    when lower(coalesce(p_category, '')) = 'team' then 'team'
    when lower(coalesce(p_category, '')) = 'combat' then 'combat_grappling'
    when lower(coalesce(p_category, '')) in ('force', 'muscu') then 'strength'
    when lower(coalesce(p_category, '')) in ('endurance', 'cardio') or lower(coalesce(p_form_type, '')) like '%gps%' then 'endurance'
    when lower(coalesce(p_category, '')) = 'zen' then 'mindbody'
    when lower(coalesce(p_category, '')) = 'fun' then 'skill'
    else 'generic'
  end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_v72_tracking_summary(p_profile text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_profile
    when 'football' then jsonb_build_object('headline', 'Poste, volume de jeu, creation, duel et finition.', 'graphs', jsonb_build_array('minutes_played', 'goals', 'assists', 'duels_won'))
    when 'basketball' then jsonb_build_object('headline', 'Scoring, creation, rebond, defense et pertes.', 'graphs', jsonb_build_array('points', 'assists', 'rebounds', 'turnovers'))
    when 'handball' then jsonb_build_object('headline', 'Tirs, buts, passes, defense et gardien.', 'graphs', jsonb_build_array('goals', 'shots', 'assists', 'saves'))
    when 'rugby' then jsonb_build_object('headline', 'Portes, metres, plaquages et turnovers.', 'graphs', jsonb_build_array('carries', 'meters_carried', 'tackles', 'turnovers_won'))
    when 'volleyball' then jsonb_build_object('headline', 'Service, attaque, bloc, reception et fautes.', 'graphs', jsonb_build_array('kills', 'aces', 'blocks', 'serve_errors'))
    when 'tennis' then jsonb_build_object('headline', 'Service, jeux, winners, fautes et pression.', 'graphs', jsonb_build_array('games_won', 'aces', 'winners', 'unforced_errors'))
    when 'racket_fast' then jsonb_build_object('headline', 'Sets, points directs, erreurs et echanges.', 'graphs', jsonb_build_array('sets_won', 'direct_points', 'unforced_errors', 'rally_quality_score'))
    when 'padel' then jsonb_build_object('headline', 'Jeu en paire, vollee, break et faute directe.', 'graphs', jsonb_build_array('sets_won', 'break_points', 'net_points', 'unforced_errors'))
    when 'running' then jsonb_build_object('headline', 'Allure, duree, cadence, FC et repetitions.', 'graphs', jsonb_build_array('avg_hr', 'cadence', 'intervals'))
    when 'speed' then jsonb_build_object('headline', 'Repetitions rapides, temps cible et recuperation.', 'graphs', jsonb_build_array('fast_reps', 'best_time', 'fast_distance_m'))
    when 'cycling' then jsonb_build_object('headline', 'Puissance, cadence, FC, denivele et sprints.', 'graphs', jsonb_build_array('avg_power', 'normalized_power', 'cadence', 'sprints'))
    when 'mtb' then jsonb_build_object('headline', 'Technique, denivele, descentes et pilotage.', 'graphs', jsonb_build_array('technical_sections', 'descents', 'avg_power'))
    when 'swimming_pool' then jsonb_build_object('headline', 'Nage, allure, efficacite et travail technique.', 'graphs', jsonb_build_array('pace_100m', 'swolf', 'drills', 'stroke_rate'))
    when 'open_water' then jsonb_build_object('headline', 'Distance, navigation, conditions et allure.', 'graphs', jsonb_build_array('pace_100m', 'sighting_errors', 'water_temp'))
    when 'rowing_water' then jsonb_build_object('headline', 'Split, cadence, puissance et qualite technique.', 'graphs', jsonb_build_array('split_500m', 'stroke_rate', 'avg_power'))
    when 'strength_max' then jsonb_build_object('headline', 'Mouvement, top set, intensite et volume utile.', 'graphs', jsonb_build_array('top_set_weight', 'top_set_reps', 'working_sets', 'rir'))
    when 'strength' then jsonb_build_object('headline', 'Volume, groupe musculaire, top set et RIR.', 'graphs', jsonb_build_array('top_set_weight', 'top_set_reps', 'working_sets', 'rir'))
    when 'calisthenics' then jsonb_build_object('headline', 'Reps strictes, holds, variations et densite.', 'graphs', jsonb_build_array('strict_reps', 'hold_seconds', 'working_sets'))
    when 'combat_striking' then jsonb_build_object('headline', 'Rounds, precision, defense et intensite sparring.', 'graphs', jsonb_build_array('rounds', 'clean_strikes', 'defensive_actions'))
    when 'combat_grappling' then jsonb_build_object('headline', 'Rounds, entrees, controles, escapes et soumissions.', 'graphs', jsonb_build_array('rounds', 'takedowns', 'escapes', 'submissions'))
    when 'climbing' then jsonb_build_object('headline', 'Grade, essais, sends et style de grimpe.', 'graphs', jsonb_build_array('attempts', 'successful_routes', 'fall_count'))
    when 'precision' then jsonb_build_object('headline', 'Tentatives, reussite, precision et pression.', 'graphs', jsonb_build_array('attempts', 'accuracy', 'pressure_sets'))
    when 'mindbody' then jsonb_build_object('headline', 'Zone cible, respiration, douleur et amplitude.', 'graphs', jsonb_build_array('hold_seconds', 'pain_before', 'pain_after'))
    else jsonb_build_object('headline', 'Technique, charge, qualite et resultat mesurable.', 'graphs', jsonb_build_array('successful_actions', 'errors', 'quality_score'))
  end;
$function$
;
CREATE OR REPLACE FUNCTION public.titan_week_start(p_at timestamp with time zone DEFAULT now())
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select date_trunc('week', coalesce(p_at, now()))::date;
$function$
;
