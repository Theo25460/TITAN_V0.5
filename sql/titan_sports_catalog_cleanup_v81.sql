begin;

-- TITAN OS v81 - Sports catalog cleanup.
-- Goals:
-- - keep one visible entry per obvious duplicate family;
-- - complete readable tracking metadata for every sport;
-- - add 20 useful non-duplicate sports.

with duplicate_map(old_id, canonical_id) as (
    values
        ('mtb', 'mountain_bike'),
        ('beach_volley', 'beach_volleyball'),
        ('soccer', 'football'),
        ('horse_riding', 'equestrian'),
        ('hockey_field', 'field_hockey'),
        ('hockey_ice', 'ice_hockey'),
        ('open_water', 'open_water_swimming'),
        ('skate', 'skateboarding'),
        ('ski', 'alpine_skiing'),
        ('cross_country_ski', 'cross_country_skiing'),
        ('haltero', 'weightlifting')
)
update public.sports s
set
    is_active = false,
    tracking_summary = coalesce(s.tracking_summary, '{}'::jsonb)
        || jsonb_build_object(
            'mergedInto', d.canonical_id,
            'hiddenReason', 'duplicate_catalog_entry',
            'legacyLabel', s.label
        ),
    updated_at = now()
from duplicate_map d
where s.id = d.old_id;

with polish(id, label, name, description, headline, aliases, graphs, sort_order) as (
    values
        ('mountain_bike', 'VTT', 'VTT', 'Sortie VTT: terrain, denivele, pilotage, relances et temps utile.', 'Terrain, D+, pilotage, relances et temps utile.', array['vtt','mtb','mountain bike','vtt olympique'], array['elevation','technical_sections','descents','avg_power'], 799),
        ('beach_volleyball', 'Beach volley', 'Beach volley', 'Jeu sur sable: service, reception, attaque, bloc et regularite.', 'Service, reception, attaque, bloc et fautes utiles.', array['beach volley','volley plage'], array['score_for','score_against','decisive_actions'], 778),
        ('football', 'Football', 'Football', 'Match ou entrainement: poste, volume de jeu, courses, duels et actions decisives.', 'Poste, volume de jeu, duels, creation et finition.', array['soccer','foot'], array['goals','assists','successful_tackles','minutes_played'], 792),
        ('equestrian', 'Equitation', 'Equitation', 'Seance a cheval: discipline, controle, precision, fautes et qualite des passages.', 'Controle, precision, discipline, fautes et temps utile.', array['cheval','dressage','jumping','eventing'], array['execution_quality','successful_actions','fall_count'], 789),
        ('field_hockey', 'Hockey sur gazon', 'Hockey sur gazon', 'Hockey sur gazon: pressing, passes, defense, score et decisions rapides.', 'Pressing, passes, defense, score et decisions.', array['hockey gazon','field hockey'], array['score_for','score_against','decisive_actions'], 795),
        ('ice_hockey', 'Hockey sur glace', 'Hockey sur glace', 'Hockey sur glace: temps de jeu, transitions, tirs, defense et intensite.', 'Temps de jeu, transitions, tirs, defense et intensite.', array['hockey glace'], array['score_for','score_against','decisive_actions'], 837),
        ('open_water_swimming', 'Nage eau libre', 'Nage eau libre', 'Nage hors bassin: distance, conditions, orientation, allure et regularite.', 'Distance, conditions, orientation, allure et regularite.', array['open water','eau libre'], array['stroke','swolf','avg_hr','water_state'], 800),
        ('skateboarding', 'Skateboard', 'Skateboard', 'Session skate: runs, tricks propres, chutes, flow et progression technique.', 'Runs, tricks propres, chutes, flow et progression.', array['skate','skateboard'], array['tricks','fall_count','execution_quality'], 807),
        ('alpine_skiing', 'Ski alpin', 'Ski alpin', 'Ski alpin: descentes, neige, vitesse, surface, D- et maitrise.', 'Descentes, neige, vitesse, surface et maitrise.', array['ski','slalom','descente'], array['runs','surface_state','fall_count'], 830),
        ('cross_country_skiing', 'Ski de fond', 'Ski de fond', 'Ski de fond: distance, D+, rythme, technique classique/skating et endurance.', 'Distance, D+, rythme, technique et endurance.', array['ski fond','nordic ski','cross country ski'], array['avg_hr','cadence','elevation'], 833),
        ('weightlifting', 'Halterophilie', 'Halterophilie', 'Halterophilie: arrache, epaule-jete, top set, charge et qualite technique.', 'Arrache, epaule-jete, top set, charge et technique.', array['haltero','weightlifting'], array['top_set_weight','record_attempt','execution_quality'], 819)
)
update public.sports s
set
    label = p.label,
    name = p.name,
    description = p.description,
    sort_order = p.sort_order,
    tracking_summary = coalesce(s.tracking_summary, '{}'::jsonb)
        || jsonb_build_object(
            'headline', p.headline,
            'aliases', to_jsonb(p.aliases),
            'graphs', to_jsonb(p.graphs),
            'catalogPolish', 'v81'
        ),
    updated_at = now()
