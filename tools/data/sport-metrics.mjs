// Authoring source for V11-09R. Explicit discipline groups, never a generic fallback.
// Old IDs remain readable in the optional section. All new measures are optional.
import { readFileSync } from 'node:fs';
export const baseline = JSON.parse(readFileSync(new URL('./sport-metrics-baseline.json', import.meta.url)));
const n = (id, label, unit = '', max = 1000, step = 1, aggregate = 'sum') => ({ id, label, type: 'number', unit, min: 0, max, step, chart: true, aggregate });
const s = (id, label, options) => ({ id, label, type: 'select', options: options.split('|') });
const hr = n('avg_hr', 'Fréquence cardiaque moyenne', 'bpm', 240, 1, 'avg');
const cadence = n('cadence', 'Cadence moyenne', 'tr/min', 220, 1, 'avg');
const power = n('avg_power', 'Puissance moyenne', 'W', 2500, 1, 'avg');
const ascent = n('elevation', 'Dénivelé positif', 'm', 12000);
const descent = n('descent_m', 'Dénivelé négatif', 'm', 20000);
const played = n('minutes_played', 'Temps de jeu effectif', 'min', 360);
const score = [n('score_for', 'Score de ton équipe', 'points', 300), n('score_against', 'Score adverse', 'points', 300)];
const goals = n('goals', 'Buts marqués', '', 100);
const assists = n('assists', 'Passes décisives', '', 100);
const sets = [n('sets_won', 'Sets gagnés', '', 30), n('sets_lost', 'Sets perdus', '', 30)];
const rounds = n('rounds', 'Rounds travaillés', '', 100);
const roundTime = n('round_duration_s', 'Durée d’un round', 's', 1800, 5, 'avg');
const routines = n('routines', 'Enchaînements travaillés', '', 100);
const landings = n('landings', 'Réceptions maîtrisées', '', 500);
const matches = [n('bouts', 'Combats / oppositions', '', 100), n('wins', 'Victoires', '', 100)];
const map = new Map();
function group(ids, fields, family) {
  for (const id of ids.split(' ')) {
    if (map.has(id)) throw new Error(`Duplicate discipline assignment: ${id}`);
    map.set(id, { family, fields });
  }
}

