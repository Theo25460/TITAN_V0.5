begin;

-- TITAN OS v77 - Olympic and Winter Olympic sport catalog coverage.
-- Safe to rerun. Adds missing protocols and tags existing rows with official program metadata.

with seed(
  id, label, category, icon, unit, xp_multiplier, form_type, balance_profile,
  sort_order, official_label, discipline_group, programs, aliases, graphs, headline
) as (
  values
    ('basketball_3x3','Basketball 3x3','team','ri-basketball-line','min',8,'duration','team',770,'3x3 Basketball','Basketball',array['olympic_summer_2028'],array['3x3','streetball'],array['score_for','score_against','decisive_actions'],'Format court: score, roles, actions decisives et pression.'),
    ('archery','Tir a l arc','skill','ri-focus-3-line','min',5,'duration','precision',771,'Archery','Precision',array['olympic_summer_2028'],array['archery','arc'],array['attempts','successful_actions','accuracy'],'Precision: vollee, reussites, pourcentage et serie sous pression.'),
    ('artistic_gymnastics','Gym artistique','skill','ri-medal-line','min',8,'duration','skill',772,'Artistic Gymnastics','Gymnastics',array['olympic_summer_2028'],array['gym artistique','gymnastique artistique'],array['combo_count','execution_quality','successful_actions'],'Routine, execution, difficultes propres et sequences maitrisees.'),
    ('artistic_swimming','Natation artistique','skill','ri-drop-line','min',7,'duration','swimming',773,'Artistic Swimming','Aquatics',array['olympic_summer_2028'],array['synchronisee','synchro'],array['execution_quality','combo_count','mobility_work'],'Synchronisation, routine, souffle, mobilite et qualite technique.'),
    ('athletics','Athletisme','cardio','ri-run-line','min',10,'duration','running',774,'Athletics','Athletics',array['olympic_summer_2028'],array['track and field','piste','stade'],array['intervals','avg_hr','cadence'],'Piste, route, sauts ou lancers: intensite, repetitions et qualite.'),
    ('badminton','Badminton','cardio','ri-ping-pong-line','min',8,'duration','racket',775,'Badminton','Racket',array['olympic_summer_2028'],array['bad'],array['sets_won','aces','unforced_errors'],'Raquette rapide: sets, points directs, fautes et qualite des echanges.'),
    ('baseball','Baseball','team','ri-baseball-line','min',7,'duration','team',776,'Baseball','Baseball/Softball',array['olympic_summer_2028'],array['batting','pitching'],array['score_for','score_against','decisive_actions'],'Batting, defense, score, presence terrain et actions decisives.'),
    ('basketball','Basketball','team','ri-basketball-line','min',8,'duration','team',777,'Basketball','Basketball',array['olympic_summer_2028'],array['basket'],array['score_for','score_against','decisive_actions'],'Scoring, creation, defense, rebond et pertes sous controle.'),
    ('beach_volleyball','Beach Volleyball','team','ri-volleyball-line','min',8,'duration','team',778,'Beach Volleyball','Volleyball',array['olympic_summer_2028'],array['beach volley','volley plage'],array['score_for','score_against','decisive_actions'],'Jeu en paire: service, reception, attaque, bloc et fautes.'),
    ('bmx_freestyle','BMX freestyle','skill','ri-riding-line','min',9,'duration','glide',779,'BMX Freestyle','Cycling',array['olympic_summer_2028'],array['bmx park'],array['tricks','fall_count','execution_quality'],'Runs, figures propres, amplitude, fluidite et chutes.'),
    ('bmx_racing','BMX racing','cardio','ri-riding-line','min',10,'duration','cycling',780,'BMX Racing','Cycling',array['olympic_summer_2028'],array['bmx race'],array['sprints','cadence','execution_quality'],'Depart, sprints, tours, technique de piste et explosivite.'),
    ('boxing','Boxe','combat','ri-boxing-line','min',12,'duration','combat',781,'Boxing','Combat',array['olympic_summer_2028'],array['boxe anglaise'],array['rounds','significant_strikes','execution_quality'],'Rounds, technique, sparring, frappes propres et controle.'),
    ('canoe_slalom','Canoe slalom','skill','ri-ship-2-line','min',10,'duration','water',782,'Canoe Slalom','Canoe',array['olympic_summer_2028'],array['kayak slalom','canoe-kayak slalom'],array['tech_drills','falls','execution_quality'],'Portes, eau vive, penalites, technique et autonomie.'),
    ('canoe_sprint','Canoe sprint','cardio','ri-ship-line','km',35,'gps_full','water',783,'Canoe Sprint','Canoe',array['olympic_summer_2028'],array['kayak sprint','canoe-kayak sprint'],array['tech_drills','avg_power','cadence'],'Distance, cadence, puissance, technique et tenue d effort.'),
    ('sport_climbing','Escalade sportive','skill','ri-landscape-line','min',8,'duration','climbing',784,'Climbing','Sport Climbing',array['olympic_summer_2028'],array['sport climbing','escalade'],array['attempts','successful_routes','fall_count'],'Bloc, voie ou vitesse: essais, niveau, reussites et chutes.'),
    ('cricket','Cricket','team','ri-baseball-line','min',7,'duration','team',785,'Cricket','Cricket',array['olympic_summer_2028'],array['t20'],array['score_for','score_against','decisive_actions'],'Runs, wickets, catches, role et temps de jeu.'),
    ('cycling_road','Cyclisme route','endurance','ri-riding-line','km',40,'gps_full','cycling',786,'Cycling Road','Cycling',array['olympic_summer_2028'],array['velo route','road cycling'],array['avg_power','cadence','elevation'],'Distance, D+, puissance, cadence, terrain et duree active.'),
    ('cycling_track','Cyclisme piste','cardio','ri-timer-flash-line','min',11,'duration','cycling',787,'Cycling Track','Cycling',array['olympic_summer_2028'],array['piste','track cycling'],array['sprints','cadence','avg_power'],'Tours de piste, cadence, sprints, puissance et explosivite.'),
    ('springboard_diving','Plongeon','skill','ri-drop-line','min',7,'duration','skill',788,'Diving','Aquatics',array['olympic_summer_2028'],array['diving','plongeon olympique'],array['execution_quality','successful_actions','attempts'],'Essais, hauteur, execution, entree dans l eau et regularite.'),
    ('equestrian','Equitation','skill','ri-horse-line','min',7,'duration','skill',789,'Equestrian','Equestrian',array['olympic_summer_2028'],array['dressage','jumping','eventing'],array['execution_quality','successful_actions','fall_count'],'Dressage, saut ou complet: precision, controle, fautes et temps.'),
    ('fencing','Escrime','combat','ri-sword-line','min',9,'duration','combat',790,'Fencing','Combat',array['olympic_summer_2028'],array['epee','fleuret','sabre'],array['attempts','successful_actions','accuracy'],'Touches, precision, assauts, deplacements et decision.'),
    ('flag_football','Flag football','team','ri-flag-line','min',9,'duration','team',791,'Flag Football','Football',array['olympic_summer_2028'],array['flag','football americain sans contact'],array['score_for','score_against','decisive_actions'],'Routes, flags, score, role, actions offensives et defensives.'),
    ('football','Football','team','ri-football-line','min',9,'duration','football',792,'Football (Soccer)','Football',array['olympic_summer_2028'],array['soccer'],array['goals','assists','successful_tackles'],'Poste, temps joue, buts, passes, defense et gardien.'),
    ('golf','Golf','skill','ri-flag-line','min',5,'duration','precision',793,'Golf','Precision',array['olympic_summer_2028'],array['putting','drive'],array['attempts','successful_actions','accuracy'],'Trous, precision, coups utiles, pression et regularite.'),
    ('handball','Handball','team','ri-hand-heart-line','min',10,'duration','team',794,'Handball','Team',array['olympic_summer_2028'],array['hand'],array['score_for','score_against','decisive_actions'],'Role, score, tirs, defense, duels et actions decisives.'),
    ('field_hockey','Hockey sur gazon','team','ri-meteor-line','min',10,'duration','team',795,'Hockey','Team',array['olympic_summer_2028'],array['hockey','field hockey'],array['score_for','score_against','decisive_actions'],'Role, score, passes, defense, pressing et decisions.'),
    ('judo','Judo','combat','ri-boxing-line','min',10,'duration','combat',796,'Judo','Combat',array['olympic_summer_2028'],array['ippon'],array['rounds','takedowns','execution_quality'],'Randori, technique, projections, controle et intensite.'),
    ('lacrosse_sixes','Lacrosse sixes','team','ri-team-line','min',10,'duration','team',797,'Lacrosse','Team',array['olympic_summer_2028'],array['lacrosse'],array['score_for','score_against','decisive_actions'],'Format sixes: vitesse, score, transitions et actions decisives.'),
    ('modern_pentathlon','Pentathlon moderne','mixed','ri-compass-3-line','min',12,'duration','mixed',798,'Modern Pentathlon','Multisport',array['olympic_summer_2028'],array['pentathlon'],array['rounds','score','execution_quality'],'Multisport: effort mixte, precision, course, obstacles et score.'),
    ('mountain_bike','VTT olympique','outdoor','ri-riding-line','km',60,'gps_full','cycling',799,'Mountain Bike','Cycling',array['olympic_summer_2028'],array['mtb','vtt'],array['avg_power','cadence','elevation'],'Terrain, distance, D+, puissance, technique et relances.'),
    ('open_water_swimming','Nage eau libre','endurance','ri-drop-line','m',0.6,'gps_simple','swimming',800,'Open Water Swimming','Aquatics',array['olympic_summer_2028'],array['marathon swimming','eau libre'],array['stroke','swolf','avg_hr'],'Distance, conditions, rythme, nage dominante et orientation.'),
    ('rhythmic_gymnastics','Gym rythmique','skill','ri-rhythm-line','min',7,'duration','skill',801,'Rhythmic Gymnastics','Gymnastics',array['olympic_summer_2028'],array['gr','ruban','cerceau'],array['combo_count','execution_quality','mobility_work'],'Routine, engin, coordination, mobilite et execution.'),
    ('rowing','Aviron','endurance','ri-ship-line','km',60,'gps_full','water',802,'Rowing','Rowing',array['olympic_summer_2028'],array['rame','rowing'],array['stroke_rate','avg_power','split_500m'],'Distance, cadence, split, puissance et efficacite.'),
    ('coastal_rowing','Aviron coastal','outdoor','ri-ship-2-line','km',55,'gps_full','water',803,'Rowing Coastal Beach Sprints','Rowing',array['olympic_summer_2028'],array['beach sprints','coastal rowing'],array['stroke_rate','water_state','avg_power'],'Beach sprints: distance, mer, cadence, relance et technique.'),
    ('rugby_sevens','Rugby a 7','team','ri-football-line','min',12,'duration','team',804,'Rugby Sevens','Team',array['olympic_summer_2028'],array['sevens','rugby'],array['score_for','score_against','decisive_actions'],'Format rapide: score, appuis, contacts, defense et actions decisives.'),
    ('sailing','Voile','skill','ri-sailboat-line','min',6,'duration','water',805,'Sailing','Water',array['olympic_summer_2028'],array['sailing'],array['water_state','execution_quality','autonomy'],'Vent, eau, autonomie, technique, manoeuvres et decision.'),
    ('shooting','Tir sportif','skill','ri-focus-3-line','min',4,'duration','precision',806,'Shooting','Precision',array['olympic_summer_2028'],array['shooting','rifle','pistol'],array['attempts','successful_actions','accuracy'],'Tentatives, reussites, precision et serie sous pression.'),
    ('skateboarding','Skateboard','skill','ri-skateboard-line','min',8,'duration','glide',807,'Skateboarding','Urban',array['olympic_summer_2028'],array['skate'],array['tricks','fall_count','execution_quality'],'Runs, tricks propres, chutes, flow et qualite d execution.'),
    ('softball','Softball','team','ri-baseball-line','min',7,'duration','team',808,'Softball','Baseball/Softball',array['olympic_summer_2028'],array['pitching','batting'],array['score_for','score_against','decisive_actions'],'Batting, defense, score, presence terrain et actions decisives.'),
    ('squash','Squash','cardio','ri-ping-pong-line','min',12,'duration','racket',809,'Squash','Racket',array['olympic_summer_2028'],array['squash'],array['sets_won','aces','unforced_errors'],'Jeu intense: sets, points directs, erreurs et qualite des echanges.'),
    ('surfing','Surf','skill','ri-surround-sound-line','min',8,'duration','water',810,'Surfing','Water',array['olympic_summer_2028'],array['surfing'],array['water_state','falls','execution_quality'],'Vagues, conditions, vagues prises, chutes et qualite technique.'),
    ('swimming','Natation','endurance','ri-drop-line','m',0.5,'duration','swimming',811,'Swimming','Aquatics',array['olympic_summer_2028'],array['piscine','swim'],array['stroke','swolf','drills'],'Distance, nage, bassin, educatifs, rythme et efficacite.'),
    ('table_tennis','Tennis de table','skill','ri-ping-pong-line','min',6,'duration','racket',812,'Table Tennis','Racket',array['olympic_summer_2028'],array['ping pong','ping-pong'],array['sets_won','aces','unforced_errors'],'Sets, points directs, rythme, fautes et precision.'),
    ('taekwondo','Taekwondo','combat','ri-boxing-line','min',10,'duration','combat',813,'Taekwondo','Combat',array['olympic_summer_2028'],array['tkd'],array['rounds','significant_strikes','execution_quality'],'Rounds, coups propres, technique, mobilite et controle.'),
    ('tennis','Tennis','cardio','ri-ping-pong-line','min',9,'duration','racket',814,'Tennis','Racket',array['olympic_summer_2028'],array['simple','double'],array['sets_won','aces','unforced_errors'],'Sets, services, points directs, fautes et qualite des echanges.'),
    ('trampoline_gymnastics','Trampoline','skill','ri-bubble-chart-line','min',8,'duration','skill',815,'Trampoline Gymnastics','Gymnastics',array['olympic_summer_2028'],array['trampoline gymnastics'],array['combo_count','execution_quality','fall_count'],'Routine, figures, hauteur, execution et receptions.'),
    ('triathlon','Triathlon','endurance','ri-route-line','km',65,'gps_full','mixed',816,'Triathlon','Multisport',array['olympic_summer_2028'],array['swim bike run'],array['avg_hr','cadence','elevation'],'Natation, velo, course: distance, transitions, duree et intensite.'),
    ('volleyball','Volleyball','team','ri-volleyball-line','min',7,'duration','team',817,'Volleyball','Volleyball',array['olympic_summer_2028'],array['volley'],array['score_for','score_against','decisive_actions'],'Service, reception, attaque, bloc, score et fautes.'),
    ('water_polo','Water-polo','team','ri-drop-line','min',11,'duration','team',818,'Water Polo','Aquatics',array['olympic_summer_2028'],array['water polo'],array['score_for','score_against','decisive_actions'],'Temps de jeu, score, tirs, defense, nage et intensite.'),
    ('weightlifting','Halterophilie','force','ri-bar-chart-horizontal-fill','kg',12,'builder_gym','strength',819,'Weightlifting','Strength',array['olympic_summer_2028'],array['weightlifting','haltero'],array['top_set_weight','record_attempt','execution_quality'],'Arrache/epaule-jete, top set, technique, charge et tentative record.'),
    ('wrestling','Lutte','combat','ri-boxing-line','min',12,'duration','combat',820,'Wrestling','Combat',array['olympic_summer_2028'],array['greco roman','freestyle wrestling'],array['rounds','takedowns','execution_quality'],'Lutte libre ou greco-romaine: rounds, projections, controle et intensite.'),
    ('alpine_skiing','Ski alpin','outdoor','ri-snowflake-line','km',20,'gps_full','glide',830,'Alpine Skiing','Winter',array['olympic_winter_2026'],array['ski','slalom','descente'],array['runs','surface_state','fall_count'],'Descentes, neige, vitesse, surface, D- utile et chutes.'),
    ('biathlon','Biathlon','outdoor','ri-focus-3-line','km',58,'gps_full','glide',831,'Biathlon','Winter',array['olympic_winter_2026'],array['ski tir'],array['accuracy','avg_hr','elevation'],'Ski de fond + tir: distance, rythme, precision et recuperation.'),
    ('bobsleigh','Bobsleigh','skill','ri-snowy-line','min',8,'duration','glide',832,'Bobsleigh','Winter',array['olympic_winter_2026'],array['bob'],array['runs','execution_quality','fall_count'],'Poussees, trajectoires, runs, vitesse et execution.'),
    ('cross_country_skiing','Ski de fond','outdoor','ri-snowy-line','km',60,'gps_full','glide',833,'Cross-Country Skiing','Winter',array['olympic_winter_2026'],array['cross country ski','nordic ski'],array['avg_hr','cadence','elevation'],'Distance, D+, rythme, style classique/skating et endurance.'),
    ('curling','Curling','skill','ri-snowy-line','min',5,'duration','precision',834,'Curling','Winter',array['olympic_winter_2026'],array['curl'],array['attempts','successful_actions','accuracy'],'Lancers, balayage, precision, strategie et serie sous pression.'),
    ('figure_skating','Patinage artistique','skill','ri-snowy-line','min',8,'duration','glide',835,'Figure Skating','Winter',array['olympic_winter_2026'],array['figure skating'],array['combo_count','execution_quality','fall_count'],'Programme, sauts, pirouettes, execution et chutes.'),
    ('freestyle_skiing','Ski freestyle','skill','ri-snowflake-line','min',10,'duration','glide',836,'Freestyle Skiing','Winter',array['olympic_winter_2026'],array['moguls','aerials','slopestyle'],array['tricks','runs','fall_count'],'Runs, modules, figures, reception, surface et chutes.'),
    ('ice_hockey','Hockey sur glace','team','ri-snowy-line','min',12,'duration','team',837,'Ice Hockey','Winter',array['olympic_winter_2026'],array['hockey glace'],array['score_for','score_against','decisive_actions'],'Temps de jeu, poste, score, transitions, defense et intensite.'),
    ('luge','Luge','skill','ri-snowy-line','min',7,'duration','glide',838,'Luge','Winter',array['olympic_winter_2026'],array['luge'],array['runs','execution_quality','fall_count'],'Runs, trajectoire, depart, vitesse et regularite technique.'),
    ('nordic_combined','Combine nordique','outdoor','ri-snowy-line','km',62,'gps_full','glide',839,'Nordic Combined','Winter',array['olympic_winter_2026'],array['nordic combined'],array['avg_hr','runs','elevation'],'Saut a ski + fond: distance, sauts, rythme et transition.'),
    ('short_track_speed_skating','Short track','cardio','ri-timer-flash-line','min',11,'duration','glide',840,'Short Track Speed Skating','Winter',array['olympic_winter_2026'],array['short track speed skating'],array['sprints','cadence','fall_count'],'Tours courts, vitesse, depassements, appuis et chutes.'),
    ('skeleton','Skeleton','skill','ri-snowy-line','min',8,'duration','glide',841,'Skeleton','Winter',array['olympic_winter_2026'],array['skeleton'],array['runs','execution_quality','fall_count'],'Depart, trajectoire, runs, vitesse et precision.'),
    ('ski_jumping','Saut a ski','skill','ri-flight-takeoff-line','min',8,'duration','glide',842,'Ski Jumping','Winter',array['olympic_winter_2026'],array['ski jumping'],array['attempts','execution_quality','fall_count'],'Sauts, reception, controle aerien, engagement et regularite.'),
    ('ski_mountaineering','Ski alpinisme','outdoor','ri-mountain-line','km',65,'gps_full','glide',843,'Ski Mountaineering','Winter',array['olympic_winter_2026'],array['skimo','ski rando'],array['elevation','avg_hr','surface_state'],'Montee, D+, transition, neige, descente et autonomie.'),
    ('snowboard','Snowboard','outdoor','ri-snowy-line','km',20,'gps_full','glide',844,'Snowboard','Winter',array['olympic_winter_2026'],array['snow'],array['runs','tricks','fall_count'],'Runs, neige, figures, surface, descente et chutes.'),
    ('speed_skating','Patinage de vitesse','cardio','ri-timer-flash-line','min',10,'duration','glide',845,'Speed Skating','Winter',array['olympic_winter_2026'],array['speed skating'],array['sprints','cadence','avg_hr'],'Tours, vitesse, cadence, appuis, rythme et puissance.')
)
insert into public.sports (
  id, label, category, icon, unit, xp_multiplier, form_type,
  balance_profile, tracking_summary, tracking_version, is_active,
  slug, name, description, sort_order, updated_at
)
select
  id,
  label,
  category,
  icon,
  unit,
  xp_multiplier,
  form_type,
  balance_profile,
  jsonb_build_object(
    'headline', headline,
    'graphs', to_jsonb(graphs),
    'aliases', to_jsonb(aliases),
    'programs', to_jsonb(programs),
    'officialLabel', official_label,
    'disciplineGroup', discipline_group
  ),
  'v77-olympic',
  true,
  id,
  label,
  headline,
  sort_order,
  now()
from seed
on conflict (id) do update
set
  label = coalesce(nullif(public.sports.label, ''), excluded.label),
  category = excluded.category,
  icon = excluded.icon,
  unit = excluded.unit,
  xp_multiplier = excluded.xp_multiplier,
  form_type = excluded.form_type,
  balance_profile = excluded.balance_profile,
  tracking_summary = coalesce(public.sports.tracking_summary, '{}'::jsonb) || excluded.tracking_summary,
  tracking_version = excluded.tracking_version,
  is_active = true,
  slug = coalesce(public.sports.slug, excluded.slug),
  name = coalesce(public.sports.name, excluded.name),
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

grant select on public.sports to anon, authenticated;

commit;