from polish p
where s.id = p.id;

with seed(
    id, label, category, icon, unit, xp_multiplier, form_type,
    balance_profile, sort_order, headline, aliases, graphs, description
) as (
    values
        ('duathlon','Duathlon','endurance','ri-route-line','km',52,'gps_full','mixed',900,'Course + velo: distance, transitions, allure et regularite.',array['run bike run'],array['avg_hr','cadence','elevation'],'Enchainement course/velo/course, utile pour suivre transitions, distance et gestion de rythme.'),
        ('aquathlon','Aquathlon','endurance','ri-drop-line','km',48,'gps_simple','mixed',901,'Natation + course: distance, transitions, souffle et allure.',array['swim run'],array['stroke','avg_hr','cadence'],'Format natation puis course, simple a noter pour travailler souffle et transitions.'),
        ('swimrun','Swimrun','outdoor','ri-route-line','km',58,'gps_full','mixed',902,'Alternance nage/course: segments, conditions, transitions et endurance.',array['swim run outdoor'],array['water_state','avg_hr','elevation'],'Sortie enchainant nage et course en exterieur, avec conditions et transitions.'),
        ('obstacle_course','Course obstacles','cardio','ri-speed-up-line','km',65,'gps_full','mixed',903,'OCR: distance, obstacles passes, penalites, portages et rythme.',array['ocr','spartan','mud run'],array['successful_actions','errors','elevation'],'Course avec obstacles, portages et franchissements, plus lisible qu une course classique.'),
        ('rucking','Rucking','outdoor','ri-walk-line','km',58,'gps_full','hiking',904,'Marche chargee: distance, poids porte, D+, allure et posture.',array['marche chargee','ruck march'],array['elevation','load_kg','avg_hr'],'Marche avec sac charge, entre endurance, force lente et discipline mentale.'),
        ('stair_climbing','Montee escaliers','cardio','ri-stairs-line','min',12,'duration','speed',905,'Escaliers: duree, etages, relances, souffle et recuperation.',array['stairs','escaliers'],array['fast_reps','elevation','avg_hr'],'Travail court ou long en escaliers, pratique pour cardio et jambes.'),
        ('handbike','Handbike','endurance','ri-riding-line','km',38,'gps_full','cycling',906,'Handbike: distance, cadence, puissance bras et endurance.',array['handcycle'],array['avg_power','cadence','avg_hr'],'Cyclisme a bras, suivi par distance, cadence et intensite.'),
        ('wheelchair_basketball','Basket fauteuil','team','ri-basketball-line','min',8,'duration','team',907,'Basket fauteuil: temps de jeu, score, defense et creation.',array['basket fauteuil'],array['score_for','score_against','decisive_actions'],'Basket adapte, centre sur temps utile, role et actions decisives.'),
        ('para_swimming','Para natation','endurance','ri-drop-line','m',0.5,'duration','swimming',908,'Para natation: distance, nage, rythme, souffle et efficacite.',array['para swimming'],array['stroke','swolf','drills'],'Natation adaptee, avec les memes reperes simples que la nage bassin.'),
        ('para_athletics','Para athletisme','cardio','ri-run-line','min',10,'duration','running',909,'Para athletisme: discipline, repetitions, rythme et qualite.',array['para athletics'],array['intervals','avg_hr','cadence'],'Piste, route, sauts ou lancers adaptes, sans noyer dans les details.'),
        ('dragon_boat','Dragon boat','team','ri-ship-line','km',45,'gps_full','water',910,'Dragon boat: distance, cadence, equipage, relances et rythme.',array['dragonboat'],array['stroke_rate','avg_power','water_state'],'Bateau collectif, bon pour cadence, synchronisation et endurance.'),
        ('netball','Netball','team','ri-basketball-line','min',8,'duration','team',911,'Netball: poste, passes, interceptions, score et lucidite.',array['net ball'],array['score_for','score_against','decisive_actions'],'Sport collectif proche du basket, suivi par role et actions propres.'),
        ('korfball','Korfball','team','ri-team-line','min',8,'duration','team',912,'Korfball: tirs, passes, defense, score et rotation.',array['korf'],array['score_for','score_against','decisive_actions'],'Sport mixte collectif, lisible par score, role et decisions.'),
        ('floorball','Floorball','team','ri-meteor-line','min',10,'duration','team',913,'Floorball: transitions, tirs, defense, score et intensite.',array['unihockey'],array['score_for','score_against','decisive_actions'],'Hockey indoor rapide, parfait pour volume de jeu et transitions.'),
        ('inline_hockey','Roller hockey','team','ri-skateboard-line','min',11,'duration','team',914,'Roller hockey: patinage, tirs, transitions, defense et score.',array['inline hockey'],array['score_for','score_against','decisive_actions'],'Hockey sur rollers, suivi comme sport collectif intense et technique.'),
        ('roller_derby','Roller derby','team','ri-skateboard-line','min',12,'duration','team',915,'Roller derby: jams, blocages, relances, score et impact.',array['derby'],array['rounds','decisive_actions','fall_count'],'Sport de contact sur rollers, entre cardio, placement et impact.'),
        ('lifesaving_sport','Sauvetage sportif','mixed','ri-lifebuoy-line','min',10,'duration','water',916,'Sauvetage sportif: nage, portage, technique, vitesse et precision.',array['lifesaving'],array['stroke','successful_actions','best_time'],'Discipline aquatique mixte, utile pour technique, vitesse et resistance.'),
        ('freediving','Apnee','skill','ri-drop-line','min',4,'duration','water',917,'Apnee: duree, relachement, profondeur, securite et recuperation.',array['apnee','freedive'],array['hold_seconds','water_state','recovery'],'Apnee statique ou dynamique, notee prudemment autour du souffle et de la securite.'),
        ('snorkeling','Snorkeling','zen','ri-drop-line','min',4,'duration','water',918,'Snorkeling: temps dans l eau, aisance, conditions et mobilite.',array['palmes masque tuba'],array['water_state','mobility_work','avg_hr'],'Sortie aquatique douce, utile pour mobilite, souffle et aisance.'),
        ('roller_ski','Ski-roues','endurance','ri-road-map-line','km',55,'gps_full','glide',919,'Ski-roues: distance, cadence, D+, appuis et endurance.',array['ski roues','rollerski'],array['avg_hr','cadence','elevation'],'Ski nordique hors neige, propre pour suivre cadence, appuis et volume.')
)
insert into public.sports (
    id, label, category, icon, unit, xp_multiplier, form_type,
    balance_profile, tracking_summary, tracking_version, is_active,
    slug, name, description, sort_order, updated_at
)
select
    id, label, category, icon, unit, xp_multiplier, form_type,
    balance_profile,
    jsonb_build_object(
        'headline', headline,
        'aliases', to_jsonb(aliases),
        'graphs', to_jsonb(graphs),
        'disciplineGroup', balance_profile,
        'catalogPolish', 'v81'
    ),
    'v81-catalog-cleanup',
    true,
    id,
    label,
    description,
    sort_order,
    now()