group('cycling cycling_road gravel mountain_bike velotaf cyclocross para_cycling handbike', [cadence, power, descent, hr, s('surface', 'Terrain', 'Route|Chemin roulant|Sentier technique|Mixte'), n('max_power', 'Puissance maximale', 'W', 3500, 1, 'max')], 'cyclisme');
group('cycling_indoor spinning', [cadence, power, hr, n('resistance', 'Résistance machine', '', 100, 1, 'avg')], 'cyclisme intérieur');
group('cycling_track', [n('laps', 'Tours de piste', '', 1000), n('best_lap_s', 'Meilleur tour', 's', 600, 0.01, 'min'), power, cadence, s('event', 'Épreuve', 'Poursuite|Vitesse|Keirin|Course aux points|Entraînement')], 'piste');
group('bmx_racing', [n('runs', 'Manches courues', '', 100), n('best_run_s', 'Meilleure manche', 's', 600, 0.01, 'min'), n('starts', 'Départs travaillés', '', 100)], 'BMX course');
group('bmx bmx_freestyle artistic_cycling', [n('tricks', 'Figures réussies', '', 500), n('attempts', 'Tentatives', '', 1000), routines, n('falls', 'Chutes', '', 100)], 'cyclisme technique');
group('running treadmill race_walking walking nordic_walk', [n('cadence', 'Cadence de pas', 'pas/min', 300, 1, 'avg'), hr, n('intervals', 'Fractions réalisées', '', 200), n('work_time', 'Temps des fractions', 'min', 600, 0.1), n('recovery_min', 'Récupération entre fractions', 'min', 60, 0.1, 'avg')], 'course et marche');
group('trail fell_running hiking trekking rucking alpinism snowshoeing', [descent, n('pack_kg', 'Poids du sac', 'kg', 80, 0.1, 'avg'), hr, s('terrain', 'Terrain', 'Chemin|Sentier|Technique|Neige|Mixte'), n('max_altitude_m', 'Altitude maximale', 'm', 9000, 1, 'max')], 'montagne');
group('orienteering rogaining ski_orienteering', [n('controls', 'Balises trouvées', '', 300), n('controls_missed', 'Balises manquées', '', 100), n('navigation_errors', 'Erreurs de navigation', '', 100), ascent, hr], 'orientation');
group('sprint hurdles', [n('repetitions', 'Courses réalisées', '', 200), n('rep_distance_m', 'Distance d’une répétition', 'm', 5000, 1, 'avg'), n('best_time_s', 'Meilleur temps', 's', 3600, 0.01, 'min'), n('recovery_s', 'Repos entre courses', 's', 1800, 5, 'avg')], 'vitesse');
group('athletics para_athletics', [s('event', 'Discipline', 'Course|Saut|Lancer|Épreuves combinées'), n('attempts', 'Essais / répétitions', '', 200), n('best_distance_m', 'Meilleure distance', 'm', 100, 0.01, 'max'), n('best_time_s', 'Meilleur temps', 's', 86400, 0.01, 'min')], 'athlétisme');
group('swimming para_swimming finswimming open_water_swimming', [s('stroke', 'Nage', 'Crawl|Dos|Brasse|Papillon|Quatre nages|Palmes|Mixte'), n('intervals', 'Séries réalisées', '', 200), n('stroke_rate', 'Fréquence de bras', 'cycles/min', 150, 1, 'avg'), n('swolf', 'SWOLF mesuré', '', 300, 1, 'avg'), hr], 'natation');
group('artistic_swimming', [routines, n('figures', 'Figures travaillées', '', 200), n('routine_duration_s', 'Durée d’un ballet', 's', 1200, 1, 'avg'), s('format', 'Formation', 'Solo|Duo|Équipe|Combiné')], 'natation artistique');
group('aquagym', [s('equipment', 'Matériel', 'Sans matériel|Frites|Haltères aquatiques|Aquabike|Mixte'), n('work_time', 'Temps actif', 'min', 180), n('sets', 'Séries', '', 100), hr], 'fitness aquatique');
group('diving', [n('max_depth_m', 'Profondeur maximale', 'm', 200, 0.1, 'max'), n('bottom_time_min', 'Temps de fond', 'min', 300), n('dives', 'Immersions', '', 100), s('environment', 'Milieu', 'Mer|Lac|Carrière|Fosse')], 'plongée sous-marine');
group('freediving', [s('discipline', 'Discipline', 'Statique|Dynamique|Poids constant|Immersion libre'), n('max_depth_m', 'Profondeur maximale', 'm', 200, 0.1, 'max'), n('best_hold_s', 'Meilleure apnée', 's', 1200, 1, 'max'), n('distance_m', 'Distance dynamique', 'm', 500, 1, 'max')], 'apnée');
group('snorkeling', [s('environment', 'Milieu', 'Mer|Lac|Lagune'), n('distance_m', 'Distance observée', 'm', 20000), n('max_depth_m', 'Profondeur maximale', 'm', 30, 0.5, 'max')], 'randonnée aquatique');
group('springboard_diving', [n('dives', 'Plongeons', '', 200), s('height', 'Hauteur du plongeoir', '1 m|3 m|5 m|7,5 m|10 m'), n('avg_score', 'Note moyenne', '/10', 10, 0.1, 'avg')], 'plongeon');
group('muscu_gym muscu_home muscu_builder powerlifting weightlifting para_powerlifting kettlebell sandbag trx', [n('rest_seconds', 'Repos moyen entre séries', 's', 1200, 5, 'avg'), s('focus', 'Objectif de séance', 'Force|Hypertrophie|Technique|Endurance musculaire'), n('warmup_sets', 'Séries d’échauffement', '', 50), n('tempo_s', 'Tempo d’une répétition', 's', 60, 0.1, 'avg')], 'musculation');
group('bodyweight abs_session dips pompes tractions squat plank street_workout', [n('rest_seconds', 'Repos moyen entre séries', 's', 1200, 5, 'avg'), n('hold_seconds', 'Meilleur maintien', 's', 3600, 1, 'max'), s('assistance', 'Aide', 'Sans aide|Élastique|Machine|Partenaire'), n('added_weight', 'Lest', 'kg', 200, 0.5, 'max')], 'poids du corps');
group('farmers_walk', [n('load_per_hand', 'Charge par main', 'kg', 300, 0.5, 'max'), n('distance_m', 'Distance portée', 'm', 10000), n('sets', 'Passages', '', 100), n('rest_seconds', 'Repos', 's', 1200, 5, 'avg')], 'portés');
group('strongman highland_games grip_sport arm_wrestling', [s('event', 'Épreuve', 'Porté|Soulevé|Lancer|Préhension|Duel'), n('attempts', 'Essais', '', 100), n('top_load', 'Charge maximale', 'kg', 1000, 0.5, 'max'), n('distance_m', 'Distance de l’épreuve', 'm', 1000, 0.1, 'max'), n('hold_seconds', 'Meilleur maintien', 's', 1200, 1, 'max')], 'force spécifique');
group('tug_of_war', [n('pulls', 'Tirages', '', 100), n('wins', 'Tirages gagnés', '', 100), n('team_size', 'Taille de ton équipe', '', 20), n('round_duration_s', 'Durée moyenne du tirage', 's', 900, 1, 'avg')], 'tir à la corde');
group('climbing bouldering climbing_route sport_climbing ice_climbing via_ferrata', [n('attempts', 'Essais', '', 500), n('successful_routes', 'Blocs / voies réussis', '', 500), n('flashes', 'Réussites au premier essai', '', 200), n('pitches', 'Longueurs grimpées', '', 100), n('approach_min', 'Marche d’approche', 'min', 600)], 'escalade');
group('tennis padel beach_tennis platform_tennis real_tennis wheelchair_tennis', [...sets, n('aces', 'Aces', '', 100), n('double_faults', 'Doubles fautes', '', 200), n('unforced_errors', 'Fautes directes', '', 500), n('first_serve_pct', 'Premières balles', '%', 100, 0.1, 'avg')], 'tennis');
group('badminton table_tennis squash pickleball racquetball racketlon', [...sets, n('direct_points', 'Points gagnants', '', 500), n('unforced_errors', 'Fautes directes', '', 500), n('rallies', 'Échanges joués', '', 2000)], 'raquettes');
group('volleyball beach_volleyball sitting_volleyball futnet sepak_takraw', [...sets, n('attacks', 'Attaques gagnantes', '', 200), n('aces', 'Services gagnants', '', 100), n('blocks', 'Contres', '', 100), n('errors', 'Fautes', '', 200)], 'jeux au filet');
group('football futsal beach_soccer blind_football', [s('position', 'Poste', 'Gardien|Défenseur|Milieu|Attaquant'), played, goals, assists, { ...n('saves', 'Arrêts', '', 100), visibleWhen: { field: 'position', equals: 'Gardien' } }, n('shots', 'Tirs', '', 100), ...score], 'football');
group('basketball basketball_3x3 wheelchair_basketball netball korfball', [played, n('points', 'Points marqués', '', 200), n('rebounds', 'Rebonds', '', 100), assists, n('steals', 'Interceptions', '', 100), n('turnovers', 'Balles perdues', '', 100), ...score], 'basket et paniers');
group('handball beach_handball tchoukball', [played, goals, n('shots', 'Tirs', '', 100), n('saves', 'Arrêts', '', 100), assists, ...score], 'handball');
group('rugby rugby_sevens wheelchair_rugby', [played, n('tries', 'Essais marqués', '', 50), n('tackles', 'Plaquages', '', 100), n('conversions', 'Transformations', '', 30), ...score], 'rugby');
group('american_football flag_football', [played, n('touchdowns', 'Touchdowns', '', 30), n('yards', 'Yards gagnés', 'yd', 2000), n('tackles', 'Plaquages / flags', '', 100), n('interceptions', 'Interceptions', '', 30), ...score], 'football américain');
group('australian_rules_football gaelic_football hurling camogie', [played, goals, n('points', 'Points marqués', '', 100), n('tackles', 'Duels défensifs gagnés', '', 100), ...score], 'jeux gaéliques et australiens');
group('ice_hockey field_hockey inline_hockey floorball bandy ringette underwater_hockey underwater_rugby water_polo canoe_polo lacrosse lacrosse_sixes', [played, goals, assists, n('shots', 'Tirs', '', 100), n('saves', 'Arrêts', '', 100), ...score], 'sports collectifs à buts');
group('baseball softball', [n('innings', 'Manches jouées', '', 30), n('hits', 'Coups sûrs', '', 30), n('runs', 'Points marqués', '', 100), n('at_bats', 'Passages à la batte', '', 50), n('strikeouts', 'Retraits sur prises', '', 50)], 'baseball');
group('cricket', [n('runs_scored', 'Runs marqués', '', 1000), n('wickets', 'Guichets pris', '', 20), n('overs', 'Séries complètes de six balles', '', 100), n('balls_faced', 'Balles affrontées', '', 1000)], 'cricket');
group('ultimate', [played, n('points_scored', 'Points marqués', '', 100), assists, n('turnovers', 'Pertes de disque', '', 100), ...score], 'ultimate');
group('dodgeball goalball kabaddi kho_kho', [played, n('points_scored', 'Points marqués', '', 200), n('successful_defences', 'Défenses réussies', '', 200), ...score], 'jeux collectifs');
group('cycle_ball cycle_polo polo', [played, goals, assists, n('periods', 'Périodes jouées', '', 20), ...score], 'jeux montés');
group('roller_derby', [n('jams', 'Jams joués', '', 100), n('points', 'Points marqués', '', 500), n('penalties', 'Pénalités', '', 50), played], 'roller derby');
group('boxing thaiboxing kickboxing savate', [rounds, roundTime, s('mode', 'Travail', 'Sac|Pattes d’ours|Technique|Sparring|Combat'), n('combinations', 'Combinaisons travaillées', '', 500), hr], 'boxe');
group('mma', [rounds, roundTime, s('mode', 'Travail', 'Pieds-poings|Lutte|Sol|Mixte|Combat'), n('takedowns', 'Amenées au sol', '', 100), n('submissions', 'Soumissions réussies', '', 100)], 'MMA');
group('bjj grappling judo wrestling freestyle_wrestling greco_roman_wrestling sambo sumo', [...matches, n('takedowns', 'Projections / amenées au sol', '', 200), n('escapes', 'Sorties de contrôle', '', 200), n('submissions', 'Soumissions réussies', '', 100), roundTime], 'préhension');
group('aikido hapkido krav_maga kung_fu wushu karate taekwondo capoeira', [n('techniques', 'Techniques travaillées', '', 200), rounds, s('mode', 'Travail', 'Technique|Formes / kata|Opposition|Compétition'), routines, roundTime], 'arts martiaux');
group('fencing kendo arnis_eskrima', [...matches, n('touches', 'Touches marquées', '', 200), n('touches_received', 'Touches reçues', '', 200), s('mode', 'Travail', 'Technique|Assauts|Compétition')], 'armes');
group('golf disc_golf', [n('holes', 'Trous joués', '', 72), n('strokes', 'Coups / lancers', '', 400), n('putts', 'Putts', '', 200), n('penalties', 'Pénalités', '', 100)], 'golf');
group('archery', [n('arrows', 'Flèches tirées', '', 1000), n('distance_m', 'Distance de tir', 'm', 200), n('avg_score', 'Score moyen par flèche', '/10', 10, 0.1, 'avg'), s('bow', 'Arc', 'Classique|Poulies|Arc nu|Traditionnel')], 'tir à l’arc');
group('shooting', [n('shots', 'Tirs effectués', '', 1000), n('distance_m', 'Distance de tir', 'm', 1000), n('score', 'Score de la série', 'points', 2000), s('position', 'Position', 'Debout|Couché|Genou|Mixte')], 'tir sportif');
group('petanque bocce boccia', [n('ends', 'Mènes jouées', '', 100), n('pointing_success', 'Points réussis', '', 300), n('shooting_success', 'Tirs réussis', '', 300), ...score], 'boules');
group('bowling', [n('games', 'Parties jouées', '', 50), n('best_score', 'Meilleur score', 'points', 300, 1, 'max'), n('strikes', 'Strikes', '', 600), n('spares', 'Spares', '', 500)], 'bowling');
group('darts', [n('legs', 'Manches jouées', '', 100), n('avg_3darts', 'Moyenne sur trois fléchettes', 'points', 180, 0.1, 'avg'), n('checkout_pct', 'Taux de finition', '%', 100, 0.1, 'avg')], 'fléchettes');
group('billiards_pool snooker', [n('frames', 'Manches jouées', '', 100), n('frames_won', 'Manches gagnées', '', 100), n('best_break', 'Meilleure série', 'points', 200, 1, 'max'), n('safety_shots', 'Coups de défense', '', 300)], 'billard');
group('croquet curling', [n('ends', 'Manches jouées', '', 100), n('shots', 'Coups joués', '', 500), n('successful_shots', 'Coups réussis', '', 500), ...score], 'précision');
group('yoga', [s('style', 'Style', 'Hatha|Vinyasa|Ashtanga|Yin|Restauratif|Autre'), n('poses', 'Postures travaillées', '', 100), n('breath_minutes', 'Travail respiratoire', 'min', 120), s('focus', 'Zone travaillée', 'Corps entier|Dos|Hanches|Épaules|Équilibre')], 'yoga');
group('pilates yoga_mobility stretching qigong taichi', [s('focus', 'Zone / travail', 'Corps entier|Dos|Hanches|Épaules|Équilibre|Respiration'), n('movements', 'Mouvements travaillés', '', 200), n('hold_seconds', 'Durée des maintiens', 's', 600, 5, 'avg'), s('equipment', 'Matériel', 'Sans matériel|Tapis|Élastique|Reformer|Autre')], 'mobilité');
group('dance ballet hiphop salsa zumba pole_dance breakdance', [routines, n('moves', 'Pas / figures travaillés', '', 200), s('work', 'Travail', 'Technique|Chorégraphie|Improvisation|Répétition|Scène'), n('practice_minutes', 'Temps de pratique active', 'min', 360)], 'danse');
group('gymnastics artistic_gymnastics acrobatic_gymnastics aerobic_gymnastics rhythmic_gymnastics trampoline_gymnastics cheerleading circus', [s('apparatus', 'Agrès / spécialité', 'Sol|Saut|Barres|Anneaux|Poutre|Trampoline|Engin|Portés|Aérien|Autre'), routines, landings, n('falls', 'Chutes / pertes d’engin', '', 100)], 'gymnastique');
group('parkour skateboarding', [n('tricks', 'Figures / franchissements réussis', '', 500), n('attempts', 'Tentatives', '', 1000), landings, n('lines', 'Enchaînements complets', '', 100)], 'franchissement');
group('crossfit hiit hyrox fitness_class elliptical stair_climbing rope_jump', [rounds, n('work_time', 'Temps de travail actif', 'min', 600, 0.1), n('rest_seconds', 'Repos moyen', 's', 1200, 5, 'avg'), n('repetitions', 'Répétitions', '', 10000), hr], 'conditionnement');
group('triathlon duathlon aquathlon swimrun adventure_racing modern_pentathlon obstacle_course lifesaving_sport', [n('run_km', 'Distance courue', 'km', 300, 0.01), n('swim_m', 'Distance nagée', 'm', 50000), n('bike_km', 'Distance à vélo', 'km', 1000, 0.01), n('transitions_s', 'Temps de transition', 's', 7200), n('obstacles', 'Obstacles franchis', '', 500)], 'multisport');
group('rowing rowing_machine coastal_rowing kayak canoe_sprint outrigger_canoe dragon_boat surfski paddle', [n('stroke_rate', 'Cadence de coups', 'coups/min', 150, 1, 'avg'), n('intervals', 'Séries réalisées', '', 200), hr, s('water', 'Plan d’eau', 'Lac|Rivière|Mer|Bassin|En salle'), n('avg_power', 'Puissance moyenne', 'W', 2000, 1, 'avg')], 'rame et pagaie');
group('canoe_slalom rafting canyoning', [n('rapids', 'Rapides / passages', '', 200), n('gates', 'Portes franchies', '', 200), n('penalties', 'Pénalités', 's', 10000), s('difficulty', 'Difficulté', 'I|II|III|IV|V|VI')], 'eau vive');
group('surfing bodyboarding skimboarding', [n('waves', 'Vagues prises', '', 300), n('wave_height_m', 'Taille des vagues', 'm', 20, 0.1, 'avg'), n('rides', 'Glisses réussies', '', 300), n('tricks', 'Figures réussies', '', 300)], 'surf');
group('sailing windsurf kitesurf', [n('wind_kt', 'Vent moyen', 'nds', 80, 1, 'avg'), n('distance_nm', 'Distance nautique', 'NM', 1000, 0.1), n('maneuvers', 'Manœuvres réussies', '', 500), n('planing_minutes', 'Temps en glisse', 'min', 1440)], 'voile');
group('wakeboard water_skiing', [n('laps', 'Passages', '', 100), n('tricks', 'Figures / portes réussies', '', 500), n('falls', 'Chutes', '', 100), n('tow_speed_kmh', 'Vitesse de traction', 'km/h', 100, 0.1, 'avg')], 'glisse tractée');
group('alpine_skiing snowboard telemark_skiing freestyle_skiing', [n('runs', 'Descentes', '', 100), n('vertical_m', 'Dénivelé descendu', 'm', 30000), s('snow', 'Neige', 'Poudreuse|Damée|Dure|Transformée|Mixte'), n('tricks', 'Figures réussies', '', 500)], 'ski et snowboard');
group('cross_country_skiing ski_touring ski_mountaineering roller_ski', [ascent, descent, hr, s('technique', 'Technique', 'Classique|Skating|Alternatif|Mixte')], 'ski endurance');
group('biathlon nordic_combined', [n('distance_km', 'Distance skiée', 'km', 200, 0.01), n('targets_hit', 'Cibles touchées', '', 100), n('shots', 'Tirs effectués', '', 100), n('jump_distance_m', 'Distance de saut', 'm', 300, 0.1, 'max')], 'combinés nordiques');
group('ski_jumping', [n('jumps', 'Sauts réalisés', '', 100), n('best_distance_m', 'Meilleur saut', 'm', 300, 0.1, 'max'), n('style_score', 'Note de style', 'points', 60, 0.5, 'avg')], 'saut à ski');
group('speed_skiing', [n('runs', 'Runs', '', 100), n('max_speed_kmh', 'Vitesse maximale mesurée', 'km/h', 300, 0.1, 'max'), n('run_distance_m', 'Longueur de la piste', 'm', 5000)], 'ski vitesse');
group('roller inline_speed_skating ice_skating speed_skating short_track_speed_skating', [n('laps', 'Tours', '', 1000), n('best_lap_s', 'Meilleur tour', 's', 3600, 0.01, 'min'), n('intervals', 'Fractions', '', 200), hr], 'patinage');
group('figure_skating', [routines, n('jumps', 'Sauts réussis', '', 200), n('spins', 'Pirouettes', '', 200), n('falls', 'Chutes', '', 100)], 'patinage artistique');
group('bobsleigh luge skeleton', [n('runs', 'Descentes', '', 100), n('best_run_s', 'Meilleure descente', 's', 600, 0.01, 'min'), n('start_time_s', 'Temps de départ', 's', 60, 0.01, 'min')], 'glisse sur piste');
group('equestrian dressage eventing show_jumping horse_racing', [s('work', 'Travail', 'Plat|Dressage|Obstacle|Cross|Extérieur|Course'), n('jumps', 'Obstacles franchis', '', 200), n('faults', 'Points de pénalité', 'points', 300), n('gaits_minutes', 'Temps au galop', 'min', 240), n('height_cm', 'Hauteur maximale', 'cm', 220, 1, 'max')], 'équitation');
group('karting motocross', [n('laps', 'Tours', '', 500), n('best_lap_s', 'Meilleur tour', 's', 1800, 0.01, 'min'), s('session', 'Session', 'Essais|Qualifications|Course|Loisir'), n('position', 'Position finale', '', 100, 1, 'min')], 'sports mécaniques');
group('paragliding skydiving', [n('flights', 'Vols / sauts', '', 100), n('airtime_min', 'Temps en vol', 'min', 1440), n('max_altitude_m', 'Altitude maximale', 'm', 10000, 1, 'max'), n('landings', 'Atterrissages maîtrisés', '', 100)], 'sports aériens');

