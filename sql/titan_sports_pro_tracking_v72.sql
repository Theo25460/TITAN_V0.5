begin;

-- TITAN OS v72 - Supabase-backed pro sport tracking definitions.
-- Every active sport gets a non-empty tracking profile and extra_fields payload.

alter table if exists public.sports add column if not exists extra_fields jsonb default '[]'::jsonb;
alter table if exists public.sports add column if not exists tracking_summary jsonb default '{}'::jsonb;
alter table if exists public.sports add column if not exists tracking_version text default 'v72';
alter table if exists public.sports add column if not exists balance_profile text default 'generic';
alter table if exists public.sports add column if not exists updated_at timestamptz default now();

create or replace function public.titan_v72_sport_profile(
  p_id text,
  p_label text,
  p_category text,
  p_form_type text
) returns text
language sql
immutable
as $$
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
$$;

create or replace function public.titan_v72_tracking_summary(p_profile text)
returns jsonb
language sql
immutable
as $$
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
$$;

create or replace function public.titan_v72_sport_fields(p_profile text)
returns jsonb
language sql
immutable
as $$
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
    when 'handball' then jsonb_build_array(
      jsonb_build_object('id','role','label','Role','type','select','options',jsonb_build_array('Gardien','Ailier','Arriere','Demi-centre','Pivot'),'priority',1),
      jsonb_build_object('id','goals','label','Buts','type','number','min',0,'max',40,'step',1,'chart',true,'aggregate','sum','priority',2),
      jsonb_build_object('id','shots','label','Tirs','type','number','min',0,'max',60,'step',1,'chart',true,'aggregate','sum','priority',3),
      jsonb_build_object('id','assists','label','Passes decisives','type','number','min',0,'max',30,'step',1,'chart',true,'aggregate','sum','priority',4),
      jsonb_build_object('id','defensive_stops','label','Stops defensifs','type','number','min',0,'max',50,'step',1,'chart',true,'aggregate','sum','priority',5),
      jsonb_build_object('id','saves','label','Arrets gardien','type','number','min',0,'max',60,'step',1,'chart',true,'aggregate','sum','priority',6,'visibleWhen',jsonb_build_object('field','role','equals','Gardien'))
    )
    when 'rugby' then jsonb_build_array(
      jsonb_build_object('id','role','label','Role','type','select','options',jsonb_build_array('Avant','Demi','Centre','Ailier','Arriere'),'priority',1),
      jsonb_build_object('id','tries','label','Essais','type','number','min',0,'max',10,'step',1,'chart',true,'aggregate','sum','priority',2),
      jsonb_build_object('id','carries','label','Ballons portes','type','number','min',0,'max',80,'step',1,'chart',true,'aggregate','sum','priority',3),
      jsonb_build_object('id','meters_carried','label','Metres gagnes','type','number','unit','m','min',0,'max',1000,'step',1,'chart',true,'aggregate','sum','priority',4),
      jsonb_build_object('id','tackles','label','Plaquages','type','number','min',0,'max',80,'step',1,'chart',true,'aggregate','sum','priority',5),
      jsonb_build_object('id','turnovers_won','label','Turnovers gagnes','type','number','min',0,'max',30,'step',1,'chart',true,'aggregate','sum','priority',6)
    )
    when 'volleyball' then jsonb_build_array(
      jsonb_build_object('id','role','label','Role','type','select','options',jsonb_build_array('Passeur','Receptionneur','Central','Pointu','Libero'),'priority',1),
      jsonb_build_object('id','kills','label','Attaques gagnantes','type','number','min',0,'max',80,'step',1,'chart',true,'aggregate','sum','priority',2),
      jsonb_build_object('id','aces','label','Aces','type','number','min',0,'max',30,'step',1,'chart',true,'aggregate','sum','priority',3),
      jsonb_build_object('id','blocks','label','Blocs','type','number','min',0,'max',40,'step',1,'chart',true,'aggregate','sum','priority',4),
      jsonb_build_object('id','digs','label','Defenses relevees','type','number','min',0,'max',100,'step',1,'chart',true,'aggregate','sum','priority',5),
      jsonb_build_object('id','serve_errors','label','Fautes service','type','number','min',0,'max',30,'step',1,'chart',true,'aggregate','sum','priority',6,'higherIsBetter',false)
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
    when 'racket_fast' then jsonb_build_array(
      jsonb_build_object('id','match_result','label','Resultat','type','select','options',jsonb_build_array('Victoire','Defaite','Nul','Entrainement'),'priority',1),
      jsonb_build_object('id','sets_won','label','Sets gagnes','type','number','min',0,'max',10,'step',1,'chart',true,'aggregate','sum','priority',2),
      jsonb_build_object('id','direct_points','label','Points directs','type','number','min',0,'max',120,'step',1,'chart',true,'aggregate','sum','priority',3),
      jsonb_build_object('id','rally_quality_score','label','Qualite echanges','type','number','min',1,'max',10,'step',1,'chart',true,'aggregate','avg','priority',4),
      jsonb_build_object('id','unforced_errors','label','Fautes directes','type','number','min',0,'max',160,'step',1,'chart',true,'aggregate','sum','priority',5,'higherIsBetter',false)
    )
    when 'padel' then jsonb_build_array(
      jsonb_build_object('id','match_result','label','Resultat','type','select','options',jsonb_build_array('Victoire','Defaite','Entrainement'),'priority',1),
      jsonb_build_object('id','sets_won','label','Sets gagnes','type','number','min',0,'max',10,'step',1,'chart',true,'aggregate','sum','priority',2),
      jsonb_build_object('id','break_points','label','Breaks convertis','type','number','min',0,'max',30,'step',1,'chart',true,'aggregate','sum','priority',3),
      jsonb_build_object('id','net_points','label','Points au filet','type','number','min',0,'max',120,'step',1,'chart',true,'aggregate','sum','priority',4),
      jsonb_build_object('id','unforced_errors','label','Fautes directes','type','number','min',0,'max',120,'step',1,'chart',true,'aggregate','sum','priority',5,'higherIsBetter',false)
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
$$;

with profiled as (
  select
    id,
    public.titan_v72_sport_profile(id::text, label::text, category::text, form_type::text) as profile
  from public.sports
)
update public.sports as s
set
  balance_profile = p.profile,
  extra_fields = public.titan_v72_sport_fields(p.profile),
  tracking_summary = public.titan_v72_tracking_summary(p.profile),
  tracking_version = 'v72',
  updated_at = now()
from profiled as p
where s.id = p.id
  and coalesce(s.is_active, true) = true;

grant select on public.sports to anon, authenticated;

notify pgrst, 'reload schema';

commit;