from seed
on conflict (id) do update
set
    label = excluded.label,
    category = excluded.category,
    icon = excluded.icon,
    unit = excluded.unit,
    xp_multiplier = excluded.xp_multiplier,
    form_type = excluded.form_type,
    balance_profile = excluded.balance_profile,
    tracking_summary = coalesce(public.sports.tracking_summary, '{}'::jsonb) || excluded.tracking_summary,
    tracking_version = excluded.tracking_version,
    is_active = true,
    slug = excluded.slug,
    name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    updated_at = now();

update public.sports
set
    slug = coalesce(nullif(slug, ''), id),
    name = coalesce(nullif(name, ''), label),
    description = coalesce(
        nullif(btrim(description), ''),
        nullif(btrim(tracking_summary ->> 'headline'), ''),
        label || ': suivi simple de la duree, de l intensite et du ressenti.'
    ),
    tracking_summary = coalesce(tracking_summary, '{}'::jsonb)
        || jsonb_build_object(
            'headline', coalesce(nullif(btrim(tracking_summary ->> 'headline'), ''), label || ': duree, intensite et ressenti.'),
            'catalogPolish', 'v81'
        ),
    required_fields = case
        when required_fields is null or required_fields = '{}'::jsonb then jsonb_build_object(
            'primary', unit,
            'durationMinutes', case when unit = 'min' then 'primary' else 'recommended' end,
            'notes', 'optional',
            'rpe', 'recommended'
        )
        else required_fields
    end,
    xp_formula = case
        when xp_formula is null or xp_formula = '{}'::jsonb then jsonb_build_object(
            'authority', 'server_rpc',
            'basis', 'primary_value_duration_and_rpe',
            'unit', unit,
            'multiplier', xp_multiplier,
            'cap', 'weekly_user_cap'
        )
        else xp_formula
    end,
    credits_formula = case
        when credits_formula is null or credits_formula = '{}'::jsonb then jsonb_build_object(
            'authority', 'server_rpc',
            'basis', 'bounded_training_reward',
            'unit', unit,
            'cap', 'weekly_user_cap'
        )
        else credits_formula
    end,
    suspicious_rules = case
        when suspicious_rules is null or suspicious_rules = '{}'::jsonb then jsonb_build_object(
            'review', 'server_side_bounds_apply',
            'maxDurationMinutes', case
                when category in ('zen','skill') then 240
                when form_type like 'gps%' then 720
                else 360
            end,
            'maxPrimaryPerSession', case
                when unit = 'km' then 250
                when unit = 'm' then 20000
                when unit = 'kg' then 10000
                when unit = 'reps' then 3000
                else 720
            end
        )
        else suspicious_rules
    end,
    updated_at = now();

notify pgrst, 'reload schema';

commit;