// Family membership alone is insufficient for atypical disciplines.
function refine(id, fields, family) {
  if (!map.has(id)) throw new Error(`Cannot refine unknown discipline ${id}`);
  map.set(id, { family, fields });
}
refine('modern_pentathlon', [n('run_km', 'Distance courue', 'km', 20, 0.01), n('swim_m', 'Distance nagée', 'm', 10000), n('fencing_bouts', 'Assauts d’escrime', '', 100), n('targets_hit', 'Cibles touchées', '', 200), n('obstacle_time_s', 'Temps sur obstacles', 's', 600, 0.01, 'min')], 'pentathlon');
refine('lifesaving_sport', [s('event', 'Épreuve', 'Nage avec obstacles|Mannequin|Bouée tube|Relais|Sauvetage côtier'), n('swim_m', 'Distance nagée', 'm', 20000), n('carries_m', 'Distance de remorquage', 'm', 5000), n('repetitions', 'Répétitions', '', 100)], 'sauvetage sportif');
refine('obstacle_course', [n('obstacles', 'Obstacles franchis', '', 500), n('obstacles_failed', 'Obstacles non franchis', '', 100), n('carry_m', 'Distance de portage', 'm', 10000), ascent, hr], 'course à obstacles');
refine('biathlon', [n('distance_km', 'Distance skiée', 'km', 200, 0.01), n('targets_hit', 'Cibles touchées', '', 200), n('shots', 'Tirs effectués', '', 200), n('penalty_laps', 'Tours de pénalité', '', 100)], 'biathlon');
refine('nordic_combined', [n('distance_km', 'Distance skiée', 'km', 200, 0.01), n('jumps', 'Sauts réalisés', '', 100), n('best_distance_m', 'Meilleur saut', 'm', 300, 0.1, 'max'), n('style_score', 'Note de style', 'points', 60, 0.5, 'avg')], 'combiné nordique');
for (const id of ['ski_touring', 'ski_mountaineering']) refine(id, [ascent, descent, n('pack_kg', 'Poids du sac', 'kg', 40, 0.1, 'avg'), s('snow', 'Neige', 'Poudreuse|Dure|Transformée|Croûtée|Mixte'), hr], 'ski de randonnée');
refine('dressage', [n('figures', 'Figures / reprises travaillées', '', 100), n('avg_score', 'Note de reprise', '%', 100, 0.1, 'avg'), s('focus', 'Travail', 'Allures|Transitions|Déplacements latéraux|Reprise complète')], 'dressage');
refine('show_jumping', [n('jumps', 'Obstacles franchis', '', 200), n('faults', 'Points de pénalité', 'points', 300), n('height_cm', 'Hauteur maximale', 'cm', 220, 1, 'max'), n('courses', 'Parcours effectués', '', 50)], 'saut d’obstacles');
refine('horse_racing', [n('races', 'Courses / galops travaillés', '', 50), n('distance_m', 'Distance de course', 'm', 10000), n('position', 'Position finale', '', 100, 1, 'min'), n('best_time_s', 'Meilleur temps', 's', 1800, 0.01, 'min')], 'courses hippiques');
refine('eventing', [s('phase', 'Phase', 'Dressage|Cross|Saut d’obstacles|Complet'), n('jumps', 'Obstacles franchis', '', 200), n('faults', 'Points de pénalité', 'points', 300), n('time_penalties', 'Pénalités de temps', 'points', 300, 0.1)], 'concours complet');
refine('arm_wrestling', [...matches, s('arm', 'Bras', 'Droit|Gauche|Les deux'), n('round_duration_s', 'Durée moyenne d’opposition', 's', 600, 1, 'avg')], 'bras de fer');
refine('grip_sport', [s('event', 'Épreuve', 'Gripper|Pincement|Barre épaisse|Maintien|Autre'), n('attempts', 'Essais', '', 100), n('top_load', 'Charge maximale', 'kg', 500, 0.5, 'max'), n('hold_seconds', 'Meilleur maintien', 's', 1200, 1, 'max')], 'préhension');
refine('archery', [n('arrows', 'Flèches tirées', '', 1000), n('distance_m', 'Distance de tir', 'm', 200), n('avg_score', 'Score moyen par flèche', '/10', 10, 0.1, 'avg'), s('bow', 'Arc', 'Classique|Poulies|Arc nu|Traditionnel')], 'tir à l’arc');

const generic = new Set(['quality_score', 'execution_quality', 'technical_quality', 'successful_actions', 'decisive_actions', 'errors', 'technical_focus']);
export function metricCatalog() {
  const active = new Set(baseline.map(s => s.id));
  for (const id of map.keys()) if (!active.has(id)) throw new Error(`Unknown sport ${id}`);
  return Object.fromEntries(baseline.map(sport => {
    const spec = map.get(sport.id);
    if (!spec) throw new Error(`No reviewed metric group for ${sport.id}`);
    const fresh = spec.fields.map((f, i) => {
      const old = sport.extra_fields.find(o => o.id === f.id);
      // A vocabulary improvement must not invalidate a value in an old session.
      const bounds = f.type === 'number' && old?.type === 'number' ? {
        min: Math.min(f.min, old.min ?? f.min), max: Math.max(f.max, old.max ?? f.max), step: Math.min(f.step, old.step || f.step),
      } : {};
      return { ...old, ...f, ...bounds, ...(f.type === 'select' && old?.type === 'select' ? { options: [...new Set([...f.options, ...old.options])] } : {}), priority: i + 1, optional: true };
    });
    const ids = new Set(fresh.map(f => f.id));
    // Keep historical fields, including generic ones, for old records and server compatibility.
    // They never displace the useful primary measures.
    const old = sport.extra_fields.filter(f => !ids.has(f.id)).map((f, i) => ({ ...f, priority: 100 + i, optional: true, legacy: generic.has(f.id) }));
    return [sport.id, { family: spec.family, fields: fresh.concat(old) }];
  }));
}
